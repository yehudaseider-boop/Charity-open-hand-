import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { ddmmyyyy, hhmm, jhbDay } from "@/lib/format";
import { People } from "./people";
import type { PeopleName } from "./people-art";
import { Text } from "./text";

/** Loading: quiet placeholder blocks in the hairline colour, no spinners. */
export function SkeletonBlock({ height, width = "100%", style }: { height: number; width?: number | `${number}%`; style?: object }) {
  return <View style={[{ height, width, borderRadius: radius.card, backgroundColor: colors.hairline, opacity: 0.6 }, style]} />;
}

export function LoadingList({ count = 3, imageHeight = 120 }: { count?: number; imageHeight?: number }) {
  return (
    <View style={{ gap: space.block }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ gap: 10 }}>
          <SkeletonBlock height={imageHeight} />
          <SkeletonBlock height={18} width="60%" />
          <SkeletonBlock height={16} width="40%" />
        </View>
      ))}
    </View>
  );
}

/**
 * Nothing here yet. `art` adds one of the people illustrations above the words (for a page's main empty
 * state, not for small ones inside a card). Without it, a soft lilac ring and dot keep it from looking bare.
 */
export function EmptyState({ title, body, action, art }: { title: string; body: string; action?: { label: string; onPress: () => void }; art?: PeopleName }) {
  return (
    <View style={styles.box}>
      <Mark art={art} />
      <Text variant="h2" style={styles.title}>{title}</Text>
      <Text variant="bodyMuted" style={styles.body}>{body}</Text>
      {action ? <View style={styles.action}><Button label={action.label} onPress={action.onPress} /></View> : null}
    </View>
  );
}

/** `away`: a second way on, for screens with no tab bar (so an error is never a dead end). */
export function ErrorState({ body, onRetry, away, art }: { body: string; onRetry: () => void; away?: { label: string; onPress: () => void }; art?: PeopleName }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Mark art={art} />
      <Text variant="h2" style={styles.title}>Something went wrong</Text>
      <Text variant="bodyMuted" style={styles.body}>{body}</Text>
      <View style={styles.action}><Button label="Try again" onPress={onRetry} /></View>
      {away ? <TextLink label={away.label} onPress={away.onPress} /> : null}
    </View>
  );
}

/** The picture above an empty or error state: a people illustration, or a quiet ring and dot. Decoration only. */
function Mark({ art }: { art?: PeopleName }) {
  if (art) return <People name={art} width={200} style={{ marginBottom: 6 }} float={false} />;
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.markRing} />
      <View style={styles.markDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", gap: 10, paddingVertical: 36, paddingHorizontal: 8 },
  title: { textAlign: "center", fontSize: 24, lineHeight: 30 },
  body: { textAlign: "center", maxWidth: 340 },
  action: { marginTop: 10, alignSelf: "stretch" },
  mark: { width: 64, height: 64, marginBottom: 6, alignItems: "center", justifyContent: "center" },
  markRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 6, borderColor: colors.lightPurple },
  markDot: { position: "absolute", right: 2, top: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.orange },
});

/** Shown while offline: the screen is the giving the phone saved last time. */
export function OfflineNote({ savedAt }: { savedAt: Date }) {
  return (
    <View accessibilityRole="alert" style={{ padding: 12, borderRadius: radius.control, backgroundColor: colors.lilacSoft }}>
      <Text style={{ fontSize: 15, lineHeight: 21 }}>
        We couldn&apos;t refresh, so this is what was saved on {ddmmyyyy(jhbDay(savedAt))} at {hhmm(savedAt)}. Pull down to try again.
      </Text>
    </View>
  );
}
