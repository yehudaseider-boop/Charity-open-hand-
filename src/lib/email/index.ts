/**
 * Email goes through one adapter, like payments, so the provider can change.
 * EMAIL_TRANSPORT chooses it: "console" (default; logs that an email would
 * have been sent, with no personal details) or "resend".
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {}

/** "sarah@example.co.za" -> "s•••@example.co.za" (for logs). */
export function maskEmail(address: string): string {
  const [local, domain] = address.split("@");
  return domain ? `${local.slice(0, 1)}•••@${domain}` : "•••";
}

export const consoleTransport: EmailTransport = {
  name: "console",
  async send(m) {
    console.info(`[email] would send "${m.subject}" to ${maskEmail(m.to)}${m.attachments?.length ? ` with ${m.attachments.length} attachment(s)` : ""}`);
  },
};

/**
 * Resend (https://resend.com). NOT YET RUN AGAINST RESEND: this session's
 * network blocks it. Written to Resend's published API (POST /emails with a
 * Bearer key; attachments as base64). Check in Resend's test mode before use.
 */
export function resendTransport(env: { RESEND_API_KEY?: string; EMAIL_FROM?: string }): EmailTransport {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!key || !from) throw new EmailError("EMAIL_TRANSPORT=resend needs RESEND_API_KEY and EMAIL_FROM.");
  return {
    name: "resend",
    async send(m) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [m.to],
          subject: m.subject,
          text: m.text,
          ...(m.html ? { html: m.html } : {}),
          ...(m.attachments?.length
            ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
            : {}),
        }),
      });
      if (!res.ok) throw new EmailError(`Resend refused the email (${res.status}).`);
    },
  };
}

export function getEmailTransport(env: Record<string, string | undefined> = process.env): EmailTransport {
  const name = env.EMAIL_TRANSPORT ?? "console";
  if (name === "console") return consoleTransport;
  if (name === "resend") return resendTransport(env);
  throw new EmailError(`Unknown EMAIL_TRANSPORT "${name}".`);
}
