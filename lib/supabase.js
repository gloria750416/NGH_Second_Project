import { createClient } from "@supabase/supabase-js";

export function createSupabaseServerClient(config) {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return null;
  }

  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
