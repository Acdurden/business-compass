import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function assertRole(
  context: { supabase: any; userId: string },
  role: "advisor" | "admin",
) {
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
    const adminIds = new Set(
      (roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
    );

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
