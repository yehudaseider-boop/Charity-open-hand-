import { Image } from "react-native";
import { colors } from "@/theme/tokens";

const word = require("../../assets/logo.png");
const tagline = require("../../assets/logo-tagline.png");

/** The Givezy wordmark (transparent background). `tagline` adds "Giving made easy." under it. */
export function Logo({ width = 150, tagline: withTagline = false, white = false }: { width?: number; tagline?: boolean; white?: boolean }) {
  const ratio = withTagline ? 2.7232 : 2.9988;
  // White on blue grounds: the same wordmark, tinted.
  return <Image source={withTagline ? tagline : word} accessibilityRole="image" accessibilityLabel="Givezy" style={[{ width, height: width / ratio }, white && { tintColor: colors.onInk }]} resizeMode="contain" />;
}
