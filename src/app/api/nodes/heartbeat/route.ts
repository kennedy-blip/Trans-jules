import { nodeAuth, errorResponse, ApiError } from '@/lib/security';
import { heartbeatSchema } from '@/lib/schemas';
import { db, check } from '@/lib/db';
export async function POST(req: Request) {
 try { nodeAuth(req); const p=heartbeatSchema.safeParse(await req.json()); if(!p.success) throw new ApiError(400,p.error.message);
 const {node_id,...stats}=p.data;
 const data=check(await db().from('worker_nodes').update({...stats,last_heartbeat:new Date().toISOString()}).eq('id',node_id).select('id').maybeSingle());
 if(!data) throw new ApiError(404,'Node not found'); return Response.json({ok:true}); } catch(e) { return errorResponse(e); }
}
