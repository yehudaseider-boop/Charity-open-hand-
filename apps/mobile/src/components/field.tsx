import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius, touch } from "@/theme/tokens";
import { Text } from "./text";

/** Labelled text input with helper or error text beneath. */
export function Field({
  label,
  helper,
  error,
  prefix,
  ...input
}: TextInputProps & { label: string; helper?: string; error?: string; prefix?: string }) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={{ color: colors.ink }}>{label}</Text>
      <View style={[styles.box, error ? { borderColor: colors.accent } : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          {...input}
          style={styles.input}
        />
      </View>
      {error ? (
        <Text variant="label" style={{ color: colors.accent }} accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="label">{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    minHeight: touch + 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  prefix: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.muted, marginRight: 6 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
});
