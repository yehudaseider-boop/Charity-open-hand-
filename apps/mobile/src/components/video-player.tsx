import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import type { ProfileVideo } from "@shared/charity/video";
import { playerNavigation, playerReferrer, VIDEO_PLAYER_ORIGINS, videoPlayerUrl } from "@/lib/charity-extras";
import { openUrl } from "@/lib/open-site";
import { SITE_URL } from "@/lib/website";

export type PlayerProps = { video: ProfileVideo; title: string; onReady: () => void; onFailed: () => void };

/**
 * The charity's video, playing inside its screen (decided 10/11/2026). Shown only after the donor presses play.
 * Locked down: it opens only the two privacy-friendly players, built from the stored site and id; nothing of ours
 * is injected into it; no files, no pop-up windows, no camera or microphone, and its own cookie jar (incognito),
 * thrown away when the card closes. A tap through to YouTube's or Vimeo's own page opens the phone's browser.
 */
export function VideoPlayer({ video, title, onReady, onFailed }: PlayerProps) {
  const leave = (url: string) => {
    if (playerNavigation(url, true) === "browser") openUrl(url);
  };
  return (
    <WebView
      source={{ uri: videoPlayerUrl(video), headers: { Referer: playerReferrer(SITE_URL) } }}
      style={StyleSheet.absoluteFill}
      containerStyle={StyleSheet.absoluteFill}
      accessibilityLabel={title}
      originWhitelist={[...VIDEO_PLAYER_ORIGINS]}
      onShouldStartLoadWithRequest={(req) => {
        // Unknown frame: treat it as the card itself, the stricter of the two.
        const decision = playerNavigation(req.url, req.isTopFrame ?? true);
        if (decision === "browser") openUrl(req.url);
        return decision === "allow";
      }}
      onOpenWindow={(e) => leave(e.nativeEvent.targetUrl)}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      incognito
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      geolocationEnabled={false}
      mediaCapturePermissionGrantType="deny"
      allowsLinkPreview={false}
      allowsBackForwardNavigationGestures={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      automaticallyAdjustContentInsets={false}
      onLoadEnd={(e) => {
        if (!e.nativeEvent.loading) onReady();
      }}
      onError={onFailed}
      onHttpError={(e) => {
        if (e.nativeEvent.statusCode >= 400) onFailed();
      }}
      onRenderProcessGone={onFailed}
      onContentProcessDidTerminate={onFailed}
    />
  );
}
