import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET as session } from '../src/app/api/auth/session/route';
import { GET as providers } from '../src/app/api/auth/providers/route';
test('session endpoint denies absent, unconfirmed, and non-admin identities',async()=>{
 process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';process.env.ADMIN_EMAILS='admin@example.com';
 const original=globalThis.fetch;let email='admin@example.com';let confirmed=true;
 globalThis.fetch=async()=>Response.json({id:'user-1',email,email_confirmed_at:confirmed?'2026-11-13T00:00:00Z':null,identities:[{provider:'google'}]});
 const req=()=>new Request('https://app.example/api/auth/session',{headers:{Authorization:'Bearer fake-token'}});
 try{
  assert.equal((await session(new Request('https://app.example/api/auth/session'))).status,401);
  confirmed=false;assert.equal((await session(req())).status,403);
  confirmed=true;email='other@example.com';assert.equal((await session(req())).status,403);
  email='admin@example.com';const r=await session(req());assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
  const b=await r.json();assert.equal(b.email,email);assert.deepEqual(b.providers,['google']);assert.equal(b.access_token,undefined);
 }finally{globalThis.fetch=original;}
});
test('provider endpoint exposes only readiness, fails closed, and never returns secrets',async()=>{
 process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_ANON_KEY='publishable-test';
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({external:{google:true,github:false},client_secret:'must-not-leak'});
  assert.deepEqual(await (await providers()).json(),{google:true,github:false,available:true});
  globalThis.fetch=async()=>new Response(null,{status:503});const r=await providers();assert.equal(r.status,503);assert.deepEqual(await r.json(),{google:false,github:false,available:false});
 }finally{globalThis.fetch=original;}
});
