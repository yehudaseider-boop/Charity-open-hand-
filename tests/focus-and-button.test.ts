import { describe, expect, it } from "vitest";
import { focusChange, focusFor, focusedSlug } from "@/lib/focus";
import { buttonHtml, buttonLabelOf, buttonStyleOf, buttonTarget, escapeHtml } from "@/lib/charity/website-button";
import { cameFromOf, giftSourceLabel, tagOf } from "@/lib/donations/source";

describe("focused giving", () => {
  it("starts on a charity's own tagged link", () => {
    expect(focusChange("/c/jotas-chair", "button")).toEqual({ set: "jotas-chair" });
    expect(focusChange("/c/jotas-chair/donate", "whatsapp")).toEqual({ set: "jotas-chair" });
    expect(focusChange("/c/jotas-chair", "qr")).toEqual({ set: "jotas-chair" });
    expect(focusChange("/c/jotas-chair", "link")).toEqual({ set: "jotas-chair" });
  });
  it("leaves things alone for untagged or unknown links", () => {
    expect(focusChange("/c/jotas-chair", null)).toBeNull();
    expect(focusChange("/c/jotas-chair", "facebook")).toBeNull();
    expect(focusChange("/account", "button")).toBeNull();
    expect(focusChange("/c/Bad%20Slug", "button")).toBeNull();
    expect(focusChange("/c/%E0", "button")).toBeNull();
  });
  it("ends on the home page or the charities list", () => {
    expect(focusChange("/", null)).toBe("clear");
    expect(focusChange("/charities", "button")).toBe("clear");
  });
  it("applies only on that charity's pages and the thank-you page", () => {
    expect(focusedSlug("/c/jotas-chair", "jotas-chair")).toBe("jotas-chair");
    expect(focusedSlug("/c/jotas-chair/donate?cents=5000", "jotas-chair")).toBe("jotas-chair");
    expect(focusedSlug("/donate/return?reference=x", "jotas-chair")).toBe("jotas-chair");
    expect(focusedSlug("/c/another-charity", "jotas-chair")).toBeNull();
    expect(focusedSlug("/account", "jotas-chair")).toBeNull();
    expect(focusedSlug("/c/jotas-chair", undefined)).toBeNull();
    expect(focusedSlug("/c/jotas-chair", "<script>")).toBeNull();
  });
  it("uses the request's own link before the cookie arrives", () => {
    expect(focusFor("/c/jotas-chair?src=button", undefined)).toBe("jotas-chair");
    expect(focusFor("/c/jotas-chair", undefined)).toBeNull();
    expect(focusFor("/c/jotas-chair", "jotas-chair")).toBe("jotas-chair");
    expect(focusFor("/c/other?src=qr", "jotas-chair")).toBe("other");
    expect(focusFor("/charities", "jotas-chair")).toBeNull();
  });
});

describe("website button", () => {
  const site = "https://charity-open-hand.vercel.app/";
  it("links to the charity's page, tagged as the website button", () => {
    expect(buttonTarget(site, "jotas-chair")).toBe("https://charity-open-hand.vercel.app/c/jotas-chair?src=button");
    expect(buttonTarget(site, "jotas-chair", "abc")).toBe("https://charity-open-hand.vercel.app/c/jotas-chair/donate?campaign=abc&src=button");
  });
  it("is a plain link with the logo's splash, opening in a new tab", () => {
    const html = buttonHtml({ site, slug: "jotas-chair", charityName: "Jota's Chair Foundation", style: "blue", label: "give" });
    expect(html).toMatch(/^<a href="https:\/\/charity-open-hand\.vercel\.app\/c\/jotas-chair\?src=button" target="_blank" rel="noopener"/);
    expect(html).toContain('src="https://charity-open-hand.vercel.app/brand/splash.png"');
    expect(html).toContain("Give with Givezy</a>");
    expect(html).toContain("background:#1749B5");
    expect(html).not.toContain("<script");
  });
  it("escapes the charity's name", () => {
    const html = buttonHtml({ site, slug: "x", charityName: `A "B" <C> & D's`, style: "white", label: "donate" });
    expect(html).toContain('title="Give to A &quot;B&quot; &lt;C&gt; &amp; D&#39;s with Givezy"');
    expect(html).toContain(">Donate</a>");
    expect(html).toContain("color:#0E1B3D");
    expect(escapeHtml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
  it("falls back to the default look for unknown choices", () => {
    expect(buttonStyleOf("pink")).toBe("blue");
    expect(buttonLabelOf(undefined)).toBe("give");
    expect(buttonStyleOf("white")).toBe("white");
  });
  it("stores gifts from it as the website button", () => {
    expect(cameFromOf({ tag: "button" })).toBe("website_button");
    expect(tagOf("website_button")).toBe("button");
    expect(giftSourceLabel("website_button")).toBe("Website button");
    expect(cameFromOf({ fromApp: true, tag: "button" })).toBe("app");
  });
});
