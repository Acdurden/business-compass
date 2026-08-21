/**
 * The only place a message is handed to Cloudflare.
 *
 * This is a `.server.ts` module on purpose. `*.functions.ts` files are bundled
 * for the browser — the server functions inside them become RPC stubs, but any
 * ordinary export goes with them. Reading `CLOUDFLARE_EMAIL_API_TOKEN` from a
 * plain exported helper in one of those files would put the shape of that
 * secret in the client bundle. Import this only from inside a handler:
 *
 *   const { deliverEmail } = await import("@/lib/email-delivery.server");
 */

const SEND_ENDPOINT = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

type CloudflareError = { message?: string; code?: number };
type CloudflareResponse = {
  success?: boolean;
  errors?: CloudflareError[];
  messages?: CloudflareError[];
  result?: unknown;
};

/** Whether the Worker has what it needs to send anything at all. */
export function sendingIsConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_EMAIL_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

/**
 * Send one message. Returns Cloudflare's raw reply so a caller can show their
 * words rather than ours; throws with their wording when they refuse.
 */
export async function deliverEmail(input: {
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      "Sending is not switched on yet: the Cloudflare account id and API token are not set in the Worker environment.",
    );
  }

  const response = await fetch(SEND_ENDPOINT(accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    /*
     * `from` goes as an object with `address` and `name`, which is what the
     * REST API documents. Note the field is `address`, not `email`.
     */
    body: JSON.stringify({
      from: { address: input.fromEmail, name: input.fromName },
      to: input.to,
      reply_to: input.replyTo ?? input.fromEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  /**
   * Cloudflare's v4 API answers 200 OK with `success: false` for most
   * rejections. Trusting the status code alone reports a send that never
   * happened — which is exactly what it did the first time this ran: the app
   * said "test sent" and Cloudflare's activity log had no record of it.
   * The body is the authority here, not the status line.
   */
  let body: CloudflareResponse | null = null;
  let raw = "";
  try {
    raw = await response.text();
    body = raw ? (JSON.parse(raw) as CloudflareResponse) : null;
  } catch {
    // Leave body null; `raw` is still the best evidence we have.
  }

  const messages = [...(body?.errors ?? []), ...(body?.messages ?? [])]
    .map((e) => e?.message)
    .filter((m): m is string => Boolean(m));

  if (!response.ok || body?.success === false) {
    const detail =
      messages[0] ?? (raw ? raw.slice(0, 300) : `${response.status} ${response.statusText}`);
    throw new Error(`Cloudflare refused the message: ${detail}`);
  }

  if (body?.success !== true) {
    throw new Error(
      `Cloudflare did not confirm the send. It answered ${response.status} with: ${
        raw ? raw.slice(0, 300) : "an empty body"
      }`,
    );
  }

  return raw.slice(0, 300);
}
