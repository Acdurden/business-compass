import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EMAIL_TEMPLATE_KEYS,
  fillTags,
  type EmailTemplate,
  type EmailTemplateKey,
} from "@/lib/email-templates";
import { renderEmail } from "@/lib/email-render";
import { buildConfig, computeValuation } from "@/lib/valscore_calc";
import { buildOpportunities, totalOpportunity, type SectionMeta } from "@/lib/score-display";
import {
  DEFAULT_VALUATION_INPUT_AMOUNT,
  DEFAULT_VALUATION_INPUT_TYPE,
} from "@/lib/valuation-defaults";

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

// ============================================================
// Composing a real email to a real client.
//
// Andrew's rule for this whole workstream: ONE CLICK, HE APPROVES. Nothing
// fires on its own. `getEmailDraft` fills the template with that client's own
// figures and hands back editable text; `sendComposedEmail` sends exactly what
// came back, edits included.
//
// The draft carries its own reasons. `blocked` means the send is refused and
// why; `warning` means it would work but the advisor should look first. Both
// are plain sentences, because they are shown to a person, not logged.
// ============================================================

export type EmailDraft = {
  key: EmailTemplateKey;
  /** Who it goes to. Null when the app cannot know yet — an invite. */
  to: string | null;
  subject: string;
  /** Tags already resolved. What the advisor edits is what is sent. */
  body: string;
  /**
   * The name the message appears to come from, as the template has it. Shown as
   * an editable field so one message can go out under a person's name without
   * changing the template for everyone.
   */
  fromName: string;
  /**
   * True when no name is saved on the advisor's account and the template's name
   * is standing in. The compose window says so rather than implying the name
   * came from the person sending it.
   */
  fromNameIsFallback: boolean;
  /** The sending address. Fixed, and shown only so the advisor can see it. */
  fromEmail: string | null;
  ctaLabel: string;
  ctaUrl: string;
  /** Why this cannot be sent at all, in plain words. Null when it can. */
  blocked: string | null;
  /** Something worth seeing before sending, but not a refusal. */
  warning: string | null;
};

async function ensureAdvisor(context: AuthedContext) {
  const { data: isAdvisor } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "advisor",
  });
  if (isAdvisor !== true) throw new Error("Forbidden: advisor role required");
}

function isTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as string[]).includes(value);
}

/** Server-only, and it carries the sender fallback. See email-store.server.ts. */
async function loadTemplate(key: EmailTemplateKey): Promise<EmailTemplate> {
  const { loadTemplateForSending } = await import("@/lib/email-store.server");
  return loadTemplateForSending(key);
}

function siteOrigin(): string {
  return process.env.PUBLIC_SITE_ORIGIN ?? "https://kriterionbvi.com";
}

/**
 * Everything the review-ready email quotes, computed from the client's own
 * rows through the same engine the client summary uses. A second calculation
 * of the same number is a second chance to disagree with it.
 */
