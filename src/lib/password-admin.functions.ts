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
      }))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
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
