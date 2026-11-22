import Anthropic from "@anthropic-ai/sdk";
import { assistantConfig, assistantDemoOn, assistantDonorDataOn, assistantOn } from "@/config/assistant";
import { legalConfig } from "@/config/legal";
import { demoSource } from "@/lib/assistant/demo-source";
import { liveSource } from "@/lib/assistant/live-source";
import { askerContext, stableInstructions } from "@/lib/assistant/prompt";
import { checkQuestion, pagePath, type AssistantRequest } from "@/lib/assistant/request";
import { nextMark } from "@/lib/assistant/suggestions";
import { checkToolCall, runTool, toolDefinitions, type HelperSource } from "@/lib/assistant/tools";
import { getViewer } from "@/lib/auth";
import { viewerRole } from "@/lib/charity/team";
import { clientIp } from "@/lib/client-ip";
import { hasSecondStep } from "@/lib/mfa";
import { forgetAttempts, hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { fromThisSite } from "@/lib/same-site";

/**
 * The dashboard helper (21/11/2026; looks things up since 22/11/2026). A signed-in member of the charity who has
 * passed the second step (or a visitor to the public demo, when it is on) sends a question; the answer streams back as
 * plain text. To answer, the model may call read-only tools (src/lib/assistant/tools.ts) that read the charity's own
 * figures as the person asking, so it never sees more than their dashboard shows them; nothing is changed. The
 * question, and what the tools return, go to Anthropic to be answered; neither is stored by us. Only counts (tokens
 * used, lookups made) are logged, never the question, the figures or the answer.
 */

export const dynamic = "force-dynamic";
// Several rounds with the model when it looks things up: each round has its own time limit (roundTimeoutMs).
export const maxDuration = 120;

const plain = (status: number, message: string) =>
  Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

let client: Anthropic | null = null;
// One quick retry, and a time limit per round, so a stalled call ends with a plain message rather than being cut off.
const anthropic = () => (client ??= new Anthropic({ timeout: assistantConfig.roundTimeoutMs, maxRetries: 1 }));

export async function POST(req: Request) {
  if (!assistantOn()) return plain(404, "Givy isn't switched on.");
  if (!fromThisSite(req.headers)) return plain(403, "This can only be asked from the Givezy dashboard.");

  let body: AssistantRequest;
  try {
    body = (await req.json()) as AssistantRequest;
  } catch {
    return plain(400, "We couldn't read that question. Please try again.");
  }
  const checked = checkQuestion(body);
  if (!checked.ok) return plain(400, checked.message);
  const { messages, charityId, demo, page } = checked;

  // Who is asking: a member of this charity who has passed the second step, or a visitor to the public demo.
  let role: Awaited<ReturnType<typeof viewerRole>> | "demo";
  let keys: { bucket: string; keys: string[]; limit: number; minutes: number }[];
  let source: HelperSource;
  if (demo) {
    if (!assistantDemoOn()) return plain(404, "Givy isn't switched on for the demo.");
    const visitor = ipKeys(clientIp(req.headers));
    // No address to count by: refused, so the demo's shared daily allowance can't be used up anonymously.
    if (visitor.length === 0) return plain(429, "Givy can't answer on the demo just now. Please try again later.");
    role = "demo";
    keys = [
      { bucket: "assistant-demo", keys: visitor, limit: assistantConfig.demoPerVisitorPerHour, minutes: 60 },
      { bucket: "assistant-demo-all", keys: ["demo#all"], limit: assistantConfig.demoPerDay, minutes: 24 * 60 },
    ];
    source = demoSource();
  } else {
    const viewer = await getViewer();
    if (!viewer) return plain(401, "Please sign in again to ask a question.");
    role = charityId ? await viewerRole(charityId) : null;
    if (!role) return plain(403, "You're not part of this charity's team, so Givy isn't available here.");
    // The dashboard itself needs the second step; so does its helper (review 21/11/2026).
    if (!(await hasSecondStep())) return plain(401, "Please finish signing in with your authenticator app, then ask again.");
    keys = [
      { bucket: "assistant-person", keys: [`user#${viewer.userId}`], limit: assistantConfig.perPersonPerHour, minutes: 60 },
      { bucket: "assistant-charity", keys: [`charity#${charityId}`], limit: assistantConfig.perCharityPerDay, minutes: 24 * 60 },
    ];
    source = liveSource(charityId!);
  }

  try {
    // A refused question counts nowhere: not in the limit that refused it, nor in one it already passed.
    const recorded: string[] = [];
    for (const k of keys) {
      if (await hitRateLimit(k.bucket, k.keys, k.limit, k.minutes, { forgetRefused: true, recorded })) {
        await forgetAttempts(recorded);
        return plain(429, "You've asked a lot of questions in a short time. Please try again a little later, or contact the Givezy team.");
      }
    }
  } catch (e) {
    console.error("[assistant] limit check failed", e);
    return plain(503, "Givy is busy just now. Nothing was changed. Please try again in a moment.");
  }

  // The demo is made up, so its donors' names may always be shown there.
  const donorData = demo || assistantDonorDataOn();
  const contact = { whatsApp: legalConfig.supportWhatsApp, email: legalConfig.supportEmail };
  const tools = toolDefinitions(donorData);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // The tools, rules and whole guide: identical for everyone with the same switches, so cached for an hour.
    { type: "text", text: stableInstructions(contact, donorData), cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: askerContext(role, pagePath(page)) },
  ];
  const convo: Anthropic.Beta.BetaMessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  const encoder = new TextEncoder();
  let stopped = false;
  let current: { abort(): void } | null = null;
  // The SDK's own timeout only covers the wait for the reply to start, so each round also has a timer that ends it
  // if it stalls part-way, and the whole answer has a deadline under the route's time limit (review 22/11/2026).
  const deadline = Date.now() + assistantConfig.answerDeadlineMs;
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (!stopped) controller.enqueue(encoder.encode(text));
      };
      // Text written this round, and in the whole answer.
      let sent = false;
      let anySent = false;
      let lookups = 0;
      // Which lookups ran, so the panel can offer fitting follow-up questions (22/11/2026).
      const used: string[] = [];
      try {
        for (let round = 0; round <= assistantConfig.maxToolRounds && !stopped; round++) {
          // The last round has no tools: by then it must answer with what it found. Short of time, it answers now.
          const left = deadline - Date.now();
          if (left < 5_000) throw new Error("answer deadline passed");
          const lastRound = round === assistantConfig.maxToolRounds || left < assistantConfig.roundTimeoutMs / 2;
          const stream = anthropic().beta.messages.stream({
            model: assistantConfig.model,
            max_tokens: assistantConfig.maxAnswerTokens,
            ...(assistantConfig.serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
            output_config: { effort: assistantConfig.effort },
            system,
            tools,
            tool_choice: lastRound ? { type: "none" } : { type: "auto" },
            messages: convo,
          });
          current = stream;
          const timer = setTimeout(() => stream.abort(), Math.min(assistantConfig.roundTimeoutMs, left));
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              sent = true;
              anySent = true;
              send(event.delta.text);
            }
          }
          const final = await stream.finalMessage().finally(() => clearTimeout(timer));
          const u = final.usage;
          // Counts only: what each round cost, never what was asked or found.
          console.info(
            `[assistant] round ${round + 1} (${demo ? "demo" : "charity"}): in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}, stop ${final.stop_reason}`,
          );

          if (final.stop_reason === "tool_use" && !lastRound) {
            // The whole reply goes back as it came (thinking included), then one message with every lookup's result.
            convo.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
            const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
            for (const block of final.content) {
              if (block.type !== "tool_use") continue;
              lookups += 1;
              const call = checkToolCall(block.name, block.input, donorData);
              if (!call.ok) {
                results.push({ type: "tool_result", tool_use_id: block.id, content: call.error, is_error: true });
                continue;
              }
              try {
                results.push({ type: "tool_result", tool_use_id: block.id, content: await runTool(call, source, donorData) });
                used.push(block.name);
              } catch (e) {
                console.error("[assistant] lookup failed", block.name, e instanceof Error ? e.message : e);
                results.push({ type: "tool_result", tool_use_id: block.id, content: "That couldn't be looked up just now.", is_error: true });
              }
            }
            convo.push({ role: "user", content: results });
            // A blank line, so words from before and after a lookup don't run together.
            if (sent) send("\n\n");
            sent = false;
            continue;
          }

          if (final.stop_reason === "max_tokens") {
            send(sent ? "\n\n(That answer was cut short. Ask me to carry on, or ask a narrower question.)" : "That answer ran too long. Please ask a narrower question.");
          } else if (final.stop_reason === "refusal" || !anySent) {
            send(anySent ? "\n\nI can't help with that one. Please contact the Givezy team." : "I can't help with that one. Please contact the Givezy team.");
          }
          break;
        }
        // Never an empty answer shown as finished.
        if (!anySent && !stopped) send("I couldn't put an answer together just now. Please try again, or contact the Givezy team.");
        // Last of all, after the answer: which lookups ran (names only, from our own list). The panel hides it.
        if (!stopped) send(nextMark(used));
        console.info(`[assistant] lookups: ${lookups}`);
      } catch (e) {
        if (!stopped) {
          console.error("[assistant] answer failed", e instanceof Anthropic.APIError ? `${e.status} ${e.name}` : e instanceof Error ? e.name : e);
          send(anySent ? "\n\n[[error]]" : "[[error]]");
        }
      } finally {
        if (!stopped) controller.close();
      }
    },
    cancel() {
      // The person pressed Stop: end quietly (no error logged, nothing more written).
      stopped = true;
      current?.abort();
    },
  });

  return new Response(out, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
