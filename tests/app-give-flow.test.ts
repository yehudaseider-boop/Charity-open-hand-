import { describe, expect, it, vi } from "vitest";
import { APP_RETURN_LINK, inAppGivingEnabled, openGivingPage, refreshAfterGiving, REFRESH_AFTER_GIVING_MS } from "../apps/mobile/src/lib/give-flow";
import { APP_RETURN_LINK as WEBSITE_RETURN_LINK } from "@/lib/donations/reference";

describe("the in-app giving switch", () => {
  it("is off unless it is exactly 'yes'", () => {
    expect(inAppGivingEnabled(undefined)).toBe(false);
    expect(inAppGivingEnabled("")).toBe(false);
    expect(inAppGivingEnabled("true")).toBe(false);
    expect(inAppGivingEnabled("YES")).toBe(false);
    expect(inAppGivingEnabled("yes")).toBe(true);
  });
});

describe("opening the payment page", () => {
  it("uses the same return link as the website's payment page", () => {
    expect(APP_RETURN_LINK).toBe(WEBSITE_RETURN_LINK);
  });

  it("opens the page with the return link, and says 'returned' when the donor comes back from it", async () => {
    const open = vi.fn(async () => ({ type: "success" }));
    expect(await openGivingPage("https://example.co.za/c/x/donate?kind=maaser&from=app", open)).toBe("returned");
    expect(open).toHaveBeenCalledWith("https://example.co.za/c/x/donate?kind=maaser&from=app", "nedivlev://giving");
  });

  it("says 'closed' when the donor closes the sheet", async () => {
    for (const type of ["cancel", "dismiss", "locked"]) {
      expect(await openGivingPage("https://example.co.za/x", async () => ({ type }))).toBe("closed");
    }
  });

  it("refuses an address that is not https, without opening anything", async () => {
    const open = vi.fn();
    await expect(openGivingPage("http://example.co.za/x", open)).rejects.toThrow(/secure address/);
    await expect(openGivingPage("javascript:alert(1)", open)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });

  it("passes on a failure to open", async () => {
    await expect(openGivingPage("https://example.co.za/x", async () => Promise.reject(new Error("no browser")))).rejects.toThrow("no browser");
  });
});

describe("looking for the new gift after paying", () => {
  it("refreshes at each delay, counted from the start", async () => {
    const refresh = vi.fn(async () => {});
    const waits: number[] = [];
    await refreshAfterGiving(refresh, async (ms) => void waits.push(ms));
    expect(refresh).toHaveBeenCalledTimes(REFRESH_AFTER_GIVING_MS.length);
    expect(waits).toEqual([5_000, 10_000, 15_000]);
  });

  it("a failed refresh does not stop the later ones", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    await expect(refreshAfterGiving(refresh, async () => {})).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(4);
  });
});
