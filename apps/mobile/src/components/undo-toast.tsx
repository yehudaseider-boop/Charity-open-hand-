import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts, radius, touch } from "@/theme/tokens";
import { Text } from "./text";

export type UndoMessage = { text: string; label?: string; run?: () => void };

/**
 * What just happened, with Undo, floating just above the tab bar so it shows wherever the person has
 * scrolled to. The same bar for every action that can be taken back.
 */
export function UndoToast({ message }: { message: UndoMessage | null }) {
  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.text}>{message.text}</Text>
        {message.run && message.label ? (
          <Pressable onPress={message.run} accessibilityRole="button" hitSlop={8} style={styles.btn}>
            <Text style={styles.btnText}>{message.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, bottom: 12 },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.control, backgroundColor: colors.navy, shadowColor: colors.navy, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  text: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.onInk },
  btn: { minHeight: touch, justifyContent: "center", paddingHorizontal: 6 },
  btnText: { fontFamily: fonts.bodyBold, color: colors.orange },
});
