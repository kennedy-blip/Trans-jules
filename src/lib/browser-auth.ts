import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | null = null;
export function browserAuth(url: string, key: string) {
 if (!url || !key) return null;
 return client ??= createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } });
}
export function callbackError(url: URL) {
 const fragment = new URLSearchParams(url.hash.slice(1));
 if (url.searchParams.has('error') || fragment.has('error')) return 'Sign-in was cancelled or the link expired. Please request a fresh link or try your provider again.';
 return null;
}
/** Complete both PKCE OAuth and Supabase's server-sent implicit email links. */
export async function completeAuth(client: SupabaseClient, url: URL) {
 const error = callbackError(url);
 if (error) throw new Error(error);
 const code = url.searchParams.get('code');
 const fragment = new URLSearchParams(url.hash.slice(1));
 if (code) {
  const result = await client.auth.exchangeCodeForSession(code);
  if (result.error) throw new Error('Unable to finish sign-in. Use the same browser and request a fresh sign-in.');
 } else if (fragment.get('access_token') && fragment.get('refresh_token')) {
  const result = await client.auth.setSession({ access_token: fragment.get('access_token')!, refresh_token: fragment.get('refresh_token')! });
  if (result.error) throw new Error('Your sign-in link is no longer valid. Request a new link.');
 } else {
  throw new Error('No sign-in response was received. Return to sign-in and try again.');
 }
 const { data, error: sessionError } = await client.auth.getSession();
 if (sessionError || !data.session) throw new Error('No active session. Please sign in again.');
 const response = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
 if (!response.ok) {
  await client.auth.signOut({ scope: 'local' });
  throw new Error(response.status === 403 ? 'This account is not an approved Trans Jules administrator. Use your allowlisted email.' : 'The platform could not verify your session. Please try again.');
 }
}
