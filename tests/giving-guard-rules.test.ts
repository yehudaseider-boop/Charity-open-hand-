import { describe, expect, it } from "vitest";
import { botCheck, PRESS_AGAIN_MESSAGE, tooManyTriesMessage, waitWords } from "@/lib/donations/giving-guard-rules";

describe("card-testing protection wording", () => {
  it("says plainly that nothing was charged and when to try again", () => {
    expect(tooManyTriesMessage(10)).toBe("Too many tries in a short time. Nothing was charged. Please try again in 10 minutes, or contact us.");
    expect(tooManyTriesMessage(60, "help@givezy.co.za")).toBe("Too many tries in a short time. Nothing was charged. Please try again in an hour, or contact us at help@givezy.co.za.");
    expect(tooManyTriesMessage(1_440)).toBe("Too many tries today. Nothing was charged. Please try again tomorrow, or contact us.");
  });

  it("puts the wait in plain words", () => {
    expect(waitWords(1)).toBe("in 1 minute");
    expect(waitWords(10)).toBe("in 10 minutes");
    expect(waitWords(120)).toBe("in 2 hours");
    expect(waitWords(90)).toBe("in 90 minutes");
    expect(waitWords(2_000)).toBe("tomorrow");
  });

  it("never mentions a bot to a person, and says nothing was charged", () => {
    expect(PRESS_AGAIN_MESSAGE).toMatch(/Nothing was charged/);
    expect(PRESS_AGAIN_MESSAGE).not.toMatch(/bot|robot|spam/i);
  });
});

describe("the give form's quiet bot checks", () => {
  const min = 3;
  it("lets a person through", () => {
    expect(botCheck({ honeypot: "", openMs: "45000", minFillSeconds: min })).toBe("ok");
    expect(botCheck({ honeypot: null, openMs: "3000", minFillSeconds: min })).toBe("ok");
  });

  it("stops a form whose hidden field is filled in", () => {
    expect(botCheck({ honeypot: "https://spam.example", openMs: "45000", minFillSeconds: min })).toBe("honeypot");
    // Only spaces counts as empty (some browsers pad fields).
    expect(botCheck({ honeypot: "   ", openMs: "45000", minFillSeconds: min })).toBe("ok");
  });

  it("stops a form sent the instant the page opened", () => {
    expect(botCheck({ honeypot: "", openMs: "0", minFillSeconds: min })).toBe("too-fast");
    expect(botCheck({ honeypot: "", openMs: "2999", minFillSeconds: min })).toBe("too-fast");
  });

  it("lets through a form with no time or a silly one (an old page): the attempt limits still apply", () => {
    expect(botCheck({ honeypot: "", openMs: null, minFillSeconds: min })).toBe("ok");
    expect(botCheck({ honeypot: "", openMs: "-5", minFillSeconds: min })).toBe("ok");
    expect(botCheck({ honeypot: "", openMs: "abc", minFillSeconds: min })).toBe("ok");
    expect(botCheck({ honeypot: "", openMs: "9".repeat(20), minFillSeconds: min })).toBe("ok");
  });
});
