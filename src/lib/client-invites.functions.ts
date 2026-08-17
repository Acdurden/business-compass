import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++)
    out += alphabet[bytes[i]! % alphabet.length];
  return out + Math.floor(Math.random() * 10);
}

export const inviteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; redirectTo: string }) => {
    const email = String(input?.email ?? "")
      .trim()
      .toLowerCase();
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

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    // Try to invite. If the user already exists, fall back to a magic-link style
    // recovery so the client can (re)set a password.
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        redirectTo: data.redirectTo,
      },
    );

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
      .upsert(
        { user_id: userId, role: "client" },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email };
  });

export const createTestClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "")
      .trim()
      .toLowerCase();
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

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

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

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "client" },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email, tempPassword: password };
  });

export const createAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "")
      .trim()
      .toLowerCase();
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

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

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
      throw new Error(
        "This account is already a client; cannot also be an advisor",
      );
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "advisor" },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId, email: data.email, tempPassword: password };
  });

// ---------------------------------------------------------------------------
// Standalone client self-sign-up (reusable invite link).
// A visitor lands on /invite?code=... , enters their own email + password, and
// this creates their client account. Gated by an active code in invite_codes.
// No auth middleware: the code is the gate. Runs server-side via service role.
// ---------------------------------------------------------------------------
export const registerClientViaInvite = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { code: string; email: string; password: string }) => {
      const code = String(input?.code ?? "").trim();
      const email = String(input?.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(input?.password ?? "");
      if (!code) throw new Error("Missing invite code");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Please enter a valid email address");
      }
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      return { code, email, password };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    // 1. The invite code must exist and be active.
    const { data: codeRow, error: codeErr } = await supabaseAdmin
      .from("invite_codes")
      .select("code, active, plan")
      .eq("code", data.code)
      .eq("active", true)
      .maybeSingle();
    if (codeErr) throw new Error("Could not validate invite link");
    if (!codeRow) {
      throw new Error(
        "This invite link is invalid or is no longer active. Please ask your advisor for a new one.",
      );
    }

    // The link decides the plan. Anything unrecognised falls back to full service.
    const plan: "objective" | "full" =
      codeRow.plan === "objective" ? "objective" : "full";

    // 2. Create the client account, email pre-confirmed so they can sign in now.
    //
    // The plan goes in app_metadata, NOT user_metadata: a signed-in user can
    // update their own user_metadata through the Supabase client, which would
    // let a client promote themselves from objective-only to full service for
    // free. app_metadata is writable only with the service role, and
    // start_my_client_submission reads it from the JWT when stamping the
    // submission.
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: { plan },
    });

    if (created.error || !created.data?.user?.id) {
      // Most common cause: an account already exists for this email.
      const existing = await supabaseAdmin.auth.admin.listUsers();
      const found = existing.data?.users.find(
        (u) => (u.email ?? "").toLowerCase() === data.email,
      );
      if (found) {
        return {
          ok: false as const,
          reason: "exists" as const,
          email: data.email,
        };
      }
      throw new Error(
        created.error?.message ?? "Could not create your account",
      );
    }

    const userId = created.data.user.id;

    // 3. Grant the client role (idempotent).
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "client" },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true as const, userId, email: data.email, plan };
  });

export type InviteLink = {
  code: string;
  label: string;
  plan: "objective" | "full";
};

// Returns the active invite codes so the admin UI can build the shareable
// sign-up links -- one per plan, because the link a client signs up through is
// what puts them on that plan. Advisor-only.
export const getActiveInviteCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ links: InviteLink[] }> => {
    const { data: isAdvisor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "advisor",
    });
    if (isAdvisor !== true) {
      throw new Error("Forbidden: advisor role required");
    }

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("invite_codes")
      .select("code, label, plan")
      .eq("active", true)
      .order("created_at", { ascending: true });

    const links: InviteLink[] = (
      (rows ?? []) as Array<Record<string, unknown>>
    ).map((r) => ({
      code: String(r.code ?? ""),
      label: String(r.label ?? ""),
      plan: r.plan === "objective" ? "objective" : "full",
    }));
    // Full service first -- it is the default offer.
    links.sort((a, b) => (a.plan === b.plan ? 0 : a.plan === "full" ? -1 : 1));
    return { links };
  });
