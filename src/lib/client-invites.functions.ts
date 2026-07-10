import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out + Math.floor(Math.random() * 10);
}


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
    // Caller must explicitly hold the advisor role.
    const { data: isAdvisor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "advisor",
    });
    if (isAdvisor !== true) {
      throw new Error("Forbidden: advisor role required");
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

export const createTestClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }
    return { email };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdvisor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "advisor",
    });
    if (isAdvisor !== true) {
      throw new Error("Forbidden: advisor role required");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const password = generateTempPassword();

    let userId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
    });
    if (created.data?.user?.id) {
      userId = created.data.user.id;
    } else {
      const existing = await supabaseAdmin.auth.admin.listUsers();
      const found = existing.data?.users.find(
        (u) => (u.email ?? "").toLowerCase() === data.email,
      );
      if (!found) {
        throw new Error(created.error?.message ?? "Could not create user");
      }
      userId = found.id;
      const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (upd.error) throw new Error(upd.error.message);
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email, tempPassword: password };
  });


export const createAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }
    return { email };
  })
  .handler(async ({ data, context }) => {
    // Caller must explicitly hold the advisor role.
    const { data: isAdvisor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "advisor",
    });
    if (isAdvisor !== true) {
      throw new Error("Forbidden: advisor role required");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const password = generateTempPassword();

    let userId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });
    if (created.data?.user?.id) {
      userId = created.data.user.id;
    } else {
      const existing = await supabaseAdmin.auth.admin.listUsers();
      const found = existing.data?.users.find(
        (u) => (u.email ?? "").toLowerCase() === data.email,
      );
      if (!found) {
        throw new Error(created.error?.message ?? "Could not create user");
      }
      userId = found.id;
      const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });
      if (upd.error) throw new Error(upd.error.message);
    }

    // Refuse to grant advisor to an account that's already a client.
    const { data: existingClient } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "client")
      .maybeSingle();
    if (existingClient) {
      throw new Error("This account is already a client; cannot also be an advisor");
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "advisor" }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email, tempPassword: password };

  });

