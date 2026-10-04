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
 * marketing mail, and the first branded invite landed in Promotions because of
 * it. A plain invite (paragraphs and one text link, the way a person writes)
 * was verified in Primary on 2026-09-18.
 *
 * Adam and Dan want the invite branded, because it is the first thing a
 * prospect sees of Kriterion. Both shapes are therefore kept, and which one the
 * invite uses is a switch on the Emails screen (`EmailLook.inviteStyle`) so the
 * question can be settled by sending each to a fresh inbox. Every other
 * template is always branded: a results notification to an existing client is a
 * product message and should look like one.
 *
 * The branded header is a second switch (`EmailLook.headerStyle`): the name set
 * in type on a navy band, or the logo as an image on white. The image is the
 * one remote asset in any of this mail. It carries real alt text styled to
 * stand in for it, because Outlook and most company mail hide images until the
 * reader allows them.
 */

import {
  BOLD_PATTERN,
  DEFAULT_EMAIL_LOOK,
  fillTags,
  splitBody,
  stripBoldMarks,
  type EmailLook,
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
 * What the renderer needs beyond the words.
 *
 * `assetOrigin` is where the logo image is fetched from. The send path passes
 * the public site; the editor's preview passes whatever host it is running on,
 * so the preview shows the logo on a staging address too.
 */
export type RenderOptions = {
  look?: EmailLook;
  assetOrigin?: string;
};

const DEFAULT_ASSET_ORIGIN = "https://kriterionbvi.com";

/** Where the logo lives once deployed: `public/email/kriterion-logo.png`. */
export const EMAIL_LOGO_PATH = "/email/kriterion-logo.png";

/**
 * Whether a template goes out as person-to-person mail rather than product
 * mail. Only the invite can, and only while the switch says plain.
 *
 * Exported so the editor's preview asks the same question the send path asks,
 * rather than carrying its own copy of the rule and drifting from it.
 */
export function rendersAsPersonalMail(
  key: EmailTemplateKey,
  look: EmailLook = DEFAULT_EMAIL_LOOK,
): boolean {
  return key === "invite" && look.inviteStyle === "plain";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A paragraph's words as HTML: tags filled, escaped, bold applied, single line
 * breaks kept. Escaping happens before the bold pass, so the only markup that
 * can come out of this is the `<strong>` it writes itself.
 */
function inlineHtml(text: string, values: Record<string, string>, strongStyle = ""): string {
  const open = strongStyle ? `<strong style="${strongStyle}">` : "<strong>";
  return escapeHtml(fillTags(text, values))
    .replace(BOLD_PATTERN, `${open}$1</strong>`)
    .replace(/\n/g, "<br />");
}

/** The same words for the plain-text copy: tags filled, bold markers gone. */
function inlineText(text: string, values: Record<string, string>): string {
  return stripBoldMarks(fillTags(text, values));
}

/**
 * The plain shape: paragraphs and one text link, nothing else.
 *
 * The call-to-action is an ordinary link carrying the button's label. It was a
 * bare web address until 2026-10-04; a per-person invite address is forty
 * characters of token, which reads as machine output in a message meant to
 * read as a person's. A single text link is still what a person sends, and the
 * plain-text copy carries the full address for anyone reading without HTML.
 *
 * A heading is set as an ordinary paragraph here, and there is no footer. A
 * branded sign-off under a personal message re-declares it as bulk mail.
 */
function renderPersonal(
  subject: string,
  ctaLabel: string,
  blocks: BodyBlock[],
  values: Record<string, string>,
  ctaUrl: string,
): RenderedEmail {
  const paragraphs = blocks
    .map((block) => {
      if (block.kind === "button") {
        return [
          `<p style="margin:0 0 16px 0;">`,
          `<a href="${escapeHtml(ctaUrl)}" style="color:${LINK};">${escapeHtml(ctaLabel)}</a>`,
          `</p>`,
        ].join("");
      }
      return `<p style="margin:0 0 16px 0;">${inlineHtml(block.text, values)}</p>`;
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
    .map((block) =>
      block.kind === "button" ? `${ctaLabel}: ${ctaUrl}` : inlineText(block.text, values),
    )
    .join("\n\n");

  return { subject, html, text };
}

/**
 * The top of a branded email.
 *
 * BAND. `background-image` carries fine diagonals over a solid
 * `background-color`, in that order deliberately: Outlook on Windows drops the
 * gradient and renders the flat navy underneath, which is the plain header this
 * replaced rather than a broken one. Same motif as the share card. Nothing here
 * is an image, so there is nothing for a mail app to block.
 *
 * LOGO. The image is drawn on its own white ground with a margin baked in, so
 * a mail app that turns the message dark shows the logo on a white plate rather
 * than navy lettering on charcoal. The `alt` is styled because the styling
 * applies to the alt text when the image is withheld: the reader then sees the
 * name in navy type, not a broken-image box.
 */
function renderHeader(look: EmailLook, assetOrigin: string): string {
  if (look.headerStyle === "logo") {
    const src = `${assetOrigin.replace(/\/+$/, "")}${EMAIL_LOGO_PATH}`;
    return [
      `<tr><td style="background:#ffffff;padding:16px 18px 12px 18px;border-bottom:1px solid ${BORDER};">`,
      `<img src="${escapeHtml(src)}" width="231" height="46" alt="Kriterion" `,
      `style="display:block;border:0;outline:none;text-decoration:none;height:46px;width:231px;max-width:100%;`,
      `color:#1f3a5f;font-size:16px;font-weight:700;letter-spacing:0.04em;" />`,
      `</td></tr>`,
    ].join("");
  }
  return [
    `<tr><td style="background-color:${NAVY};background-image:repeating-linear-gradient(115deg,rgba(255,255,255,0.075) 0 1px,transparent 1px 13px);padding:24px 28px 26px 28px;">`,
    `<div style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.16em;">KRITERION</div>`,
    `<div style="margin-top:7px;color:#9fc4c2;font-size:11px;letter-spacing:0.06em;">BUSINESS VALUE INTELLIGENCE</div>`,
    `</td></tr>`,
  ].join("");
}

/**
 * The two lines under the rule.
 *
 * The invite speaks as the company and already signs off with the tagline, so
 * its footer does not repeat it and a reply reaches "us". The other three are
 * sent by a named advisor to their own client.
 */
function footerLines(key: EmailTemplateKey): { name: string; reply: string } {
  if (key === "invite") {
    return { name: "Kriterion", reply: "Reply to this message to reach us." };
  }
  return {
    name: "Kriterion Business Value Intelligence",
    reply: "Reply to this message to reach your advisor directly.",
  };
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
  options: RenderOptions = {},
): RenderedEmail {
  const look = options.look ?? DEFAULT_EMAIL_LOOK;
  const assetOrigin = options.assetOrigin || DEFAULT_ASSET_ORIGIN;

  // A subject line is plain text everywhere it is shown, so bold markers typed
  // into one would arrive as asterisks.
  const subject = stripBoldMarks(fillTags(template.subject, values));
  const ctaLabel = fillTags(template.ctaLabel, values);
  const blocks = splitBody(template.body);

  if (rendersAsPersonalMail(template.key, look)) {
    return renderPersonal(subject, ctaLabel, blocks, values, ctaUrl);
  }

  const htmlBlocks = blocks
    .map((block) => {
      if (block.kind === "button") {
        /*
         * Side padding is 20px, not the 26px it was: "Begin Your Founder
         * Questionnaire" is a long label, and at 26px it wrapped onto two lines
         * on a 375px phone.
         */
        return [
          `<tr><td align="center" style="padding:10px 0 24px 0;text-align:center;">`,
          `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;`,
          `text-decoration:none;padding:13px 20px;border-radius:6px;font-size:15px;font-weight:600;">`,
          `${escapeHtml(ctaLabel)}</a></td></tr>`,
        ].join("");
      }
      if (block.kind === "heading") {
        return `<tr><td style="padding:0 0 14px 0;font-size:21px;line-height:1.3;font-weight:600;color:${NAVY};">${inlineHtml(block.text, values)}</td></tr>`;
      }
      const text = inlineHtml(block.text, values, `color:${NAVY};`);
      return `<tr><td style="padding:0 0 16px 0;font-size:15px;line-height:1.62;color:${INK};">${text}</td></tr>`;
    })
    .join("");

  const footer = footerLines(template.key);

  const html = [
    `<!doctype html><html><head><meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width,initial-scale=1" />`,
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:${PAGE};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};padding:28px 12px;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">`,
    renderHeader(look, assetOrigin),
    `<tr><td style="padding:28px 28px 6px 28px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${htmlBlocks}</table>`,
    `</td></tr>`,
    `<tr><td style="padding:0 28px 24px 28px;">`,
    `<div style="border-top:1px solid ${BORDER};padding-top:16px;font-size:12px;line-height:1.5;color:${MUTED};">`,
    `${footer.name} &middot; kriterionbvi.com<br />`,
    `${footer.reply}`,
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
        block.kind === "button" ? `${ctaLabel}: ${ctaUrl}` : inlineText(block.text, values),
      )
      .join("\n\n") + `\n\n\u2014\n${footer.name} \u00b7 kriterionbvi.com`;

  return { subject, html, text };
}
