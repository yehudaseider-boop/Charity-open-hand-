import { assistantConfig } from "@/config/assistant";

/**
 * What the help panel sends, and the checks on it before anything goes to the model (21/11/2026). Pure.
 * Only the conversation's words travel: never charity data. Earlier turns are trimmed to the last few.
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
    turns.push({ role, content: text.slice(0, role === "user" ? limits.maxQuestionChars : 4000) });
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
  return { ok: true, charityId, demo, page: typeof body.page === "string" ? body.page.slice(0, 200) : null, messages: merged };
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
