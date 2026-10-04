/**
 * The wording of every email Kriterion sends.
 *
 * The defaults below are the single source of truth for "the Kriterion
 * default". The `email_templates` table stores whatever an admin has since
 * edited; a key missing from the table simply falls back to the default here,
 * which is why the editor can never be opened onto a blank screen and why
 * "revert" is a write of the constant below rather than a delete.
 *
 * Everything in this module is pure. The send path renders with the same
 * `splitBody` / `fillTags` pair the editor previews with, so what an
 * admin approves on screen is what leaves the building.
 */

export type EmailTemplateKey = "invite" | "nudge" | "review_ready" | "password_reset";

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  "invite",
  "nudge",
  "review_ready",
  "password_reset",
];

/**
 * The line an admin moves to move the button. A fixed slot would mean the
 * button silently lands in the wrong place the moment a paragraph is added.
 */
export const BUTTON_MARKER = "[button]";

/**
 * How the emails look, as opposed to what they say. Two switches, both set on
 * the Emails screen and stored once for the whole app.
 *
 * `inviteStyle` exists because the choice is a real trade. A branded invite is
 * what a prospect should see; a plain one is what Gmail reliably files under
 * Primary. Both are built so the decision can be made by sending each to a
 * fresh inbox rather than by argument.
 *
 * `headerStyle` applies to every branded email, so the four of them can never
 * wear two different headers.
 *
 * The defaults are what went out before the switches existed, so shipping this
 * changes nothing until somebody moves one.
 */
export type InviteStyle = "plain" | "branded";
export type HeaderStyle = "band" | "logo";
export type EmailLook = { inviteStyle: InviteStyle; headerStyle: HeaderStyle };

export const DEFAULT_EMAIL_LOOK: EmailLook = { inviteStyle: "plain", headerStyle: "band" };

/** Anything unrecognised falls back to the default for that switch alone. */
export function normaliseLook(raw: unknown): EmailLook {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    inviteStyle: value.inviteStyle === "branded" ? "branded" : DEFAULT_EMAIL_LOOK.inviteStyle,
    headerStyle: value.headerStyle === "logo" ? "logo" : DEFAULT_EMAIL_LOOK.headerStyle,
  };
}

export type TemplateTag = {
  /** Written exactly as it appears in the body, braces included. */
  tag: string;
  /** Plain language, for the chip's tooltip. No jargon. */
  describes: string;
};

export type EmailTemplate = {
  key: EmailTemplateKey;
  fromName: string;
  fromEmail: string | null;
  subject: string;
  body: string;
  ctaLabel: string;
};

export type EmailTemplateMeta = {
  key: EmailTemplateKey;
  name: string;
  /** When this email goes out, in the advisor's terms. */
  when: string;
  tags: TemplateTag[];
  /**
   * What is honestly behind the tags for this template. Shown in the editor so
   * nobody writes a sentence around a value the app cannot supply.
   */
  note: string;
};

export const EMAIL_TEMPLATE_META: Record<EmailTemplateKey, EmailTemplateMeta> = {
  invite: {
    key: "invite",
    name: "Invite a client",
    when: "sent when you invite someone",
    tags: [
      { tag: "{{first_name}}", describes: "the first name typed on the invite form" },
      { tag: "{{advisor_name}}", describes: "the first name of whoever is sending it" },
      { tag: "{{link}}", describes: "their personal sign-up link" },
    ],
    note: "The first name and the link both come from the invite itself: each person is invited by name and gets a link that works once, for their address only. If no first name was typed, a greeting line that holds nothing but the name is left out. The preview shows your own first name.",
  },
  nudge: {
    key: "nudge",
    name: "Nudge a stalled client",
    when: "sent by hand from the dashboard",
    tags: [
      { tag: "{{company}}", describes: "their company name" },
      { tag: "{{answered}}", describes: "how many questions they have answered" },
      { tag: "{{total}}", describes: "how many questions there are" },
      { tag: "{{days}}", describes: "days since they last touched it" },
      { tag: "{{advisor_name}}", describes: "the sender name set above" },
      { tag: "{{link}}", describes: "a link back into their assessment" },
    ],
    note: "No client is part-way through an assessment today, so there is nothing real to preview this against beyond the question count. The preview will fill in properly the first time someone stalls.",
  },
  review_ready: {
    key: "review_ready",
    name: "Your review is ready",
    when: "sent by hand once the review is final",
    tags: [
      { tag: "{{company}}", describes: "their company name" },
      { tag: "{{valscore}}", describes: "their ValScore" },
      { tag: "{{opportunity}}", describes: "points of value not yet credited" },
      { tag: "{{top_area}}", describes: "their largest single gap" },
      { tag: "{{top_points}}", describes: "how many points that gap is worth" },
      { tag: "{{action_count}}", describes: "actions on their plan" },
      { tag: "{{advisor_name}}", describes: "the sender name set above" },
      { tag: "{{link}}", describes: "a link to their results" },
    ],
    note: "Every value here is read from the client's own record at the moment you send. The preview uses the most recently reviewed submission.",
  },
  password_reset: {
    key: "password_reset",
    name: "Password reset",
    when: "sent when a client asks for one",
    tags: [{ tag: "{{link}}", describes: "a reset link that expires in an hour" }],
    note: "The only email on this list a client receives without you pressing anything. The link is generated fresh each time and is the one thing that must never be edited out.",
  },
};

