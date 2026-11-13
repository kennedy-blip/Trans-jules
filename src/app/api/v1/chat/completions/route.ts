import { completion } from '@/lib/gateway';
import { errorResponse } from '@/lib/security';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(req:Request) { try { return await completion(req); } catch(e) { return errorResponse(e); } }
