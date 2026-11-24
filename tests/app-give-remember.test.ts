/** The give screen offers sign-in, not a remember switch, to someone signed out (24/11/2026). */
import { describe, expect, it } from "vitest";
import { rememberOffer, SIGN_IN_TO_REMEMBER, SIGN_IN_TO_REMEMBER_NOTE } from "../apps/mobile/src/lib/give-remember";

describe("remembering a donor's details on the give screen", () => {
  it("offers sign-in to someone signed out, because nothing is kept for a signed-out donor", () => {
    expect(rememberOffer("signed-out")).toBe("sign-in");
  });
  it("keeps the switch for everyone else (signed in, still loading, agreeing, the design preview)", () => {
    for (const s of ["signed-in", "loading", "agreeing", "preview"] as const) expect(rememberOffer(s)).toBe("switch");
  });
  it("says what happens in plain words, with no exclamation marks or dashes", () => {
    for (const t of [SIGN_IN_TO_REMEMBER, SIGN_IN_TO_REMEMBER_NOTE]) expect(t).not.toMatch(/[!—–]/);
    expect(SIGN_IN_TO_REMEMBER_NOTE).toMatch(/stays/);
  });
});
