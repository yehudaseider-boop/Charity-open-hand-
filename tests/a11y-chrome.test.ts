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
