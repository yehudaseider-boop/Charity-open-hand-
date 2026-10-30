/**
 * Plain-English explanations of the tax terms used in the app and on the
 * website, for donors who don't know them. Shown behind small "i" buttons.
 * Dependency-free: the phone app imports this file too.
 */
export type GlossaryTerm = "s18a";

export const glossary: Record<GlossaryTerm, { title: string; body: string[] }> = {
  s18a: {
    title: "s18A receipts",
    body: [
      "Section 18A of the Income Tax Act lets you deduct donations to approved organisations from your taxable income, up to a limit set by SARS.",
      "To claim, you need an s18A receipt. If the charity is approved and you ask for one, you get one receipt per charity for each tax year (1 March to the end of February), after the year ends.",
      "Not every charity is approved. Each charity's page says whether it is.",
    ],
  },
};
