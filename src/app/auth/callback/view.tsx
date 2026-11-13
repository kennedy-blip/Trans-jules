'use client';
import { useEffect, useState } from 'react';
import { browserAuth, completeAuth } from '@/lib/browser-auth';
// React Strict Mode may replay effects. Exchange each one-use code only once.
let completion: Promise<void> | null = null;
export default function Callback({url,anonKey}:{url:string;anonKey:string}) {
 const [error,setError]=useState('');
 useEffect(()=>{
  const incoming = new URL(window.location.href);
  window.history.replaceState(null,'','/auth/callback');
  const client=browserAuth(url,anonKey);
  if(!client){setError('Authentication is not configured.');return;}
  completion ??= completeAuth(client,incoming);
  completion.then(()=>window.location.replace('/')).catch(e=>setError(e.message));
 },[url,anonKey]);
 return <main className="auth-page"><section className="card auth-card"><h1>{error?'Sign-in needs attention':'Finishing your sign-in…'}</h1><p role={error?'alert':'status'}>{error||'Verifying your Trans Jules administrator access. This is separate from Vercel login.'}</p>{error&&<a className="button primary" href="/">Return to sign-in</a>}</section></main>;
}
