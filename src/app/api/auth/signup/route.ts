import { signup } from '@/lib/signup';
import { errorResponse } from '@/lib/security';
export async function POST(req:Request){try{return await signup(req);}catch(e){return errorResponse(e);}}
