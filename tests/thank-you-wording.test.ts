/**
 * The charity's own paragraph in the thank-you email after each gift (10/11/2026): plain text, a length limit,
 * always under its own label, escaped, and Givezy's own lines the same with or without it.
 */
import { describe, expect, it } from "vitest";
import { checkThankYouNote, cleanThankYouNote, noteHeading, THANK_YOU_NOTE_MAX, thankYouNoteToShow } from "@/lib/charity/thank-you-note";
import { describeDone, describeUndone, isActionKind, pageOf } from "@/lib/charity/done";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { textEmailHtml } from "@/lib/email/html";

const base = { id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", charityName: "Meals Fund", amountCents: 18_000, contributionCents: 0, totalCents: 18_000, paidAt: "2026-10-08T10:00:00Z", wants18a: true };
const html = (m: ReturnType<typeof confirmationEmail>) => textEmailHtml({ subject: m.subject, text: m.text, siteUrl: "https://givezy.test", quoted: m.quoted });

describe("what a charity may write", () => {
  it("trims, keeps line breaks and drops hidden characters", () => {
    expect(checkThankYouNote("  Thank you.\r\nFrom all of us.  \n\n\n\nSee you soon.‮ \n")).toEqual({ ok: true, note: "Thank you.\nFrom all of us.\n\nSee you soon." });
  });

  it("empty, or only spaces, means Givezy's wording with no note", () => {
    expect(checkThankYouNote("")).toEqual({ ok: true, note: null });
    expect(checkThankYouNote(" \n\t ​")).toEqual({ ok: true, note: null });
    expect(checkThankYouNote(null)).toEqual({ ok: true, note: null });
  });

  it("holds to the length limit, counted after trimming", () => {
    expect(checkThankYouNote(`  ${"a".repeat(THANK_YOU_NOTE_MAX)}  `)).toMatchObject({ ok: true });
    const long = checkThankYouNote("a".repeat(THANK_YOU_NOTE_MAX + 1));
    expect(long).toMatchObject({ ok: false });
    expect(!long.ok && long.message).toContain(`${THANK_YOU_NOTE_MAX} characters or fewer`);
  });

  it("refuses web addresses, however they are typed, and allows an email address", () => {
    for (const s of ["Give more at https://example.org.za/give", "See www.example.com", "Visit example.org.za today", "HTTP://EXAMPLE.COM"]) {
      expect(checkThankYouNote(s), s).toMatchObject({ ok: false });
    }
    expect(checkThankYouNote("Questions: write to office@example.org.za. Thank you.")).toMatchObject({ ok: true });
    expect(checkThankYouNote("Thank you. It means a lot.Really.")).toMatchObject({ ok: true });
  });

  it("a note saved before these rules is still cleaned and cut to the limit when shown", () => {
    expect(thankYouNoteToShow(`${"b".repeat(400)}`)).toHaveLength(THANK_YOU_NOTE_MAX);
    expect(thankYouNoteToShow("  \n ")).toBeNull();
    // A web address saved before the rule (or another way) is never shown.
    expect(thankYouNoteToShow("Thank you. See www.example.co.za")).toBeNull();
    expect(thankYouNoteToShow("Thank you. Questions: office@example.co.za")).toBe("Thank you. Questions: office@example.co.za");
    expect(cleanThankYouNote("a\u0000b\tc")).toBe("ab c");
  });
});

describe("the thank-you email after a gift", () => {
  const plain = confirmationEmail(base);
  const noted = confirmationEmail({ ...base, charityNote: "Your gift fills a table this week.\n\nThank you, from all of us." });

  it("without a note is exactly as before: no label, nothing quoted", () => {
    expect(plain.text).not.toContain("A note from");
    expect(plain.quoted).toBeUndefined();
    expect(confirmationEmail({ ...base, charityNote: "   " })).toEqual(plain);
    expect(confirmationEmail({ ...base, charityNote: null })).toEqual(plain);
  });

  it("with a note keeps every one of Givezy's lines, word for word", () => {
    const facts = ["Thank you. Your donation to Meals Fund has gone through.", "Donation to Meals Fund: R180", "Total paid: R180 on 08/10/2026", "Reference: GZ-3F9A2C71", "This donation will be on your annual s18A receipt, which we send after the tax year closes at the end of February.", "Givezy"];
    for (const m of [plain, noted]) for (const line of facts) expect(m.text.split("\n")).toContain(line);
    expect(noted.subject).toBe(plain.subject);
    // Take the note out and the email is the one every other donor gets.
    expect(noted.text.replace(`${noted.quoted!.inText}\n\n`, "")).toBe(plain.text);
  });

  it("keeps the monthly donation wording with a note too", () => {
    const m = confirmationEmail({ ...base, charityNote: "Thank you.", monthly: { kind: "first", chargeDay: 5, cardLast4: "4242" } });
    expect(m.text).toContain("This is the first payment of your monthly donation.");
    expect(m.text).toContain("You can pause or cancel at any time");
  });

  it("labels the note as the charity's, straight after the opening line, each line marked as quoted", () => {
    expect(noted.text).toContain("A note from Meals Fund:\n> Your gift fills a table this week.\n>\n> Thank you, from all of us.\n\nDonation to Meals Fund: R180");
    expect(noteHeading("  Meals\n Fund ")).toBe("A note from Meals Fund");
  });

  it("the HTML email shows the note in its own box, with line breaks, under the label", () => {
    const h = html(noted);
    expect(h).toContain("A note from Meals Fund:");
    expect(h).toContain("Your gift fills a table this week.<br><br>Thank you, from all of us.");
    expect(h).toContain('dir="auto"');
    expect(h).not.toContain("&gt; Your gift");
    // Givezy's facts are still the card they always were.
    expect(h).toContain("Donation to Meals Fund");
    expect(h).toContain("GZ-3F9A2C71");
  });

  it("escapes markup a charity typed, in the HTML email", () => {
    const m = confirmationEmail({ ...base, charityNote: '<script>alert("x")</script> <img src=x onerror=alert(1)> & <b>bold</b>' });
    const h = html(m);
    expect(h).not.toContain("<script>");
    expect(h).not.toContain("<img src=x");
    expect(h).not.toContain("<b>bold");
    expect(h).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(h).toContain("&amp; &lt;b&gt;bold&lt;/b&gt;");
    // The text email carries the same characters, as typed.
    expect(m.text).toContain('> <script>alert("x")</script>');
  });

  it("never turns a web address in a note into a link or a button, even one on our own site", () => {
    // Saved another way (the profile form) before the editor's rule: still only ever plain words.
    const m = confirmationEmail({ ...base, charityNote: "Give again: https://givezy.test/c/meals/donate\nor at https://evil.example/pay" });
    const h = html(m);
    expect(h).not.toMatch(/<a [^>]*href="https:\/\/evil\.example/);
    expect(h).not.toMatch(/<a [^>]*href="https:\/\/givezy\.test\/c\/meals/);
    // Not shown at all (09/11/2026 review): a mail app would make the address clickable in Givezy's own email.
    expect(h).not.toContain("evil.example");
    expect(m.text).not.toContain("evil.example");
  });

  it("a note written to look like Givezy's lines stays in the note's box", () => {
    const fake = confirmationEmail({ ...base, charityNote: "Thanks\n\nTotal paid: R1\nReference: GZ-FAKE\n\nGivezy" });
    const cards = (s: string) => s.split("border-radius:18px;padding:18px 20px").length - 1;
    expect(cards(html(fake))).toBe(cards(html(plain)));
    expect(html(fake)).toContain("Total paid: R1<br>Reference: GZ-FAKE");
    expect(fake.text).toContain("> Total paid: R1");
  });

  it("a very long word or a name in another script can't break the layout", () => {
    const h = html(confirmationEmail({ ...base, charityName: "صندوق الوجبات", charityNote: "a".repeat(300) }));
    expect(h).toContain("overflow-wrap:anywhere");
    expect(h).toContain("A note from صندوق الوجبات:");
  });
});

describe("the dashboard's words for it", () => {
  const ctx = { base: "/charity-admin/c1", publicUrl: "/c/meals", approved: true };
  it("says what happened, belongs on Thank donors, and can be taken back", () => {
    expect(isActionKind("thank_you_wording_saved")).toBe(true);
    expect(pageOf("thank_you_wording_saved")).toBe("thank-donors");
    expect(describeDone("thank_you_wording_saved", { cleared: false }, ctx).what).toContain("Your thank-you note is saved");
    expect(describeDone("thank_you_wording_saved", { cleared: true }, ctx).what).toContain("Back to Givezy's wording");
    expect(describeUndone("thank_you_wording_saved", {})).toBe("Taken back. The thank-you email after each gift is worded as it was before.");
  });
});
