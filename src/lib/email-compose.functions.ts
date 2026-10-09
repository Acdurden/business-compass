import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  dropEmptyGreeting,
  EMAIL_TEMPLATE_KEYS,
  fillTags,
  greetingName,
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
  /** Who it goes to. Null only when the draft is blocked before it gets that far. */
  to: string | null;
  /**
   * True when the address is not the advisor's to change. An invite link works
   * only for the address it was issued to, so sending it anywhere else would
   * hand someone a link that creates another person's account.
   */
  toLocked: boolean;
  subject: string;
  /** Tags already resolved. What the advisor edits is what is sent. */
  body: string;
  /**
   * The name the message appears to come from. Shown as an editable field so
   * one message can go out under a different name without changing the
   * template for everyone.
   */
  fromName: string;
  /**
   * Whose name that is. An invite speaks as the company and goes out under the
   * template's name; everything else is an advisor writing to their own client
   * and goes out under the advisor's first name.
   */
  fromNameKind: "company" | "advisor";
  /**
   * True when no name is saved on the advisor's account and the template's name
   * is standing in. The compose window says so rather than implying the name
   * came from the person sending it. Never true for a company-voiced email.
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

/**
 * One invite, as far as composing and sending need it. Null when the token
 * matches nothing.
 */
async function loadInvite(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("client_invites")
    .select("token, email, first_name, send_count, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Why an invite cannot be emailed, in plain words. Null when it can. */
function inviteBlock(invite: Awaited<ReturnType<typeof loadInvite>>): string | null {
  if (!invite) return "That invite no longer exists. Create a new one from Invite a client.";
  if (invite.revoked_at) return "This invite was revoked, so its link no longer works.";
  if (invite.accepted_at) return "This person has already signed up with this invite.";
  return null;
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
  .inputValidator(
    (input: { key: string; submissionId?: string | null; inviteToken?: string | null }) => {
      const key = String(input?.key ?? "").trim();
      if (!isTemplateKey(key)) throw new Error("Unknown template");
      const submissionId = String(input?.submissionId ?? "").trim() || null;
      const inviteToken = String(input?.inviteToken ?? "").trim() || null;
      return { key, submissionId, inviteToken };
    },
  )
  .handler(async ({ data, context }): Promise<EmailDraft> => {
    await ensureAdvisor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const template = await loadTemplate(data.key);
    const { siteOrigin } = await import("@/lib/email-store.server");
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
     * An advisor-voiced email carries the first name of whoever is actually
     * sending it, with the template's own name as the fallback. Only the first
     * name is used: "Dan" is what a person signs, "Dan Santy" is what a company
     * signs. `{{advisor_name}}` resolves to the same value, so the sign-off at
     * the bottom of the message and the From line cannot disagree.
     *
     * The invite is the exception. It is the first thing a prospect receives
     * and it speaks and signs as Kriterion, so it goes out under the template's
     * name. `{{advisor_name}}` still resolves to the advisor, for a wording that
     * wants to name them.
     */
    const me = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const savedName = String(me.data?.user?.user_metadata?.full_name ?? "").trim();
    const advisorName = savedName.split(/\s+/)[0] || template.fromName;
    const fromNameKind: "company" | "advisor" = data.key === "invite" ? "company" : "advisor";
    const fromName = fromNameKind === "company" ? template.fromName : advisorName;
    const fromNameIsFallback = fromNameKind === "advisor" && savedName.length === 0;

    const values: Record<string, string> = { "{{advisor_name}}": advisorName };
    let toLocked = false;
    let to: string | null = null;
    let ctaUrl = origin;

    if (data.key === "invite") {
      /*
       * An invite is always to one person. The link is their own token, the
       * address is the one the token was issued to, and neither is editable in
       * the compose window.
       */
      toLocked = true;
      const invite = data.inviteToken ? await loadInvite(data.inviteToken) : null;
      if (!data.inviteToken) {
        blocked =
          blocked ?? "Invites go to one person at a time. Start from Invite a client instead.";
      } else {
        blocked = blocked ?? inviteBlock(invite);
      }
      if (invite) {
        to = invite.email;
        ctaUrl = `${origin}/invite?code=${invite.token}`;
        values["{{first_name}}"] = greetingName(invite.first_name);
        if (invite.send_count > 0 && !blocked) {
          warning =
            invite.send_count === 1
              ? "This invite has already been emailed once. Sending again uses the same link."
              : `This invite has already been emailed ${invite.send_count} times. Sending again uses the same link.`;
        }
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
        ctaUrl = `${origin}/client/valscore`;
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
        /*
         * No {{band}}. Andrew, 2026-09-18: the band is internal for now and
         * appears in nothing a client reads. It came out of /client/valscore,
         * the client PDF and the share card that day, and this line was missed:
         * the review-ready email was still posting it to them.
         */
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
      toLocked,
      subject: fillTags(template.subject, values),
      // A greeting with no name behind it is dropped before the tags are filled.
      body: fillTags(dropEmptyGreeting(template.body, values), values),
      fromName,
      fromNameKind,
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
      inviteToken?: string | null;
    }) => {
      const key = String(input?.key ?? "").trim();
      if (!isTemplateKey(key)) throw new Error("Unknown template");
      const inviteToken = String(input?.inviteToken ?? "").trim() || null;

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

      return { key, to, subject, body, fromName, ctaLabel, ctaUrl, inviteToken };
    },
  )
  .handler(async ({ data, context }): Promise<{ to: string; detail: string }> => {
    await ensureAdvisor(context);

    const template = await loadTemplate(data.key);
    if (!template.fromEmail) {
      throw new Error("This email has no sender address. Set one on the Emails screen first.");
    }

    const { loadEmailLook, siteOrigin } = await import("@/lib/email-store.server");
    const origin = siteOrigin();

    /*
     * An invite is rebuilt from its own record rather than trusted from the
     * browser: the address it goes to and the link inside it both come from the
     * invite row. Otherwise this function would send anyone's sign-up link to
     * any address a caller named.
     */
    let to = data.to;
    let ctaUrl = data.ctaUrl;
    let inviteSendCount: number | null = null;
    if (data.key === "invite") {
      if (!data.inviteToken) {
        throw new Error("Invites go to one person at a time. Start from Invite a client instead.");
      }
      const invite = await loadInvite(data.inviteToken);
      const block = inviteBlock(invite);
      if (block || !invite) throw new Error(block ?? "That invite no longer exists.");
      to = invite.email;
      ctaUrl = `${origin}/invite?code=${invite.token}`;
      inviteSendCount = invite.send_count;
    }

    // Read at send time, so the switch on the Emails screen applies to the very
    // next message.
    const look = await loadEmailLook();

    const rendered = renderEmail(
      { ...template, subject: data.subject, body: data.body, ctaLabel: data.ctaLabel },
      {},
      ctaUrl,
      { look, assetOrigin: origin },
    );

    const { deliverEmail } = await import("@/lib/email-delivery.server");
    const detail = await deliverEmail({
      // What the advisor left in the From field wins. The template's name is
      // the fallback, so a cleared field cannot send as a bare address.
      fromName: data.fromName || template.fromName,
      fromEmail: template.fromEmail,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    /*
     * Record that the invite went out. This runs only after Cloudflare has
     * confirmed the send, and a failure here is swallowed: the email has left,
     * and telling the advisor it failed would get it sent twice.
     */
    if (data.key === "invite" && data.inviteToken && inviteSendCount !== null) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("client_invites")
          .update({ sent_at: new Date().toISOString(), send_count: inviteSendCount + 1 })
          .eq("token", data.inviteToken);
      } catch {
        /* The send stands. */
      }
    }

    return { to, detail };
  });
