import { createClient } from '@supabase/supabase-js';
import { readJson } from './http';
import { ApiError, allowedAdmin } from './security';

export async function sendLoginLink(req: Request) {
 const origin = req.headers.get('origin');
 if (!origin || origin !== new URL(req.url).origin) throw new ApiError(403, 'Origin not allowed');
 const body = await readJson(req, 2048);
 const email = typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
 if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Valid email required');
 // Do not reveal allowlist membership or contact the mail provider for unknown emails.
 const response = () => Response.json({ message: 'If this email is an approved administrator, a sign-in link has been requested. Check your inbox and spam folder.' }, { headers: { 'Cache-Control': 'no-store' } });
 if (!allowedAdmin(email)) return response();
 const url = process.env.SUPABASE_URL;
 const key = process.env.SUPABASE_ANON_KEY;
 const appUrl = process.env.APP_URL;
 if (!url || !key || !appUrl) throw new ApiError(503, 'Email sign-in is not configured');
 const redirect = new URL(appUrl);
 if (redirect.protocol !== 'https:' || redirect.username || redirect.password) throw new ApiError(503, 'Email sign-in is not configured');
 const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
 const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.origin + '/auth/callback', shouldCreateUser: true } });
 if (error) throw new ApiError(error.status === 429 ? 429 : 503, error.status === 429 ? 'Email limit reached. Please wait before requesting another link.' : 'Unable to send sign-in email. Check Supabase email delivery settings.');
 return response();
}
