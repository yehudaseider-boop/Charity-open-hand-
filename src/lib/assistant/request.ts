import { assistantConfig } from "@/config/assistant";

/**
 * What the help panel sends, and the checks on it before anything goes to the model (21/11/2026). Pure.
 * Only the conversation's words travel from the browser. Earlier turns are trimmed to the last few, and capped in size.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type AssistantRequest = { charityId?: unknown; demo?: unknown; page?: unknown; messages?: unknown };

type Checked =
  | { ok: true; charityId: string | null; demo: boolean; page: string | null; messages: ChatTurn[] }
  | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkQuestion(body: AssistantRequest, limits = assistantConfig): Checked {
  const demo = body.demo === true;
  const charityId = typeof body.charityId === "string" && UUID.test(body.charityId) ? body.charityId.toLowerCase() : null;
  if (!demo && !charityId) return { ok: false, message: "We couldn't tell which charity this is for. Please reload the page." };
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false, message: "Type a question first." };

  const turns: ChatTurn[] = [];
  for (const m of body.messages) {
    if (!m || typeof m !== "object") return { ok: false, message: "We couldn't read that question. Please try again." };
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return { ok: false, message: "We couldn't read that question. Please try again." };
    const text = content.trim();
    if (!text) continue;
    // Earlier answers come back from the browser with every question: an email or phone number Givy gave once is taken
    // out before it goes to the model again (review 24/11/2026), so it can't be re-sent or gathered into a list. The
    // panel keeps its own copy for the person. The person's own questions are kept as they typed them.
    const kept = role === "assistant" ? withoutContactDetails(text) : text;
    turns.push({ role, content: kept.slice(0, role === "user" ? limits.maxQuestionChars : limits.maxAnswerChars) });
  }
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return { ok: false, message: "Type a question first." };
  if ((body.messages[body.messages.length - 1] as { content: string }).content.trim().length > limits.maxQuestionChars) {
    return { ok: false, message: `Please keep your question under ${limits.maxQuestionChars} characters.` };
  }

  // Keep the last few turns, starting with a question, and with questions and answers taking turns.
  const recent = turns.slice(-limits.maxTurns);
  while (recent.length && recent[0].role !== "user") recent.shift();
  const merged: ChatTurn[] = [];
  for (const t of recent) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === t.role) prev.content = `${prev.content}\n\n${t.content}`;
    else merged.push({ ...t });
  }
  // Questions in a row (an answer that failed) are joined above: each joined turn is cut back to one turn's limit,
  // keeping its newest words, so twelve 800-character questions can't become one of 9 600 (review 24/11/2026).
  for (const m of merged) {
    const limit = m.role === "user" ? limits.maxQuestionChars : limits.maxAnswerChars;
    if (m.content.length > limit) m.content = m.content.slice(-limit);
  }
  // The whole history is capped too (review 21/11/2026): the oldest turns go first, the question always stays.
  let total = merged.reduce((t, m) => t + m.content.length, 0);
  while (merged.length > 1 && total > limits.maxHistoryChars) {
    total -= merged.shift()!.content.length;
    if (merged[0]?.role === "assistant") total -= merged.shift()!.content.length;
  }
  return { ok: true, charityId, demo, page: typeof body.page === "string" ? body.page.slice(0, 200) : null, messages: merged };
}

export const CONTACT_REMOVED = "[contact details removed]";

/**
 * Anything that looks like an email address or a phone number, replaced by CONTACT_REMOVED (review 24/11/2026). Phone
 * numbers: South African ("082 123 4567", "(011) 123-4567", "0821234567") and international ("+27 82 123 4567",
 * "0044 20 7946 0958"). Rand amounts ("R1 250 000") and dates ("20/11/2026") are left alone.
 */
export function withoutContactDetails(text: string): string {
  return text
    .replace(/[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,24}/gi, CONTACT_REMOVED)
    .replace(/(?<![\w+])(?:\+|00)\d(?:[\s.()-]{0,2}\d){7,14}(?!\d)/g, CONTACT_REMOVED)
    .replace(/(?<![\w.,/])\(?0\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\d/])/g, CONTACT_REMOVED);
}

/**
 * The page the person is on, as the guide writes it ("dash:/receipts"), from the browser's path. Only a plain
 * dashboard path counts; anything else is left out.
 */
export function pagePath(path: string | null): string | null {
  if (!path) return null;
  const m = /^\/(?:charity-admin\/[0-9a-f-]{36}|demo\/dashboard)(\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)?\/?$/i.exec(path.split(/[?#]/)[0]);
  if (!m) return null;
  // A donor's or campaign's id says nothing useful and stays here.
  return `dash:${(m[1] ?? "/").toLowerCase().replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(?=\/|$)/g, "/[id]")}`;
}
