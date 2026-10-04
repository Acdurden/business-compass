import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

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
      const found = existing.data?.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
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
      const found = existing.data?.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
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
      .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
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
    /**
     * Admin, not advisor. The Advisors screen this is called from has always
     * been admin-only, but the check here said advisor — so any advisor could
     * have created a colleague by calling the function directly. Tightened to
     * match what the screen already claimed.
     */
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) {
      throw new Error("Forbidden: admin role required");
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
      const found = existing.data?.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
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

// ---------------------------------------------------------------------------
// Per-person invites.
//
// One row in client_invites per person invited. The token is their link: it
// carries the address it was issued to and the plan, works once, and can be
// revoked. The two reusable codes in invite_codes still work beside it.
// ---------------------------------------------------------------------------

type ClientInviteRow = {
  token: string;
  email: string;
  first_name: string | null;
  plan: string;
  created_at: string;
  sent_at: string | null;
  send_count: number;
  accepted_at: string | null;
  revoked_at: string | null;
};

const INVITE_COLUMNS =
  "token, email, first_name, plan, created_at, sent_at, send_count, accepted_at, revoked_at";

/**
 * 32 letters and digits, picked from random bytes. Letters and digits only on
 * purpose: a link that ends in "-" or "_" loses that last character in some
 * chat apps when they turn pasted text into a link, and the result reads as a
 * dead invite. 62 to the 32nd is far past anything that can be guessed.
 */
function generateInviteToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Where an invite stands, in the order the answers matter. */
export type ClientInviteStatus = "revoked" | "accepted" | "sent" | "created";

export type ClientInvite = {
  token: string;
  email: string;
  firstName: string;
  plan: "objective" | "full";
  status: ClientInviteStatus;
  createdAt: string;
  sentAt: string | null;
  sendCount: number;
  acceptedAt: string | null;
};

function toClientInvite(row: ClientInviteRow): ClientInvite {
  const status: ClientInviteStatus = row.revoked_at
    ? "revoked"
    : row.accepted_at
      ? "accepted"
      : row.sent_at
        ? "sent"
        : "created";
  return {
    token: row.token,
    email: row.email,
    firstName: row.first_name ?? "",
    plan: row.plan === "objective" ? "objective" : "full",
    status,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    sendCount: row.send_count,
    acceptedAt: row.accepted_at,
  };
}

async function ensureAdvisorRole(context: AuthedContext) {
  const { data: isAdvisor } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "advisor",
  });
  if (isAdvisor !== true) throw new Error("Forbidden: advisor role required");
}

/**
 * Invite one person. Returns their invite, new or existing.
 *
 * Inviting an address that already holds an open invite updates that invite
 * rather than issuing a second link: two live links for one person is how
 * someone ends up signing up on the plan from the older email.
 */
