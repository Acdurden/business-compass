import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side route guard for advisor/admin-only routes.
 * Use inside `beforeLoad` on routes with `ssr: false`.
 * Redirects to /auth when no Supabase session exists, and to /client when
 * the signed-in user is a client (not an advisor).
 *
 * Also enforces the forced password change. Until 2026-09-18 that check lived
 * only in the sign-in handler at `auth.tsx`, so an advisor created with a
 * temporary password who navigated straight to /advisor or /admin/submissions
 * was in the back office with that password still live and was never asked
 * again. `allowTempPassword` exists for the change-password route itself,
 * which would otherwise redirect to itself forever.
 */
export async function requireAdvisorAuth(
  currentHref: string,
  opts?: { allowTempPassword?: boolean },
) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({
      to: "/auth",
      search: { redirect: currentHref },
    });
  }
  const { data: isAdvisor } = await supabase.rpc("has_role", {
    _user_id: data.session.user.id,
    _role: "advisor",
  });
  if (!isAdvisor) {
    const { data: isClient } = await supabase.rpc("has_role", {
      _user_id: data.session.user.id,
      _role: "client",
    });
    if (isClient) throw redirect({ to: "/client" });
    throw redirect({ to: "/auth", search: { redirect: currentHref } });
  }
  if (!opts?.allowTempPassword && data.session.user.user_metadata?.must_change_password) {
    throw redirect({ to: "/advisor/change-password" });
  }
  return { userId: data.session.user.id, email: data.session.user.email ?? "" };
}
