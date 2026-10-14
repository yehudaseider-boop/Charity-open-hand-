import { Image } from "react-native";

const word = require("../../assets/logo.png");
const tagline = require("../../assets/logo-tagline.png");

/** The Givezy wordmark (transparent background). `tagline` adds "Giving made easy." under it. */
export function Logo({ width = 150, tagline: withTagline = false }: { width?: number; tagline?: boolean }) {
  const ratio = withTagline ? 2.7232 : 2.9988;
  return <Image source={withTagline ? tagline : word} accessibilityRole="image" accessibilityLabel="Givezy" style={{ width, height: width / ratio }} resizeMode="contain" />;
}
