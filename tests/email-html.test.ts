import { describe, expect, it, vi } from "vitest";
import { getEmailTransport } from "@/lib/email";
import { textEmailHtml } from "@/lib/email/html";
import { brandColors } from "@/lib/brand-colors";
import { applicationReceivedEmail, donationReceivedEmail } from "@/lib/charity/emails";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { monthlyFailedEmail } from "@/lib/donations/monthly-email";

const site = "https://givezy.test";
const words = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();

describe("the HTML version of an email", () => {
  const confirmation = confirmationEmail({
    id: "0b6a3c1e-1111-4222-8333-444455556666", charityName: "Meals Fund", amountCents: 25_000, contributionCents: 2_000,
    totalCents: 27_000, paidAt: "2026-10-01T10:00:00Z", wants18a: true, dedication: "In memory of Chaim Cohen",
  });

  it("keeps every word of the text version", () => {
    for (const m of [
      applicationReceivedEmail("c@x.co", "Meals Fund", site),
      { subject: confirmation.subject, text: confirmation.text },
      monthlyFailedEmail({ charityName: "Meals Fund", totalText: "R150", cardLast4: "4242", final: false, newCardUrl: `${site}/card?t=abc`, helpEmail: "help@givezy.test" }),
    ]) {
      const raw = textEmailHtml({ subject: m.subject, text: m.text, siteUrl: site });
      const html = words(raw);
      for (const line of m.text.split("\n").filter(Boolean)) {
        // A link on its own line is the button's address.
        if (/^https?:\/\/\S+$/.test(line)) {
          expect(raw).toContain(`href="${line}"`);
          continue;
        }
        // A "label: link" line becomes a button with the label, and a card shows "label: value" as a label over its
        // value (so without the colon); every other word is there as written.
        const lead = /^(.*): (https?:\/\/\S+)$/.exec(line);
        expect(html.replace(/:/g, "")).toContain((lead ? lead[1] : line).replace(/:/g, ""));
      }
    }
  });

  it("is in the Givezy look: logo, ink text, one blue button, lilac card, no Hebrew", () => {
    const html = textEmailHtml({ subject: confirmation.subject, text: confirmation.text, siteUrl: site });
    expect(html).toContain(`src="${site}/logo.png"`);
    expect(html).toContain(brandColors.ink);
    expect(html).toContain(brandColors.lilacSoft);
    expect(html).toContain("Bricolage Grotesque");
    expect(html).not.toMatch(/dir="rtl"|Heebo|lang="he"/);
    expect(html).not.toContain("${");
    const m = applicationReceivedEmail("c@x.co", "Meals Fund", site);
    const withButton = textEmailHtml({ subject: m.subject, text: m.text, siteUrl: site });
    expect(withButton.match(/border-bottom:4px solid/g)).toHaveLength(1);
    expect(withButton).toContain(`href="${site}/charity-admin"`);
  });

  it("escapes what a person typed", () => {
    const html = textEmailHtml({ subject: "<b>x</b>", text: `Dear <script>alert(1)</script>,\n\nSee ${site}/a?x=1&y=2.` });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain(`href="${site}/a?x=1&amp;y=2"`);
  });

  it("is added by the transport when an email has none, and an email's own HTML is kept", async () => {
    const bodies: { html?: string; text: string }[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const t = getEmailTransport({ EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "k", EMAIL_FROM: "a@givezy.test", SITE_URL: site });
      const m = donationReceivedEmail("c@x.co", { charityName: "Meals Fund", charityId: "id-1", amountCents: 10_000, monthly: false, campaignTitle: null }, site);
      expect(await t.send(m)).toBe("sent");
      expect(bodies[0].text).toBe(m.text);
      expect(bodies[0].html).toContain(`href="${site}/charity-admin/id-1/donations"`);
      expect(bodies[0].html).toContain(`src="${site}/logo.png"`);
      await t.send({ ...m, html: "<p>own</p>" });
      expect(bodies[1].html).toBe("<p>own</p>");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
