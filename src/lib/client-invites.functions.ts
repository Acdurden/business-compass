import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const inviteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; redirectTo: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    const redirectTo = String(input?.redirectTo ?? "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }
    if (!redirectTo.startsWith("http")) {
      throw new Error("Invalid redirect");
    }
    return { email, redirectTo };
  })
  .handler(async ({ data, context }) => {
    // Caller must be an advisor (i.e. NOT a client account).
    const { data: isClientRow } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "client",
    });
    if (isClientRow === true) {
      throw new Error("Forbidden: client accounts cannot invite other clients");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Try to invite. If the user already exists, fall back to a magic-link style
    // recovery so the client can (re)set a password.
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
    });

    let userId = invite.data?.user?.id ?? null;

    if (invite.error || !userId) {
      // Look up the existing user by listing — fall back gracefully.
      const existing = await supabaseAdmin.auth.admin.listUsers();
      const found = existing.data?.users.find(
        (u) => (u.email ?? "").toLowerCase() === data.email,
      );
      if (!found) {
        throw new Error(invite.error?.message ?? "Could not invite user");
      }
      userId = found.id;
      // Re-send an invite-style link so they can set/reset their password.
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
        options: { redirectTo: data.redirectTo },
      });
    }

    // Stamp the client role (idempotent).
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email };
  });
