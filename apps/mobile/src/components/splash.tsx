import Svg, { G, Path } from "react-native-svg";
import { colors } from "@/theme/tokens";

/** One teardrop, point up, in a 100 x 150 box. The shape of the splashes in the Givezy logo. */
const DROP = "M50 0 C 60 28 100 60 100 102 A50 50 0 0 1 0 102 C0 60 40 28 50 0 Z";

type Props = { size?: number; opacity?: number; /** The third, blue drop. Leave it out in tight corners. */ blue?: boolean };

/**
 * The logo's splash: a lilac, an orange and a blue drop flicking up and to the right.
 * Decorative. Use it once per key screen, in a corner, as the one playful moment.
 */
export function Splash({ size = 120, opacity = 1, blue = true }: Props) {
  return (
    <Svg width={size} height={size * (blue ? 0.8 : 0.5)} viewBox={blue ? "0 0 160 128" : "0 0 160 80"} opacity={opacity} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G transform="translate(14 8) rotate(-26 25 38) scale(0.5)">
        <Path d={DROP} fill={colors.lilac} />
      </G>
      <G transform="translate(78 2) rotate(24 25 38) scale(0.46)">
        <Path d={DROP} fill={colors.orange} />
      </G>
      {blue ? (
        <G transform="translate(70 92) rotate(78 25 38) scale(0.36)">
          <Path d={DROP} fill={colors.blue} />
        </G>
      ) : null}
    </Svg>
  );
}

/** A big soft drop for backgrounds: low-contrast colour behind content. */
export function Drop({ size = 180, color = colors.lilacSoft, rotate = 0, opacity = 1 }: { size?: number; color?: string; rotate?: number; opacity?: number }) {
  return (
    <Svg width={size} height={size * 1.5} viewBox="0 0 100 150" opacity={opacity} style={{ transform: [{ rotate: `${rotate}deg` }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={DROP} fill={color} />
    </Svg>
  );
}
