import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smoke} from '../scripts/smoke-inference.mjs';
const config={baseURL:'https://example.com/api/v1',key:'sk-tj-test'};
test('smoke requires generated text, not just a model listing',async()=>{
 let calls=0;
 const result=await smoke({...config,fetcher:async(_url:unknown,init?:RequestInit)=>{calls++;assert.equal(init?.redirect,'error');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer sk-tj-test');return Response.json(calls===1?{data:[{id:'auto-fast'}]}:{choices:[{message:{content:'Four.'}}]});}});
 assert.equal(result.status,'PASS');assert.equal(calls,2);assert.equal(JSON.stringify(result).includes(config.key),false);
});
test('smoke fails for unavailable capacity and hosting HTML',async()=>{
 await assert.rejects(()=>smoke({...config,fetcher:async()=>new Response('<html>Login</html>',{headers:{'Content-Type':'text/html'}})}),/deployment protection/);
 let calls=0;
 await assert.rejects(()=>smoke({...config,fetcher:async()=>++calls===1?Response.json({data:[{id:'auto-fast'}]}):Response.json({error:{}},{status:503})}),/HTTP 503/);
});
