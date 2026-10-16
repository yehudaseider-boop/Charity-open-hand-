import { describe, expect, it } from "vitest";
import { campaignShareText, charityShareText, whatsappUrl } from "../apps/mobile/src/lib/share";
import { raisingNow } from "../apps/mobile/src/lib/live-charities";

describe("sharing on WhatsApp", () => {
  const c = { slug: "northcliff-meals-fund", nameEn: "Northcliff Meals Fund" };
  it("links to the charity's page on our website", () => {
    expect(charityShareText("https://givezy.co.za/", c)).toBe("I give to Northcliff Meals Fund on Givezy. Have a look: https://givezy.co.za/c/northcliff-meals-fund");
  });
  it("a campaign says how far along it is and links to give to it", () => {
    const t = campaignShareText("https://givezy.co.za", c, { id: "c-1", title: "Pesach parcels", raised: "R31 400", target: "R50 000" });
    expect(t).toBe("Northcliff Meals Fund is raising for Pesach parcels. R31 400 of R50 000 raised so far. Give here: https://givezy.co.za/c/northcliff-meals-fund/donate?campaign=c-1");
    expect(t).not.toMatch(/!|—/);
  });
  it("nothing to share until the website is live on https", () => {
    expect(charityShareText(undefined, c)).toBeNull();
    expect(charityShareText("http://x.test", c)).toBeNull();
  });
  it("opens WhatsApp with the message ready", () => {
    expect(whatsappUrl("Give here: https://g.test/c/a?x=1&y=2")).toBe("https://wa.me/?text=Give%20here%3A%20https%3A%2F%2Fg.test%2Fc%2Fa%3Fx%3D1%26y%3D2");
  });
});

describe("raising now on Discover", () => {
  const charity = (id: string) => ({ id, slug: id, nameEn: id }) as never;
  const row = (id: string, charityId: string, target: number | null, endsAt: string | null = null) => ({ id, charity_id: charityId, title: id, description: null, target_cents: target, ends_at: endsAt });
  const now = new Date("2026-10-16T10:00:00+02:00");
  it("closest to the goal first, only charities in the directory, none past their last day", () => {
    const rows = [row("far", "a", 100_000), row("close", "a", 100_000), row("hidden", "zzz", 100_000), row("over", "b", 100_000, "2026-10-01T23:59:59+02:00"), row("no-goal", "b", null)];
    const progress = [
      { campaign_id: "far", raised_cents: 10_000, gift_count: 1 },
      { campaign_id: "close", raised_cents: 90_000, gift_count: 9 },
    ];
    expect(raisingNow(rows, progress, [charity("a"), charity("b")], 6, now).map((x) => x.campaign.id)).toEqual(["close", "far", "no-goal"]);
  });
});
