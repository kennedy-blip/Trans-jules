import Callback from './view';
export default function Page() { return <Callback url={process.env.SUPABASE_URL??''} anonKey={process.env.SUPABASE_ANON_KEY??''}/>; }
