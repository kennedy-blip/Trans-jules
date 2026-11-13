import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendLoginLink } from '../src/lib/auth-link';
const request = (email:string,origin='https://gateway.example') => new Request('https://gateway.example/api/auth/link',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email})});
test('email link login enforces origin and allowlist and pins redirect',async()=>{
 process.env.ADMIN_EMAILS='Owner@example.com';
 process.env.SUPABASE_URL='https://database.example';
 process.env.SUPABASE_ANON_KEY='test-publishable';
 process.env.APP_URL='https://gateway.example';
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{
  calls++;
  const url=String(input);
  assert.ok(url.startsWith('https://database.example/auth/v1/otp?redirect_to=https%3A%2F%2Fgateway.example'));
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.email,'owner@example.com');assert.equal(payload.create_user,true);
  return Response.json({});
 };
 try {
  await assert.rejects(()=>sendLoginLink(request('owner@example.com','https://attacker.example')),{status:403});
  await assert.rejects(()=>sendLoginLink(request('invalid')),{status:400});
  const denied=await sendLoginLink(request('other@example.com'));assert.equal(denied.status,200);assert.equal(calls,0);
  const approved=await sendLoginLink(request(' OWNER@example.com '));assert.equal(approved.status,200);assert.equal(calls,1);
  assert.deepEqual(await denied.json(),await approved.json());
 } finally {globalThis.fetch=original;}
});
