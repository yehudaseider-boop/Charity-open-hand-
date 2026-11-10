import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { VIDEO_PROVIDER_NAME, type ProfileVideo as Video } from "@shared/charity/video";
import { videoLink, videoNote } from "@/lib/charity-extras";
import { notify } from "@/lib/open-site";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Text } from "./text";
import { VideoPlayer } from "./video-player";

type State = "idle" | "loading" | "playing" | "failed";

/**
 * "Watch our video" on a charity's screen (decided 10/11/2026: it plays here, inside the screen, like the
 * website). Until the donor presses play this is a card drawn by us: nothing is fetched from YouTube or Vimeo,
 * not even a thumbnail. If it can't play, it says so plainly and offers Try again or the video site in a sheet.
 */
export function ProfileVideo({ video, charityName }: { video: Video; charityName: string }) {
  const [state, setState] = useState<State>("idle");
  // A new key starts the player from scratch on Try again.
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  const site = VIDEO_PROVIDER_NAME[video.provider];

  const openInBrowser = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(videoLink(video));
    } catch {
      notify("Couldn't open the video", "Nothing else has changed. Please check your connection and try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.frame}>
        {state === "idle" ? (
          <Pressable
            onPress={() => setState("loading")}
            accessibilityRole="button"
            accessibilityLabel={`Play ${charityName}'s video. It plays from ${site}.`}
            style={styles.cover}
          >
            <View pointerEvents="none" style={[styles.dot, styles.dotBig]} />
            <View pointerEvents="none" style={[styles.dot, styles.ring]} />
            <View pointerEvents="none" style={[styles.dot, styles.dotSmall]} />
            <View style={styles.playRound}>
              <View style={styles.triangle} />
            </View>
            <Text style={styles.playLabel}>Play the video</Text>
          </Pressable>
        ) : state === "failed" ? (
          <View style={styles.failed} accessibilityRole="alert">
            <Text style={styles.failedTitle}>The video didn&apos;t load</Text>
            <Text style={styles.failedBody}>Check your connection and try again. Nothing else on this page has changed.</Text>
          </View>
        ) : (
          <>
            {state === "loading" ? (
              <View style={styles.loading} accessibilityLiveRegion="polite">
                <Text style={styles.loadingText}>Loading the video…</Text>
              </View>
            ) : null}
            <VideoPlayer
              key={attempt}
              video={video}
              title={`Video from ${charityName}, playing from ${site}`}
              onReady={() => setState((s) => (s === "loading" ? "playing" : s))}
              onFailed={() => setState("failed")}
            />
          </>
        )}
      </View>
      {state === "failed" ? (
        <View style={styles.actions}>
          <Button
            label="Try again"
            onPress={() => {
              setAttempt((a) => a + 1);
              setState("loading");
            }}
          />
          <Button variant="secondary" label={opening ? "Opening…" : "Open in browser"} disabled={opening} onPress={openInBrowser} />
        </View>
      ) : state === "idle" ? (
        <Text variant="label" style={styles.note}>{videoNote(video)}</Text>
      ) : (
        <View style={styles.playingNote}>
          <Text variant="label" style={styles.note}>Playing from {site}. Not playing?</Text>
          <TextLink label={opening ? "Opening…" : "Open in browser"} disabled={opening} onPress={openInBrowser} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 18, gap: 8 },
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.blue },
  cover: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: 10, overflow: "hidden" },
  dot: { position: "absolute", borderRadius: 999 },
  dotBig: { width: 130, height: 130, left: -40, top: -50, backgroundColor: colors.orange },
  ring: { width: 150, height: 150, right: "10%", bottom: -70, borderWidth: 14, borderColor: "rgba(255,255,255,0.12)" },
  dotSmall: { width: 16, height: 16, right: 28, top: 26, backgroundColor: colors.lilac },
  playRound: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: colors.lilac },
  triangle: { marginLeft: 5, width: 0, height: 0, borderTopWidth: 13, borderBottomWidth: 13, borderLeftWidth: 21, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.blue },
  playLabel: { fontFamily: fonts.display, fontSize: 20, color: colors.onInk },
  loading: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 16 },
  loadingText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.onInk, textAlign: "center" },
  failed: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 18, gap: 6, backgroundColor: colors.lilacSoft },
  failedTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.navy, textAlign: "center" },
  failedBody: { fontSize: 15, lineHeight: 21, color: colors.ink, textAlign: "center" },
  actions: { gap: 10 },
  note: { textAlign: "center" },
  playingNote: { alignItems: "center" },
});
