import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readJson } from './http';
import { ApiError } from './security';
export const signupSchema=z.object({email:z.email().max(254).transform(s=>s.trim().toLowerCase()),password:z.string().min(12).max(128),display_name:z.string().trim().max(100).default('')});
export async function signup(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError(403,'Origin not allowed');
 const p=signupSchema.safeParse(await readJson(req,4096));
 if(!p.success)throw new ApiError(400,'Enter a valid email, a password of 12–128 characters, and a name up to 100 characters.');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY,app=process.env.APP_URL;
 if(!url||!key||!app)throw new ApiError(503,'Signup is not configured');
 const redirect=new URL(app);if(redirect.protocol!=='https:'||redirect.username||redirect.password)throw new ApiError(503,'Signup is not configured');
 // Implicit email confirmation is intentional: phone/email apps do not share
 // the desktop browser's PKCE verifier. OAuth remains PKCE in the browser.
 const client=createClient(url,key,{auth:{flowType:'implicit',persistSession:false,autoRefreshToken:false}});
 const {error}=await client.auth.signUp({email:p.data.email,password:p.data.password,options:{emailRedirectTo:redirect.origin+'/auth/callback',data:{display_name:p.data.display_name}}});
 if(error)throw new ApiError(error.status===429?429:503,error.status===429?'Email limit reached. Please wait before retrying.':'Signup is unavailable. Check Supabase signup and email delivery settings.');
 return Response.json({message:'Check your email to confirm your account. If you already have an account, use sign-in instead. New accounts do not receive administrator access.'},{headers:{'Cache-Control':'no-store'}});
}
