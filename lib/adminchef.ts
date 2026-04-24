import { getServerSupabaseClient } from "@/lib/server-supabase";
import { redirect } from "next/navigation";

// Returns true if the current user is an active AdminChef, false otherwise
export async function isCurrentUserAdminChef() {
  const supabase = getServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  console.log('[AdminChef] current user id exists?', !!user);
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone_number, phone_last4, full_name")
    .eq("id", user.id)
    .single();
  console.log('[AdminChef] profile phone_last4', profile?.phone_last4);
  if (!profile) return false;
  const { data: admin } = await supabase
    .from("adminchef_access")
    .select("id, display_name, role, is_active")
    .eq("phone_number", profile.phone_number)
    .eq("phone_last4", profile.phone_last4)
    .eq("is_active", true)
    .single();
  console.log('[AdminChef] access row found?', !!admin);
  const allowed = !!admin;
  console.log('[AdminChef] allowed', allowed);
  return allowed;
}

// Throws/redirects if not an active AdminChef, returns admin info if allowed
export async function requireAdminChef() {
  const supabase = getServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/nearby");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone_number, phone_last4, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/nearby");
  const { data: admin } = await supabase
    .from("adminchef_access")
    .select("id, display_name, role, is_active")
    .eq("phone_number", profile.phone_number)
    .eq("phone_last4", profile.phone_last4)
    .eq("is_active", true)
    .single();
  if (!admin) redirect("/nearby");
  return { ...admin, profile };
}
