import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side route guard for advisor/admin-only routes.
 * Use inside `beforeLoad` on routes with `ssr: false`.
 * Redirects to /auth when no Supabase session exists, and to /client when
 * the signed-in user is a client (not an advisor).
 */
export async function requireAdvisorAuth(currentHref: string) {
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
  return { userId: data.session.user.id, email: data.session.user.email ?? "" };
}
