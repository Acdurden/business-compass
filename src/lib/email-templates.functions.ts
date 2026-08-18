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

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

// ============================================================
// Email template editor — server functions.
//
// Admin-only, matching the questionnaire editor: advisors send the emails,
// admins own the standard wording. The route guard is a UX convenience; this
// is the actual authorization boundary.
// ============================================================

async function ensureAdmin(context: AuthedContext) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (isAdmin !== true) {
    throw new Error("Forbidden: admin role required");
  }
}

function isTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as string[]).includes(value);
}

/**
 * Every template, in the order the editor lists them.
 *
 * A key with no row is returned as its shipped default rather than skipped, so
 * an empty table (which is the state on the day this ships) still opens onto a
 * complete, working screen.
 */
export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailTemplate[]> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("email_templates")
      .select("key, from_name, from_email, subject, body, cta_label");
    if (error) throw new Error(error.message);

    const saved = new Map<string, Record<string, unknown>>();
    ((data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
      saved.set(String(row.key ?? ""), row);
    });

    return EMAIL_TEMPLATE_KEYS.map((key) => {
      const fallback = EMAIL_TEMPLATE_DEFAULTS[key];
      const row = saved.get(key);
      if (!row) return fallback;
      const fromEmail = row.from_email == null ? null : String(row.from_email);
      return {
        key,
        fromName: String(row.from_name ?? fallback.fromName),
        fromEmail: fromEmail && fromEmail.trim() ? fromEmail.trim() : null,
        subject: String(row.subject ?? fallback.subject),
        body: String(row.body ?? fallback.body),
        ctaLabel: String(row.cta_label ?? fallback.ctaLabel),
      };
    });
  });

type SaveInput = {
  key: string;
  fromName: string;
  fromEmail: string | null;
  subject: string;
  body: string;
  ctaLabel: string;
};

/**
 * Write one template. Everything an admin can type is validated here as well as
 * in the form: the form is a courtesy, this is the rule.
 */
export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveInput) => {
    const key = String(input?.key ?? "").trim();
    if (!isTemplateKey(key)) throw new Error("Unknown template");

    const fromName = String(input?.fromName ?? "").trim();
    if (!fromName) throw new Error("The sender name cannot be empty");
    if (fromName.length > 80) throw new Error("The sender name is too long");

    const rawEmail = String(input?.fromEmail ?? "")
      .trim()
      .toLowerCase();
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      throw new Error("That does not look like an email address");
    }

    const subject = String(input?.subject ?? "").trim();
    if (!subject) throw new Error("The subject line cannot be empty");
    if (subject.length > 200) throw new Error("The subject line is too long");

    // Store line endings as LF only. A CRLF body would compare unequal to the
    // shipped default forever and would show as "edited" the moment it was
    // saved untouched.
    const body = String(input?.body ?? "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!body) throw new Error("The body cannot be empty");

    const ctaLabel = String(input?.ctaLabel ?? "").trim();
    if (!ctaLabel) throw new Error("The button needs a label");
    if (ctaLabel.length > 60) throw new Error("The button label is too long");

    return {
      key,
      fromName,
      fromEmail: rawEmail || null,
      subject,
      body,
      ctaLabel,
    };
  })
  .handler(async ({ data, context }): Promise<EmailTemplate> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("email_templates").upsert(
      {
        key: data.key,
        from_name: data.fromName,
        from_email: data.fromEmail,
        subject: data.subject,
        body: data.body,
        cta_label: data.ctaLabel,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);

    return {
      key: data.key,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      subject: data.subject,
      body: data.body,
      ctaLabel: data.ctaLabel,
    };
  });