export const createClientInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; firstName: string; plan: string }) => {
    const email = String(input?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("That does not look like an email address");
    }
    const firstName = String(input?.firstName ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (firstName.length > 60) throw new Error("That first name is too long");
    const plan: "objective" | "full" = input?.plan === "objective" ? "objective" : "full";
    return { email, firstName, plan };
  })
  .handler(async ({ data, context }): Promise<ClientInvite> => {
    await ensureAdvisorRole(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    /*
     * Someone who already has an account cannot use an invite: sign-up would
     * tell them the account exists. Better the advisor hears that now than the
     * client hears it after choosing a password.
     */
    const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const taken = users.data?.users.some((u) => (u.email ?? "").toLowerCase() === data.email);
    if (taken) {
      throw new Error(
        "This address already has a Kriterion account. They can sign in on the client sign-in page.",
      );
    }

    const { data: open, error: openErr } = await supabaseAdmin
      .from("client_invites")
      .select(INVITE_COLUMNS)
      .eq("email", data.email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openErr) throw new Error(openErr.message);

    if (open) {
      const openRow = open as ClientInviteRow;
      /*
       * A link that has already gone out keeps the plan it went out with. The
       * person holding it was told one thing, and quietly switching the plan
       * underneath them is how someone ends up on a plan nobody chose. Revoking
       * and inviting again is two clicks and leaves a record.
       */
      if (openRow.sent_at && openRow.plan !== data.plan) {
        const current = openRow.plan === "objective" ? "Objective only" : "Full service";
        throw new Error(
          `This address already has an invite on the ${current} plan, and it has been emailed. Revoke that invite first if the plan should change.`,
        );
      }
      const { data: updated, error } = await supabaseAdmin
        .from("client_invites")
        .update({
          // A blank name on a re-invite means "not typed", not "remove it".
          first_name: data.firstName || openRow.first_name,
          plan: data.plan,
        })
        .eq("token", openRow.token)
        .select(INVITE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toClientInvite(updated as ClientInviteRow);
    }

    const { data: created, error } = await supabaseAdmin
      .from("client_invites")
      .insert({
        token: generateInviteToken(),
        email: data.email,
        first_name: data.firstName || null,
        plan: data.plan,
        created_by: context.userId,
      })
      .select(INVITE_COLUMNS)
      .single();
    if (error) {
      // 23505: the one-open-invite-per-address index. Two advisors invited the
      // same person at the same moment and the other one got there first.
      if (error.code === "23505") {
        throw new Error("Someone else has just invited this address. Reload the list to see it.");
      }
      throw new Error(error.message);
    }
    return toClientInvite(created as ClientInviteRow);
  });

/** The most recent invites, newest first, for the Invite a client window. */
export const listClientInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ invites: ClientInvite[] }> => {
    await ensureAdvisorRole(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("client_invites")
      .select(INVITE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { invites: ((data ?? []) as ClientInviteRow[]).map(toClientInvite) };
  });

/**
 * Switch one invite off. The link stops working at once. An invite that has
 * already been used is left alone: revoking it would change nothing for the
 * account it created and would only blur the record.
 */
export const revokeClientInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    const token = String(input?.token ?? "").trim();
    if (!token) throw new Error("Missing invite");
    return { token };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await ensureAdvisorRole(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("client_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", data.token)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("token");
    if (error) throw new Error(error.message);
    // An update that matched nothing is not a revoke. Saying "revoked" about a
    // link somebody used a minute ago would be a false statement about an
    // account that now exists.
    if ((rows ?? []).length === 0) {
      throw new Error(
        "That invite could not be revoked. It has already been used or was revoked earlier.",
      );
    }
    return { ok: true };
  });

/** What `/invite` needs to know about the link it was opened with. */
export type InviteCheck = {
  valid: boolean;
  /** Why not, when it is not. "used" gets its own message: they have an account. */
  reason: "ok" | "used" | "inactive";
  /** Set for a per-person link: the address it was issued to, and their name. */
  personal: { email: string; firstName: string } | null;
};

/**
 * Is this invite link usable?
 *
 * Public on purpose, like `registerClientViaInvite` below: the code is the
 * gate, and there is no auth yet because the visitor has no account. It returns
 * only what the holder of that one link is entitled to know, never the list of
 * codes.
 *
 * A per-person link answers with the address it was issued to. Whoever holds
 * the link received it at that address, so this tells them nothing new, and it
 * lets the form arrive with the email already filled in.
 *
 * Added 2026-09-18. Until then `/invite` validated nothing until the form was
 * submitted, so someone holding a retired or mistyped link typed their email,
 * chose a password, confirmed it, waited through the spinner, and got a toast.
 * The filled-in form stayed on screen and a typo looked exactly like a retired
 * link.
 */
export const checkInviteCode = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => ({ code: String(input?.code ?? "").trim() }))
  .handler(async ({ data }): Promise<InviteCheck> => {
    if (!data.code) return { valid: false, reason: "inactive", personal: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    /* A lookup that failed is not a link that is invalid. Saying "invalid" on a
       database hiccup would send a legitimate client back to their advisor for
       a replacement they do not need. */
    const failed = new Error("We could not check that link. Please try again.");

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("client_invites")
      .select("email, first_name, accepted_at, revoked_at")
      .eq("token", data.code)
      .maybeSingle();
    if (invite) {
      if (invite.revoked_at) return { valid: false, reason: "inactive", personal: null };
      if (invite.accepted_at) return { valid: false, reason: "used", personal: null };
      return {
        valid: true,
        reason: "ok",
        personal: { email: invite.email, firstName: invite.first_name ?? "" },
      };
    }

    const { data: row, error } = await supabaseAdmin
      .from("invite_codes")
      .select("code")
      .eq("code", data.code)
      .eq("active", true)
      .maybeSingle();
    if (error) throw failed;
    if (row) return { valid: true, reason: "ok", personal: null };
    // Not a reusable code. If the personal lookup itself failed, the code may
    // still be someone's invite, and "we could not check" is the true answer.
    if (inviteErr) throw failed;
    return { valid: false, reason: "inactive", personal: null };
  });

// ---------------------------------------------------------------------------
// Client self-sign-up.
// A visitor lands on /invite?code=... , chooses a password, and this creates
// their client account. The code is either a per-person invite token or one of
// the reusable plan codes in invite_codes.
// No auth middleware: the code is the gate. Runs server-side via service role.
// ---------------------------------------------------------------------------
export const registerClientViaInvite = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; email: string; password: string }) => {
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
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const inactive = new Error(
      "This invite link is invalid or is no longer active. Please ask us for a new one.",
    );

    // 1. The code must be a live per-person invite, or an active reusable code.
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("client_invites")
      .select("token, email, first_name, plan, accepted_at, revoked_at")
      .eq("token", data.code)
      .maybeSingle();
    let email = data.email;
    let plan: "objective" | "full";
    let firstName = "";

    if (invite) {
      if (invite.revoked_at) throw inactive;
      if (invite.accepted_at) {
        return { ok: false as const, reason: "exists" as const, email: invite.email };
      }
      /*
       * A personal link creates an account for the address it was issued to and
       * no other. The form shows that address read-only, so a different one can
       * only arrive when the link check failed and the form fell back to an
       * empty, editable field. Creating the account under an address the person
       * did not type would leave them unable to sign in, so say so instead.
       */
      if (data.email !== invite.email.toLowerCase()) {
        throw new Error(
          "This link was sent to a different email address. Use the address your invite arrived at.",
        );
      }
      email = invite.email;
      plan = invite.plan === "objective" ? "objective" : "full";
      firstName = invite.first_name ?? "";
    } else {
      const { data: codeRow, error: codeErr } = await supabaseAdmin
        .from("invite_codes")
        .select("code, active, plan")
        .eq("code", data.code)
        .eq("active", true)
        .maybeSingle();
      if (codeErr) throw new Error("Could not validate invite link");
      if (!codeRow) {
        // Neither kind of link. If the personal lookup failed rather than came
        // back empty, this may be a good invite we could not read.
        if (inviteErr) throw new Error("Could not validate invite link");
        throw inactive;
      }
      // The link decides the plan. Anything unrecognised falls back to full service.
      plan = codeRow.plan === "objective" ? "objective" : "full";
    }

    // 2. Create the client account, email pre-confirmed so they can sign in now.
    //
    // The plan goes in app_metadata, NOT user_metadata: a signed-in user can
    // update their own user_metadata through the Supabase client, which would
    // let a client promote themselves from objective-only to full service for
    // free. app_metadata is writable only with the service role, and
    // start_my_client_submission reads it from the JWT when stamping the
    // submission.
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      app_metadata: { plan },
      ...(firstName ? { user_metadata: { first_name: firstName } } : {}),
    });

    if (created.error || !created.data?.user?.id) {
      // Most common cause: an account already exists for this email.
      const existing = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing.data?.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) {
        return {
          ok: false as const,
          reason: "exists" as const,
          email,
        };
      }
      throw new Error(created.error?.message ?? "Could not create your account");
    }

    const userId = created.data.user.id;

    // 3. Grant the client role (idempotent).
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    // 4. Any open invite for this address is now spent, whichever link they
    //    used: their own, or a reusable one while an invite sat in their inbox.
    //    The account exists either way, so a failure to record it must not fail
    //    the sign-up; the worst case is an invite that still reads as open for
    //    an address that now has an account, which sign-up already answers
    //    correctly.
    try {
      await supabaseAdmin
        .from("client_invites")
        .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
        .eq("email", email)
        .is("accepted_at", null)
        .is("revoked_at", null);
    } catch {
      /* The account stands. */
    }

    return { ok: true as const, userId, email, plan };
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("invite_codes")
      .select("code, label, plan")
      .eq("active", true)
      .order("created_at", { ascending: true });

    const links: InviteLink[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      code: String(r.code ?? ""),
      label: String(r.label ?? ""),
      plan: r.plan === "objective" ? "objective" : "full",
    }));
    // Full service first -- it is the default offer.
    links.sort((a, b) => (a.plan === b.plan ? 0 : a.plan === "full" ? -1 : 1));
    return { links };
  });
