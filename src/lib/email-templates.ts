/**
 * The wording of every email Kriterion sends.
 *
 * The defaults below are the single source of truth for "the Kriterion
 * default". The `email_templates` table stores whatever an admin has since
 * edited; a key missing from the table simply falls back to the default here,
 * which is why the editor can never be opened onto a blank screen and why
 * "revert" is a write of the constant below rather than a delete.
 *
 * Everything in this module is pure. The send path (not yet built) renders with
 * the same `splitBody` / `fillTags` pair the editor previews with, so what an
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
      { tag: "{{advisor_name}}", describes: "the sender name set above" },
      { tag: "{{link}}", describes: "their personal sign-up link" },
    ],
    note: "At the moment you invite someone, the only thing Kriterion knows about them is their email address. There is no name to greet them with and no company to mention. Adding a name box to the invite dialog would change that.",
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
      { tag: "{{band}}", describes: "where that score places them" },
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
    subject: "Your Kriterion assessment",
    ctaLabel: "Begin the assessment",
    body: [
      "Here is your Kriterion assessment. It takes about twenty minutes and covers nine areas of the business, from the quality of your financials to how much of the operation still runs through you.",
      "It is not a valuation calculator. The questions are the ones a buyer works through before they make an offer, and the score you get is the one we then sit down and talk about.",
      BUTTON_MARKER,
      "The link is yours and does not expire. If you would rather walk through the first few questions together, reply and we will find twenty minutes.",
      "{{advisor_name}}",
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
      "Worth saying though: the sections still ahead of you are the ones that move the number most — leadership, documentation, and how concentrated your client base is. The score you would get from what you have answered so far would not tell you much.",
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
      "Your ValScore is {{valscore}}, which places you at the {{band}}.",
      "The score is worth less than what sits behind it. There are {{opportunity}} points of value your business is not currently being credited for, and {{top_area}} alone accounts for {{top_points}} of them — the largest single gap by a wide margin.",
      "Your plan sets out what to do about it, in order.",
      BUTTON_MARKER,
      "Read it before we speak, and bring the parts you disagree with — those conversations are the useful ones.",
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
      "The link works for one hour. If you did not ask for this, ignore this message — nothing has changed and your account is untouched.",
    ].join("\n\n"),
  },
};

export type EmailBlock = { kind: "paragraph"; text: string } | { kind: "button" };

/**
 * Split a body into what actually renders: paragraphs on blank lines, with the
 * marker line becoming the button wherever the admin left it.
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
    .map<EmailBlock>((part) =>
      part === BUTTON_MARKER ? { kind: "button" } : { kind: "paragraph", text: part },
    );
}

export function hasButton(body: string): boolean {
  return splitBody(body).some((block) => block.kind === "button");
}

const TAG_PATTERN = /\{\{[a-z_]+\}\}/g;

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
