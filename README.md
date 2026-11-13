# Trans Jules

**Your infrastructure. Your intelligence. One API.**

A self-hosted AI gateway and versioned model registry: Next.js App Router, TypeScript, Tailwind CSS, Supabase/Postgres, and a Python GPU worker agent. Deploy the control plane on Vercel; keep model inference on your own hardware or configured upstream providers.

## Included

- Admin-only Supabase email/password authentication with a server-enforced email allowlist.
- Unified `sk-tj-…` keys, generated from 256 bits of randomness. Only SHA-256 hashes are stored; secrets appear once and can be copied or revoked.
- Immutable model configuration versions, system prompts, generation defaults, priorities, and explicit `model-name@v2` addressing.
- Virtual aliases with priority-ordered, case-insensitive literal task matching (`auto-fast`, `auto-code`, `auto-reasoning`).
- OpenAI-compatible `GET /api/v1/models` and `POST /api/v1/chat/completions`, including SSE, tools, multimodal message pass-through, and cancellation.
- Healthy-worker routing (heartbeat younger than 30 seconds), ordered worker retry, then Groq → OpenRouter → Hugging Face fallback.
- Atomic Postgres concurrency leases across Vercel instances, plus a bounded two-second wait per worker and worker-side concurrency admission.
- Dashboard with 10-second live polling, node telemetry, all-time usage totals, TTFT, and the latest 50 request/failover logs. No fabricated metrics or demo nodes.
- Python CLI with an authenticated inference-only proxy, automatic Cloudflare/ngrok tunnel discovery, custom tunnel support, model discovery, RAM/NVIDIA VRAM statistics, and 15-second heartbeats.

## Repository

```text
src/app/                       Dashboard and API route handlers
src/lib/                       Authentication, validation, routing, gateway
supabase/migrations/           Transactional schema + seeded configurations
worker-agent/                  Installable trans_jules_node Python CLI
 tests/                        TypeScript unit/integration tests
.github/workflows/ci.yml       Build, gateway tests, Python smoke tests
```

## Setup

### 1. Supabase database and authentication

1. Create or choose a Supabase project dedicated to this gateway.
2. Run **the complete file** `supabase/migrations/202611130001_initial.sql` in the SQL Editor, or apply it with the Supabase CLI (`supabase link --project-ref YOUR_REF`, then `supabase db push`). Apply once to a fresh schema.
3. Under Authentication → Users, create your admin email/password account. Disable public signups for a private deployment. There is deliberately no signup UI.
4. Copy the project URL, anon key, and **service-role** key from project settings. Never expose the service-role key in browser code or use a `NEXT_PUBLIC_` name for it.
5. Set `ADMIN_EMAILS` to the exact email(s) allowed to manage the gateway. A valid Supabase login alone does not grant admin access. Use strong passwords and keep the allowlist narrow.

Tables: `api_keys`, `model_configs`, `routing_rules`, `worker_nodes`, `request_logs`, and internal `node_leases`. All have RLS enabled without public policies. Only server-side service-role operations access them. Privileged RPCs are revoked from public/anon/authenticated roles. The migration seeds three model configurations and aliases; change base IDs to match your inference server.

### 2. Environment variables

Copy `.env.example` to `.env.local` for local development. In Vercel, add the same variables under Project → Settings → Environment Variables **before building**, then redeploy after changes.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Browser Supabase Auth client; safe public credential |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only database access |
| `ADMIN_EMAILS` | Yes | Comma-separated exact admin emails |
| `NODE_REGISTRATION_SECRET` | Yes for workers | Shared registration/heartbeat secret |
| `WORKER_INFERENCE_KEY` | Yes for workers | Separate secret protecting worker proxy inference |
| `GROQ_API_KEY`, `GROQ_MODEL` | Optional | First upstream fallback |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Optional | Second fallback (default `openrouter/free`) |
| `HF_TOKEN`, `HF_MODEL` | Optional | Third fallback via HF's OpenAI-compatible router |

Generate the two independent worker secrets using `openssl rand -hex 32`. Providers may require billing, have rate limits, or change free-model availability. Free inference is **not guaranteed**; select models available to your provider account. Keys remain server-side and are never stored in registry configurations.

```bash
npm ci
npm run dev
# Dashboard: http://localhost:3000
```

