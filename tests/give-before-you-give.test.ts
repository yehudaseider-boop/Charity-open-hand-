/**
 * The give form's last step (12/11/2026): the two optional choices share one folded row that still sends both
 * boxes, the one agreement tick stays in view, and the closed row says what was chosen. Rendered to HTML, so we
 * check what the page actually sends.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { choicesSummary } from "@/lib/donations/choices-summary";
import { BeforeYouGive } from "@/app/c/[slug]/donate/before-you-give";

const render = (props: Partial<Parameters<typeof BeforeYouGive>[0]> = {}) =>
  renderToStaticMarkup(createElement(BeforeYouGive, { charityName: "Northcliff Meals Fund", receiptsAvailable: true, org: false, singleAgreementTick: true, ...props }));

/** The markup of the folded row, and everything after it. */
function parts(html: string) {
  const start = html.indexOf("<details");
  const end = html.indexOf("</details>") + "</details>".length;
  return { row: html.slice(start, end), after: html.slice(end), before: html.slice(0, start) };
}

describe("the optional choices row", () => {
  it("is one closed row, both choices inside it, and neither ticked", () => {
    const { row } = parts(render());
    expect(row).not.toMatch(/<details[^>]*\sopen(="")?[\s>]/);
    expect(row).toContain("Your choices");
    expect(row).toContain("(optional)");
    expect(row).toContain('name="is_anonymous"');
    expect(row).toContain('name="no_news"');
    expect(row).not.toContain("checked");
  });
  it("keeps the exact wording of both choices", () => {
    const { row } = parts(render());
    expect(row).toContain("Give anonymously. Your name won&#x27;t appear on public pages, campaign lists or live totals.");
    expect(row).toContain("still sees your details, because it needs them to record your donation and issue your s18A receipt.");
    expect(row).toContain("Don&#x27;t send me news or appeals from");
    expect(row).toContain("You&#x27;ll still get your confirmation and s18A receipt.");
  });
  it("leaves out the s18A words when the charity issues no s18A receipts", () => {
    const { row } = parts(render({ receiptsAvailable: false }));
    expect(row).not.toContain("s18A");
  });
});

describe("the agreement tick", () => {
  it("one tick, in view after the row, with its error beside it", () => {
    const { before, after } = parts(render({ fieldErrors: { agreement: "Please tick this box to give." } }));
    expect(before).toContain("Before you give");
    expect(after).toContain('name="agreement"');
    expect(after).not.toContain('name="age_confirmed"');
    expect(after).not.toContain('name="popia_consent"');
    expect(after).toContain('aria-invalid="true"');
    expect(after).toContain("Please tick this box to give.");
  });
  it("a company or trust is also asked to confirm it may give for the organisation", () => {
    expect(render({ org: true })).toContain("allowed to give on behalf of this organisation");
    expect(render({ org: false })).not.toContain("allowed to give on behalf of this organisation");
  });
  it("switched off, the two ticks come back (and the row stays)", () => {
    const html = render({ singleAgreementTick: false });
    expect(html).toContain('name="age_confirmed"');
    expect(html).toContain('name="popia_consent"');
    expect(html).not.toContain('name="agreement"');
    expect(html).toContain('name="is_anonymous"');
  });
});

describe("what the closed row says", () => {
  it("names what was chosen, in a fixed order", () => {
    expect(choicesSummary({ anonymous: false, noNews: false })).toBeNull();
    expect(choicesSummary({ anonymous: true, noNews: false })).toBe("Anonymous");
    expect(choicesSummary({ anonymous: false, noNews: true })).toBe("No news");
    expect(choicesSummary({ anonymous: true, noNews: true })).toBe("Anonymous · No news");
  });
});
