import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { db, check, DatabaseError } from './db';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function bearer(req: Request) { return req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] ?? ''; }
export class ApiError extends Error { constructor(public status: number, message: string, public code = 'invalid_request_error') { super(message); } }
export function errorResponse(e: unknown) {
  if(e instanceof DatabaseError) {
    console.error('Database failure',e.code);
    const message=e.code==='42501'?'Database permissions are missing. Apply the service-role grants migration.':(e.code==='42P01'||e.code==='PGRST202'||e.code==='PGRST205')?'Database setup is incomplete. Apply the application migrations.':'Database is temporarily unavailable. Please retry or contact the administrator.';
    return Response.json({error:{message,type:'server_error',param:null,code:'database_unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  const known = e instanceof ApiError;
  if (!known) console.error(e);
  return Response.json({ error: { message: known ? e.message : 'Internal service error', type: known ? e.code : 'server_error', param: null, code: known ? e.code : 'internal_error' } }, { status: known ? e.status : 500 });
}
export function allowedAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(email.trim().toLowerCase());
}
export async function signedInUser(req: Request) {
  const token=bearer(req);if(!token)throw new ApiError(401,'Sign-in required','authentication_error');
  const {data,error}=await db().auth.getUser(token);
  if(error||!data.user)throw new ApiError(401,'Session expired. Please sign in again.','authentication_error');
  if(!data.user.email||!data.user.email_confirmed_at)throw new ApiError(403,'Confirm your email before continuing.','permission_error');
  return data.user;
}
export async function admin(req: Request) {
  const user=await signedInUser(req);
  if (!allowedAdmin(user.email!)) throw new ApiError(401, 'Admin access required', 'authentication_error');
  if (req.method !== 'GET' && req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) throw new ApiError(403, 'Origin not allowed');
}
export function nodeAuth(req: Request) {
  const expected = process.env.NODE_REGISTRATION_SECRET;
  if (!expected || !timingSafeEqual(Buffer.from(hash(bearer(req))), Buffer.from(hash(expected)))) throw new ApiError(401, 'Invalid node secret', 'authentication_error');
}
export async function apiKey(req: Request) {
  const token = bearer(req);
  if (!token.startsWith('sk-tj-')) throw new ApiError(401, 'Invalid API key', 'authentication_error');
  const data = check(await db().from('api_keys').select('id').eq('key_hash', hash(token)).is('revoked_at', null).maybeSingle());
  if (!data) throw new ApiError(401, 'Invalid API key', 'authentication_error');
  return data.id as string;
}
function privateIP(ip: string) {
  if (ip.includes(':')) return !/^2[0-9a-f]{3}:/i.test(ip) || ip.toLowerCase().startsWith('2001:db8:');
  const [a,b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || a === 198;
}
export async function publicUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (u.port && u.port !== '443')) throw new ApiError(400, 'Node URL must be a public HTTPS URL');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => privateIP(a.address))) throw new ApiError(400, 'Private node addresses are forbidden');
  return u.toString().replace(/\/$/, '');
}
