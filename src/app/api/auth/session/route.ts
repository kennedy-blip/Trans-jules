import { allowedAdmin, signedInUser, errorResponse } from '@/lib/security';
export async function GET(req:Request) {
 try {
  const user=await signedInUser(req);
  const role=allowedAdmin(user.email!)?'admin':'member';
  return Response.json({email:user.email,role,display_name:String(user.user_metadata?.display_name??user.user_metadata?.full_name??'').slice(0,100),providers:user.identities?.map(i=>i.provider)??[],deployment:{repository:'https://github.com/kennedy-blip/Trans-jules',vercel:'https://vercel.com/kmokaya864-5310/trans-jules',note:'Repository deployment linkage is not an authorization to access your personal GitHub or Vercel account.'}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}
}
