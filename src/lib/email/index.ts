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
  /** Where a reply goes (for example the charity, on a thank-you sent in its name). */
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

/** "sent" means a real email left; "skipped" means nothing was sent (console transport, erased or disallowed address). */
export type SendOutcome = "sent" | "skipped";

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<SendOutcome>;
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
    return "skipped";
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
          // A subject is one line, whatever a charity typed into its name.
          subject: m.subject.replace(/[\r\n]+/g, " "),
          text: m.text,
          ...(m.html ? { html: m.html } : {}),
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          ...(m.attachments?.length
            ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
            : {}),
        }),
      });
      if (!res.ok) throw new EmailError(`Resend refused the email (${res.status}).`);
      return "sent";
    },
  };
}

/** An address left behind by an erasure (see erase_donor_data). Nothing is ever sent to it. */
export function isErasedAddress(address: string): boolean {
  return address.trim().toLowerCase().endsWith("@erased.invalid");
}

function skippingErased(inner: EmailTransport): EmailTransport {
  return {
    name: inner.name,
    async send(m) {
      if (isErasedAddress(m.to)) return "skipped";
      return inner.send(m);
    },
  };
}

/**
 * EMAIL_ALLOWLIST (comma-separated addresses or domains, e.g. "givezy.co.za, yehuda@example.com"):
 * when set, email goes only to those; anything else is logged and skipped. For the test site, so a
 * test checkout can never email a real donor. Leave unset on the live site.
 */
export function allowedAddress(address: string, allowlist: string | undefined): boolean {
  const rules = (allowlist ?? "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return true;
  const to = address.trim().toLowerCase();
  const domain = to.split("@")[1] ?? "";
  return rules.some((r) => (r.includes("@") ? r === to : r === domain));
}

function onlyAllowed(inner: EmailTransport, allowlist: string | undefined): EmailTransport {
  return {
    name: inner.name,
    async send(m) {
      if (!allowedAddress(m.to, allowlist)) {
        console.info(`[email] not on EMAIL_ALLOWLIST, skipped "${m.subject}" to ${maskEmail(m.to)}`);
        return "skipped";
      }
      return inner.send(m);
    },
  };
}

export function getEmailTransport(env: Record<string, string | undefined> = process.env): EmailTransport {
  const name = env.EMAIL_TRANSPORT ?? "console";
  const inner = name === "console" ? consoleTransport : name === "resend" ? resendTransport(env) : null;
  if (!inner) throw new EmailError(`Unknown EMAIL_TRANSPORT "${name}".`);
  return skippingErased(onlyAllowed(inner, env.EMAIL_ALLOWLIST));
}
