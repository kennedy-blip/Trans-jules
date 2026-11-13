# Production inference smoke test

This sends one small **real, potentially billable** non-streaming completion.
Unit tests use mocks and are NOT proof of production inference.

## Prerequisite: live capacity

Configure at least one healthy compatible worker or a provider in Vercel project
**trans-jules → Settings → Environment Variables → Production**. For example:

- `GROQ_API_KEY`: your own provider key, stored as Sensitive
- `GROQ_MODEL`: a currently available model your provider account can access

Alternatively configure `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` or
`HF_TOKEN`/`HF_MODEL`. Do not paste provider keys in chat or commit them.
Check credits/access and set a provider spending limit. Redeploy production after
changing environment variables; changes do not affect existing deployments.
The API domain must allow external requests without interactive Vercel login.
Never disable application API-key authentication.

## Run from your computer (Node 20+)

From this repository, in Bash:

```bash
export TRANS_JULES_BASE_URL=https://trans-jules-kmokaya864-5310.vercel.app/api/v1
export TRANS_JULES_MODEL=auto-fast
read -rsp 'Trans Jules API key: ' TRANS_JULES_API_KEY; echo
export TRANS_JULES_API_KEY
npm run smoke:inference
unset TRANS_JULES_API_KEY
```

The hidden prompt avoids putting the key in shell history. Never share it.
The command refuses redirects so credentials are not forwarded to a login page
or another origin. Use your actual trusted production origin.

PASS means `/models` authenticated, the requested model was advertised, and
`/chat/completions` returned non-empty text. Output contains no key or response
text. A failure is not evidence that the key itself is wrong: check hosting
protection, routing, provider credits/credentials, and dashboard request logs.
Correlate the fresh request with a status-200 log and provider/worker in the admin
dashboard. Do not publish logs containing secrets. Revoke a dedicated test key
afterward if it is no longer needed. Streaming and load testing are separate.

## Investigation snapshot

On 2026-11-13, connected infrastructure inspection found zero registered workers,
zero healthy workers, no Groq/OpenRouter/Hugging Face credential variables in the
Vercel project, one active API key, and zero successful request logs. Consequently
production inference has **not** been verified. The development sandbox cannot
reach the production API host under its outbound network restrictions. Complete
provider setup and run this command from an unrestricted client before claiming
end-to-end success.
