import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModels, healthyNodes, type Model } from '../src/lib/routing';
import { hash, publicUrl } from '../src/lib/security';
import { chatSchema } from '../src/lib/schemas';
const m=(name:string,version=1):Model=>({name,version,base_model:name,system_prompt:'',parameters:{},priority:100});
test('latest model and immutable explicit versions',()=>{
 assert.equal(resolveModels('code','',[m('code'),m('code',2)],[])[0].version,2);
 assert.equal(resolveModels('code@v1','',[m('code'),m('code',2)],[])[0].version,1);
 assert.equal(resolveModels('missing','',[m('code')],[]).length,0);
});
test('task rules are case insensitive literal matches and priority ordered',()=>{
 const rules=[{alias:'auto-code',model_name:'fast',task_pattern:'',priority:10},{alias:'auto-code',model_name:'code',task_pattern:'Python',priority:20}];
 assert.deepEqual(resolveModels('auto-code','write python',[m('fast'),m('code')],rules).map(m=>m.name),['code','fast']);
 assert.equal(resolveModels('auto-code','hello',[m('fast'),m('code')],rules)[0].name,'fast');
});
test('stale workers excluded, healthy workers priority sorted',()=>{
 const nodes=[{id:'old',url:'',models:['code'],priority:999,last_heartbeat:new Date(0).toISOString()},... [1,2].map(n=>({id:String(n),url:'',models:['code'],priority:n,last_heartbeat:new Date(99000).toISOString()}))];
 assert.deepEqual(healthyNodes(nodes,'code',100000).map(n=>n.id),['2','1']);
 assert.deepEqual(healthyNodes(nodes,'other',100000),[]);
});
test('keys hashed deterministically without retaining plaintext',()=>{assert.equal(hash('test').length,64);assert.equal(hash('test'),hash('test'));assert.notEqual(hash('test'),hash('other'));});
test('SSRF rejects loopback, metadata IPs, insecure protocols',async()=>{
 for(const u of ['https://127.0.0.1','https://169.254.169.254','http://example.com','https://[::1]','https://10.0.0.1','https://user:password@example.com']) await assert.rejects(()=>publicUrl(u));
});
test('chat schema retains tool calls, multimodal messages, and SDK parameters',()=>{
 const result=chatSchema.parse({model:'auto-code',messages:[{role:'assistant',content:null,tool_calls:[{id:'1'}]},{role:'tool',tool_call_id:'1',content:'ok'},{role:'user',content:[{type:'text',text:'hi'}]}],tools:[{type:'function'}],temperature:0.4,stream:true});
 assert.equal(result.messages[1].tool_call_id,'1');assert.equal(result.temperature,0.4);assert.ok(result.tools);
});
