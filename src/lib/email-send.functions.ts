import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
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

/** Server-only, and it carries the sender fallback. See email-store.server.ts. */
async function loadTemplate(key: EmailTemplateKey): Promise<EmailTemplate> {
  const { loadTemplateForSending } = await import("@/lib/email-store.server");
  return loadTemplateForSending(key);
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

    const { sendingIsConfigured } = await import("@/lib/email-delivery.server");
    const configured = sendingIsConfigured();
    const hasToken = configured;
    const hasAccount = configured;

    /*
     * One address configured anywhere covers every template — see the sender
     * fallback in email-store.server.ts. So this is all-or-nothing: either
     * Kriterion has a mailbox to send from or it has none.
     */
    const { loadAllTemplates, effectiveSender } = await import("@/lib/email-store.server");
    const all = await loadAllTemplates();
    const missingSender: EmailTemplateKey[] = effectiveSender(all) ? [] : [...EMAIL_TEMPLATE_KEYS];

    return {
      hasToken,
      hasAccount,
      missingSender,
      ready: hasToken && hasAccount && missingSender.length === 0,
    };
  });

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

    const { deliverEmail } = await import("@/lib/email-delivery.server");
    const rendered = renderEmail(template, values, origin);
    const detail = await deliverEmail({
      fromName: template.fromName,
      fromEmail: template.fromEmail,
      to,
      subject: `[test] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });

    return { to, detail };
  });
