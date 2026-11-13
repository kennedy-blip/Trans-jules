import unittest
import httpx
from trans_jules_node.cli import discover, stats, serve_proxy

class AgentTests(unittest.TestCase):
    def test_model_discovery(self):
        client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"data": [{"id": "qwen"}]})))
        self.assertEqual(discover(client, "http://local/v1", {}), ["qwen"])
        client.close()

    def test_stats(self):
        self.assertGreaterEqual(stats()["ram_free_mb"], 0)

    def test_proxy_blocks_unauthenticated_and_management(self):
        server, state = serve_proxy("http://localhost:11434/v1", "test-secret", "", 1)
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            self.assertEqual(httpx.post(origin + "/v1/chat/completions", json={}).status_code, 401)
            self.assertEqual(httpx.post(origin + "/api/pull", json={}).status_code, 404)
            self.assertEqual(httpx.get(origin + "/v1/models").status_code, 405)
            self.assertEqual(state["active"], 0)
        finally:
            server.shutdown()
            server.server_close()

if __name__ == "__main__":
    unittest.main()
