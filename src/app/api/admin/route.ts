import { z } from 'zod';
import { readJson } from '@/lib/http';
import { randomBytes } from 'node:crypto';
import { admin, hash, errorResponse, ApiError } from '@/lib/security';
import { db, check } from '@/lib/db';
import { modelSchema, ruleSchema } from '@/lib/schemas';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
 try {
  await admin(req); const d = db();
  const [keys, models, rules, nodes, logs, metrics] = await Promise.all([
   d.from('api_keys').select('id,name,prefix,created_at,revoked_at').order('created_at',{ascending:false}),
   d.from('model_configs').select('*').order('version',{ascending:false}), d.from('routing_rules').select('*').order('priority',{ascending:false}),
   d.from('worker_nodes').select('id,name,url,models,priority,max_concurrency,last_heartbeat,vram_free_mb,ram_free_mb,queue_load'),
   d.from('request_logs').select('*').order('created_at',{ascending:false}).limit(50), d.rpc('usage_metrics')
  ]);
  return Response.json({ keys:check(keys), models:check(models), rules:check(rules), nodes:check(nodes), logs:check(logs), metrics:check(metrics) });
 } catch(e) { return errorResponse(e); }
}
export async function POST(req: Request) {
 try {
  await admin(req); const body = await readJson(req, 100_000);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400,'JSON object required');
  const b = body as Record<string, unknown>; const d = db();
  if (['revoke-key','delete-rule','delete-node'].includes(String(b.action)) && !z.uuid().safeParse(b.id).success) throw new ApiError(400,'Valid resource ID required');
  if(b.action === 'create-key') {
   if(typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) throw new ApiError(400,'Key name required');
   const key = 'sk-tj-' + randomBytes(32).toString('hex');
   check(await d.from('api_keys').insert({name:b.name,key_hash:hash(key),prefix:key.slice(0,14)})); return Response.json({key});
  }
  if(b.action === 'revoke-key') { check(await d.from('api_keys').update({revoked_at:new Date().toISOString()}).eq('id',b.id)); return Response.json({ok:true}); }
  if(b.action === 'save-model') {
   const p = modelSchema.safeParse(b); if(!p.success) throw new ApiError(400,p.error.message);
   return Response.json(check(await d.rpc('create_model_version',{config:p.data})));
  }
  if(b.action === 'save-rule') {
   const p = ruleSchema.safeParse(b); if(!p.success) throw new ApiError(400,p.error.message);
   const target=check(await d.from('model_configs').select('id').eq('name',p.data.model_name).limit(1));
   if(!target?.length) throw new ApiError(400,'Target model is not registered');
   check(await d.from('routing_rules').upsert(p.data,{onConflict:'alias,model_name,task_pattern'})); return Response.json({ok:true});
  }
  if(b.action === 'delete-rule') { check(await d.from('routing_rules').delete().eq('id',b.id)); return Response.json({ok:true}); }
  if(b.action === 'delete-node') { check(await d.from('worker_nodes').delete().eq('id',b.id)); return Response.json({ok:true}); }
  throw new ApiError(400,'Unknown action');
 } catch(e) { return errorResponse(e); }
}
