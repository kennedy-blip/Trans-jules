import Dashboard from './dashboard';
export default function Page() { return <Dashboard url={process.env.SUPABASE_URL??''} anonKey={process.env.SUPABASE_ANON_KEY??''} appUrl={process.env.APP_URL??''}/>; }