async function reviewValues(submissionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [subRes, responsesRes, questionsRes, sectionsRes, bandsRes, multiplesRes, problemsRes] =
    await Promise.all([
      supabaseAdmin
        .from("submissions")
        .select(
          "submission_id, company_name, plan, client_status, advisor_status, owner_user_id, updated_at, valuation_input_type, valuation_input_amount",
        )
        .eq("submission_id", submissionId)
        .maybeSingle(),
      supabaseAdmin
        .from("responses")
        .select("submission_id, section_id, questionnaire_type, points_awarded")
        .eq("submission_id", submissionId),
      supabaseAdmin
        .from("questions")
        .select("section_id, questionnaire_type, max_score")
        .eq("active", true),
      supabaseAdmin
        .from("sections")
        .select("section_id, section_name, questionnaire_type, sort_order")
        .eq("active", true),
      supabaseAdmin.from("score_bands").select("band_type, min_score, max_score, label"),
      supabaseAdmin.from("valuation_multiples").select("band_index, nfi_multiple, ebitda_multiple"),
      supabaseAdmin.from("submission_problems").select("id").eq("submission_id", submissionId),
    ]);

  const submission = subRes.data as Record<string, unknown> | null;
  const responses = (responsesRes.data ?? []) as Array<Record<string, unknown>>;
  const questions = (questionsRes.data ?? []) as Array<Record<string, unknown>>;
  const sections = (sectionsRes.data ?? []) as SectionMeta[];
  const problemIds = ((problemsRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);

  let actionCount = 0;
  if (problemIds.length > 0) {
    const cures = await supabaseAdmin
      .from("submission_cures")
      .select("id")
      .in("submission_problem_id", problemIds);
    actionCount = (cures.data ?? []).length;
  }

  const advisoryAnswers = responses.filter((r) => r.questionnaire_type === "advisory").length;
  const config = buildConfig((bandsRes.data ?? []) as never, (multiplesRes.data ?? []) as never);

  const computed = computeValuation(
    responses as never,
    questions as never,
    {
      valuationInputType:
        (submission?.valuation_input_type as "netfeeincome" | "ebitda" | null) ??
        DEFAULT_VALUATION_INPUT_TYPE,
      valuationInputAmount: Number(
        submission?.valuation_input_amount ?? DEFAULT_VALUATION_INPUT_AMOUNT,
      ),
      targetValuation: 0,
    },
    config,
  );

  const plan = submission?.plan === "objective" ? "objective" : "full";
  const opportunities = buildOpportunities(sections, computed.sectionScores, plan);

  return {
    submission,
    computed,
    opportunities,
    actionCount,
    problemCount: problemIds.length,
    advisoryAnswers,
  };
}

async function ownerEmail(ownerUserId: string | null): Promise<string | null> {
  if (!ownerUserId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(ownerUserId);
  return data.user?.email ?? null;
}

/**
 * Build the draft for one email, filled with one client's own figures.
 */
export const getEmailDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; submissionId?: string | null; plan?: string | null }) => {
    const key = String(input?.key ?? "").trim();
    if (!isTemplateKey(key)) throw new Error("Unknown template");
    const submissionId = String(input?.submissionId ?? "").trim() || null;
    const plan = String(input?.plan ?? "").trim() || null;
    return { key, submissionId, plan };
  })
  .handler(async ({ data, context }): Promise<EmailDraft> => {
    await ensureAdvisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const template = await loadTemplate(data.key);
    const origin = siteOrigin();

    let blocked: string | null = null;
    let warning: string | null = null;

    const { sendingIsConfigured } = await import("@/lib/email-delivery.server");
    if (!sendingIsConfigured()) {
      blocked = "Kriterion has no credentials for the sending service yet.";
    } else if (!template.fromEmail) {
      blocked = "This email has no sender address. Set one on the Emails screen first.";
    }

    /**
     * Who this appears to come from.
     *
     * The template's own name is the fallback, not the answer. An invite reads
     * as a personal message, so it should carry the name of whoever is actually
     * sending it. Only the first name is used: "Dan" is what a person signs,
     * "Dan Santy" is what a company signs.
     *
     * `{{advisor_name}}` resolves to the same value, so the sign-off at the
     * bottom of the message and the From line cannot disagree.
     */
    const me = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const savedName = String(me.data?.user?.user_metadata?.full_name ?? "").trim();
    const fromName = savedName.split(/\s+/)[0] || template.fromName;
    const fromNameIsFallback = savedName.length === 0;

    const values: Record<string, string> = { "{{advisor_name}}": fromName };
    let to: string | null = null;
    let ctaUrl = origin;

    if (data.key === "invite") {
      const wanted = data.plan === "objective" ? "objective" : "full";
      const { data: codes } = await supabaseAdmin
        .from("invite_codes")
        .select("code, plan, active")
        .eq("active", true);
      const rows = (codes ?? []) as Array<{ code: string; plan: string }>;
      const match = rows.find((c) => c.plan === wanted) ?? rows[0];
      if (!match) {
        blocked = blocked ?? "No active invite link is configured.";
      } else {
        ctaUrl = `${origin}/invite?code=${match.code}`;
      }
      values["{{link}}"] = ctaUrl;
    } else if (data.key === "nudge" || data.key === "review_ready") {
      if (!data.submissionId) throw new Error("submissionId required");
      const { submission, computed, opportunities, actionCount, problemCount, advisoryAnswers } =
        await reviewValues(data.submissionId);

      if (!submission) throw new Error("That submission no longer exists");

      to = await ownerEmail((submission.owner_user_id as string | null) ?? null);
      if (!to) {
        blocked =
          blocked ??
          "This assessment has no client account attached, so there is nowhere to send it.";
      }

      values["{{company}}"] = String(submission.company_name ?? "");

      if (data.key === "nudge") {
        ctaUrl = `${origin}/client`;
        const answered = (
          (
            await supabaseAdmin
              .from("responses")
              .select("response_id")
              .eq("submission_id", data.submissionId)
              .eq("questionnaire_type", "objective")
          ).data ?? []
        ).length;
        const total = (
          (
            await supabaseAdmin
              .from("questions")
              .select("question_id")
              .eq("active", true)
              .eq("questionnaire_type", "objective")
          ).data ?? []
        ).length;
        values["{{answered}}"] = String(answered);
        values["{{total}}"] = String(total);
        values["{{days}}"] = String(
          Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(String(submission.updated_at ?? Date.now())).getTime()) /
                86_400_000,
            ),
          ),
        );
        if (submission.client_status === "submitted" || submission.client_status === "complete") {
          warning = "This client has already finished their assessment. A nudge would be odd.";
        }
      } else {
        ctaUrl = `${origin}/client/summary`;
        const reviewIn =
          submission.advisor_status === "submitted" || submission.advisor_status === "final";

        /**
         * The same guard the client summary and the dashboard use: a ValScore
         * quoted without advisory answers is the objective half masquerading as
         * the whole thing.
         */
        if (!reviewIn || advisoryAnswers === 0) {
          blocked = blocked ?? "The review is not finished, so there is no score to send.";
        }

        values["{{valscore}}"] = String(Math.round(computed.valScore));
        values["{{band}}"] = computed.adjusted.marketPosition.toLowerCase();
        values["{{opportunity}}"] = String(totalOpportunity(opportunities));
        if (opportunities.length > 0) {
          values["{{top_area}}"] = opportunities[0].name;
          values["{{top_points}}"] = String(Math.round(opportunities[0].totalGap));
        }
        values["{{action_count}}"] = String(actionCount);

        if (!blocked && actionCount === 0) {
          warning =
            problemCount === 0
              ? "This client has no action plan yet, and the email promises one."
              : "Problems are flagged but no actions have been added, and the email promises a plan.";
        }
      }
      values["{{link}}"] = ctaUrl;
    } else {
      // password_reset is sent by the app when a client asks, never composed.
      blocked = blocked ?? "This email is sent automatically and cannot be composed by hand.";
    }

    return {
      key: data.key,
      to,
      subject: fillTags(template.subject, values),
      body: fillTags(template.body, values),
      fromName,
      fromNameIsFallback,
      fromEmail: template.fromEmail,
      ctaLabel: template.ctaLabel,
      ctaUrl,
      blocked,
      warning,
    };
  });

