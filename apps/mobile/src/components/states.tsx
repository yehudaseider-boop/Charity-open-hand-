import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme/tokens";
import { Button } from "./button";
import { ddmmyyyy, hhmm } from "@/lib/format";
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

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.box}>
      <Text variant="h2" style={{ textAlign: "center" }}>{title}</Text>
      <Text variant="bodyMuted" style={{ textAlign: "center" }}>{body}</Text>
      {action ? <View style={{ marginTop: 8, alignSelf: "stretch" }}><Button label={action.label} onPress={action.onPress} /></View> : null}
    </View>
  );
}

export function ErrorState({ body, onRetry }: { body: string; onRetry: () => void }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text variant="h2" style={{ textAlign: "center" }}>Something went wrong</Text>
      <Text variant="bodyMuted" style={{ textAlign: "center" }}>{body}</Text>
      <View style={{ marginTop: 8, alignSelf: "stretch" }}><Button label="Try again" onPress={onRetry} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 8 },
});

/** Shown while offline: the screen is the giving the phone saved last time. */
export function OfflineNote({ savedAt }: { savedAt: Date }) {
  return (
    <View accessibilityRole="alert" style={{ padding: 12, borderRadius: radius.control, backgroundColor: colors.accentSoft }}>
      <Text style={{ fontSize: 15, lineHeight: 21 }}>
        No connection. Showing what was saved on {ddmmyyyy(savedAt)} at {hhmm(savedAt)}.
      </Text>
    </View>
  );
}
