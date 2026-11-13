"""Register an inference server and keep the gateway informed of availability."""
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
from urllib.parse import urlparse
from typing import Optional

import httpx
import psutil
import typer

app = typer.Typer(help="Connect Ollama or an OpenAI-compatible server to Trans Jules.")


def discover(client: httpx.Client, base: str, headers: dict) -> list[str]:
    response = client.get(base.rstrip("/") + "/models", headers=headers)
    response.raise_for_status()
    return [m["id"] for m in response.json()["data"]]


def stats() -> dict:
    vram = None
    if shutil.which("nvidia-smi"):
        try:
            output = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
                timeout=3, text=True,
            )
            vram = sum(int(v.strip()) for v in output.splitlines())
        except (subprocess.SubprocessError, ValueError):
            pass
    return {"vram_free_mb": vram, "ram_free_mb": round(psutil.virtual_memory().available / 1048576), "queue_load": 0}


def open_tunnel(kind: str, origin: str) -> tuple[str, subprocess.Popen]:
    binary = "cloudflared" if kind == "cloudflare" else "ngrok"
    if not shutil.which(binary):
        raise RuntimeError(f"Install {binary} first, or use --public-url")
    command = ([binary, "tunnel", "--url", origin, "--no-autoupdate"] if kind == "cloudflare"
               else [binary, "http", origin, "--log", "stdout", "--log-format", "json"])
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines: queue.Queue[str] = queue.Queue(maxsize=500)

    def drain():
        for line in process.stdout:
            try:
                lines.put_nowait(line)
            except queue.Full:
                pass
    threading.Thread(target=drain, daemon=True).start()
    deadline = time.monotonic() + 45
    pattern = r"https://[a-zA-Z0-9-]+\.trycloudflare\.com" if kind == "cloudflare" else r"https://[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:app|io|dev)"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            match = re.search(pattern, lines.get(timeout=0.5))
            if match:
                return match.group(), process
        except queue.Empty:
            pass
    process.terminate()
    process.wait(timeout=10)
    raise RuntimeError(f"Could not discover {binary} tunnel URL; check its configuration")


def serve_proxy(origin: str, key: str, inference_key: str, max_concurrency: int):
    """Expose only authenticated inference, not the Ollama management API."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import hmac
    slots = threading.BoundedSemaphore(max_concurrency)
    state = {"active": 0}
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_):
            pass

        def reject(self, status):
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True

        def do_GET(self):
            self.reject(405)

        def do_POST(self):
            if self.path != "/v1/chat/completions":
                return self.reject(404)
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + key):
                return self.reject(401)
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reject(400)
            if not 0 < length <= 2_000_000:
                return self.reject(413)
            if not slots.acquire(blocking=False):
                return self.reject(429)
            with lock:
                state["active"] += 1
            try:
                self.connection.settimeout(60)
                body = self.rfile.read(length)
                with httpx.Client(timeout=55) as local:
                    headers = {"Content-Type": "application/json"}
                    if inference_key:
                        headers["Authorization"] = "Bearer " + inference_key
                    with local.stream("POST", origin + "/chat/completions", content=body, headers=headers) as response:
                        self.send_response(response.status_code)
                        self.send_header("Content-Type", response.headers.get("content-type", "application/json"))
                        self.send_header("Connection", "close")
                        self.end_headers()
                        for chunk in response.iter_bytes():
                            self.wfile.write(chunk)
                            self.wfile.flush()
                        self.close_connection = True
            except (httpx.HTTPError, OSError):
                self.close_connection = True
            finally:
                with lock:
                    state["active"] -= 1
                slots.release()

    server = ThreadingHTTPServer(("127.0.0.1", int(os.getenv("TJ_PROXY_PORT", "8787"))), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, state


@app.callback()
def main():
    """Trans Jules distributed worker."""


@app.command()
def start(
    gateway: str = typer.Option(..., envvar="TJ_GATEWAY", help="Gateway HTTPS origin"),
    secret: str = typer.Option(..., envvar="TJ_NODE_SECRET", help="Registration secret; prefer environment variable"),
    name: str = typer.Option("my-gpu", help="Worker display name"),
    inference_url: str = typer.Option("http://localhost:11434/v1", help="Local OpenAI-compatible base URL"),
    public_url: Optional[str] = typer.Option(None, help="Existing HTTPS tunnel origin; must point at the authenticated proxy"),
    tunnel: str = typer.Option("cloudflare", help="cloudflare or ngrok"),
    priority: int = typer.Option(100, min=0, max=1000),
    max_concurrency: int = typer.Option(1, min=1, max=32),
):
    """Start an authenticated proxy, register a tunnel, and heartbeat every 15s."""
    if urlparse(gateway).scheme != "https":
        raise typer.BadParameter("Gateway must use HTTPS")
    worker_key = os.environ.get("TJ_WORKER_KEY", "")
    if not worker_key:
        raise typer.BadParameter("Set TJ_WORKER_KEY to the gateway's WORKER_INFERENCE_KEY")
    if tunnel not in ("cloudflare", "ngrok"):
        raise typer.BadParameter("Tunnel must be cloudflare or ngrok")
    inference_url = inference_url.rstrip("/")
    inference_key = os.environ.get("TJ_INFERENCE_KEY", "")
    inference_headers = {"Authorization": "Bearer " + inference_key} if inference_key else {}
    server, state = serve_proxy(inference_url, worker_key, inference_key, max_concurrency)
    process = None
    node_id = None
    stop = threading.Event()
    try:
        if not public_url:
            public_url, process = open_tunnel(tunnel, f"http://127.0.0.1:{server.server_port}")
        if urlparse(public_url).scheme != "https":
            raise RuntimeError("Public URL must use HTTPS")
        endpoint = public_url.rstrip("/") + "/v1"
        headers = {"Authorization": "Bearer " + secret}
        with httpx.Client(timeout=10) as client:
            while not stop.is_set():
                try:
                    # A failed discovery must not advertise a dead inference server as healthy.
                    models = discover(client, inference_url, inference_headers)
                    if node_id is None:
                        response = client.post(gateway.rstrip("/") + "/api/nodes/register", headers=headers,
                                               json={"name": name, "url": endpoint, "models": models, "priority": priority, "max_concurrency": max_concurrency})
                        response.raise_for_status()
                        node_id = response.json()["node_id"]
                        typer.echo(f"Connected {name} ({node_id}); proxy authenticated; heartbeat every 15s")
                    telemetry = stats()
                    telemetry["queue_load"] = state["active"]
                    response = client.post(gateway.rstrip("/") + "/api/nodes/heartbeat", headers=headers,
                                           json={"node_id": node_id, "models": models, **telemetry})
                    if response.status_code == 404:
                        node_id = None
                    response.raise_for_status()
                    if process and process.poll() is not None:
                        raise RuntimeError("Tunnel exited; restart the agent")
                except (httpx.HTTPError, ValueError, KeyError) as exc:
                    typer.echo(f"Heartbeat unavailable ({type(exc).__name__}); retrying in 15s", err=True)
                stop.wait(15)
    except KeyboardInterrupt:
        typer.echo("Stopping; node will become offline within 30 seconds.")
    except RuntimeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1)
    finally:
        server.shutdown()
        server.server_close()
        if process:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    app()
