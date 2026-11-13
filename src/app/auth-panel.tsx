'use client';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
export default function AuthPanel({client,appUrl,error,onError}:{client:SupabaseClient|null;appUrl:string;error:string;onError:(s:string)=>void}) {
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 const [providers,setProviders]=useState({google:false,github:false,available:false});const [canonical,setCanonical]=useState('');
 useEffect(()=>{
  fetch('/api/auth/providers').then(r=>r.json()).then(setProviders).catch(()=>{});
  if(appUrl&&new URL(appUrl).origin!==location.origin)setCanonical(new URL(appUrl).origin);
 },[appUrl]);
 async function run(work:()=>Promise<void>){setBusy(true);onError('');setNotice('');try{await work();}catch(e){onError((e as Error).message);}finally{setBusy(false);}}
 async function oauth(provider:'google'|'github') {
  if(!client)return;
  await run(async()=>{
   const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+'/auth/callback',...(provider==='google'?{queryParams:{prompt:'select_account'}}:{scopes:'read:user user:email'})}});
   if(error)throw new Error(error.message);
  });
 }
 return <section className="card auth-card"><div className="eyebrow">TRANS JULES ACCOUNT</div><h1>Sign in to your workspace</h1><p>Vercel login grants access to the deployment only. Sign in below to access your Trans Jules account.</p>
 {canonical?<><p>Continue on the canonical domain so your session and sign-in links stay in the same browser origin.</p><a className="button primary" href={canonical}>Continue to Trans Jules sign-in ↗</a></>:<>
 <div className="oauth-buttons"><button className="button" disabled={!client||busy||!providers.google} onClick={()=>oauth('google')}>Continue with Google</button><button className="button" disabled={!client||busy||!providers.github} onClick={()=>oauth('github')}>Continue with GitHub</button></div>
 {(!providers.google||!providers.github)&&<p className="auth-help">{providers.available?'Google/GitHub options become available after their OAuth apps are configured in Supabase.':'Checking OAuth provider availability. Email sign-in is available below when configured.'} <a href="/auth/setup" target="_blank" rel="noreferrer">Setup guide ↗</a></p>}
 <form onSubmit={e=>{e.preventDefault();run(async()=>{const r=await fetch('/api/auth/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const b=await r.json();if(!r.ok)throw new Error(b.error?.message??'Unable to send email');setNotice(b.message);});}}><label>Admin email<input aria-label="Admin email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com"/></label><button className="button primary" disabled={!client||busy}>{busy?'Please wait…':'Email me a sign-in link'}</button></form>
 <details><summary>Use an existing Trans Jules password</summary><form onSubmit={e=>{e.preventDefault();if(!client)return;run(async()=>{const {error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)throw new Error('Password sign-in failed. Google/Vercel passwords do not work here. Use an email sign-in link unless you created a Trans Jules password.');});}}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="button" disabled={!client||busy}>Sign in with password</button></form></details>
 </>}
 {notice&&<p className="banner" role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 {!client&&<p className="error">Supabase authentication environment variables are not configured.</p>}
 <p className="auth-help">Signing in does not install software, connect provider accounts, or grant repository permissions. Those actions require separate authorization.</p></section>;
}
