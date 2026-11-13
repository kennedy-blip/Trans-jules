import { readJson } from '@/lib/http';
import { nodeAuth, publicUrl, errorResponse, ApiError } from '@/lib/security';
import { nodeSchema } from '@/lib/schemas';
import { db, check } from '@/lib/db';
export async function POST(req: Request) {
 try { nodeAuth(req); const p=nodeSchema.safeParse(await readJson(req, 100_000)); if(!p.success) throw new ApiError(400,p.error.message);
 const url=await publicUrl(p.data.url);
 const data=check(await db().from('worker_nodes').upsert({...p.data,url,last_heartbeat:new Date().toISOString()},{onConflict:'url'}).select('id').single());
 return Response.json({node_id:data!.id}); } catch(e) { return errorResponse(e); }
}
