import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";
import { Text } from "./text";

/** The app name is not decided: a plain neutral block until it is. */
export function LogoPlaceholder() {
  return (
    <View style={styles.box} accessibilityLabel="Logo placeholder">
      <Text variant="label" style={{ color: colors.muted }}>Logo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 88,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
