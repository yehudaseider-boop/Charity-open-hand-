import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Text } from "./text";

/**
 * Shown when a personal record on this phone could not be opened or saved.
 * Says what happened and what is safe, and offers the next step.
 */
export function RecordProblem({
  title,
  body,
  retryLabel = "Try again",
  onRetry,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  body: string;
  retryLabel?: string;
  onRetry: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text variant="bodyMuted">{body}</Text>
      <Button label={retryLabel} onPress={onRetry} />
      {secondaryLabel && onSecondary ? <TextLink label={secondaryLabel} onPress={onSecondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
  title: { fontSize: 17, lineHeight: 24, color: colors.danger },
});
