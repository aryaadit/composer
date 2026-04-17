import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _supabase: SupabaseClient | null = null;
let _serviceSupabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

/** Service-role client — bypasses RLS. Use only in admin/server contexts. */
export function getServiceSupabase(): SupabaseClient {
  if (!_serviceSupabase) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local");
    }
    _serviceSupabase = createClient(supabaseUrl, serviceKey);
  }
  return _serviceSupabase;
}
