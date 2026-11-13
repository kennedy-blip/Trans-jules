/** Real external-client test; no Supabase/admin credentials required. */
export async function smoke({baseURL,key,model='auto-fast',fetcher=fetch}) {
 const base=new URL(baseURL);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error('Use an HTTPS API base URL without credentials, query, or fragment.');
 if(!base.pathname.replace(/\/$/,'').endsWith('/api/v1'))throw Error('Base URL must end in /api/v1.');
 if(!key?.startsWith('sk-tj-'))throw Error('Set TRANS_JULES_API_KEY to your Trans Jules key.');
 const root=base.href.replace(/\/$/,'');
 async function call(path,body){
  const response=await fetcher(root+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(260_000),headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Expected API JSON. Check the domain and Vercel deployment protection.');
  const data=await response.json();
  if(!response.ok){
   const hints={401:'Key is invalid, missing, or revoked (or hosting protection blocked access).',404:'Model or route not found.',429:'Rate limit reached.',503:'Check healthy workers, provider credentials/credits, and database setup.'};
   throw Error(`HTTP ${response.status}: ${hints[response.status]??'Gateway request failed.'}`);
  }
  return data;
 }
 const models=await call('/models');
 if(!Array.isArray(models.data)||!models.data.some(m=>m.id===model))throw Error('Requested model is not advertised by /models. Check model registry and routing rules.');
 const started=Date.now();
 const result=await call('/chat/completions',{model,messages:[{role:'user',content:'Reply briefly: what is two plus two?'}],max_tokens:32,stream:false});
 if(typeof result.choices?.[0]?.message?.content!=='string'||!result.choices[0].message.content.trim())throw Error('Completion did not contain generated text.');
 // Never print request headers, keys, raw provider errors, or arbitrary response text.
 return {status:'PASS',model,latency_ms:Date.now()-started,reply_characters:result.choices[0].message.content.length};
}
export async function main(){
 try{console.log(JSON.stringify(await smoke({baseURL:process.env.TRANS_JULES_BASE_URL??'',key:process.env.TRANS_JULES_API_KEY,model:process.env.TRANS_JULES_MODEL??'auto-fast'}),null,2));}
 catch{console.error('Smoke test FAILED. Verify HTTPS base URL (/api/v1), key, model, public API access, and inference capacity. Run local tests for diagnostics; never paste secrets in chat.');process.exitCode=1;}
}

if(process.argv[1]?.endsWith('/smoke-inference.mjs'))void main();
