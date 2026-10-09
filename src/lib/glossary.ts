/**
 * Plain-English explanations of the Jewish and tax terms used in the app and
 * on the website, for donors who don't know them. Shown behind small "i"
 * buttons. Dependency-free: the phone app imports this file too.
 *
 * Kept general on purpose: for how these apply to a particular person
 * (for example whether maaser is worked out before or after tax), the text
 * points people to their own Rabbi rather than giving a ruling.
 */
export type GlossaryTerm = "tzedaka" | "maaser" | "chomesh" | "generalTzedaka" | "givingYear" | "s18a";

export const glossary: Record<GlossaryTerm, { title: string; body: string[] }> = {
  tzedaka: {
    title: "Tzedaka",
    body: [
      "Tzedaka is the Jewish practice of giving to people in need and to good causes.",
      "The word comes from the Hebrew for justice or doing what is right: giving is seen as a duty, not only a kindness.",
    ],
  },
  maaser: {
    title: "Maaser",
    body: [
      "Maaser means \"a tenth\". Many Jewish people set aside a tenth of their income for tzedaka.",
      "NEDIV lev helps you keep count: mark a donation as maaser and it counts towards your maaser total. Log your income and the app works out what a tenth would be.",
      "How maaser applies to you (for example, before or after tax) is a question for your Rabbi.",
    ],
  },
  chomesh: {
    title: "Chomesh",
    body: [
      "Chomesh means \"a fifth\". Some people give a fifth of their income: their maaser plus a further tenth.",
      "In NEDIV lev, chomesh is that second tenth, kept as its own total so you can see each one separately.",
    ],
  },
  generalTzedaka: {
    title: "General tzedaka",
    body: [
      "Giving you don't count towards maaser or chomesh, for example when you have already given your maaser for the month.",
      "Every donation is still recorded, and only you see how you marked it.",
    ],
  },
  givingYear: {
    title: "The giving year",
    body: [
      "NEDIV lev counts your yearly maaser and chomesh from Rosh Hashana (the Jewish New Year, usually in September or October) to the next Rosh Hashana.",
      "Tax receipts use the SARS tax year instead, which runs from 1 March to the end of February.",
    ],
  },
  s18a: {
    title: "s18A tax receipts",
    body: [
      "Section 18A of the Income Tax Act lets you deduct donations to approved organisations from your taxable income, up to a limit set by SARS.",
      "To claim, you need an s18A receipt. If the charity is approved and you ask for one, you get one receipt per charity for each tax year (1 March to the end of February), after the year ends.",
      "Not every charity is approved. Each charity's page says whether it is.",
    ],
  },
};
