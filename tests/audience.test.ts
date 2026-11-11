/** The landing page's two doors (10/11/2026): a shared ?for= link opens the right one (#give or #charity). */
import { describe, expect, it } from "vitest";
import { AUDIENCE_LABELS, AUDIENCE_PATHS, appCta, audienceRedirect } from "@/lib/audience";
import { appLinks } from "@/config/app-links";

const at = (u: string) => new URL(u);

describe("a shared ?for= link", () => {
  it("opens the charity door on the landing page, keeping other parameters", () => {
    expect(audienceRedirect(at("https://givezy.co.za/?for=charity&utm_source=wa"), "GET")?.toString()).toBe("https://givezy.co.za/?utm_source=wa#charity");
  });
  it("opens the giver's door, from the landing page or from For charities", () => {
    expect(audienceRedirect(at("https://givezy.co.za/?for=give"), "GET")?.toString()).toBe("https://givezy.co.za/#give");
    expect(audienceRedirect(at("https://givezy.co.za/for-charities?for=give"), "GET")?.toString()).toBe("https://givezy.co.za/#give");
  });
  it("treats anything but charity as the giver's door, and keeps For charities for the charity side", () => {
    expect(audienceRedirect(at("https://givezy.co.za/?for=nonsense"), "GET")?.toString()).toBe("https://givezy.co.za/#give");
    expect(audienceRedirect(at("https://givezy.co.za/for-charities?for=charity&x=1"), "GET")?.toString()).toBe("https://givezy.co.za/for-charities?x=1");
  });
  it("leaves other pages, plain visits and sent forms alone", () => {
    expect(audienceRedirect(at("https://givezy.co.za/"), "GET")).toBeNull();
    expect(audienceRedirect(at("https://givezy.co.za/charities?for=charity"), "GET")).toBeNull();
    expect(audienceRedirect(at("https://givezy.co.za/?for=charity"), "POST")).toBeNull();
  });
  it("has one label and place per side", () => {
    expect(AUDIENCE_LABELS).toEqual({ give: "I give", charity: "I run a charity" });
    expect(AUDIENCE_PATHS).toEqual({ give: "/for-donors", charity: "/for-charities" });
  });
});

describe("the app button", () => {
  it("says coming soon, with no dead link, while the store links are not set", () => {
    expect(appCta({ appStoreUrl: null, playStoreUrl: null })).toEqual({ kind: "soon", text: "Coming soon to the App Store and Google Play" });
  });
  it("shows only the stores that are set", () => {
    expect(appCta({ appStoreUrl: "https://apps.apple.com/x", playStoreUrl: null })).toEqual({ kind: "stores", stores: [{ label: "App Store", href: "https://apps.apple.com/x" }] });
    expect(appCta({ appStoreUrl: "https://a", playStoreUrl: "https://p" })).toMatchObject({ kind: "stores", stores: [{ label: "App Store" }, { label: "Google Play" }] });
  });
  it("starts with no store links and the confirmed launch month", () => {
    expect(appLinks.appStoreUrl).toBeNull();
    expect(appLinks.playStoreUrl).toBeNull();
    expect(appLinks.launchMonth).toBe("January 2027");
    // The launch list is new personal data: off until its migration runs, with Yehuda's yes.
    expect(appLinks.launchListOpen).toBe(false);
  });
});
