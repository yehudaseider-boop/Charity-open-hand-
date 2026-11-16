import { describe, expect, it } from "vitest";
import { comingSoonAction, comingSoonHosts, isComingSoonHost } from "@/lib/coming-soon";

const on = "givezy.co.za";
const act = (url: string, method = "GET", setting: string | undefined | null = on, deployed = true) => comingSoonAction(new URL(url), method, setting === null ? undefined : setting, deployed);

describe("comingSoonHosts", () => {
  it("reads a comma-separated list as bare lower-case host names", () => {
    expect(comingSoonHosts(" Givezy.co.za , https://WWW.Example.com:443/x ,, localhost:3000 ")).toEqual(["givezy.co.za", "www.example.com", "localhost"]);
  });
  it("is empty when unset or blank", () => {
    expect(comingSoonHosts(undefined)).toEqual([]);
    expect(comingSoonHosts("  ,  ")).toEqual([]);
  });
});

describe("isComingSoonHost", () => {
  it("matches the listed host and its www, any case, with or without a trailing dot", () => {
    expect(isComingSoonHost("givezy.co.za", on)).toBe(true);
    expect(isComingSoonHost("GIVEZY.co.za", on)).toBe(true);
    expect(isComingSoonHost("www.givezy.co.za", on)).toBe(true);
    expect(isComingSoonHost("givezy.co.za.", on)).toBe(true);
  });
  it("does not match other addresses, including look-alikes", () => {
    expect(isComingSoonHost("test.givezy.co.za", on)).toBe(false);
    expect(isComingSoonHost("charity-open-hand.vercel.app", on)).toBe(false);
    expect(isComingSoonHost("evilgivezy.co.za", on)).toBe(false);
    expect(isComingSoonHost("givezy.co.za.evil.com", on)).toBe(false);
  });
  it("is off when the setting is empty", () => {
    expect(isComingSoonHost("givezy.co.za", undefined)).toBe(false);
    expect(isComingSoonHost("givezy.co.za", "")).toBe(false);
  });
});

describe("comingSoonAction", () => {
  it("serves the front page, whatever is after it, with the address unchanged", () => {
    expect(act("https://givezy.co.za/")).toBe("serve");
    expect(act("https://givezy.co.za/?utm_source=x#give")).toBe("serve");
    expect(act("https://givezy.co.za/", "HEAD")).toBe("serve");
    expect(act("https://www.givezy.co.za/")).toBe("serve");
    expect(act("https://GIVEZY.co.za:443/")).toBe("serve");
  });

  it("sends every other page back to the front page", () => {
    for (const p of ["/charities", "/login", "/for-donors", "/for-charities", "/c/some-charity", "/c/some-charity/donate", "/apply", "/admin", "/demo/dashboard", "/privacy", "/terms", "/faq", "/sitemap.xml", "/llms.txt", "/coming-soon", "/thanks/abc", "/auth/callback"]) {
      expect(act(`https://givezy.co.za${p}`), p).toBe("redirect-home");
    }
    expect(act("https://givezy.co.za/charities", "HEAD")).toBe("redirect-home");
  });

  it("refuses the app's and the payment provider's calls with a 404, never a redirect", () => {
    for (const m of ["GET", "POST", "HEAD"]) {
      expect(act("https://givezy.co.za/api/app/quote", m)).toBe("not-found");
      expect(act("https://givezy.co.za/api/webhooks/payments", m)).toBe("not-found");
    }
    expect(act("https://givezy.co.za/api")).toBe("not-found");
  });

  it("refuses anything that is not a page visit (a form post, a server action)", () => {
    expect(act("https://givezy.co.za/", "POST")).toBe("not-found");
    expect(act("https://givezy.co.za/charities", "POST")).toBe("not-found");
    expect(act("https://givezy.co.za/login", "PUT")).toBe("not-found");
    expect(act("https://givezy.co.za/", "OPTIONS")).toBe("not-found");
  });

  it("still serves the technical files", () => {
    for (const p of ["/robots.txt", "/_next/static/chunks/a.js", "/_next/image", "/opengraph-image", "/opengraph-image-1abc", "/logo.png", "/brand/splash.png", "/icon.png", "/apple-icon.png", "/favicon.ico", "/brand/x.svg"]) {
      expect(act(`https://givezy.co.za${p}`), p).toBe("pass-through");
    }
    // But only for a plain read.
    expect(act("https://givezy.co.za/robots.txt", "POST")).toBe("not-found");
  });

  it("does not treat a page that merely looks like a file as one", () => {
    expect(act("https://givezy.co.za/charities.png.html")).toBe("redirect-home");
    expect(act("https://givezy.co.za/opengraph-imagex")).toBe("redirect-home");
  });

  it("changes nothing on any other address", () => {
    for (const host of ["test.givezy.co.za", "charity-open-hand.vercel.app", "localhost"]) {
      for (const p of ["/", "/charities", "/api/app/quote", "/coming-soon"]) {
        expect(act(`https://${host}${p}`), `${host}${p}`).toBe("pass-through");
        expect(act(`https://${host}${p}`, "POST"), `${host}${p} POST`).toBe("pass-through");
      }
    }
  });

  it("changes nothing when the setting is empty or the site is not deployed", () => {
    expect(act("https://givezy.co.za/charities", "GET", null)).toBe("pass-through");
    expect(act("https://givezy.co.za/charities", "GET", "")).toBe("pass-through");
    expect(act("https://givezy.co.za/charities", "GET", on, false)).toBe("pass-through");
    expect(act("https://givezy.co.za/api/x", "POST", on, false)).toBe("pass-through");
  });

  it("works with more than one listed address", () => {
    const s = "givezy.co.za, givezy.africa";
    expect(act("https://givezy.africa/login", "GET", s)).toBe("redirect-home");
    expect(act("https://givezy.co.za/", "GET", s)).toBe("serve");
    expect(act("https://test.givezy.co.za/login", "GET", s)).toBe("pass-through");
  });
});
