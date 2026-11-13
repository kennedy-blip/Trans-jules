import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completion } from '../src/lib/gateway';

// Mock the HTTP boundary, exercising real validation, Supabase client queries,
// retry flow, streaming and telemetry without external services or credentials.
test('gateway upstream fallback, JSON, SSE usage, and outage',async()=>{
 process.env.SUPABASE_URL='https://database.example';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';
 process.env.GROQ_API_KEY='test-groq';
 process.env.OPENROUTER_API_KEY='test-openrouter';
 delete process.env.HF_TOKEN;
 const original=globalThis.fetch;
 let stream=false; let outage=false; let truncated=false; const logs:Record<string,any>[]=[];
 const model={name:'test-model',version:1,base_model:'local-model',system_prompt:'Be helpful',parameters:{temperature:0.2},priority:100};
 globalThis.fetch=async (input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const method=init?.method??(input instanceof Request?input.method:'GET');
  const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
  if(url.includes('database.example')) {
   if(url.includes('/api_keys')) return json({id:'00000000-0000-4000-8000-000000000001'});
   if(url.includes('/model_configs')) return json([model]);
   if(url.includes('/routing_rules') || url.includes('/worker_nodes')) return json([]);
   if(url.includes('/request_logs')&&method==='POST') {
    const body=init?.body??(input instanceof Request?await input.text():'{}');
    logs.push(JSON.parse(String(body))); return new Response(null,{status:201});
   }
   throw new Error('Unexpected database query '+url);
  }
  if(url.includes('api.groq.com')) return json({error:'capacity'},429);
  if(url.includes('openrouter.ai')) {
   if(outage) return json({error:'unavailable'},503);
   const payload=JSON.parse(String(init?.body));
   assert.equal(payload.messages[0].content,'Be helpful');
   assert.equal(payload.temperature,0.9);
   if(stream && truncated) return new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',{headers:{'Content-Type':'text/event-stream'}});
   if(stream) return new Response('data: {"id":"chatcmpl-test","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[],"usage":{"total_tokens":12}}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
   return json({id:'chatcmpl-test',object:'chat.completion',model:'provider-model',choices:[{index:0,message:{role:'assistant',content:'Hello'},finish_reason:'stop'}],usage:{total_tokens:8}});
  }
  throw new Error('Unexpected fetch '+url);
 };
 const request=()=>new Request('https://gateway.example/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer sk-tj-test'},body:JSON.stringify({model:'test-model',temperature:0.9,stream,messages:[{role:'user',content:'Hello'}]})});
 try {
  const response=await completion(request());assert.equal(response.status,200);assert.equal((await response.json()).model,'test-model');
  assert.equal(logs[0].tokens,8);assert.equal(logs[0].attempts.length,2);assert.equal(logs[0].attempts[0].status,429);
  stream=true;const sse=await completion(request());assert.match(sse.headers.get('content-type')! ,/text\/event-stream/);
  assert.match(await sse.text(),/data: \[DONE\]/);assert.equal(logs[1].tokens,12);
  truncated=true;const broken=await completion(request());assert.match(await broken.text(),/upstream_error/);assert.equal(logs[2].status,502);
  outage=true;await assert.rejects(()=>completion(request()),{status:503});assert.equal(logs[3].status,503);
 } finally {globalThis.fetch=original;}
});
