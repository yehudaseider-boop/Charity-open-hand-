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
  slip: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  top: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 2 },
  kicker: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  kickerText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.successText },
  name: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.blue },
  amount: { fontFamily: fonts.displayBold, fontVariant: ["tabular-nums"], fontSize: 32, lineHeight: 38, color: colors.ink, marginTop: 2 },
  tear: { height: 22, justifyContent: "center" },
  notch: { position: "absolute", top: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.hairline },
  dots: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 20, overflow: "hidden" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.hairline },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  btn: { flex: 1, minHeight: touch, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnMain: { backgroundColor: colors.blue },
  btnQuiet: { borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.surface },
  btnText: { fontFamily: fonts.bodySemibold, fontSize: 16 },
});
