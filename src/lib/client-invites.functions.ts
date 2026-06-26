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

export const createTestClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    const password = String(input?.password ?? "");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return { email, password };
  })
  .handler(async ({ data, context }) => {
    const { data: isClientRow } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "client",
    });
    if (isClientRow === true) {
      throw new Error("Forbidden: client accounts cannot create other clients");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Try to create a new confirmed user. If they already exist, update password.
    let userId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
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
        password: data.password,
        email_confirm: true,
      });
      if (upd.error) throw new Error(upd.error.message);
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email };
  });

export const createAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    const password = String(input?.password ?? "");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return { email, password };
  })
  .handler(async ({ data, context }) => {
    // Caller must already be an advisor (i.e. NOT a client account).
    const { data: isClientRow } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "client",
    });
    if (isClientRow === true) {
      throw new Error("Forbidden: client accounts cannot create advisor accounts");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
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
        password: data.password,
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

    return { ok: true, userId, email: data.email };
  });

