import type { PlayerProps } from "./video-player";
import { videoPlayerUrl } from "@/lib/charity-extras";

/**
 * The web preview's player: the same frame the website uses, with the same address and the same limits, so the
 * preview build behaves like the phone without a native web view.
 */
export function VideoPlayer({ video, title, onReady }: PlayerProps) {
  return (
    <iframe
      src={videoPlayerUrl(video)}
      title={title}
      onLoad={onReady}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
