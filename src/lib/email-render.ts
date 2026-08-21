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
 */

import { fillTags, splitBody, type EmailTemplate } from "@/lib/email-templates";

const NAVY = "#1E395F";
const INK = "#243447";
const MUTED = "#6b7a8d";
const BORDER = "#e2e8f0";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  const htmlBlocks = blocks
    .map((block) => {
      if (block.kind === "button") {
        return [
          `<tr><td style="padding:6px 0 22px 0;">`,
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
    `<body style="margin:0;padding:0;background:#f1f4f8;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f8;padding:24px 12px;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">`,
    `<tr><td style="background:${NAVY};padding:22px 28px;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.16em;">KRITERION</td></tr>`,
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
