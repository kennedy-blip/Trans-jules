import { createClient } from '@supabase/supabase-js';
export function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Database is not configured');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
export class DatabaseError extends Error {
 constructor(public code:string, message:string){super(message);}
}
export function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new DatabaseError(result.error.code??'unknown', result.error.message);
  return result.data;
}
