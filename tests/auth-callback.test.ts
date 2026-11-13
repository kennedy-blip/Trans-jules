import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { completeAuth, callbackError } from '../src/lib/browser-auth';
function mockClient() {
 const calls:string[]=[];
 return {calls, client: {auth:{
  exchangeCodeForSession:async(code:string)=>{calls.push('exchange:'+code);return {error:null};},
  setSession:async()=>{calls.push('setSession');return {error:null};},
  getSession:async()=>({data:{session:{access_token:'test-token'}},error:null}),
  signOut:async()=>{calls.push('signOut');return {error:null};},
 }} as unknown as SupabaseClient};
}
test('PKCE callback exchanges code and validates server-side access',async()=>{
 const original=globalThis.fetch;const {client,calls}=mockClient();
 globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/auth/session');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-token');return Response.json({email:'admin@example.com'});};
 try{await completeAuth(client,new URL('https://app.example/auth/callback?code=one-use&next=https://attacker.example'));assert.deepEqual(calls,['exchange:one-use']);}finally{globalThis.fetch=original;}
});
test('implicit email callback accepts fragment tokens, not query-string tokens',async()=>{
 const original=globalThis.fetch;const {client,calls}=mockClient();globalThis.fetch=async()=>Response.json({});
 try{await completeAuth(client,new URL('https://app.example/auth/callback#access_token=access&refresh_token=refresh'));assert.deepEqual(calls,['setSession']);await assert.rejects(()=>completeAuth(client,new URL('https://app.example/auth/callback?access_token=access&refresh_token=refresh')),/No sign-in response/);}finally{globalThis.fetch=original;}
});
test('denied accounts are signed out locally, not shown the dashboard',async()=>{
 const original=globalThis.fetch;const {client,calls}=mockClient();globalThis.fetch=async()=>Response.json({},{status:403});
 try{await assert.rejects(()=>completeAuth(client,new URL('https://app.example/auth/callback?code=one-use')),/approved/);assert.deepEqual(calls,['exchange:one-use','signOut']);}finally{globalThis.fetch=original;}
});
test('provider cancellation and expired links never leak provider error details',async()=>{
 const {client,calls}=mockClient();const url=new URL('https://app.example/auth/callback#error=access_denied&error_description=sensitive');
 assert.match(callbackError(url)!,/expired/);await assert.rejects(()=>completeAuth(client,url),/cancelled/);assert.deepEqual(calls,[]);assert.ok(!callbackError(url)!.includes('sensitive'));
});
