import { describe, expect, it } from "vitest";
import { CHARITY_LIGHT_UNTIL, photoLightUntil, statusBarStyle } from "../apps/mobile/src/lib/status-bar";

describe("phone app clock colour", () => {
  it("is white over blue or a photo at the top, and while pulling down to refresh", () => {
    expect(statusBarStyle(true, 0, CHARITY_LIGHT_UNTIL)).toBe("light");
    expect(statusBarStyle(true, -80, CHARITY_LIGHT_UNTIL)).toBe("light");
    expect(statusBarStyle(true, CHARITY_LIGHT_UNTIL, CHARITY_LIGHT_UNTIL)).toBe("light");
  });
  it("turns dark once white has scrolled under it", () => {
    expect(statusBarStyle(true, CHARITY_LIGHT_UNTIL + 1, CHARITY_LIGHT_UNTIL)).toBe("dark");
    expect(statusBarStyle(true, 5000, CHARITY_LIGHT_UNTIL)).toBe("dark");
  });
  it("is always dark on white pages", () => {
    expect(statusBarStyle(false, 0, CHARITY_LIGHT_UNTIL)).toBe("dark");
    expect(statusBarStyle(false, -40, Number.POSITIVE_INFINITY)).toBe("dark");
  });
  it("on the charity page, turns dark halfway through the white bar's fade (220 to 300)", () => {
    expect(CHARITY_LIGHT_UNTIL).toBeGreaterThan(220);
    expect(CHARITY_LIGHT_UNTIL).toBeLessThan(300);
  });
  it("a photo header that scrolls away stays light until its foot reaches the status bar", () => {
    const until = photoLightUntil(427, 47);
    expect(until).toBe(380);
    expect(statusBarStyle(true, 380, until)).toBe("light");
    expect(statusBarStyle(true, 381, until)).toBe("dark");
    // Not laid out yet: the screen opens at the top, over the photo.
    expect(statusBarStyle(true, 0, photoLightUntil(null, 47))).toBe("light");
    // Never a negative limit.
    expect(photoLightUntil(20, 47)).toBe(0);
  });
});
