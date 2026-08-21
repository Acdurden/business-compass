/**
 * Reading templates the way a *send* needs them, in one place.
 *
 * Three modules were each carrying their own copy of "row, or shipped default"
 * and each copy quietly disagreed about the sender address. This is the single
 * version, and it is where the sender fallback lives.
 *
 * THE SENDER FALLBACK. A sending address is an account-level fact, not a
 * per-template one: there is one mailbox, and Cloudflare verified it once.
 * Storing it per template meant configuring `invite` left `nudge` and
 * `review_ready` un-configured, so two of the three real buttons would have
 * opened onto "This email has no sender address" on a system that was in fact
 * fully configured. A template's own address still wins when it has one — that
 * is what makes a deliberate per-template override possible — but a template
 * without one borrows the first address that is set rather than refusing.
 *
 * This is a `.server.ts` module: it reads the service-role client. Import it
 * only from inside a handler.
 */

import {
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplate,
  type EmailTemplateKey,
} from "@/lib/email-templates";

function rowToTemplate(key: EmailTemplateKey, row: Record<string, unknown> | null): EmailTemplate {
  const fallback = EMAIL_TEMPLATE_DEFAULTS[key];
  if (!row) return fallback;
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

async function loadRows(): Promise<Map<string, Record<string, unknown>>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("email_templates")
    .select("key, from_name, from_email, subject, body, cta_label");

  const saved = new Map<string, Record<string, unknown>>();
  ((data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    saved.set(String(row.key ?? ""), row);
  });
  return saved;
}

/**
 * The address a send will actually use, or null when nothing is configured
 * anywhere. Deterministic: templates are considered in their listed order, so
 * this does not change answer between two calls.
 */
export function effectiveSender(templates: Array<{ fromEmail: string | null }>): string | null {
  return templates.find((t) => t.fromEmail)?.fromEmail ?? null;
}

/** Every template as stored, in listed order, with no fallback applied. */
export async function loadAllTemplates(): Promise<EmailTemplate[]> {
  const saved = await loadRows();
  return EMAIL_TEMPLATE_KEYS.map((key) => rowToTemplate(key, saved.get(key) ?? null));
}

/**
 * One template, ready to send: its own sender address if it has one, otherwise
 * the account's. Use this everywhere a message is about to go out.
 */
export async function loadTemplateForSending(key: EmailTemplateKey): Promise<EmailTemplate> {
  const all = await loadAllTemplates();
  const mine = all.find((t) => t.key === key) ?? EMAIL_TEMPLATE_DEFAULTS[key];
  if (mine.fromEmail) return mine;
  return { ...mine, fromEmail: effectiveSender(all) };
}
