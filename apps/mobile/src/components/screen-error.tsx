import type { ErrorBoundaryProps } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "@/theme/tokens";
import { ErrorState } from "./states";
import { Text } from "./text";

/**
 * Shown instead of a blank page when a screen fails while drawing. "Try again" redraws it.
 * The error's own words sit underneath, small, so a screenshot tells us what went wrong.
 * Each tab exports this as its `ErrorBoundary`.
 */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: space.gutter, paddingBottom: 40 }}>
      <ErrorState body="This page didn't load properly. Please try again." onRetry={() => void retry()} />
      <View style={{ marginTop: 8 }}>
        <Text variant="label" selectable style={{ textAlign: "center" }}>{error.message || String(error)}</Text>
      </View>
    </ScrollView>
  );
}
