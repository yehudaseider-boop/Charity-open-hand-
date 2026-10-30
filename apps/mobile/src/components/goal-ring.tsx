import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts } from "@/theme/tokens";
import { Text } from "./text";

/**
 * A goal ring: an orange arc on a see-through white track (on blue grounds) or a light purple track (on white),
 * a soft disc inside it, and the percentage in the middle in the headline font, the % sign a size smaller.
 */
export function GoalRing({ percent, size = 120, onBlue = false, stroke = 12 }: { percent: number; size?: number; onBlue?: boolean; stroke?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ink = onBlue ? colors.onInk : colors.navy;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }} accessibilityLabel={`${p} per cent of your goal`}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {/* The soft disc inside the ring: a quiet lift on blue, pale lilac on white. */}
        <Circle cx={size / 2} cy={size / 2} r={Math.max(0, r - stroke / 2 - 5)} fill={onBlue ? colors.blueTrack : colors.lilacSoft} opacity={onBlue ? 0.45 : 1} />
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
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Text style={{ fontFamily: fonts.displayBold, fontSize: size * 0.25, lineHeight: size * 0.3, letterSpacing: -0.5, color: ink }}>{p}</Text>
        <Text style={{ fontFamily: fonts.display, fontSize: size * 0.13, lineHeight: size * 0.18, marginTop: size * 0.02, marginLeft: 1, color: ink }}>%</Text>
      </View>
    </View>
  );
}
