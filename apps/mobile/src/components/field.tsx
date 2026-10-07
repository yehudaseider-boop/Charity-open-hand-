import { useId } from "react";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
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
  // iPhone number pads have no return key, so give them a Done bar to close the keyboard.
  const accessoryId = `field-${useId()}`;
  const needsDone = Platform.OS === "ios" && NUMBER_PADS.has(String(input.keyboardType));
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={{ color: colors.ink }}>{label}</Text>
      <View style={[styles.box, error ? { borderColor: colors.accent } : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          {...input}
          inputAccessoryViewID={needsDone ? accessoryId : input.inputAccessoryViewID}
          style={styles.input}
        />
      </View>
      {error ? (
        <Text variant="label" style={{ color: colors.accent }} accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="label">{helper}</Text>
      ) : null}
      {needsDone ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.doneBar}>
            <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" hitSlop={8} style={styles.done}>
              <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.accent }}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

const NUMBER_PADS = new Set(["number-pad", "decimal-pad", "numeric", "phone-pad"]);

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
  doneBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  done: { minHeight: touch, justifyContent: "center", paddingHorizontal: 8 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
});