/**
 * Send exactly what came back from the draft, edits included.
 *
 * The body arriving here has already had its tags resolved, so nothing is
 * substituted a second time — what the advisor read on screen is what leaves.
 */
export const sendComposedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      key: string;
      to: string;
      subject: string;
      body: string;
      fromName: string;
      ctaLabel: string;
      ctaUrl: string;
    }) => {
      const key = String(input?.key ?? "").trim();
      if (!isTemplateKey(key)) throw new Error("Unknown template");

      const to = String(input?.to ?? "")
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        throw new Error("That does not look like an email address");
      }

      const subject = String(input?.subject ?? "").trim();
      if (!subject) throw new Error("The subject line cannot be empty");

      const body = String(input?.body ?? "")
        .replace(/\r\n?/g, "\n")
        .trim();
      if (!body) throw new Error("The message cannot be empty");

      // An empty From name would send as a bare address, which reads worse than
      // anything the template could say. The handler falls back when it is blank.
      const fromName = String(input?.fromName ?? "").trim();

      const ctaLabel = String(input?.ctaLabel ?? "").trim() || "Open Kriterion";
      const ctaUrl = String(input?.ctaUrl ?? "").trim();
      if (!/^https?:\/\//.test(ctaUrl)) throw new Error("The button link is not a valid address");

      return { key, to, subject, body, fromName, ctaLabel, ctaUrl };
    },
  )
  .handler(async ({ data, context }): Promise<{ to: string; detail: string }> => {
    await ensureAdvisor(context);

    const template = await loadTemplate(data.key);
    if (!template.fromEmail) {
      throw new Error("This email has no sender address. Set one on the Emails screen first.");
    }

    const rendered = renderEmail(
      { ...template, subject: data.subject, body: data.body, ctaLabel: data.ctaLabel },
      {},
      data.ctaUrl,
    );

    const { deliverEmail } = await import("@/lib/email-delivery.server");
    const detail = await deliverEmail({
      // What the advisor left in the From field wins. The template's name is
      // the fallback, so a cleared field cannot send as a bare address.
      fromName: data.fromName || template.fromName,
      fromEmail: template.fromEmail,
      to: data.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    return { to: data.to, detail };
  });
