"use client";

import { useEffect, useRef, useState } from "react";
import { VIDEO_PROVIDER_NAME, videoEmbedUrl, videoWatchUrl, type ProfileVideo as Video } from "@/lib/charity/video";

/**
 * "Watch our video" (decided 09/11/2026). Until the visitor presses play this is a picture drawn by us: nothing
 * at all is fetched from YouTube or Vimeo, not even a thumbnail. Pressing play puts the site's privacy-friendly
 * player in a frame. The frame's address is built from the stored site and video id only.
 */
export function ProfileVideo({ video, charityName }: { video: Video; charityName: string }) {
  const [state, setState] = useState<"idle" | "offline" | "loading" | "playing">("idle");
  const frame = useRef<HTMLIFrameElement>(null);
  const site = VIDEO_PROVIDER_NAME[video.provider];
  const watch = videoWatchUrl(video);

  // Once the player is in, the keyboard and screen readers land on it.
  useEffect(() => {
    if (state === "loading") frame.current?.focus();
  }, [state]);

  const play = () => setState(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "loading");
  const showFrame = state === "loading" || state === "playing";

  return (
    <div className="space-y-3">
      <div className="relative isolate aspect-video w-full overflow-hidden rounded-card bg-brand">
        {showFrame ? (
          <>
            {state === "loading" ? (
              <p role="status" className="absolute inset-0 -z-10 flex items-center justify-center px-4 text-center font-semibold text-brand-contrast">
                Loading the video from {site}…
              </p>
            ) : null}
            <iframe
              ref={frame}
              src={videoEmbedUrl(video)}
              title={`Video from ${charityName}, playing from ${site}`}
              onLoad={() => setState("playing")}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={play}
            aria-label={`Play ${charityName}'s video. It plays from ${site}.`}
            className="group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center text-brand-contrast"
          >
            <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 -z-10 h-36 w-36 rounded-full bg-coral sm:h-48 sm:w-48" />
            <span aria-hidden className="pointer-events-none absolute -bottom-16 right-[12%] -z-10 h-44 w-44 rounded-full border-[16px] border-white/10" />
            <span aria-hidden className="pointer-events-none absolute right-8 top-8 -z-10 h-5 w-5 rounded-full bg-honey" />
            <span className="pressable flex h-16 w-16 items-center justify-center rounded-full bg-surface sm:h-20 sm:w-20">
              <svg aria-hidden viewBox="0 0 24 24" width="30" height="30" className="translate-x-0.5 fill-brand"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
            </span>
            <span className="font-display text-xl font-bold sm:text-2xl">Play the video</span>
          </button>
        )}
      </div>
      {state === "offline" ? (
        <p role="alert" className="rounded-control bg-honey-soft p-3 text-sm">
          You&apos;re offline, so the video can&apos;t play. Check your connection, then press play again.
        </p>
      ) : null}
      <p className="text-sm text-muted">
        {showFrame ? (
          <>Playing from {site}. Not playing? <a href={watch} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand underline">Watch it on {site}</a>.</>
        ) : (
          <>The video plays from {site}. Nothing loads from {site} until you press play.</>
        )}
      </p>
    </div>
  );
}
