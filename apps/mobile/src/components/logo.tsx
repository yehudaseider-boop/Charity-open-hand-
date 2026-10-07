import { Image } from "react-native";

const source = require("../../assets/logo.png");

/** NEDIV lev wordmark. Dark ink on a transparent background. */
export function Logo({ width = 150 }: { width?: number }) {
  return <Image source={source} accessibilityRole="image" accessibilityLabel="NEDIV lev" style={{ width, height: (width * 265) / 1581 }} resizeMode="contain" />;
}
