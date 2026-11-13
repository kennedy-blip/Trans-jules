import { db, check } from './db';
import { apiKey, ApiError, publicUrl } from './security';
import { chatSchema } from './schemas';
import { resolveModels, healthyNodes, fallbacks, type Model, type Rule, type Node } from './routing';

export async function completion(req: Request) {
 const keyId=await apiKey(req);
 const raw=await req.text(); if(raw.length>2_000_000) throw new ApiError(413,'Request too large');
 let body: unknown; try { body=JSON.parse(raw); } catch { throw new ApiError(400,'Invalid JSON'); }
 const parsed=chatSchema.safeParse(body); if(!parsed.success) throw new ApiError(400,parsed.error.message);
 const input=parsed.data; const d=db(); const started=Date.now();
 const [mr,rr,nr]=await Promise.all([d.from('model_configs').select('*'),d.from('routing_rules').select('*'),d.from('worker_nodes').select('*').gt('last_heartbeat',new Date(Date.now()-30000).toISOString())]);
 const models=resolveModels(input.model,JSON.stringify(input.messages),check(mr) as Model[],check(rr) as Rule[]);
 if(!models.length) throw new ApiError(404,'Model not found','model_not_found');
 const nodes=check(nr) as Node[];
 const attempts: {provider:string;status:number;reason?:string}[]=[];
 let tokens=0; let ttft: number|null=null;
 async function log(status:number,provider:string,nodeId?:string) {
  const {error}=await d.from('request_logs').insert({api_key_id:keyId,model:input.model,provider,node_id:nodeId,status,tokens,ttft_ms:ttft,latency_ms:Date.now()-started,attempts});
  if(error) console.error('Telemetry insert failed',error.message);
 }
 const candidates=models.flatMap(m=>healthyNodes(nodes,m.base_model).map(n=>({model:m,node:n,provider:n.id,url:n.url,key:process.env.WORKER_INFERENCE_KEY,base:m.base_model})));
 const targets=[...candidates,...fallbacks().map(p=>({model:models[0],node:undefined,provider:p.name,url:p.url,key:p.key,base:p.model}))];
 for(const target of targets) {
  if(req.signal.aborted) throw new ApiError(499,'Client disconnected');
  let lease: string|null=null;
  if(target.node) {
   // Bounded queue: up to 2 seconds per candidate, with atomic cross-instance admission.
   const until=Date.now()+2000;
   do {
    lease=check(await d.rpc('acquire_node',{target:target.node.id}));
    if(lease || Date.now()>=until || req.signal.aborted) break;
    await new Promise(r=>setTimeout(r,200));
   } while(true);
   if(!lease) { attempts.push({provider:target.provider,status:429,reason:'capacity'}); continue; }
  }
  const release=async()=>{ if(lease) { const id=lease; lease=null; const {error}=await d.from('node_leases').delete().eq('id',id); if(error) console.error('Lease release failed'); } };
  const controller=new AbortController();
  const abort=()=>controller.abort(); req.signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,55000);
  const cleanup=async()=>{clearTimeout(timer);req.signal.removeEventListener('abort',abort);await release();};
  try {
   if(target.node) await publicUrl(target.url);
   const payload={...target.model.parameters,...input,model:target.base,messages:[...(target.model.system_prompt?[{role:'system',content:target.model.system_prompt}]:[]),...input.messages],...(input.stream?{stream_options:{...(input.stream_options as object ?? {}),include_usage:true}}:{})};
   const response=await fetch(target.url.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(target.key?{Authorization:`Bearer ${target.key}`}:{})},body:JSON.stringify(payload),signal:controller.signal,redirect:'error'});
   if(!response.ok || !response.body) { attempts.push({provider:target.provider,status:response.status,reason:'upstream rejected'}); await response.body?.cancel(); await cleanup(); continue; }
   if(!input.stream) {
    const result=await response.json();
    if(!Array.isArray(result.choices)) throw new Error('Invalid upstream response');
    ttft=Date.now()-started; tokens=result.usage?.total_tokens??0;
    attempts.push({provider:target.provider,status:200}); await log(200,target.provider,target.node?.id); await cleanup();
    return Response.json({...result,model:input.model});
   }
   if(!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Upstream did not return SSE');
   const reader=response.body.getReader();
   // Prime before returning headers so connection/first-byte failures can still fail over.
   const first=await reader.read(); if(first.done) throw new Error('Empty upstream stream');
   ttft=Date.now()-started;
   attempts.push({provider:target.provider,status:200});
   const decoder=new TextDecoder(); let pending=''; let ended=false;
   const inspect=(bytes:Uint8Array)=>{
    pending+=decoder.decode(bytes,{stream:true});
    const lines=pending.split('\n'); pending=lines.pop()??'';
    for(const line of lines) if(line.startsWith('data: ')) { try { const data=JSON.parse(line.slice(6)); if(data.usage?.total_tokens) tokens=data.usage.total_tokens; } catch { /* [DONE] and extension frames */ } }
    if(pending.length>1_000_000) pending='';
   };
   inspect(first.value);
   const finish=async(status:number)=>{if(ended)return;ended=true;await cleanup();await log(status,target.provider,target.node?.id);};
   let initial=true;
   const stream=new ReadableStream<Uint8Array>({
    async pull(c) {
     try { if(initial) { initial=false; c.enqueue(first.value); return; }
      const chunk=await reader.read(); if(chunk.done) { await finish(200);c.close(); } else { inspect(chunk.value);c.enqueue(chunk.value); }
     } catch { await reader.cancel().catch(()=>{}); await finish(502); c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({error:{message:'Upstream stream interrupted',type:'server_error',code:'upstream_error'}})+'\n\ndata: [DONE]\n\n'));c.close(); }
    },
    async cancel() { controller.abort();await reader.cancel().catch(()=>{});await finish(499); }
   });
   return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
  } catch {
   controller.abort(); attempts.push({provider:target.provider,status:502,reason:'timeout or connection failure'});await cleanup();
  }
 }
 await log(503,'unavailable'); throw new ApiError(503,'No inference capacity available; all workers and configured fallback providers failed','service_unavailable');
}
