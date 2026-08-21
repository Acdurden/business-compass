import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplate,
  type EmailTemplateKey,
} from "@/lib/email-templates";
import { renderEmail } from "@/lib/email-render";

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

// ============================================================
// Sending, through Cloudflare Email Service.
//
// The Worker cannot open an SMTP socket, so this goes over Cloudflare's REST
// API. The token never leaves the server: this module is only ever reached
// through a server function, and the token is read from the Worker environment
// that Andrew sets himself.
//
// Everything here refuses loudly rather than half-working. An email that
// silently does not send is worse than a button that says why it cannot.
// ============================================================

const SEND_ENDPOINT = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

async function ensureAdvisor(context: AuthedContext) {
  const { data: isAdvisor } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "advisor",
  });
  if (isAdvisor !== true) throw new Error("Forbidden: advisor role required");
}

/** The three things that must all be true before anything can be sent. */
export type SendingStatus = {
  /** A Cloudflare API token is present in the Worker environment. */
  hasToken: boolean;
  /** The Cloudflare account id is present. */
  hasAccount: boolean;
  /** Templates that still have no sender address on them. */
  missingSender: EmailTemplateKey[];
  /** True only when a message could actually go out. */
  ready: boolean;
};

async function loadTemplate(key: EmailTemplateKey): Promise<EmailTemplate> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("email_templates")
    .select("key, from_name, from_email, subject, body, cta_label")
    .eq("key", key)
    .maybeSingle();

  const fallback = EMAIL_TEMPLATE_DEFAULTS[key];
  if (!data) return fallback;

  const row = data as Record<string, unknown>;
  const fromEmail = row.from_email == null ? null : String(row.from_email).trim();
  return {
    key,
    fromName: String(row.from_name ?? fallback.fromName),
    fromEmail: fromEmail || null,
    subject: String(row.subject ?? fallback.subject),
    body: String(row.body ?? fallback.body),
    ctaLabel: String(row.cta_label ?? fallback.ctaLabel),
  };
}

/**
 * Why the Send buttons are or are not available.
 *
 * The screen asks this rather than assuming, so a button is never offered that
 * cannot do anything — the failure this whole workstream started from.
 */
export const getSendingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SendingStatus> => {
    await ensureAdvisor(context);

    const hasToken = Boolean(process.env.CLOUDFLARE_EMAIL_API_TOKEN);
    const hasAccount = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);

    const missingSender: EmailTemplateKey[] = [];
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const template = await loadTemplate(key);
      if (!template.fromEmail) missingSender.push(key);
    }

    return {
      hasToken,
      hasAccount,
      missingSender,
      ready: hasToken && hasAccount && missingSender.length < EMAIL_TEMPLATE_KEYS.length,
    };
  });

type CloudflareError = { message?: string; code?: number };
type CloudflareResponse = {
  success?: boolean;
  errors?: CloudflareError[];
  messages?: CloudflareError[];
  result?: unknown;
};

/**
 * The one place a message is actually handed to Cloudflare.
 *
 * Errors are rethrown with Cloudflare's own wording where there is any, because
 * "could not send" tells nobody whether the token is wrong, the domain is not
 * verified, or the plan does not allow it.
 */
