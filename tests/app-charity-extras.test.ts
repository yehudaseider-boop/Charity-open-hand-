/** The app's charity screen extras: the "Watch our video" link and the charity's own focus card. */
import { describe, expect, it } from "vitest";
import { focusGive, focusUntil, toFocus, toVideo, videoLink, videoNote } from "../apps/mobile/src/lib/charity-extras";

describe("the video button in the app", () => {
  it("opens the video's own page, built only from the stored site and id", () => {
    const y = toVideo({ video_provider: "youtube", video_id: "dQw4w9WgXcQ" })!;
    const v = toVideo({ video_provider: "vimeo", video_id: "76979871" })!;
    expect(videoLink(y)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(videoLink(v)).toBe("https://vimeo.com/76979871");
    expect(videoNote(y)).toBe("Opens YouTube in a sheet, here in the app.");
    expect(videoNote(v)).toBe("Opens Vimeo in a sheet, here in the app.");
  });

  it("shows no button for a row with no video, or one that isn't a known site and a well-formed id", () => {
    for (const row of [null, undefined, {}, { video_provider: null, video_id: null }, { video_provider: "youtube", video_id: "javascript:alert(1)" }, { video_provider: "other", video_id: "dQw4w9WgXcQ" }, { video_provider: "vimeo", video_id: "12/../x" }]) {
      expect(toVideo(row), JSON.stringify(row)).toBeNull();
    }
  });
});

describe("the focus card in the app", () => {
  const row = { campaign_id: "c-1", title: "Winter blankets", message: "Nights are cold.", starts_on: "2026-11-10", ends_on: "2026-11-30" };

  it("shows only between its Johannesburg dates, wherever the phone's clock is set", () => {
    expect(toFocus(row, new Date("2026-11-09T21:59:59Z"))).toBeNull();
    expect(toFocus(row, new Date("2026-11-09T22:00:00Z"))).toMatchObject({ title: "Winter blankets", campaignId: "c-1" });
    expect(toFocus(row, new Date("2026-11-30T21:59:59Z"))).not.toBeNull();
    expect(toFocus(row, new Date("2026-11-30T22:00:00Z"))).toBeNull();
    expect(toFocus(null)).toBeNull();
    expect(toFocus({ ...row, title: "" }, new Date("2026-11-15T10:00:00Z"))).toBeNull();
  });

  it("gives to the chosen campaign while it runs, otherwise to the charity", () => {
    const focus = toFocus(row, new Date("2026-11-15T10:00:00Z"))!;
    expect(focusGive(focus, [{ id: "c-1" }, { id: "c-2" }])).toEqual({ label: "Give to this campaign", campaignId: "c-1" });
    expect(focusGive(focus, [{ id: "c-2" }])).toEqual({ label: "Give", campaignId: null });
    expect(focusGive(focus, undefined)).toEqual({ label: "Give", campaignId: null });
    expect(focusGive({ ...focus, campaignId: null }, [{ id: "c-1" }])).toEqual({ label: "Give", campaignId: null });
    expect(focusUntil(focus)).toBe("Until 30/11/2026");
  });
});
