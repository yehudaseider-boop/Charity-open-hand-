/**
 * One-click stop (RFC 8058) on charities' emails to donors: the headers are on news and appeals and
 * thank-yous only, a POST with the email's token stops what the stop page's button stops, opening the
 * address changes nothing, and a bad token is refused the same way whether or not it was ever ours.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// The stop tables, in memory: news tokens are tied to one charity, thank-you tokens to an address only.
const newsTokens = new Map<string, { charity_id: string; email_hash: string }>();
const thanksTokens = new Map<string, { email_hash: string }>();
let newsOptOuts: { charity_id: string; email_hash: string }[] = [];
let thanksOptOuts: string[] = [];
let limited = false;
const limits: { bucket: string; keys: string[] }[] = [];

vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (bucket: string, keys: string[]) => (limits.push({ bucket, keys }), limited),
  ipKeys: (ip: string) => (ip && ip !== "unknown" ? [`ip:${ip}`] : []),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let hash = "";
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (_c: string, v: string) => ((hash = v), b);
      b.maybeSingle = async () => {
        if (table === "charity_email_stop_tokens") {
          const t = newsTokens.get(hash);
          return { data: t ? { ...t, charities: { name_en: "Meals Fund" } } : null, error: null };
        }
        if (table === "email_stop_tokens") return { data: thanksTokens.get(hash) ?? null, error: null };
        return { data: null, error: null };
      };
      b.upsert = async (row: { charity_id?: string; email_hash: string }) => {
        if (table === "charity_email_opt_outs") newsOptOuts.push({ charity_id: row.charity_id!, email_hash: row.email_hash });
        if (table === "thank_you_opt_outs") thanksOptOuts.push(row.email_hash);
        return { error: null };
      };
      return b;
    },
  }),
}));

const news = await import("@/app/api/stop/news/route");
const thanks = await import("@/app/api/stop/thanks/route");
const { appealEmail } = await import("@/lib/charity/appeals-rules");
const { oneDonorThankYouEmail, thankYouEmail } = await import("@/lib/charity/thank-you");
const { approvedEmail, inviteEmail } = await import("@/lib/charity/emails");
const { confirmationEmail } = await import("@/lib/donations/confirmation-email");
const { oneClickStopUrl } = await import("@/lib/email/headers");
const { consoleTransport, resendTransport } = await import("@/lib/email");

const token = (c: string) => c.repeat(43);
const req = (kind: "news" | "thanks", t: string, method = "POST") =>
  new NextRequest(`https://g.test/api/stop/${kind}?t=${encodeURIComponent(t)}`, {
    method,
    headers: { "x-real-ip": "203.0.113.9", ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    ...(method === "POST" ? { body: "List-Unsubscribe=One-Click" } : {}),
  });

beforeEach(() => {
  newsTokens.clear();
  thanksTokens.clear();
  newsOptOuts = [];
  thanksOptOuts = [];
  limited = false;
  limits.length = 0;
  newsTokens.set(sha(token("a")), { charity_id: "charity-1", email_hash: "h".repeat(64) });
  thanksTokens.set(sha(token("b")), { email_hash: "k".repeat(64) });
});

describe("the headers", () => {
  const one = { "List-Unsubscribe": "<https://g.test/api/stop/news?t=abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };

  it("are on a donor's news or appeal, and point at the news stop with the email's token", () => {
    const url = oneClickStopUrl("https://g.test/", "news", "abc");
    expect(url).toBe("https://g.test/api/stop/news?t=abc");
    const m = appealEmail("d@x.co", { charityName: "Meals", firstName: "Dana", subject: "News", body: "Some news.", stopUrl: "https://g.test/news/stop?t=abc", replyTo: null, oneClickUrl: url });
    expect(m.headers).toEqual(one);
  });

  it("are on the monthly thank-you and a personal thank-you, pointing at the thank-you stop", () => {
    const url = oneClickStopUrl("https://g.test", "thanks", "abc");
    const monthly = thankYouEmail("d@x.co", { charityName: "Meals", firstName: "Dana", month: "2026-10-01", body: "Thank you.", stopUrl: "s", oneClickUrl: url });
    const personal = oneDonorThankYouEmail("d@x.co", { charityName: "Meals", firstName: "Dana", body: "Thank you.", stopUrl: "s", replyTo: null, oneClickUrl: url });
    for (const m of [monthly, personal]) expect(m.headers).toEqual({ ...one, "List-Unsubscribe": "<https://g.test/api/stop/thanks?t=abc>" });
  });

  it("are not on a test copy, confirmations, receipts or emails to charities", () => {
    expect(appealEmail("me@x.co", { charityName: "Meals", firstName: null, subject: "[Test] News", body: "Some news.", stopUrl: "(each donor gets their own stop link here)", replyTo: null }).headers).toBeUndefined();
    expect(confirmationEmail({ id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", charityName: "Meals", amountCents: 18_000, contributionCents: 0, totalCents: 18_000, paidAt: "2026-10-08T10:00:00Z", wants18a: false })).not.toHaveProperty("headers");
    expect(approvedEmail("c@x.co", "Meals", "c1", true, "https://g.test").headers).toBeUndefined();
    expect(inviteEmail("c@x.co", "Meals", "https://g.test/invite").headers).toBeUndefined();
  });

  it("go to Resend as its headers field, one line each, and only when there are some", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => (bodies.push(JSON.parse(init.body)), new Response("{}", { status: 200 })));
    const t = resendTransport({ RESEND_API_KEY: "k", EMAIL_FROM: "hello@g.test" });
    await t.send({ to: "d@x.co", subject: "News", text: "Hi", headers: { "List-Unsubscribe": "<https://g.test/x>\r\nBcc: e@vil.test", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    await t.send({ to: "d@x.co", subject: "Receipt", text: "Hi" });
    vi.unstubAllGlobals();
    expect(bodies[0].headers).toEqual({ "List-Unsubscribe": "<https://g.test/x> Bcc: e@vil.test", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(bodies[1]).not.toHaveProperty("headers");
  });

  it("the log transport names them, without the link", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await consoleTransport.send({ to: "d@x.co", subject: "News", text: "Hi", headers: { "List-Unsubscribe": "<https://g.test/api/stop/news?t=secret>" } });
    expect(log.mock.calls[0][0]).toContain("with headers List-Unsubscribe");
    expect(log.mock.calls[0][0]).not.toContain("secret");
    log.mockRestore();
  });
});

describe("the one-click stop", () => {
  it("a POST stops that charity's news and appeals for that donor, and only that charity's", async () => {
    const res = await news.POST(req("news", token("a")));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect((await res.text()).length).toBeLessThan(80);
    expect(newsOptOuts).toEqual([{ charity_id: "charity-1", email_hash: "h".repeat(64) }]);
    // Not thank-yous, and not other charities.
    expect(thanksOptOuts).toEqual([]);
    expect(limits[0]).toEqual({ bucket: "one-click-stop", keys: ["ip:203.0.113.9"] });
  });

  it("a POST to the thank-you stop stops thank-yous, as the page's button does", async () => {
    const res = await thanks.POST(req("thanks", token("b")));
    expect(res.status).toBe(200);
    expect(thanksOptOuts).toEqual(["k".repeat(64)]);
    expect(newsOptOuts).toEqual([]);
  });

  it("each kind takes only its own tokens: a news token stops no thank-yous, and the other way round", async () => {
    expect((await thanks.POST(req("thanks", token("a")))).status).toBe(400);
    expect((await news.POST(req("news", token("b")))).status).toBe(400);
    expect(newsOptOuts).toEqual([]);
    expect(thanksOptOuts).toEqual([]);
  });

  it("opening the address (GET) changes nothing and goes to the page that asks first", async () => {
    const res = await news.GET(req("news", token("a"), "GET"));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/news/stop");
    expect(new URL(res.headers.get("location")!).searchParams.get("t")).toBe(token("a"));
    const t = await thanks.GET(req("thanks", token("b"), "GET"));
    expect(new URL(t.headers.get("location")!).pathname).toBe("/thanks/stop");
    expect(newsOptOuts).toEqual([]);
    expect(thanksOptOuts).toEqual([]);
  });

  it("refuses a bad or unknown token with the same answer, and changes nothing", async () => {
    const answers = [];
    for (const t of ["", "short", token("z"), `${token("a")}x`]) {
      const res = await news.POST(req("news", t));
      answers.push([res.status, await res.text()]);
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0][0]).toBe(400);
    expect(newsOptOuts).toEqual([]);
  });

  it("is rate limited, and then changes nothing", async () => {
    limited = true;
    const res = await news.POST(req("news", token("a")));
    expect(res.status).toBe(429);
    expect(newsOptOuts).toEqual([]);
  });
});
