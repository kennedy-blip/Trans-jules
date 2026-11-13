# Authentication and authorization setup

## Three separate kinds of access

1. **Vercel Deployment Protection:** a Vercel login (including “Continue with Google” on Vercel's own page) only unlocks the hosting gate. It does not sign into Trans Jules.
2. **Trans Jules login:** Supabase verifies email or an OAuth identity. The server then requires a confirmed email matching `ADMIN_EMAILS`. Only after this check does the dashboard appear.
3. **GitHub/Vercel integration authorization:** repository installation, team/project permissions, and deployments are separate consent flows. Google identity scopes do not grant access to GitHub repositories or Vercel projects. This version does not collect personal GitHub/Vercel management tokens, register provider OAuth apps automatically, or install software on login.

This installation's GitHub repository is already linked to Vercel's project. The dashboard exposes links to manage that deployment, and shows the current platform account's login identities. Those links are **not** claims of personal-account OAuth authorization. Do not reuse a Vercel session or an Arena connector token as a Trans Jules credential.

## Fix the current email flow

- Always use the canonical domain: `https://trans-jules-kmokaya864-5310.vercel.app`.
- Use **Email me a sign-in link**, not the password form. The password form is collapsed and labeled for existing Trans Jules passwords only. Your Google or Vercel password is not your Trans Jules password.
- Use the newest, unused link. It opens `/auth/callback`, which installs the session, strips sensitive callback URL parameters, verifies admin access with the server, then navigates to `/`.
- Existing email links that returned to `/` are forwarded to the callback. Expired/cancelled links show a recoverable error.
- Use the same browser. PKCE OAuth stores a code verifier in that browser's origin. Alternate deployment domains are redirected by the login UI to the canonical domain before starting OAuth.
- Supabase's default mail service has low limits and recipient restrictions. Configure custom SMTP if email cannot be delivered. Never disable email verification as a workaround.

### Supabase URL configuration

Project: `suaukmetnxjciwmejofj`.

- Site URL: `https://trans-jules-kmokaya864-5310.vercel.app`
- Additional redirect URLs (exact matches, no broad wildcard required):
  - `https://trans-jules-kmokaya864-5310.vercel.app`
  - `https://trans-jules-kmokaya864-5310.vercel.app/auth/callback`
  - `https://trans-jules.vercel.app`
  - `https://trans-jules.vercel.app/auth/callback`
- Vercel environment `APP_URL`: canonical origin above.

## Enable “Continue with Google”

The Google option is implemented, but is enabled in the UI **only when Supabase's public provider settings report Google enabled**. A button alone cannot create a Google OAuth application.

1. In Google Cloud Console → Google Auth Platform, configure branding/consent and an OAuth web application. If in testing mode, add your admin Google account as a test user.
2. Use the required scopes for login only: `openid`, `email`, `profile`. Do not request Drive, cloud-management, or repository access for sign-in.
3. Set the authorized redirect URI to **`https://suaukmetnxjciwmejofj.supabase.co/auth/v1/callback`**. This is the provider → Supabase callback, **not** the Vercel `/auth/callback` route.
4. In Supabase Dashboard → Authentication → Sign In / Providers → Google, enter the Google client ID and secret and enable the provider. Keep nonce checks enabled. Enter secrets directly in the dashboard—never in chat, source files, or `NEXT_PUBLIC_` variables.
5. Ensure the Google account's confirmed email is in `ADMIN_EMAILS` in Vercel. Refresh the login page and choose **Continue with Google**.
6. The path is Google consent → Supabase callback → Trans Jules `/auth/callback` → server admin verification → dashboard. Completing the Google consent page alone does not prove dashboard access.

The connected Supabase management tool currently exposes email/URL configuration but **does not expose Google client credentials or provider enablement fields**. Configure those fields in the Supabase dashboard; do not invent tool arguments or ask for passwords/tokens in chat.

## Enable “Continue with GitHub”

1. Register an OAuth App in GitHub → Settings → Developer settings → OAuth Apps.
2. Homepage URL: the canonical Trans Jules origin. Authorization callback URL: **`https://suaukmetnxjciwmejofj.supabase.co/auth/v1/callback`**.
3. Store the client ID and secret in Supabase's GitHub provider settings and enable it.
4. Use a GitHub account with a verified email matching `ADMIN_EMAILS`. Login requests `read:user user:email`, not repository write permissions.
5. Refresh the page; the GitHub login option becomes active. Supabase manages supported same-email identity linking; no manual identity-linking bypass is enabled by this app.

This grants identity login only. For repo deployment/install permissions, use Vercel's existing GitHub App installation flow. Review the repository selection and restrict it to the intended repository. Do not confuse `Continue with GitHub` login with installing a GitHub App.

## Vercel gate and Git deployment

The existing project is `trans-jules`, under `kmokaya864-5310`, linked to `kennedy-blip/Trans-jules` with production branch `main`.

In Vercel Project Settings → Deployment Protection, review Vercel Authentication for production. The current team setting is `all_except_custom_domains`. A second Vercel login gate can complicate email/OAuth callbacks and blocks external OpenAI SDK clients. For a publicly reachable API, turn off Vercel Authentication for production (or use a suitable custom domain) while keeping Trans Jules admin auth and API-key validation enabled. This is a separate hosting security decision; it is not disabled automatically on login. The connected project-settings tool does not expose that field.

Future “install this platform” onboarding requires registering a dedicated GitHub App/Vercel integration and building separate least-privilege consent callbacks, state/CSRF binding, encrypted token storage, revocation, and a deployment progress flow. It must not be simulated by calling those accounts connected merely because the user signed in with Google. These personal-account installation flows are not implemented in this auth repair.

## Verify before further upgrades

- Email link on canonical domain → callback → admin dashboard.
- Google login (after provider configuration) → callback → admin dashboard.
- GitHub login (after provider configuration) → callback → admin dashboard.
- Non-allowlisted or unconfirmed email → denied; no control-plane data.
- Cancelled/expired provider response → helpful error and return-to-login link.
- Sign out → private dashboard data disappears.
- Canonical domain, not a preview host, receives the session.
- Deployment Protection no longer intercepts SDK requests where production is intentionally public.

Unit tests cover PKCE and implicit callback handling, allowlist checks, cancellation, untrusted query tokens, session verification, and provider availability. Real provider consent and mail delivery require the owner's browser/account and are not proved by a passing build.
