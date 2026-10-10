import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";
import { CheckIcon } from "./icons";
import { InfoButton } from "./info-button";
import { Text } from "./text";

/** 18A status, shown once per charity. Only the negative case is a badge. */
export function Status18a({ issues18a }: { issues18a: boolean }) {
  if (issues18a) {
    return (
      <View style={styles.row}>
        <CheckIcon size={16} />
        <Text variant="label" style={{ color: colors.success }}>Annual 18A receipt</Text>
        <InfoButton terms={["s18a"]} />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Text variant="label" style={{ color: colors.ink }}>No 18A receipt</Text>
      </View>
      <InfoButton terms={["s18a"]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderColor: colors.hairline, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
});
