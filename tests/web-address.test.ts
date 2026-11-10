/**
 * The one "no web addresses" rule for words a charity writes into Givezy's emails (the thank-you note and donor journey
 * emails, 10/11/2026 review): every way of typing a link is refused; ordinary words, amounts and plain email addresses
 * are not.
 */
import { describe, expect, it } from "vitest";
import { checkThankYouNote, hasWebAddress, thankYouNoteToShow } from "@/lib/charity/thank-you-note";
import { checkJourneySteps } from "@/lib/charity/journey";

const LINKS = [
  "https://evil.example/pay?r=a@b",
  "see t.co/x",
  "donate.xyz/now",
  "Give at donate.xyz today",
  "http://example.com",
  "HTTPS://EXAMPLE.COM",
  "ftp://files.example",
  "Visit www.ourcharity.org",
  "WWW.OURCHARITY.ORG",
  "ourcharity.org.za/give",
  "kitchen.org.za",
  "bit.ly/abc",
  "Mail a@b.com/x",
  "(see example.africa)",
  "pay.me",
  "Visit Donate.Com today",
  "Kitchen.Org.Za",
  "Our-Kitchen.Africa",
];
const FINE = [
  "R1 250 feeds a family for a month.",
  "We moved 3.5 tonnes of food.",
  "Rated 4.5/5 by our volunteers.",
  "e.g. our team, i.e. everyone, at 10.30am.",
  "Write to info@kitchen.org.za any time.",
  "Email info@kitchen.org.za.",
  "Questions? (hello@meals.example) or reply.",
  "Thank you.We mean it.",
  "Dr.Smith and St.Mary's say thanks.",
  "",
];

describe("web addresses in a charity's words", () => {
  it.each(LINKS)("refuses %s", (text) => {
    expect(hasWebAddress(text)).toBe(true);
    expect(checkThankYouNote(text).ok).toBe(false);
    expect(checkJourneySteps([{ subject: "Welcome", body: `Thank you. ${text}`, waitDays: "2" }]).ok).toBe(false);
  });

  it.each(FINE.filter(Boolean))("lets through %s", (text) => {
    expect(hasWebAddress(text)).toBe(false);
    expect(checkThankYouNote(text)).toEqual({ ok: true, note: text });
    expect(thankYouNoteToShow(text)).toBe(text);
  });

  it("a note saved before the rule tightened, with a link in it, is never shown", () => {
    expect(thankYouNoteToShow("Thanks. Give again at donate.xyz/now")).toBeNull();
    expect(thankYouNoteToShow("See https://evil.example/pay?r=a@b")).toBeNull();
  });
});
