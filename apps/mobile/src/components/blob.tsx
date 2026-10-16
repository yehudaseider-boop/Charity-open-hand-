import { View, type ViewStyle } from "react-native";

/**
 * An organic splash: a rounded shape with uneven corners (about 50% / 40% / 55% / 45%), in one flat
 * colour. Purely decorative. Not the logo's splash (that is an image, see splash.tsx).
 */
export function Blob({ size, color, rotate = 0, stretch = 1, style }: { size: number; color: string; rotate?: number; stretch?: number; style?: ViewStyle }) {
  const w = size * stretch;
  const h = size;
  const m = Math.min(w, h);
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: w,
          height: h,
          backgroundColor: color,
          borderTopLeftRadius: m * 0.5,
          borderTopRightRadius: m * 0.4,
          borderBottomRightRadius: m * 0.55,
          borderBottomLeftRadius: m * 0.45,
          transform: [{ rotate: `${rotate}deg` }],
        },
        style,
      ]}
    />
  );
}
