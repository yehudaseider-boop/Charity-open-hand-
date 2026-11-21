import Anthropic from "@anthropic-ai/sdk";
import { assistantConfig, assistantDemoOn, assistantOn } from "@/config/assistant";
import { legalConfig } from "@/config/legal";
import { askerContext, stableInstructions } from "@/lib/assistant/prompt";
import { checkQuestion, pagePath, type AssistantRequest } from "@/lib/assistant/request";
import { getViewer } from "@/lib/auth";
import { viewerRole } from "@/lib/charity/team";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { fromThisSite } from "@/lib/same-site";

/**
 * The dashboard help assistant (21/11/2026). A signed-in member of the charity (or the public demo, when it is on)
 * sends a question; the answer streams back as plain text. It answers from our dashboard guide only: no charity data
 * is read or sent, and nothing is changed. The question goes to Anthropic to be answered; it is not stored by us.
 * Only counts (tokens used) are logged, never the question or the answer.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const plain = (status: number, message: string) =>
  Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export async function POST(req: Request) {
  if (!assistantOn()) return plain(404, "The help assistant isn't switched on.");
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

  // Who is asking: a member of this charity, or a visitor to the public demo.
  let role: Awaited<ReturnType<typeof viewerRole>> | "demo";
  let keys: { bucket: string; keys: string[]; limit: number; minutes: number }[];
  if (demo) {
    if (!assistantDemoOn()) return plain(404, "The help assistant isn't switched on for the demo.");
    role = "demo";
    keys = [
      { bucket: "assistant-demo", keys: ipKeys(clientIp(req.headers)), limit: assistantConfig.demoPerVisitorPerHour, minutes: 60 },
      { bucket: "assistant-demo-all", keys: ["demo#all"], limit: assistantConfig.demoPerDay, minutes: 24 * 60 },
    ];
  } else {
    const viewer = await getViewer();
    if (!viewer) return plain(401, "Please sign in again to ask a question.");
    role = charityId ? await viewerRole(charityId) : null;
    if (!role) return plain(403, "You're not part of this charity's team, so the helper isn't available here.");
    keys = [
      { bucket: "assistant-person", keys: [`user#${viewer.userId}`], limit: assistantConfig.perPersonPerHour, minutes: 60 },
      { bucket: "assistant-charity", keys: [`charity#${charityId}`], limit: assistantConfig.perCharityPerDay, minutes: 24 * 60 },
    ];
  }

  try {
    for (const k of keys) {
      if (await hitRateLimit(k.bucket, k.keys, k.limit, k.minutes)) {
        return plain(429, "You've asked a lot of questions in a short time. Please try again a little later, or contact the Givezy team.");
      }
    }
  } catch (e) {
    console.error("[assistant] limit check failed", e);
    return plain(503, "The helper is busy just now. Nothing was changed. Please try again in a moment.");
  }

  const contact = { whatsApp: legalConfig.supportWhatsApp, email: legalConfig.supportEmail };
  const stream = anthropic().beta.messages.stream({
    model: assistantConfig.model,
    max_tokens: assistantConfig.maxAnswerTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: assistantConfig.effort },
    system: [
      // The rules and the whole guide: identical for everyone, so it is cached and paid for once.
      { type: "text", text: stableInstructions(contact), cache_control: { type: "ephemeral" } },
      { type: "text", text: askerContext(role, pagePath(page)) },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const body2 = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            sent = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        const u = final.usage;
        // Counts only: what each answer cost, never what was asked.
        console.info(
          `[assistant] answered (${demo ? "demo" : "charity"}): in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}, stop ${final.stop_reason}`,
        );
        if (final.stop_reason === "refusal" || !sent) {
          controller.enqueue(encoder.encode(sent ? "\n\nI can't help with that one. Please contact the Givezy team." : "I can't help with that one. Please contact the Givezy team."));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n(That answer was cut short. Ask me to carry on, or ask a narrower question.)"));
        }
      } catch (e) {
        console.error("[assistant] answer failed", e instanceof Anthropic.APIError ? `${e.status} ${e.name}` : e);
        controller.enqueue(encoder.encode(sent ? "\n\n[[error]]" : "[[error]]"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body2, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
