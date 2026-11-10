/**
 * A charity's profile video (decided 09/11/2026: a link first, no uploads). The charity pastes a YouTube or Vimeo
 * link; we keep only which site it is on and the video's id, never the link itself and never any HTML. Every
 * address we later open or embed is built here from those two values. Dependency-free: the app shares this file.
 */

export type VideoProvider = "youtube" | "vimeo";
export type ProfileVideo = { provider: VideoProvider; id: string };

/** The only two addresses a video may play from on our pages (the Content-Security-Policy's frame-src). */
export const VIDEO_FRAME_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[1-9][0-9]{0,11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

export const VIDEO_PROVIDER_NAME: Record<VideoProvider, string> = { youtube: "YouTube", vimeo: "Vimeo" };

export const VIDEO_LINK_MESSAGES = {
  notALink: "Paste the link to your video on YouTube or Vimeo, for example https://youtu.be/…",
  embedCode: "That looks like embed code. Paste only the link to the video, the one that starts with https://",
  notHttps: "The link must start with https://",
  otherSite: "We can only show videos from YouTube or Vimeo. Paste a link from youtube.com, youtu.be or vimeo.com.",
  noVideo: "That link doesn't point to one video. Open the video on YouTube or Vimeo and copy its link.",
  privateVimeo: "That Vimeo video is unlisted, so visitors couldn't watch it. Make it public on Vimeo, then paste its link.",
} as const;

export type VideoLinkResult = { ok: true; video: ProfileVideo | null } | { ok: false; message: string };

/**
 * Read what the charity pasted. Empty means "no video". Only an https link to YouTube or Vimeo that names one
 * video is accepted; everything else in the link (start time, playlist, tracking) is dropped.
 */
export function parseVideoLink(raw: unknown): VideoLinkResult {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: true, video: null };
  if (s.length > 300) return { ok: false, message: VIDEO_LINK_MESSAGES.notALink };
  if (/[<>"'`\s\\]/.test(s) || /[\u0000-\u001f\u007f]/.test(s)) return { ok: false, message: /<|iframe/i.test(s) ? VIDEO_LINK_MESSAGES.embedCode : VIDEO_LINK_MESSAGES.notALink };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, message: VIDEO_LINK_MESSAGES.notALink };
  }
  if (url.protocol !== "https:") return { ok: false, message: /^https?:$/.test(url.protocol) ? VIDEO_LINK_MESSAGES.notHttps : VIDEO_LINK_MESSAGES.notALink };
  // A name and password before the host ("https://youtube.com@other.example/") is how a link pretends to be another site.
  if (url.username || url.password || url.port) return { ok: false, message: VIDEO_LINK_MESSAGES.otherSite };
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    let id: string | null = null;
    if (host === "youtu.be") id = parts.length === 1 ? parts[0] : null;
    else if (parts[0] === "watch" && parts.length === 1) id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "") && parts.length === 2) id = parts[1];
    return id && YOUTUBE_ID.test(id) ? { ok: true, video: { provider: "youtube", id } } : { ok: false, message: VIDEO_LINK_MESSAGES.noVideo };
  }
  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/123456789, vimeo.com/channels/name/123456789, vimeo.com/groups/name/videos/123456789, player.vimeo.com/video/123456789.
    const last = parts[parts.length - 1] ?? "";
    const before = parts.slice(0, -1);
    const shapes = host === "player.vimeo.com"
      ? before.length === 1 && before[0] === "video"
      : before.length === 0 || (before.length === 2 && before[0] === "channels") || (before.length === 3 && before[0] === "groups" && before[2] === "videos");
    if (shapes && VIMEO_ID.test(last)) {
      // An unlisted video needs its secret key (?h=…), which we don't keep.
      if (url.searchParams.has("h")) return { ok: false, message: VIDEO_LINK_MESSAGES.privateVimeo };
      return { ok: true, video: { provider: "vimeo", id: last } };
    }
    // vimeo.com/123456789/abcdef0123: an unlisted video's link.
    if (host !== "player.vimeo.com" && parts.length === 2 && VIMEO_ID.test(parts[0]) && /^[0-9a-f]{6,16}$/i.test(parts[1])) return { ok: false, message: VIDEO_LINK_MESSAGES.privateVimeo };
    return { ok: false, message: VIDEO_LINK_MESSAGES.noVideo };
  }
  return { ok: false, message: VIDEO_LINK_MESSAGES.otherSite };
}

/** A stored provider and id, checked again before anything is built from them. Anything odd is "no video". */
export function videoFrom(row: { video_provider?: unknown; video_id?: unknown } | null | undefined): ProfileVideo | null {
  const provider = row?.video_provider;
  const id = row?.video_id;
  if (typeof id !== "string") return null;
  if (provider === "youtube" && YOUTUBE_ID.test(id)) return { provider, id };
  if (provider === "vimeo" && VIMEO_ID.test(id)) return { provider, id };
  return null;
}

/** The video's own page on YouTube or Vimeo (what the editor shows back, and what the app opens). */
export function videoWatchUrl(v: ProfileVideo): string {
  return v.provider === "youtube" ? `https://www.youtube.com/watch?v=${v.id}` : `https://vimeo.com/${v.id}`;
}

/**
 * The player we put in a frame, only after the visitor presses play. YouTube's no-cookie player; Vimeo's player
 * with "do not track" on. It starts playing because the visitor has just pressed play.
 */
export function videoEmbedUrl(v: ProfileVideo): string {
  return v.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${v.id}?autoplay=1&dnt=1`;
}
