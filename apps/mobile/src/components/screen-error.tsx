import type { ErrorBoundaryProps } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { helpLine } from "@/lib/help";
import { colors, space } from "@/theme/tokens";
import { TextLink } from "./button";
import { ErrorState } from "./states";
import { Text } from "./text";

/**
 * Shown instead of a blank page when a screen fails while drawing. "Try again" redraws it. Nothing
 * the donor saved is lost (it stays on the phone and on our server). The error's own words are behind
 * "Show details", so a screenshot can still tell us what went wrong without showing code to everyone.
 * Each tab exports this as its `ErrorBoundary`.
 */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState(false);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: space.gutter, paddingBottom: 40 }}>
      <ErrorState body="This page didn't open properly. Nothing you saved is lost. Please try again." onRetry={() => void retry()} />
      <View style={{ marginTop: 8, gap: 10, alignItems: "center" }}>
        <Text variant="bodyMuted" style={{ textAlign: "center" }}>{helpLine()}</Text>
        {details ? (
          <Text variant="label" selectable style={{ textAlign: "center" }}>{error.message || String(error)}</Text>
        ) : (
          <TextLink label="Show details for support" onPress={() => setDetails(true)} />
        )}
      </View>
    </ScrollView>
  );
}