/**
 * `fromEmail` is deliberately null. Until a mailbox exists that Cloudflare is
 * verified to send from, inventing an address here would put a plausible but
 * dead sender on four templates.
 *
 * The bodies sign off with the sender name ALONE. They used to add a literal
 * "Kriterion" line under it, which rendered as "Kriterion / Kriterion" while
 * the sender name was the company — and the footer already says who sent it.
 */
export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, EmailTemplate> = {
  invite: {
    key: "invite",
    fromName: "Kriterion",
    fromEmail: null,
    /*
     * Adam and Dan's wording, 2026-10-04. It is the first thing a prospect
     * reads from Kriterion, so it speaks as the company and signs as the
     * company. "Your personal link" is true because every invite now carries a
     * link of its own (see `client_invites`).
     */
    subject: "Your Kriterion Founder Questionnaire",
    ctaLabel: "Begin Your Founder Questionnaire",
    body: [
      "{{first_name}},",
      "# Welcome to Kriterion.",
      "Kriterion is a Business Value Intelligence platform designed to help owners of small to mid-sized independent advertising, media and marketing agencies better understand what drives, limits and ultimately creates value in their business through the lens of a sophisticated buyer.",
      "**Your first step is the Founder Questionnaire.**",
      "It takes approximately 20 minutes and looks across nine areas of your business that can influence how a sophisticated buyer evaluates what you\u2019ve built.",
      "This isn\u2019t a valuation calculator. The purpose is to help surface the strengths, risks and questions that may matter when your business is viewed from the other side of the table.",
      BUTTON_MARKER,
      "Your personal link will take you directly into Kriterion. You can complete the questionnaire on your own time and return to it if needed.",
      "We look forward to showing you what your responses reveal.",
      "**Kriterion**\nBusiness Value Intelligence",
    ].join("\n\n"),
  },
  nudge: {
    key: "nudge",
    fromName: "Kriterion",
    fromEmail: null,
    subject: "Picking your assessment back up",
    ctaLabel: "Pick up where you left off",
    body: [
      "You started the Kriterion assessment {{days}} days ago and answered {{answered}} of the {{total}} questions. No deadline on this, and no chasing intended.",
      "Worth saying though: the sections still ahead of you are the ones that move the number most: leadership, documentation, and how concentrated your client base is. The score you would get from what you have answered so far would not tell you much.",
      BUTTON_MARKER,
      'If a question was unclear, or the honest answer is "it depends", reply and tell me which one. That happens often and it is usually the interesting part.',
      "{{advisor_name}}",
    ].join("\n\n"),
  },
  review_ready: {
    key: "review_ready",
    fromName: "Kriterion",
    fromEmail: null,
    subject: "Your review is finished",
    ctaLabel: "Open your results",
    body: [
      "I have finished reviewing {{company}} and your results are ready.",
      "Your ValScore is {{valscore}}.",
      "The score is worth less than what sits behind it. There are {{opportunity}} points of value your business is not currently being credited for, and {{top_area}} alone accounts for {{top_points}} of them, the largest single gap by a wide margin.",
      "Your plan sets out what to do about it, in order.",
      BUTTON_MARKER,
      "Read it before we speak, and bring the parts you disagree with. Those conversations are the useful ones.",
      "{{advisor_name}}",
    ].join("\n\n"),
  },
  password_reset: {
    key: "password_reset",
    fromName: "Kriterion",
    fromEmail: null,
    subject: "Reset your Kriterion password",
    ctaLabel: "Choose a new password",
    body: [
      "Someone asked to reset the password on this Kriterion account.",
      BUTTON_MARKER,
      "The link works for one hour. If you did not ask for this, ignore this message. Nothing has changed and your account is untouched.",
    ].join("\n\n"),
  },
};

const TAG_PATTERN = /\{\{[a-z_]+\}\}/g;

