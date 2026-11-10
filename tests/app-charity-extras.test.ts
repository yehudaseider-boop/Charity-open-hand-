/** The app's charity screen extras: the video that plays inside the screen, and the charity's own focus card. */
import { describe, expect, it } from "vitest";
import { focusGive, focusUntil, playerNavigation, playerReferrer, toFocus, toVideo, videoLink, videoNote, videoPlayerUrl } from "../apps/mobile/src/lib/charity-extras";

describe("the video in the app", () => {
  it("plays the privacy-friendly player and falls back to the video's own page, both built only from the stored site and id", () => {
    const y = toVideo({ video_provider: "youtube", video_id: "dQw4w9WgXcQ" })!;
    const v = toVideo({ video_provider: "vimeo", video_id: "76979871" })!;
    expect(videoLink(y)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(videoLink(v)).toBe("https://vimeo.com/76979871");
    expect(videoPlayerUrl(y)).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1");
    expect(videoPlayerUrl(v)).toBe("https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&playsinline=1");
    expect(videoNote(y)).toBe("The video plays from YouTube. Nothing loads from YouTube until you press play.");
    expect(videoNote(v)).toBe("The video plays from Vimeo. Nothing loads from Vimeo until you press play.");
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

describe("what the in-app player may load", () => {
  it("lets the card show only the two players", () => {
    expect(playerNavigation("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1", true)).toBe("allow");
    expect(playerNavigation("https://player.vimeo.com/video/76979871", true)).toBe("allow");
  });

  it("sends a tap through to the video site's own page to the phone's browser", () => {
    expect(playerNavigation("https://www.youtube.com/watch?v=dQw4w9WgXcQ", true)).toBe("browser");
    expect(playerNavigation("https://youtu.be/dQw4w9WgXcQ", true)).toBe("browser");
    expect(playerNavigation("https://vimeo.com/76979871", true)).toBe("browser");
  });

  it("refuses everything else in the card", () => {
    for (const url of [
      "https://www.youtube-nocookie.com.evil.com/embed/x",
      "https://evil.com/?https://www.youtube-nocookie.com",
      "https://www.youtube-nocookie.com@evil.com/embed/x",
      "https://user:pw@www.youtube-nocookie.com/embed/x",
      "https://www.youtube-nocookie.com:8443/embed/x",
      "http://www.youtube-nocookie.com/embed/x",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "intent://scan/#Intent;scheme=zxing;end",
      "about:blank",
      "https://accounts.google.com/",
      "not a url",
      "",
    ]) {
      expect(playerNavigation(url, true), url).toBe("block");
    }
  });

  it("inside the player, allows its own https frames but never a script, file or plain http address", () => {
    expect(playerNavigation("about:blank", false)).toBe("allow");
    expect(playerNavigation("https://www.youtube-nocookie.com/embed/x", false)).toBe("allow");
    expect(playerNavigation("https://static.doubleclick.net/instream/ad_status.js", false)).toBe("allow");
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///x", "http://example.com/", "https://www.youtube.com/watch?v=x"]) {
      expect(playerNavigation(url, false), url).toBe("block");
    }
  });

  it("says it came from our website, and only ever an https address", () => {
    expect(playerReferrer("https://test.givezy.co.za/some/path")).toBe("https://test.givezy.co.za/");
    expect(playerReferrer(undefined)).toBe("https://givezy.co.za/");
    expect(playerReferrer("http://insecure.example")).toBe("https://givezy.co.za/");
    expect(playerReferrer("not a url")).toBe("https://givezy.co.za/");
  });
});
