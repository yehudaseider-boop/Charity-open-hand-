import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts } from "@/theme/tokens";
import { Text } from "./text";

/**
 * A goal ring: an orange arc on a see-through white track (on blue grounds) or a light purple track (on white),
 * with the percentage in the middle.
 */
export function GoalRing({ percent, size = 120, onBlue = false, stroke = 12 }: { percent: number; size?: number; onBlue?: boolean; stroke?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }} accessibilityLabel={`${p} per cent of your goal`}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={onBlue ? colors.blueTrack : colors.lightPurple} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.orange}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * p) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.24, lineHeight: size * 0.28, color: onBlue ? colors.onInk : colors.navy }}>{p}%</Text>
    </View>
  );
}
