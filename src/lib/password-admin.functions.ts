import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

function generateTempPassword(): string {
  // 12 chars, url-safe, avoids ambiguous chars
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  // Guarantee at least one digit
  return out + Math.floor(Math.random() * 10);
}

async function assertRole(context: AuthedContext, role: "advisor" | "admin") {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: role,
  });
  if (data !== true) throw new Error(`Forbidden: ${role} role required`);
}

export const resetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { submissionId: string }) => {
    const submissionId = String(input?.submissionId ?? "").trim();
    if (!submissionId) throw new Error("submissionId required");
    return { submissionId };
  })
  .handler(async ({ data, context }) => {
    await assertRole(context, "advisor");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("owner_user_id")
      .eq("submission_id", data.submissionId)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub?.owner_user_id) {
      throw new Error("This submission has no client account attached");
    }

    const tempPassword = generateTempPassword();
    const upd = await supabaseAdmin.auth.admin.updateUserById(sub.owner_user_id, {
      password: tempPassword,
      email_confirm: true,
    });
    if (upd.error) throw new Error(upd.error.message);

    return {
      ok: true,
      email: upd.data.user?.email ?? null,
      tempPassword,
    };
  });

export type AdvisorAccountRow = {
  user_id: string;
  email: string | null;
  is_admin: boolean;
  created_at: string | null;
  /**
   * The advisor's own name, empty until someone fills it in.
   *
   * There is no profiles table in this app; Supabase auth is the only account
   * store, so the name lives in the account's own metadata beside the flags
   * already kept there. Its first word becomes the From name on email the
   * advisor composes, which is why an empty one falls back to the template
   * rather than to something derived from the address — nobody should receive
   * an invite signed "Dsanty".
   */
  full_name: string;
};

export const listAdvisorAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorAccountRow[]> => {
    await assertRole(context, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const advisorIds = new Set(
      (roles ?? []).filter((r) => r.role === "advisor").map((r) => r.user_id),
    );
    const adminIds = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));

    const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (list.error) throw new Error(list.error.message);

    return (list.data?.users ?? [])
      .filter((u) => advisorIds.has(u.id))
      .map((u) => ({
        user_id: u.id,
        email: u.email ?? null,
        is_admin: adminIds.has(u.id),
        created_at: u.created_at ?? null,
        full_name: String(u.user_metadata?.full_name ?? "").trim(),
      }))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  });

/**
 * Set or clear an advisor's display name.
 *
 * Admin-gated and written through the service role, matching every other write
 * on this screen. Worth knowing: a signed-in user can also change their own
 * `user_metadata` through the Supabase client. That is acceptable here because
 * the name is not a permission — the compose window already lets an advisor put
 * any name on a single message — but it is the reason the plan flag lives in
 * `app_metadata` instead, and a name is the only thing that should join it here.
 */
export const setAdvisorDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; fullName: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("userId required");
    const fullName = String(input?.fullName ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return { userId, fullName };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; full_name: string }> => {
    await assertRole(context, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "advisor")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Target user is not an advisor");

    // Merge rather than replace: the account also carries must_change_password
    // and the verification flags, and overwriting the object would drop them.
    const existing = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (existing.error) throw new Error(existing.error.message);
    const meta = { ...(existing.data?.user?.user_metadata ?? {}), full_name: data.fullName };

    const upd = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      user_metadata: meta,
    });
    if (upd.error) throw new Error(upd.error.message);

    return { ok: true, full_name: data.fullName };
  });

export const resetAdvisorPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    await assertRole(context, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Confirm target is actually an advisor.
    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "advisor")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Target user is not an advisor");

    const tempPassword = generateTempPassword();
    const upd = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });
    if (upd.error) throw new Error(upd.error.message);

    return {
      ok: true,
      email: upd.data.user?.email ?? null,
      tempPassword,
    };
  });

/**
 * Remove an advisor account entirely.
 *
 * Three refusals, all deliberate:
 *   - you cannot delete yourself, because the click that locks you out of your
 *     own back office is unrecoverable from inside the app;
 *   - you cannot delete the last admin, for the same reason one step removed;
 *   - the target must actually hold the advisor role, so an id typed or
 *     tampered into the request cannot reach a client or a stranger.
 *
 * Submissions the advisor was assigned to are DETACHED, not deleted. A review
 * is the client's record, not the advisor's, and losing an assessment because
 * someone left the firm would be the worst possible outcome of a tidy-up.
 */
export const deleteAdvisorAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    await assertRole(context, "admin");

    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const rows = (roles ?? []) as Array<{ user_id: string; role: string }>;
    const isAdvisor = rows.some((r) => r.user_id === data.userId && r.role === "advisor");
    if (!isAdvisor) throw new Error("Target user is not an advisor");

    const admins = new Set(rows.filter((r) => r.role === "admin").map((r) => r.user_id));
    if (admins.has(data.userId) && admins.size <= 1) {
      throw new Error("This is the only admin account. Make someone else an admin first.");
    }

    // Keep the assessments, drop the assignment.
    const detach = await supabaseAdmin
      .from("submissions")
      .update({ advisor_id: null })
      .eq("advisor_id", data.userId);
    if (detach.error) throw new Error(detach.error.message);

    const delRole = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (delRole.error) throw new Error(delRole.error.message);

    const del = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (del.error) throw new Error(del.error.message);

    return { ok: true };
  });

export type ClientAccountRow = {
  user_id: string;
  email: string | null;
  created_at: string | null;
  /**
   * Null means the account was created but the person never signed in — the
   * clearest signal that a row is seed data rather than someone who stalled.
   */
  last_sign_in_at: string | null;
  company_names: string[];
};

export const listClientAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientAccountRow[]> => {
    await assertRole(context, "advisor");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "client");
    if (rolesErr) throw new Error(rolesErr.message);

    const clientIds = new Set((roles ?? []).map((r) => r.user_id));
    if (clientIds.size === 0) return [];

    const { data: subs, error: subsErr } = await supabaseAdmin
      .from("submissions")
      .select("owner_user_id, company_name")
      .not("owner_user_id", "is", null);
    if (subsErr) throw new Error(subsErr.message);

    const companiesByUser = new Map<string, string[]>();
    for (const s of subs ?? []) {
      if (!s.owner_user_id) continue;
      const arr = companiesByUser.get(s.owner_user_id) ?? [];
      if (s.company_name) arr.push(s.company_name);
      companiesByUser.set(s.owner_user_id, arr);
    }

    const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (list.error) throw new Error(list.error.message);

    return (list.data?.users ?? [])
      .filter((u) => clientIds.has(u.id))
      .map((u) => ({
        user_id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        company_names: companiesByUser.get(u.id) ?? [],
      }))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  });

export const resetClientPasswordByUserId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    await assertRole(context, "advisor");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "client")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Target user is not a client");

    const tempPassword = generateTempPassword();
    const upd = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });
    if (upd.error) throw new Error(upd.error.message);

    return {
      ok: true,
      email: upd.data.user?.email ?? null,
      tempPassword,
    };
  });

export const deleteClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    await assertRole(context, "advisor");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Confirm target is actually a client.
    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "client")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Target user is not a client");

    // Detach any submissions owned by this user so history is preserved.
    const detach = await supabaseAdmin
      .from("submissions")
      .update({ owner_user_id: null })
      .eq("owner_user_id", data.userId);
    if (detach.error) throw new Error(detach.error.message);

    // Remove role row(s).
    const delRole = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (delRole.error) throw new Error(delRole.error.message);

    // Delete the auth user.
    const del = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (del.error) throw new Error(del.error.message);

    return { ok: true };
  });
