import { Linking, Pressable, Share, StyleSheet } from "react-native";
import { haptic } from "@/lib/haptics";
import { notify } from "@/lib/open-site";
import { whatsappUrl } from "@/lib/share";
import { colors, fonts, radius, touch } from "@/theme/tokens";
import { ShareIcon } from "./icons";
import { Text } from "./text";

/**
 * Share on WhatsApp, where our community talks. Falls back to the phone's own share sheet when
 * WhatsApp isn't installed. `text` is null until the website is live (nothing to link to yet).
 */
export async function shareOnWhatsApp(text: string | null) {
  if (!text) return notify("Not available yet", "Sharing works once the Givezy website is live.");
  haptic.tap();
  try {
    await Linking.openURL(whatsappUrl(text));
  } catch {
    await Share.share({ message: text }).catch(() => undefined);
  }
}

/** Round button (over a photo) or a text pill (on a card). */
export function ShareButton({ text, label, variant = "pill" }: { text: string | null; label: string; variant?: "pill" | "round" }) {
  if (variant === "round") {
    return (
      <Pressable onPress={() => shareOnWhatsApp(text)} accessibilityRole="button" accessibilityLabel={label} style={styles.round} hitSlop={4}>
        <ShareIcon size={22} />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => shareOnWhatsApp(text)} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}>
      <ShareIcon size={18} color={colors.blue} />
      <Text style={styles.pillText}>Share on WhatsApp</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: touch, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.surface },
  pillText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.blue },
});
