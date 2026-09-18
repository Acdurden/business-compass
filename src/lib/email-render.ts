/**
 * Turning an approved template into the HTML and plain text that actually get
 * sent.
 *
 * Pure and side-effect free so the editor's preview and the send path can share
 * it — what an admin signs off on screen is what leaves the building.
 *
 * Email HTML is not web HTML. Everything is inline-styled, the layout is a
 * table, and there is no external CSS, webfont or image: a remote logo is the
 * single most common reason a legitimate message renders as a broken box and
 * scores worse with spam filters. The wordmark is set in type for that reason.
 *
 * TWO SHAPES, DELIBERATELY. Gmail files a message into Promotions on how it
 * looks and who sent it, not on whether it authenticates. A card layout with a
 * header bar and a styled call-to-action button is the exact markup signature of
 * marketing mail, and the invite was landing in Promotions because of it — which
 * for a personal invitation from an advisor is close to not arriving at all.
 *
 * So the invite renders PLAIN: no wrapper table, no wordmark bar, no card, no
 * button, no footer. Paragraphs and a bare link, the way a person writes. Every
 * other template keeps the branded card, because a results notification to an
 * existing client is a product message and should look like one.
 */

import {
  fillTags,
  splitBody,
  type EmailTemplate,
  type EmailTemplateKey,
} from "@/lib/email-templates";

type BodyBlock = ReturnType<typeof splitBody>[number];

/*
 * The brand navy, matching `BRAND.navy` in score-display, the share card and
 * the PDF masthead. The email carried its own lighter navy until 2026-09-18,
 * which meant the one place a client sees Kriterion before they see the product
 * was the one place it was a different colour.
 */
const NAVY = "#0e1c2b";
/** The tinted field the card sits on. */
const PAGE = "#d9e1e8";
const INK = "#243447";
const MUTED = "#6b7a8d";
const BORDER = "#e2e8f0";
/** Link colour for the plain shape. Ordinary mail-client blue, not brand navy. */
const LINK = "#1a4d8f";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Which templates are sent as person-to-person mail rather than product mail.
 *
 * Exported so the editor's preview asks the same question the send path asks,
 * rather than carrying its own copy of the rule and drifting from it.
 */
export function rendersAsPersonalMail(key: EmailTemplateKey): boolean {
  return key === "invite";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The plain shape: paragraphs and a bare link, nothing else.
 *
 * The call-to-action becomes the URL itself rather than a labelled button. A
 * visible address is what a person sends, it survives forwarding and plain-text
 * reading intact, and it removes the single strongest Promotions signal in the
 * message. The consequence is that the template's button label does not appear
 * in the HTML for these templates — the lead-in sentence above the marker is
 * what introduces the link, so it has to read like one.
 *
 * There is no footer. A branded sign-off under a personal message re-declares it
 * as bulk mail, and the body already ends with the advisor's name.
 */
function renderPersonal(
  subject: string,
  blocks: BodyBlock[],
  values: Record<string, string>,
  ctaUrl: string,
): RenderedEmail {
  const paragraphs = blocks
    .map((block) => {
      if (block.kind === "button") {
        return [
          `<p style="margin:0 0 16px 0;">`,
          `<a href="${escapeHtml(ctaUrl)}" style="color:${LINK};">${escapeHtml(ctaUrl)}</a>`,
          `</p>`,
        ].join("");
      }
      const text = escapeHtml(fillTags(block.text, values)).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px 0;">${text}</p>`;
    })
    .join("");

  const html = [
    `<!doctype html><html><head><meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width,initial-scale=1" />`,
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#ffffff;">`,
    `<div style="max-width:600px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.62;color:${INK};">`,
    paragraphs,
    `</div></body></html>`,
  ].join("");

  const text = blocks
    .map((block) => (block.kind === "button" ? ctaUrl : fillTags(block.text, values)))
    .join("\n\n");

  return { subject, html, text };
}

/**
 * Render one template into a sendable message.
 *
 * `ctaUrl` is where the button points. It is passed separately rather than read
 * out of the body because the destination is the app's to decide, not the
 * admin's — an admin edits the words on the button, never where it goes.
 */
export function renderEmail(
  template: EmailTemplate,
  values: Record<string, string>,
  ctaUrl: string,
): RenderedEmail {
  const subject = fillTags(template.subject, values);
  const ctaLabel = fillTags(template.ctaLabel, values);
  const blocks = splitBody(template.body);

  if (rendersAsPersonalMail(template.key)) {
    return renderPersonal(subject, blocks, values, ctaUrl);
  }

  const htmlBlocks = blocks
    .map((block) => {
      if (block.kind === "button") {
        return [
          `<tr><td align="center" style="padding:10px 0 24px 0;text-align:center;">`,
          `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;`,
          `text-decoration:none;padding:13px 26px;border-radius:6px;font-size:15px;font-weight:600;">`,
          `${escapeHtml(ctaLabel)}</a></td></tr>`,
        ].join("");
      }
      const text = escapeHtml(fillTags(block.text, values)).replace(/\n/g, "<br />");
      return `<tr><td style="padding:0 0 16px 0;font-size:15px;line-height:1.62;color:${INK};">${text}</td></tr>`;
    })
    .join("");

  const html = [
    `<!doctype html><html><head><meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width,initial-scale=1" />`,
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:${PAGE};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};padding:28px 12px;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">`,
    /*
     * The ruled field. `background-image` carries fine diagonals over a solid
     * `background-color`, in that order deliberately: Outlook on Windows drops
     * the gradient and renders the flat navy underneath, which is the plain
     * header this replaced rather than a broken one. Same motif as the share
     * card, drawn the same way.
     */
    `<tr><td style="background-color:${NAVY};background-image:repeating-linear-gradient(115deg,rgba(255,255,255,0.075) 0 1px,transparent 1px 13px);padding:24px 28px 26px 28px;">`,
    `<div style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.16em;">KRITERION</div>`,
    `<div style="margin-top:7px;color:#9fc4c2;font-size:11px;letter-spacing:0.06em;">BUSINESS VALUE INTELLIGENCE</div>`,
    `</td></tr>`,
    `<tr><td style="padding:28px 28px 6px 28px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${htmlBlocks}</table>`,
    `</td></tr>`,
    `<tr><td style="padding:0 28px 24px 28px;">`,
    `<div style="border-top:1px solid ${BORDER};padding-top:16px;font-size:12px;line-height:1.5;color:${MUTED};">`,
    `Kriterion Business Value Intelligence &middot; kriterionbvi.com<br />`,
    `Reply to this message to reach your advisor directly.`,
    `</div></td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");

  /**
   * The plain-text alternative is not a courtesy. A message with no text part
   * is a well-known spam signal, and the button has to survive as a URL for
   * anyone reading in plain text.
   */
  const text =
    blocks
      .map((block) =>
        block.kind === "button" ? `${ctaLabel}: ${ctaUrl}` : fillTags(block.text, values),
      )
      .join("\n\n") + `\n\n—\nKriterion Business Value Intelligence · kriterionbvi.com`;

  return { subject, html, text };
}
