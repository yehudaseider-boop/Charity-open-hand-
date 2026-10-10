import { Asset } from "expo-asset";
import { ImageBackground, Platform, StyleSheet, View, type ViewStyle } from "react-native";

const grain = require("../../assets/grain.png");

/** Ultra-subtle paper grain. Keep it away from small text. */
export function PaperGrain({ style, opacity = 0.5 }: { style?: ViewStyle; opacity?: number }) {
  if (Platform.OS === "web") {
    // react-native-web doesn't tile images; use a CSS repeating background.
    const uri = Asset.fromModule(grain).uri;
    const webStyle = { backgroundImage: `url(${uri})`, backgroundRepeat: "repeat", backgroundSize: "160px 160px" } as unknown as ViewStyle;
    return <View style={[StyleSheet.absoluteFill, webStyle, { opacity, pointerEvents: "none" }, style]} />;
  }
  return (
    <ImageBackground
      source={grain}
      resizeMode="repeat"
      style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, style]}
      imageStyle={{ opacity }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
