import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/states";
import { colors, space } from "@/theme/tokens";

/** A link to a page that doesn't exist (an old link, a typo): the same calm empty state as everywhere else. */
export default function NotFound() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream, paddingTop: insets.top + 40, paddingHorizontal: space.gutter }}>
      <EmptyState title="We couldn't find that page" body="It may have moved, or the link may be out of date." action={{ label: "Go to Home", onPress: () => router.replace("/home") }} />
    </View>
  );
}
