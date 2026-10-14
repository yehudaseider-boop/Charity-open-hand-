import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";
import { CheckIcon, InfoIcon } from "./icons";
import { InfoButton } from "./info-button";
import { Text } from "./text";

/**
 * s18A status, shown once per charity, as two badges of the same shape and size
 * so neither looks like a warning: a sage outline and tick for "s18A receipts",
 * a stone outline and dash for "No s18A receipt". Both with ink text.
 */
export function Status18a({ issues18a }: { issues18a: boolean }) {
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { borderColor: issues18a ? colors.sage : colors.muted }]}>
        {issues18a ? <CheckIcon size={16} color={colors.sage} /> : <InfoIcon size={16} color={colors.muted} />}
        <Text variant="label" style={{ color: colors.ink }}>{issues18a ? "s18A receipts" : "No s18A receipt"}</Text>
      </View>
      <InfoButton terms={["s18a"]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
