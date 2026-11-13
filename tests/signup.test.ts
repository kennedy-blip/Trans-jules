import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signup} from '../src/lib/signup';
test('public signup validates origin and password, pins confirmation redirect, stores account metadata',async()=>{
 process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_ANON_KEY='publishable';process.env.APP_URL='https://app.example';
 const req=(password:string,origin='https://app.example')=>new Request('https://app.example/api/auth/signup',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:'member@example.com',password,display_name:'Member'})});
 await assert.rejects(()=>signup(req('longpassword123','https://evil.example')),{status:403});
 await assert.rejects(()=>signup(req('short')),{status:400});
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{assert.equal(new URL(String(input)).searchParams.get('redirect_to'),'https://app.example/auth/callback');const b=JSON.parse(String(init?.body));assert.equal(b.email,'member@example.com');assert.deepEqual(b.data,{display_name:'Member'});assert.ok(!b.code_challenge);return Response.json({id:'member'});};
 try{assert.equal((await signup(req('longpassword123'))).status,200);}finally{globalThis.fetch=original;}
});
