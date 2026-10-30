import { Pressable, StyleSheet, View } from "react-native";
import type { Receipt } from "@/data/giving";
import { ddmmyyyy, rand } from "@/lib/format";
import { colors, fonts, radius, touch } from "@/theme/tokens";
import { CheckIcon, DownloadIcon, ShareIcon } from "./icons";
import { Text } from "./text";

const DOTS = 28;

/**
 * One issued s18A receipt, drawn as a paper slip: the charity, the amount and the receipt number on
 * top, a torn-ticket line (two notches and a dotted rule), then Download and Share underneath.
 */
export function ReceiptSlip({ receipt, onDownload, onShare }: { receipt: Receipt; onDownload: () => void; onShare: () => void }) {
  return (
    <View style={styles.slip}>
      <View style={styles.top} accessible accessibilityLabel={`s18A receipt from ${receipt.charityName}, ${rand(receipt.cents)}, issued ${ddmmyyyy(receipt.issued)}`}>
        {/* A lavender ring and an orange dot at the corner, as on the For charities page. */}
        <View style={styles.corner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.cornerRing} />
          <View style={styles.cornerDot} />
        </View>
        <View style={styles.kicker}>
          <CheckIcon size={14} color={colors.sage} />
          <Text style={styles.kickerText}>s18A receipt</Text>
        </View>
        <Text style={styles.name}>{receipt.charityName}</Text>
        <Text style={styles.amount}>{rand(receipt.cents)}</Text>
        <Text variant="label">
          {receipt.number ? `No. ${receipt.number} · ` : ""}issued {ddmmyyyy(receipt.issued)}
        </Text>
      </View>

      {/* The tear line: a notch cut into each side and a dotted rule between them. */}
      <View style={styles.tear} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.notch, { left: -11 }]} />
        <View style={styles.dots}>
          {Array.from({ length: DOTS }, (_, i) => <View key={i} style={styles.dot} />)}
        </View>
        <View style={[styles.notch, { right: -11 }]} />
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onDownload} accessibilityRole="button" accessibilityLabel={`Download receipt from ${receipt.charityName}`} style={({ pressed }) => [styles.btn, styles.btnMain, pressed && { opacity: 0.8 }]}>
          <DownloadIcon color={colors.onInk} />
          <Text style={[styles.btnText, { color: colors.onInk }]}>Download</Text>
        </Pressable>
        <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel={`Share receipt from ${receipt.charityName}`} style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && { opacity: 0.7 }]}>
          <ShareIcon color={colors.blue} />
          <Text style={[styles.btnText, { color: colors.blue }]}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slip: { borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, overflow: "hidden" },
  top: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, gap: 2, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  corner: { position: "absolute", right: -26, top: -26, width: 96, height: 96 },
  cornerRing: { position: "absolute", right: 0, top: 0, width: 84, height: 84, borderRadius: 42, borderWidth: 9, borderColor: colors.lightPurple },
  cornerDot: { position: "absolute", right: 64, top: 58, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.orange },
  kicker: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 5, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface },
  kickerText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.successText },
  name: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.navy, paddingRight: 40 },
  amount: { fontFamily: fonts.displayBold, fontVariant: ["tabular-nums"], fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.blue, marginTop: 2 },
  tear: { height: 22, justifyContent: "center", backgroundColor: colors.surface },
  notch: { position: "absolute", top: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cream, borderWidth: 1.5, borderColor: colors.lightPurple },
  dots: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 20, overflow: "hidden" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.lightPurple },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  btn: { flex: 1, minHeight: touch, borderRadius: radius.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnMain: { backgroundColor: colors.blue, borderBottomWidth: 4, borderBottomColor: colors.navy },
  btnQuiet: { borderWidth: 1.5, borderColor: colors.lightPurple, borderBottomWidth: 4, borderBottomColor: colors.lilac, backgroundColor: colors.surface },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 16 },
});
