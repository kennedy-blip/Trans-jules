import { apiKey, errorResponse } from '@/lib/security';
import { db, check } from '@/lib/db';
export async function GET(req: Request) {
 try { await apiKey(req); const d=db(); const models=check(await d.from('model_configs').select('name,created_at')); const rules=check(await d.from('routing_rules').select('alias'));
 const names=new Set([...(models??[]).map(m=>m.name),...(rules??[]).map(r=>r.alias)]);
 return Response.json({object:'list',data:[...names].map(id=>({id,object:'model',created:0,owned_by:'trans-jules'}))}); } catch(e) { return errorResponse(e); }
}
