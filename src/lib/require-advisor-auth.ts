import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side route guard for advisor/admin-only routes.
 * Use inside `beforeLoad` on routes with `ssr: false`.
 * Redirects to /auth when no Supabase session exists.
 */
export async function requireAdvisorAuth(currentHref: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({
      to: "/auth",
      search: { redirect: currentHref },
    });
  }
  return { userId: data.session.user.id, email: data.session.user.email ?? "" };
}
