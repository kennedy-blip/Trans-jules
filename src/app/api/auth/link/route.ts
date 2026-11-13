import { sendLoginLink } from '@/lib/auth-link';
import { errorResponse } from '@/lib/security';
export async function POST(req: Request) {
 try { return await sendLoginLink(req); } catch (e) { return errorResponse(e); }
}
