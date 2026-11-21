/**
 * Turns an assistant answer into safe pieces to show (21/11/2026). Dependency-free, shared by the panel and the tests.
 *
 * The assistant writes plain text with numbered or dashed lists, **bold** for on-screen labels, and links written as
 * [Label](dash:/page). Only "dash:" links become links, and only to a plain dashboard path under this charity's
 * dashboard; anything else (a web address, a "javascript:" link, a path with ".." or a query) shows as plain text.
 * Nothing the assistant writes is ever treated as HTML.
 */

export type Inline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "link"; text: string; href: string };
export type Block = { kind: "para"; parts: Inline[] } | { kind: "list"; ordered: boolean; items: Inline[][] };

/** A dashboard page path the assistant may link to: lower-case words and slashes, nothing else. */
const SAFE_PATH = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;

/** The address for "dash:/receipts" in this dashboard ("/charity-admin/<id>" or the demo's "/demo/dashboard"), or null. */
export function dashHref(target: string, base: string): string | null {
  if (!target.startsWith("dash:")) return null;
  const path = target.slice(5) || "/";
  if (!SAFE_PATH.test(path)) return null;
  return path === "/" ? base : `${base}${path}`;
}

const TOKEN = /\[([^\]\n]{1,80})\]\(([^)\s]{1,120})\)|\*\*([^*\n]{1,120})\*\*/g;

/** One line's text, split into plain text, bold labels and safe links. */
export function inline(line: string, base: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[3] !== undefined) {
      out.push({ kind: "bold", text: m[3] });
    } else {
      const href = dashHref(m[2], base);
      out.push(href ? { kind: "link", text: m[1], href } : { kind: "text", text: m[1] });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out.filter((p) => p.text.length > 0);
}

const ORDERED = /^\s*\d{1,2}[.)]\s+/;
const BULLET = /^\s*[-*•]\s+/;

/** The whole answer as paragraphs and lists. Headings and other markup show as their plain words. */
export function parseAnswer(text: string, base: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", parts: inline(para.join(" "), base) });
    para = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "").trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      flush();
      const item = inline(line.replace(ordered ? ORDERED : BULLET, ""), base);
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === "list" && prev.ordered === ordered) prev.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
