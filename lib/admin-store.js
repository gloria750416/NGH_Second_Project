function ensureSupabaseResult(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

export function createAdminStore(options = {}) {
  const supabase = options.supabase ?? null;

  if (!supabase) {
    return null;
  }

  return {
    async findByUsername(username) {
      const result = await supabase
        .from("admin_users")
        .select("id, username, password_hash, display_name, is_active")
        .eq("username", username)
        .maybeSingle();

      ensureSupabaseResult(result, "Failed to load admin user");

      if (!result.data) {
        return null;
      }

      return {
        id: result.data.id,
        username: result.data.username,
        passwordHash: result.data.password_hash,
        displayName: result.data.display_name,
        isActive: result.data.is_active,
      };
    },
    async touchLastLogin(adminId) {
      const result = await supabase
        .from("admin_users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", adminId);

      ensureSupabaseResult(result, "Failed to update admin last login");
    },
  };
}
