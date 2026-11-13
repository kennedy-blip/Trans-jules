export async function GET() {
 const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_ANON_KEY;
 if(!url||!key)return Response.json({google:false,github:false,available:false},{status:503});
 try {
  // These are public provider flags, never OAuth secrets or management credentials.
  const r=await fetch(`${url}/auth/v1/settings`,{headers:{apikey:key},signal:AbortSignal.timeout(5000),cache:'no-store'});
  if(!r.ok)throw new Error('Provider configuration unavailable');
  const settings=await r.json();
  return Response.json({google:settings.external?.google===true,github:settings.external?.github===true,available:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({google:false,github:false,available:false},{status:503});}
}
