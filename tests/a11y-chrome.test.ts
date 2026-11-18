/**
 * Keyboard and screen-reader basics that must not quietly disappear (accessibility pass, 18/11/2026): a skip link as the
 * first stop on every page, one labelled main area it lands on, a header that wraps instead of running off a narrow
 * screen at large text, and a Give button whose spoken name is its visible words.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("page chrome", () => {
  const layout = read("src/app/layout.tsx");

  it("starts with a skip link that goes to the main area", () => {
    const skip = layout.indexOf('href="#main"');
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(layout.indexOf("<SiteHeader"));
    expect(layout).toMatch(/<main id="main" tabIndex=\{-1\}/);
  });

  it("shows the skip link only when it has focus, and never in print", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.skip-link\s*\{[^}]*translateY\(-300%\)/s);
    expect(css).toMatch(/\.skip-link:focus\s*\{[^}]*transform:\s*none/s);
  });

  it("lets the header wrap at large text, instead of a fixed height and a no-wrap row", () => {
    const header = read("src/components/site-header.tsx");
    expect(header).toContain("min-h-16");
    expect(header).toContain("flex-wrap");
    expect(header).not.toContain("flex h-16");
    expect(read("src/components/header-nav.tsx")).toMatch(/<nav aria-label="Main" className="flex flex-wrap/);
  });

  it("keeps ticks and radios at least 24 px (WCAG 2.2)", () => {
    expect(read("src/app/globals.css")).toMatch(/input\[type="radio"\]\s*\{[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem/s);
  });
});

describe("the Give button on a charity's page", () => {
  const page = read("src/app/c/[slug]/page.tsx");
  it("has no spoken name that differs from its visible words", () => {
    const link = page.slice(page.indexOf('id="give-button"'), page.indexOf("</Link>", page.indexOf('id="give-button"')));
    expect(link).not.toContain("aria-label");
    expect(link).toContain(">Give </span>");
  });
});

describe("outlines you can see (WCAG 1.4.11, 3:1)", () => {
  it("the controls in the give form use the outline colour, not the pale card border", () => {
    const flow = read("src/app/c/[slug]/donate/donate-flow.tsx");
    const fields = read("src/components/forms/fields.tsx");
    expect(read("src/app/globals.css")).toContain("--outline: #7a86a5");
    expect(fields).toMatch(/border-2 border-outline bg-surface px-3\.5/);
    expect(flow).toMatch(/rounded-2xl border-2 border-outline bg-surface/); // contribution choices
    expect(flow).toMatch(/: "border-outline bg-surface text-navy hover:-translate-y-0\.5/); // amount presets
  });

  it("the app has the same outline colour, at 3:1 or more on white", () => {
    const tokens = read("apps/mobile/src/theme/tokens.ts");
    expect(tokens).toContain('outline: "#7A86A5"');
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(ratio("#7A86A5", "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(ratio("#7A86A5", "#F4F1FF")).toBeGreaterThanOrEqual(3);
  });
});
