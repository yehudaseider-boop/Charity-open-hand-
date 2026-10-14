import { Image, type ImageSourcePropType } from "react-native";
import { colors } from "@/theme/tokens";

/**
 * The splash from the Givezy logo: the lilac, orange and blue shapes, cut straight out of the
 * logo file so they are exactly the logo's. Never redraw them: use these images.
 */
const burst = require("../../assets/logo-splash.png");
const shapes = {
  lilac: { source: require("../../assets/drop-lilac.png"), ratio: 240 / 440 },
  orange: { source: require("../../assets/drop-orange.png"), ratio: 240 / 295 },
  blue: { source: require("../../assets/drop-blue.png"), ratio: 300 / 113 },
} as const satisfies Record<string, { source: ImageSourcePropType; ratio: number }>;

const BURST_RATIO = 640 / 451;

/** All three shapes together, as in the logo. Decorative: one per key screen, in a corner. */
export function Splash({ size = 120, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <Image
      source={burst}
      resizeMode="contain"
      style={{ width: size, height: size / BURST_RATIO, opacity }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

type Colour = typeof colors.lilac | typeof colors.orange | typeof colors.blue;

/** One of the logo's three shapes on its own, for soft backgrounds. `size` is its width. */
export function Drop({ size = 120, color = colors.lilac, rotate = 0, opacity = 1 }: { size?: number; color?: Colour; rotate?: number; opacity?: number }) {
  const shape = color === colors.orange ? shapes.orange : color === colors.blue ? shapes.blue : shapes.lilac;
  return (
    <Image
      source={shape.source}
      resizeMode="contain"
      style={{ width: size, height: size / shape.ratio, opacity, transform: [{ rotate: `${rotate}deg` }] }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
