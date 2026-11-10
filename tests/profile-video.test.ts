/**
 * The profile video (CRM build plan step 12): only an https link to one YouTube or Vimeo video is accepted, only
 * the site and the video's id are kept, and our pages may frame exactly the two players and nothing wider.
 */
import { describe, expect, it } from "vitest";
import { parseVideoLink, VIDEO_FRAME_ORIGINS, VIDEO_LINK_MESSAGES as M, videoEmbedUrl, videoFrom, videoWatchUrl } from "@/lib/charity/video";
import { describeDone, describeUndone, isActionKind, pageOf } from "@/lib/charity/done";
import nextConfig from "../next.config";

const yt = (id = "dQw4w9WgXcQ") => ({ ok: true, video: { provider: "youtube", id } });
const vimeo = (id = "76979871") => ({ ok: true, video: { provider: "vimeo", id } });

describe("reading the link a charity pastes", () => {
  it("accepts YouTube links in every usual shape, and keeps only the id", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "  https://youtu.be/dQw4w9WgXcQ  ",
    ]) expect(parseVideoLink(link), link).toEqual(yt());
  });

  it("drops everything else in the link: start time, playlist, tracking", () => {
    expect(parseVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123&si=abcDEF_tracking&feature=share")).toEqual(yt());
    expect(parseVideoLink("https://youtu.be/dQw4w9WgXcQ?si=Xyz&t=10#t=5")).toEqual(yt());
    expect(parseVideoLink("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&origin=https://evil.example")).toEqual(yt());
    expect(parseVideoLink("https://vimeo.com/76979871?share=copy#t=30s")).toEqual(vimeo());
  });

  it("accepts Vimeo links, and the player's own address", () => {
    for (const link of ["https://vimeo.com/76979871", "https://www.vimeo.com/76979871", "https://vimeo.com/channels/staffpicks/76979871", "https://vimeo.com/groups/name/videos/76979871", "https://player.vimeo.com/video/76979871"]) {
      expect(parseVideoLink(link), link).toEqual(vimeo());
    }
  });

  it("an empty box means no video", () => {
    expect(parseVideoLink("")).toEqual({ ok: true, video: null });
    expect(parseVideoLink("   ")).toEqual({ ok: true, video: null });
    expect(parseVideoLink(null)).toEqual({ ok: true, video: null });
  });

  it("refuses anything that isn't https, in plain words", () => {
    expect(parseVideoLink("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ ok: false, message: M.notHttps });
    for (const link of ["javascript:alert(1)", "javascript://youtube.com/%0aalert(1)", "data:text/html,hello", "vbscript:msgbox", "file:///etc/passwd", "youtube.com/watch?v=dQw4w9WgXcQ", "//youtu.be/dQw4w9WgXcQ", "our video", "ftp://youtu.be/dQw4w9WgXcQ"]) {
      const r = parseVideoLink(link);
      expect(r.ok, link).toBe(false);
    }
    expect(parseVideoLink("javascript:alert(1)")).toEqual({ ok: false, message: M.notALink });
  });

  it("refuses other sites, however much they look like YouTube or Vimeo", () => {
    for (const link of [
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ",
      "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
      "https://evil.example/?u=https://youtu.be/dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://xn--yutube-wqf.com/watch?v=dQw4w9WgXcQ",
      "https://vimeo.com.evil.example/76979871",
      "https://www.dailymotion.com/video/x8abc",
    ]) expect(parseVideoLink(link), link).toEqual({ ok: false, message: M.otherSite });
  });

  it("refuses embed code and anything carrying HTML, quotes or spaces", () => {
    expect(parseVideoLink('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')).toEqual({ ok: false, message: M.embedCode });
    for (const link of [
      'https://youtu.be/dQw4w9WgXcQ"><script>alert(1)</script>',
      "https://youtu.be/dQw4w9WgXcQ' onload='x",
      "https://youtu.be/dQw4w9WgXcQ https://evil.example",
      "https://youtu.be/dQw4w9WgXcQ\nhttps://evil.example",
      "https://www.youtube.com\\@evil.example/watch?v=dQw4w9WgXcQ",
    ]) expect(parseVideoLink(link).ok, link).toBe(false);
  });

  it("refuses a link that doesn't name one video", () => {
    for (const link of [
      "https://www.youtube.com/",
      "https://www.youtube.com/@somechannel",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22%3E%3Cscript%3E",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQextra",
      "https://youtu.be/dQw4w9WgXcQ/extra",
      "https://www.youtube.com/embed/dQw4w9WgXcQ/../../redirect",
      "https://www.youtube.com/redirect?q=https://evil.example",
      "https://vimeo.com/",
      "https://vimeo.com/somebody",
      "https://vimeo.com/0123",
      "https://player.vimeo.com/76979871",
    ]) expect(parseVideoLink(link), link).toEqual({ ok: false, message: M.noVideo });
  });

  it("an unlisted Vimeo video is refused with the reason, because its key isn't kept", () => {
    expect(parseVideoLink("https://vimeo.com/76979871/abcdef0123")).toEqual({ ok: false, message: M.privateVimeo });
    expect(parseVideoLink("https://player.vimeo.com/video/76979871?h=abcdef0123")).toEqual({ ok: false, message: M.privateVimeo });
  });

  it("a very long paste is refused without being read", () => {
    expect(parseVideoLink(`https://youtu.be/dQw4w9WgXcQ?x=${"a".repeat(400)}`).ok).toBe(false);
  });

  it("no message shouts or blames", () => {
    for (const m of Object.values(M)) expect(m).not.toMatch(/!|invalid|illegal/i);
  });
});

describe("what is built from the stored site and id", () => {
  it("the frame's address is the privacy-friendly player, on an allowed origin, with only the id in it", () => {
    const y = videoEmbedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" });
    const v = videoEmbedUrl({ provider: "vimeo", id: "76979871" });
    expect(y).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(v).toBe("https://player.vimeo.com/video/76979871?autoplay=1&dnt=1");
    for (const u of [y, v]) expect(VIDEO_FRAME_ORIGINS as readonly string[]).toContain(new URL(u).origin);
    expect(videoWatchUrl({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(videoWatchUrl({ provider: "vimeo", id: "76979871" })).toBe("https://vimeo.com/76979871");
  });

  it("a stored row that isn't a known site and a well-formed id is no video at all", () => {
    expect(videoFrom({ video_provider: "youtube", video_id: "dQw4w9WgXcQ" })).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(videoFrom({ video_provider: "vimeo", video_id: "76979871" })).toEqual({ provider: "vimeo", id: "76979871" });
    for (const row of [
      null, undefined, {}, { video_provider: null, video_id: null },
      { video_provider: "youtube", video_id: '"><script>' }, { video_provider: "youtube", video_id: "76979871" },
      { video_provider: "vimeo", video_id: "dQw4w9WgXcQ" }, { video_provider: "vimeo", video_id: "76979871?h=1" },
      { video_provider: "evil", video_id: "dQw4w9WgXcQ" }, { video_provider: "youtube", video_id: 12345678901 },
      { video_provider: "youtube", video_id: "../../../x" },
    ]) expect(videoFrom(row as never), JSON.stringify(row)).toBeNull();
  });

  it("everything a parsed link can produce survives the stored-row check (and so the database's)", () => {
    for (const link of ["https://youtu.be/a-b_c1D2e3F", "https://vimeo.com/1", "https://vimeo.com/999999999999"]) {
      const r = parseVideoLink(link);
      expect(r.ok && r.video && videoFrom({ video_provider: r.video.provider, video_id: r.video.id }), link).toEqual(r.ok ? r.video : null);
    }
  });
});

describe("the Content-Security-Policy", () => {
  it("lets frames load exactly the two video players: no wildcard, no scheme-wide rule, nothing else", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.flatMap((r) => r.headers).find((h) => h.key === "Content-Security-Policy")!.value;
    const directives = new Map(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
    expect(directives.get("frame-src")).toEqual(["https://www.youtube-nocookie.com", "https://player.vimeo.com"]);
    expect(csp.match(/frame-src/g)).toHaveLength(1);
    for (const v of directives.get("frame-src")!) expect(v).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    // Our own pages still can't be framed by anyone, and nothing else got wider.
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(csp).not.toContain("*");
    expect(directives.get("script-src")!.join(" ")).not.toMatch(/youtube|vimeo/);
    expect(directives.get("img-src")!.join(" ")).not.toMatch(/youtube|ytimg|vimeo/);
    expect(directives.get("connect-src")!.join(" ")).not.toMatch(/youtube|vimeo/);
  });
});

describe("what the dashboard says after saving or removing a video", () => {
  const ctx = { base: "/charity-admin/c1", publicUrl: "/c/meals", approved: true };
  it("says what happened, belongs on the profile page, and can be described when taken back", () => {
    for (const kind of ["video_saved", "video_removed", "focus_saved", "focus_removed"] as const) {
      expect(isActionKind(kind)).toBe(true);
      expect(pageOf(kind)).toBe("profile");
      const d = describeDone(kind, { site: "YouTube", title: "Winter blankets", from: "10/11/2026", to: "30/11/2026", status: "scheduled" }, ctx);
      expect(d.what).toMatch(/[.]$/);
      expect(d.what).not.toMatch(/!/);
      expect(d.next!.href).toBe("/c/meals");
      expect(describeUndone(kind, { title: "Winter blankets" })).toMatch(/^Taken back\./);
    }
    expect(describeDone("video_saved", { site: "Vimeo" }, ctx).what).toBe("Your video is on your page. Nothing loads from Vimeo until a visitor presses play.");
    expect(describeDone("video_saved", { site: "Vimeo" }, { ...ctx, approved: false }).what).toContain("once your application is approved");
    expect(describeDone("focus_saved", { title: "Winter blankets", from: "10/11/2026", to: "30/11/2026", status: "showing" }, ctx).what).toBe(
      '"Winter blankets" is your focus. It shows at the top of your page and in the Givezy app until 30/11/2026. We don\'t send a notification about it.',
    );
    expect(describeDone("focus_saved", { title: "Winter blankets", from: "20/11/2026", to: "30/11/2026", status: "scheduled" }, ctx).what).toContain("from 20/11/2026 to 30/11/2026");
  });
});
