/**
 * The HTML version of Givezy's emails, in the brand look (v2.1): a white page, the logo, ink text,
 * blue buttons and links, pale lilac cards and soft corners. The words are never changed here: an email
 * is written once, as plain text, and `textEmailHtml` lays that same text out. Inline styles and tables
 * only, so it holds up in Gmail and Outlook and reads at 375px. Most mail apps cannot load web fonts,
 * so each font names a web-safe fallback. Colours come from brand-colors.ts. Kept dependency-free.
 */
import { brandColors as c } from "@/lib/brand-colors";

export const emailFonts = {
  heading: "'Bricolage Grotesque','Trebuchet MS','Segoe UI',Arial,Helvetica,sans-serif",
  body: "'DM Sans',Arial,Helvetica,sans-serif",
} as const;

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const linkStyle = `color:${c.blue};text-decoration:underline;word-break:break-word;overflow-wrap:anywhere`;
const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** "R1 250" never breaks over two lines. */
const keepRand = (s: string) => s.replace(/R\d{1,3}(?: \d{3})+/g, (m) => m.replace(/ /g, "\u00a0"));

/** Escapes a line and turns any address in it into a blue link (a full stop or bracket after it stays outside). */
export function linkify(line: string): string {
  line = keepRand(line);
  let out = "";
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    const at = m.index ?? 0;
    out += escHtml(line.slice(last, at)) + `<a href="${escHtml(url)}" style="${linkStyle}">${escHtml(url)}</a>`;
    last = at + url.length;
  }
  return out + escHtml(line.slice(last));
}

export function paragraphHtml(inner: string, opts: { muted?: boolean } = {}): string {
  const style = opts.muted
    ? `margin:0 0 16px;color:${c.muted};font-size:14px;line-height:1.5`
    : `margin:0 0 16px;color:${c.ink};font-size:16px;line-height:1.55`;
  return `<p style="${style}">${inner}</p>`;
}

/** A blue button with the deep blue edge underneath (the pressable look). Table-based so Outlook draws it. */
export function buttonHtml(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-collapse:separate"><tr><td bgcolor="${c.blue}" style="background:${c.blue};border-radius:18px;border-bottom:4px solid ${c.blueEdge}"><a href="${escHtml(url)}" style="display:inline-block;padding:14px 24px;font-family:${emailFonts.body};font-size:16px;line-height:1.3;font-weight:700;color:${c.surface};text-decoration:none;border-radius:18px">${escHtml(label)}</a></td></tr></table>`;
}