async function deliver(input: {
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      "Sending is not switched on yet: the Cloudflare account id and API token are not set in the Worker environment.",
    );
  }

  const response = await fetch(SEND_ENDPOINT(accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    /*
     * `from` goes as an object with `address` and `name`, which is what the
     * REST API documents. The combined "Name <address>" form was accepted with
     * success:true and produced no mail and no activity-log entry — the API is
     * lenient about the shape and silent about the consequence.
     * Note the field is `address`, not `email`.
     */
    body: JSON.stringify({
      from: { address: input.fromEmail, name: input.fromName },
      to: input.to,
      reply_to: input.replyTo ?? input.fromEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  /**
   * Cloudflare's v4 API answers 200 OK with `success: false` for most
   * rejections. Trusting the status code alone reports a send that never
   * happened — which is exactly what it did the first time this ran: the app
   * said "test sent" and Cloudflare's activity log had no record of it.
   * The body is the authority here, not the status line.
   */
  let body: CloudflareResponse | null = null;
  let raw = "";
  try {
    raw = await response.text();
    body = raw ? (JSON.parse(raw) as CloudflareResponse) : null;
  } catch {
    // Leave body null; `raw` is still the best evidence we have.
  }

  const messages = [...(body?.errors ?? []), ...(body?.messages ?? [])]
    .map((e) => e?.message)
    .filter((m): m is string => Boolean(m));

  const rejected = !response.ok || body?.success === false;
  if (rejected) {
    const detail =
      messages[0] ?? (raw ? raw.slice(0, 300) : `${response.status} ${response.statusText}`);
    throw new Error(`Cloudflare refused the message: ${detail}`);
  }

  /**
   * A 200 with neither `success: true` nor a recognisable body is not proof of
   * anything. Refusing it is better than another false confirmation.
   */
  if (body?.success !== true) {
    throw new Error(
      `Cloudflare did not confirm the send. It answered ${response.status} with: ${
        raw ? raw.slice(0, 300) : "an empty body"
      }`,
    );
  }

  /**
   * Hand back what Cloudflare actually returned. A bare "sent" has already
   * proved worthless twice; the id or status they quote is the only thing that
   * can be checked against their activity log.
   */
  return raw.slice(0, 300);
}

/**
 * Send one template to the signed-in advisor's own address.
 *
 * This exists so the first proof that sending works is one click and lands
 * somewhere harmless, rather than being discovered on a real client.
 */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; to?: string | null }) => {
    const key = String(input?.key ?? "").trim();
    if (!(EMAIL_TEMPLATE_KEYS as string[]).includes(key)) throw new Error("Unknown template");

    const to = String(input?.to ?? "")
      .trim()
      .toLowerCase();
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new Error("That does not look like an email address");
    }
    return { key: key as EmailTemplateKey, to: to || null };
  })
  .handler(async ({ data, context }): Promise<{ to: string; detail: string }> => {
    await ensureAdvisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    /**
     * The address is overridable so a failure can be pinned on the right party.
     * "It never arrives" at one mailbox proves nothing; the same message
     * arriving at a different provider and not at the first proves the
     * receiving end is filtering it, which is a different problem from a send
     * that never left.
     */
    let to = data.to;
    if (!to) {
      const { data: user, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
        context.userId,
      );
      if (userErr) throw new Error(userErr.message);
      to = user.user?.email ?? null;
    }
    if (!to) throw new Error("No address to send the test to");

    const template = await loadTemplate(data.key);
    if (!template.fromEmail) {
      throw new Error(
        "This template has no sender address yet. Set one at the top of the editor first.",
      );
    }

    const origin = process.env.PUBLIC_SITE_ORIGIN ?? "https://kriterionbvi.com";

    /**
     * Values are deliberately obvious placeholders rather than a real client's.
     * A test that reads exactly like a live email is a test somebody forwards
     * by mistake.
     */
    const values: Record<string, string> = {
      "{{advisor_name}}": template.fromName,
      "{{company}}": "[company name]",
      "{{valscore}}": "[score]",
      "{{band}}": "[band]",
      "{{opportunity}}": "[points]",
      "{{top_area}}": "[largest gap]",
      "{{top_points}}": "[points]",
      "{{action_count}}": "[actions]",
      "{{answered}}": "[answered]",
      "{{total}}": "[total]",
      "{{days}}": "[days]",
      "{{link}}": origin,
    };

    const rendered = renderEmail(template, values, origin);
    const detail = await deliver({
      fromName: template.fromName,
      fromEmail: template.fromEmail,
      to,
      subject: `[test] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });

    return { to, detail };
  });
