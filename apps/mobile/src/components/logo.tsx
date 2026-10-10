import { Image } from "react-native";

const source = require("../../assets/logo.png");

/** Nadiv Lev wordmark. Dark ink on a transparent background. */
export function Logo({ width = 150 }: { width?: number }) {
  return <Image source={source} accessibilityRole="image" accessibilityLabel="Nadiv Lev" style={{ width, height: width / 6.1213 }} resizeMode="contain" />;
}
