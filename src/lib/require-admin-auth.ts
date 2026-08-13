import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side route guard for admin-only routes.
 * Use inside `beforeLoad` on routes with `ssr: false`.
 * Redirects to /auth when no Supabase session exists, to /client when the
 * signed-in user is a client, and to /advisor when the user is a non-admin
 * advisor. Only users with the `admin` role are allowed through.
 *
 * NOTE: this is a UX guard only — the real authorization boundary is enforced
 * server-side in questionnaire-admin.functions.ts (ensureAdmin).
 */
export async function requireAdminAuth(currentHref: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({
      to: "/auth",
      search: { redirect: currentHref },
    });
  }
  const userId = data.session.user.id;
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) {
    const { data: isAdvisor } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "advisor",
    });
    if (isAdvisor) throw redirect({ to: "/admin/submissions" });
    const { data: isClient } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "client",
    });
    if (isClient) throw redirect({ to: "/client" });
    throw redirect({ to: "/auth", search: { redirect: currentHref } });
  }
  return { userId, email: data.session.user.email ?? "" };
}