export type EmailBlock =
  { kind: "paragraph"; text: string } | { kind: "heading"; text: string } | { kind: "button" };

/** A paragraph that opens with this is set as a heading. */
const HEADING_PREFIX = /^#\s+/;

/**
 * Split a body into what actually renders: paragraphs on blank lines, with the
 * marker line becoming the button wherever the admin left it.
 *
 * Two pieces of light formatting, and only two, because the people writing
 * these are not going to learn a markup language: a paragraph that starts with
 * "# " is a heading, and words wrapped in ** are bold. Both are stripped from
 * the plain-text copy of the message.
 */
export function splitBody(body: string): EmailBlock[] {
  // Windows line endings reach this from pasted text and from anything the repo
  // has historically stored as CRLF; splitting on bare \n would then treat the
  // whole body as one paragraph and swallow the button marker.
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .flatMap<EmailBlock>((part) => {
      if (part === BUTTON_MARKER) return [{ kind: "button" }];
      if (HEADING_PREFIX.test(part)) {
        // Only the first line is the heading. Text typed straight under it,
        // with no blank line between, is an ordinary paragraph and not a
        // second line of very large type.
        const [first, ...rest] = part.replace(HEADING_PREFIX, "").split("\n");
        const after = rest.join("\n").trim();
        const heading: EmailBlock = { kind: "heading", text: first.trim() };
        return after ? [heading, { kind: "paragraph", text: after }] : [heading];
      }
      return [{ kind: "paragraph", text: part }];
    });
}

export function hasButton(body: string): boolean {
  return splitBody(body).some((block) => block.kind === "button");
}

/**
 * Bold is a pair of ** around words on one line. Kept to a single line and to
 * text without asterisks on purpose: two stray ** in different lines of a
 * paragraph would otherwise turn everything between them bold.
 */
export const BOLD_PATTERN = /\*\*([^*\n]+?)\*\*/g;

/** The bold markers, removed. For the plain-text copy and for subject lines. */
export function stripBoldMarks(text: string): string {
  return text.replace(BOLD_PATTERN, "$1");
}

const FIRST_NAME_TAG = "{{first_name}}";

/**
 * Leave out a greeting that has nobody to greet.
 *
 * The invite opens with a line holding only the recipient's first name. When no
 * name was typed, filling the tag with nothing would send a line reading ",",
 * and leaving the tag would send literal braces. So a paragraph that is nothing
 * but the first-name tag and punctuation is dropped whole when there is no
 * name.
 *
 * Deliberately narrow. It touches only `{{first_name}}`, and only when that tag
 * stands alone: a name used inside a real sentence is left as a visible tag for
 * the advisor to fix in the draft, and a mistyped tag elsewhere still shows up
 * as braces rather than vanishing.
 */
export function dropEmptyGreeting(body: string, values: Record<string, string>): string {
  if ((values[FIRST_NAME_TAG] ?? "").trim().length > 0) return body;
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .filter((part) => {
      if (!part.includes(FIRST_NAME_TAG)) return true;
      const rest = part
        .split(FIRST_NAME_TAG)
        .join("")
        .replace(/[\s,.:;!*#-]/g, "");
      return rest.length > 0;
    })
    .join("\n\n");
}

/** Every tag written in the text, in order, deduplicated. */
export function tagsUsed(text: string): string[] {
  return Array.from(new Set(text.match(TAG_PATTERN) ?? []));
}

/**
 * Tags that will never resolve, because this template is not given them. They
 * would reach the client as literal braces, so the editor warns rather than
 * quietly shipping them.
 */
export function unknownTags(text: string, key: EmailTemplateKey): string[] {
  const allowed = new Set(EMAIL_TEMPLATE_META[key].tags.map((t) => t.tag));
  return tagsUsed(text).filter((t) => !allowed.has(t));
}

/**
 * Substitute the tags that have values. A tag with no value is left exactly as
 * written: losing it silently would turn "your score is {{valscore}}" into
 * "your score is", which reads as finished prose and is worse than an obvious
 * placeholder.
 */
export function fillTags(text: string, values: Record<string, string>): string {
  return text.replace(TAG_PATTERN, (tag) => values[tag] ?? tag);
}

/** True when the wording matches the shipped Kriterion default exactly. */
export function isDefaultWording(template: EmailTemplate): boolean {
  const d = EMAIL_TEMPLATE_DEFAULTS[template.key];
  return (
    template.subject === d.subject &&
    template.body === d.body &&
    template.ctaLabel === d.ctaLabel &&
    template.fromName === d.fromName &&
    (template.fromEmail ?? "") === (d.fromEmail ?? "")
  );
}