/** A pale lilac card of "label: value" rows, value in the headline font (amounts, reference). Lines without a label are kept as they are. */
export function cardHtml(rows: { label?: string; value: string }[]): string {
  const cells = rows
    .map((r, i) => {
      const pad = i === rows.length - 1 ? "0" : "0 0 12px";
      if (!r.label) return `<tr><td style="padding:${pad};font-size:15px;line-height:1.5;color:${c.ink}">${linkify(r.value)}</td></tr>`;
      return `<tr><td style="padding:${pad}"><div style="font-size:14px;line-height:1.4;color:${c.muted}">${escHtml(r.label)}</div><div style="font-family:${emailFonts.heading};font-size:18px;line-height:1.35;font-weight:700;color:${c.ink};word-break:break-word">${linkify(r.value)}</div></td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:separate"><tr><td bgcolor="${c.lilacSoft}" style="background:${c.lilacSoft};border:1px solid ${c.hairline};border-radius:18px;padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr></table>`;
}

/** The page round every email: white, the logo top left, a headline, the body, at most 560px wide. */
export function emailLayout(args: { title: string; siteUrl?: string; bodyHtml: string }): string {
  const site = (args.siteUrl ?? "").replace(/\/+$/, "");
  const logo = site
    ? `<img src="${escHtml(site)}/logo.png" alt="Givezy" width="132" style="display:block;width:132px;max-width:132px;height:auto;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${emailFonts.heading};font-size:24px;font-weight:800;color:${c.blue}">Givezy</span>`;
  return `<!doctype html>
<html lang="en-ZA" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escHtml(args.title)}</title>
<style>@media (max-width:600px){.gz-pad{padding:24px 16px !important}.gz-h1{font-size:24px !important}}</style></head>
<body style="margin:0;padding:0;background:${c.surface};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.surface}" style="background:${c.surface}"><tr><td align="center" style="padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%"><tr><td class="gz-pad" style="padding:32px 24px;font-family:${emailFonts.body};color:${c.ink};font-size:16px;line-height:1.55;text-align:left">
<div style="margin:0 0 28px">${logo}</div>
<h1 class="gz-h1" style="margin:0 0 20px;font-family:${emailFonts.heading};font-size:28px;line-height:1.2;font-weight:800;color:${c.ink}">${escHtml(keepRand(args.title))}</h1>
${args.bodyHtml}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const KV = /^([^:]{1,200}?): (?!\/\/)(.+)$/;
const LEAD_LINK = /^(.{2,70}):\s+(https?:\/\/\S+)$/;
const BARE_LINK = /^https?:\/\/\S+$/;

/** Short button words for links whose own sentence is too long to sit on a button. */
const PATH_LABELS: [RegExp, string][] = [
  [/\/monthly\/card(\?|$)/, "Use a different card"],
  [/\/charity-admin\/?$/, "See your application"],
];
function buttonLabel(url: string, lead?: string): string | null {
  if (lead && lead.length <= 30) return lead;
  let path = url;
  try { path = new URL(url).pathname + new URL(url).search; } catch { /* keep the raw address */ }
  return PATH_LABELS.find(([re]) => re.test(path))?.[1] ?? null;
}
const FOOTER = /^You're getting this because|sent this through Givezy\./;

function isCardBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const kv = lines.filter((l) => KV.test(l) && !/https?:\/\//.test(l));
  return kv.length >= 2 && kv.length * 2 >= lines.length;
}

/**
 * Lays a plain-text email out as HTML, word for word. Blank lines separate paragraphs. A block of
 * "label: value" lines becomes a lilac card. The first link that stands on its own line becomes the one
 * blue button, labelled with the words already in front of it; every other address is a plain link.
 * The sign-off and the "you're getting this because" lines are set smaller, in slate.
 */
export function textEmailHtml(args: { subject: string; text: string; siteUrl?: string }): string {
  const blocks = args.text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== ""))
    .filter((b) => b.length > 0);
  let buttonUsed = false;
  const out: string[] = [];
  blocks.forEach((lines, bi) => {
    const isLast = bi === blocks.length - 1;
    if (isLast && lines.length === 1 && lines[0].length <= 60 && /Givezy/.test(lines[0])) {
      out.push(paragraphHtml(escHtml(lines[0]), { muted: true }));
      return;
    }
    if (isCardBlock(lines)) {
      out.push(cardHtml(lines.map((l) => {
        const m = KV.exec(l);
        return m ? { label: m[1], value: m[2] } : { value: l };
      })));
      return;
    }
    let pending: string[] = [];
    const flush = () => {
      if (!pending.length) return;
      const muted = pending.every((l) => FOOTER.test(l));
      out.push(paragraphHtml(pending.map(linkify).join("<br>"), { muted }));
      pending = [];
    };
    lines.forEach((line, li) => {
      const lead = LEAD_LINK.exec(line);
      const leadLabel = lead ? buttonLabel(lead[2], lead[1]) : null;
      if (!buttonUsed && lead && leadLabel) {
        // A long lead sentence stays as words above the button, so nothing is said twice or lost.
        if (leadLabel !== lead[1]) pending.push(`${lead[1]}:`);
        flush();
        out.push(buttonHtml(leadLabel, lead[2]));
        buttonUsed = true;
        return;
      }
      const prev = li > 0 ? lines[li - 1] : "";
      if (!buttonUsed && BARE_LINK.test(line) && prev.endsWith(":")) {
        // The link's own line, after "...put it in here. ... as before:": the sentence stays above, the button gets short words.
        const label = buttonLabel(line);
        if (label) {
          flush();
          out.push(buttonHtml(label, line));
          buttonUsed = true;
          return;
        }
      }
      pending.push(line);
    });
    flush();
  });
  return emailLayout({ title: args.subject, siteUrl: args.siteUrl, bodyHtml: out.join("\n") });
}
