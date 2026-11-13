import { db } from '@/lib/db';
import { allowedAdmin, bearer, ApiError, errorResponse } from '@/lib/security';
export async function GET(req:Request) {
 try {
  const token=bearer(req);if(!token)throw new ApiError(401,'Sign-in required','authentication_error');
  const {data,error}=await db().auth.getUser(token);
  if(error||!data.user)throw new ApiError(401,'Session expired. Please sign in again.','authentication_error');
  if(!data.user.email||!data.user.email_confirmed_at||!allowedAdmin(data.user.email))throw new ApiError(403,'This account is not an approved administrator.','permission_error');
  return Response.json({email:data.user.email,providers:data.user.identities?.map(i=>i.provider)??[],deployment:{repository:'https://github.com/kennedy-blip/Trans-jules',vercel:'https://vercel.com/kmokaya864-5310/trans-jules',note:'Repository deployment linkage is not an authorization to access your personal GitHub or Vercel account.'}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}
}
