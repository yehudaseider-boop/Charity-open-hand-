/**
 * "Request a charity" (15/11/2026): what the form accepts, how links and names are tidied, how Admin groups the
 * requests, the one email a donor agreed to, and the links on Find a charity.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { checkCharityRequest, cleanLink, groupRequests, joinedEmail, requestKey, requestSentMessage, type RequestRow } from "@/lib/charity-requests";
import { emptyState, requestHref } from "@/lib/charity/browse";
import { dailyDigest, type DailyChecks } from "@/lib/ops/daily";

describe("the request form", () => {
  it("needs only the charity's name", () => {
    const r = checkCharityRequest({ name: "  Hope   House " });
    expect(r).toEqual({ ok: true, request: { name: "Hope House", town: null, link: null, note: null, notifyEmail: null } });
  });

  it("an empty or silly name is refused in plain words", () => {
    expect(checkCharityRequest({ name: "" })).toMatchObject({ ok: false, fieldErrors: { name: "Enter the charity's name." } });
    expect(checkCharityRequest({ name: "x" })).toMatchObject({ ok: false, fieldErrors: { name: expect.stringMatching(/too short/) } });
    expect(checkCharityRequest({ name: "a".repeat(121) })).toMatchObject({ ok: false, fieldErrors: { name: expect.stringMatching(/under 120/) } });
  });

  it("the email is kept only when the box is ticked", () => {
    expect(checkCharityRequest({ name: "Hope House", email: "a@example.co.za" })).toMatchObject({ ok: true, request: { notifyEmail: null } });
    expect(checkCharityRequest({ name: "Hope House", emailMe: "on", email: " A@Example.co.za " })).toMatchObject({ ok: true, request: { notifyEmail: "a@example.co.za" } });
    expect(checkCharityRequest({ name: "Hope House", emailMe: true, email: "" })).toMatchObject({ ok: false, fieldErrors: { email: expect.stringMatching(/untick/) } });
    expect(checkCharityRequest({ name: "Hope House", emailMe: true, email: "nope" })).toMatchObject({ ok: false, fieldErrors: { email: expect.stringMatching(/email address/) } });
  });

  it("several problems are named together, and nothing is sent", () => {
    const r = checkCharityRequest({ name: "", link: "not a link", note: "n".repeat(501) });
    expect(r).toMatchObject({ ok: false, message: "A few things need a look. Nothing was sent yet." });
    expect(Object.keys((r as { fieldErrors: object }).fieldErrors)).toEqual(["name", "link", "note"]);
  });

  it("the thank-you says whether they'll hear back", () => {
    expect(requestSentMessage("Hope House", true)).toMatch(/email you once if they do/);
    expect(requestSentMessage("Hope House", false)).not.toMatch(/email/);
  });
});

describe("links typed by donors", () => {
  it("gets https:// added, and only web links pass", () => {
    expect(cleanLink("facebook.com/hopehouse")).toBe("https://facebook.com/hopehouse");
    expect(cleanLink("http://hope.org.za")).toBe("http://hope.org.za/");
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("mailto:a@b.co")).toBeNull();
    expect(cleanLink("hope house")).toBeNull();
    expect(cleanLink("https://user:pw@hope.org.za")).toBeNull();
    expect(cleanLink("")).toBeNull();
  });
});

describe("grouping for Admin", () => {
  it("the same charity typed differently is one group", () => {
    expect(requestKey("The Hope-House!")).toBe(requestKey("hope house"));
    expect(requestKey("Café Kids")).toBe(requestKey("cafe kids"));
  });

  it("most asked first, with the spelling most people used", () => {
    const row = (name: string, at: string, extra: Partial<RequestRow> = {}): RequestRow => ({ name, name_key: requestKey(name), town: null, link: null, note: null, wants_email: false, status: "new", created_at: at, ...extra });
    const groups = groupRequests([
      row("Hope House", "2026-11-10T08:00:00Z", { wants_email: true, town: "Soweto" }),
      row("hope house", "2026-11-12T08:00:00Z", { status: "invited", town: "Soweto" }),
      row("Hope House", "2026-11-11T08:00:00Z"),
      row("Lone Charity", "2026-11-14T08:00:00Z"),
      row("Done Charity", "2026-11-14T08:00:00Z", { status: "added" }),
    ]);
    expect(groups.map((g) => [g.name, g.asks])).toEqual([["Hope House", 3], ["Lone Charity", 1]]);
    expect(groups[0]).toMatchObject({ wantEmail: 1, status: "invited", towns: ["Soweto"], firstAt: "2026-11-10T08:00:00Z", lastAt: "2026-11-12T08:00:00Z" });
  });
});

describe("the email when a charity joins", () => {
  it("names the charity, links to it, and says the address is deleted", () => {
    const e = joinedEmail("Hope House", "https://givezy.test/c/hope-house");
    expect(e.subject).toBe("Hope House has joined Givezy");
    expect(e.text).toContain("https://givezy.test/c/hope-house");
    expect(e.text).toMatch(/deleted your email address/);
    expect(e.text).not.toMatch(/!/);
  });
});

describe("Find a charity", () => {
  it("an empty search offers to ask for it, carrying what was typed", () => {
    expect(emptyState("hope", null, { requestsOpen: true }).actions).toContainEqual({ label: "Ask us to add it", href: "/charities/request?name=hope" });
    expect(emptyState("hope", null).actions.map((a) => a.label)).not.toContain("Ask us to add it");
    expect(requestHref("")).toBe("/charities/request");
    expect(requestHref("a&b")).toBe("/charities/request?name=a%26b");
  });
});

describe("the daily email", () => {
  it("counts new requests, never who asked", () => {
    const c = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {}, charityRequests: { lastDay: 2, waiting: 5 } } as DailyChecks;
    const lines = dailyDigest(c, {} as Parameters<typeof dailyDigest>[1]);
    expect(lines).toContainEqual("2 donors asked for a charity that isn't on Givezy yet. 5 requests wait for a look in Admin, Charity requests.");
  });
});