Without environment variables the dashboard renders an honest empty setup state. Admin mutations and inference remain unavailable, rather than using an insecure in-memory demo database.

### 3. Deploy on Vercel

1. Import `kennedy-blip/Trans-jules` in Vercel (framework: **Next.js**, root: repository root).
2. Use Node.js 22+, install command `npm ci`, build command `npm run build`; leave output-directory defaults unchanged.
3. Add the environment variables above. Set the Supabase Auth Site URL to your deployed HTTPS origin.
4. Deploy the feature branch for a preview; after reviewing the PR, merge for production.
5. Sign in with the allowlisted admin. Create a key in **API keys**, and save it immediately.

No GPU runs on Vercel. Vercel serves only the UI, gateway, and streaming proxy. The completion route requests a 300-second function duration; actual duration and streaming limits depend on the Vercel plan. Each upstream attempt is capped at 55 seconds; reduce retries/timeouts for stricter deployment limits. Build does not require a live database.

### 4. Boot a local, Colab, or Kaggle worker

Prerequisites: Python 3.10+, Ollama (or another OpenAI-compatible inference server), a downloaded model, and `cloudflared` on `PATH` for automatic tunnels. For ngrok, install/configure its CLI and account credentials separately. Use a Python virtual environment on systems enforcing externally-managed Python.

```bash
ollama serve
# In another terminal:
ollama pull llama3.2:3b
python -m venv .venv
source .venv/bin/activate
pip install "git+https://github.com/kennedy-blip/Trans-jules.git#subdirectory=worker-agent"
export TJ_GATEWAY=https://your-domain.vercel.app
export TJ_NODE_SECRET='same-value-as-NODE_REGISTRATION_SECRET'
export TJ_WORKER_KEY='same-value-as-WORKER_INFERENCE_KEY'
```

**One-line boot after prerequisites/secrets are set:**

```bash
trans-jules-node start --gateway "$TJ_GATEWAY" --name local-gpu --tunnel cloudflare
```

On a Colab/Kaggle notebook (internet and GPU enabled), install the package with `%pip install "git+https://github.com/kennedy-blip/Trans-jules.git#subdirectory=worker-agent"`, configure the above variables using notebook secrets, start your inference server, and run:

```python
!trans-jules-node start --gateway "$TJ_GATEWAY" --name notebook-gpu --tunnel cloudflare
```

This foreground cell stays running; interrupt it to stop. Platform notebook and tunnel policies apply. The agent does not install model runtimes or download weights automatically.

Other modes:

```bash
# Existing ngrok/custom HTTPS tunnel targeting localhost:8787 (NOT Ollama directly):
trans-jules-node start --gateway "$TJ_GATEWAY" --public-url https://your-tunnel.example --name custom-gpu
# Automatically spawn ngrok:
trans-jules-node start --gateway "$TJ_GATEWAY" --tunnel ngrok
# vLLM or another OpenAI-compatible server:
trans-jules-node start --gateway "$TJ_GATEWAY" --inference-url http://localhost:8000/v1 --max-concurrency 2
```

`TJ_INFERENCE_KEY` optionally authenticates the local inference server; `TJ_PROXY_PORT` defaults to 8787. The agent exposes **only** `POST /v1/chat/completions`, protected by `TJ_WORKER_KEY`. It does not expose Ollama's model-management endpoints. It registers the tunnel's `/v1` base automatically. `queue_load` reports active requests at the proxy. Discovery reports available model IDs from `/v1/models` (Ollama lists installed models, not strictly resident GPU weights). Free VRAM is summed across NVIDIA GPUs; unavailable measurements are null, not estimated. If discovery fails, heartbeats stop until recovery, preventing a dead backend from staying healthy. Ctrl+C shuts down owned tunnel processes; workers become offline within 30 seconds.

## API usage

Use `https://YOUR_DOMAIN/api/v1` as the OpenAI base URL, including in Continue, Cline, and Open WebUI. Supply your `sk-tj-…` key, not a Supabase key.

```bash
curl https://YOUR_DOMAIN/api/v1/models \
  -H "Authorization: Bearer $TJ_API_KEY"

curl https://YOUR_DOMAIN/api/v1/chat/completions \
  -H "Authorization: Bearer $TJ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto-fast","messages":[{"role":"user","content":"Hello!"}]}'

curl -N https://YOUR_DOMAIN/api/v1/chat/completions \
  -H "Authorization: Bearer $TJ_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto-code","stream":true,"messages":[{"role":"user","content":"Write a Python binary search"}]}'
```

