import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme/tokens";

/** Decorative asset 1: a thin dotted arc, used once per key screen. */
export function DottedArc({ size = 220, color = colors.accent, opacity = 0.55 }: { size?: number; color?: string; opacity?: number }) {
  const r = size / 2 - 2;
  return (
    <Svg width={size} height={size / 2 + 4} viewBox={`0 0 ${size} ${size / 2 + 4}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        d={`M 2 ${size / 2 + 2} A ${r} ${r} 0 0 1 ${size - 2} ${size / 2 + 2}`}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="0.1 7"
        fill="none"
      />
    </Svg>
  );
}