```python
from openai import OpenAI
client = OpenAI(base_url="https://YOUR_DOMAIN/api/v1", api_key="sk-tj-...")
for chunk in client.chat.completions.create(
    model="auto-fast", stream=True,
    messages=[{"role": "user", "content": "Explain distributed inference"}],
):
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="")
```

### Routing semantics

1. Verify the bearer key against an unrevoked hash.
2. Resolve a concrete name to its latest version, an explicit `name@vN`, or an alias to matching rules (higher numeric priority first). Task matching is a literal substring of serialized messages, not arbitrary regex or AI classification. Publish rules from **Routing rules**; use multiple target models for availability-based selection.
3. Try each matching configuration's healthy workers in descending worker priority. Only workers advertising the exact base ID qualify. Configuration parameters are defaults, overridden by explicit caller parameters. The configuration's system prompt is prepended.
4. Atomically acquire a concurrency lease; wait at most two seconds per busy worker. Release on completion/cancellation/failure; abandoned leases expire after 65 seconds. The worker proxy separately limits active inference calls.
5. Try configured fallback providers in fixed order. Each fallback has an explicit environment-configured model ID, because provider model names differ from local weights. Unknown registry models return 404 instead of silently falling back.
6. Return JSON or forward SSE bytes without buffering the whole completion. The first upstream body chunk is primed before response headers, allowing early transport failure to fail over. SSE usage frames are requested and counted when supplied by the provider. Streaming model IDs reflect the actual upstream model; nonstreaming responses expose the requested registry name.
7. Once streaming starts, replay is unsafe: later failures emit an SSE error and `[DONE]`, and are logged, not retried. Cancellation aborts upstream fetch and releases admission. TTFT measures gateway-to-first-body-byte (nonstreaming uses completion latency), not an exact first generated token timestamp. Tokens are provider-reported; missing usage stays zero.

Node protocol: `POST /api/nodes/register` with `{name,url,models,priority,max_concurrency}` returns `{node_id}`; `POST /api/nodes/heartbeat` with `{node_id,models,vram_free_mb,ram_free_mb,queue_load}` updates telemetry. Both require `Authorization: Bearer NODE_REGISTRATION_SECRET`. These are trusted-owner endpoints, not public worker enrollment.

## Verification

```bash
npm ci
npm test
npm run build
npm run typecheck
pip install -e ./worker-agent
trans-jules-node start --help
python -m unittest discover -s worker-agent/tests
```

CI repeats these checks. Tests cover model/version and alias selection, stale-node filtering, priority, hash generation, private-address rejection, tool/multimodal field preservation, Python discovery/telemetry, and proxy authorization. End-to-end database, GPU inference, upstream account permissions, and cloud deployment require your configured resources; a successful local build alone does not verify them.

## Operational scope and limitations

- MVP targets a single trusted owner. Shared worker secrets should be rotated together across nodes. No multi-tenant billing, per-key quotas, audit exports, or public worker marketplace.
- Workers require public HTTPS and private/metadata IPs are rejected at registration and before forwarding; redirects are disabled. Registration credentials are powerful: give them only to trusted operators. DNS checks are defense in depth, not DNS-pinned egress protection against a malicious authorized operator. Use an egress firewall for untrusted node enrollment.
- Bounded per-node waiting is not a durable global FIFO job queue. Keep alias candidate lists small to bound aggregate request time; serverless function deadlines remain authoritative.
- Dashboard uses live polling, not Supabase Realtime subscriptions. Request bodies, prompts, generated text, and raw secrets are not logged; metadata retention is your responsibility. Periodically delete old request logs and expired leases if needed.
- Supabase service-role availability is required for both authentication and routing. There is no insecure database-free production mode.
- OpenAI compatibility covers the chat completions/models surface, not Responses, embeddings, files, audio, fine-tuning, or every provider's model capabilities. Tool/vision/structured-output support depends on the selected inference backend. Failover may use a different model/provider; review privacy requirements before configuring cloud fallbacks.

## License

MIT — see [LICENSE](LICENSE).
