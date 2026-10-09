import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/theme/tokens";

/**
 * One icon set for the whole app: 24 px grid, 1.75 px stroke, round caps and
 * joins, outline only (never filled).
 */
type IconProps = { size?: number; color?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none" });
const stroke = (color: string) => ({ stroke: color, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export function DiscoverIcon({ size = 24, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="12" r="8.5" {...stroke(color)} />
      <Path d="M14.8 9.2l-1.7 3.9-3.9 1.7 1.7-3.9 3.9-1.7z" {...stroke(color)} />
    </Svg>
  );
}

export function GivingIcon({ size = 24, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M3.5 14.5h3l3.2 2.2h4.1a1.6 1.6 0 000-3.2H11" {...stroke(color)} />
      <Path d="M6.5 14.5v5.5M6.5 20h7.8l6.2-4.1a1.5 1.5 0 00-1.8-2.4l-3.4 2.1" {...stroke(color)} />
      <Path d="M14.5 4.2c-.9-.9-2.4-.9-3.3 0-.9.9-.9 2.4 0 3.3l3.3 3.2 3.3-3.2c.9-.9.9-2.4 0-3.3-.9-.9-2.4-.9-3.3 0z" {...stroke(color)} />
    </Svg>
  );
}

export function ReceiptsIcon({ size = 24, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6.5 3.5h11v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.3-1.4V3.5z" {...stroke(color)} />
      <Path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" {...stroke(color)} />
    </Svg>
  );
}

export function AccountIcon({ size = 24, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="8.5" r="3.75" {...stroke(color)} />
      <Path d="M4.75 20c.8-3.6 3.7-5.75 7.25-5.75s6.45 2.15 7.25 5.75" {...stroke(color)} />
    </Svg>
  );
}

export function SearchIcon({ size = 20, color = colors.muted }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="11" cy="11" r="6.75" {...stroke(color)} />
      <Path d="M16 16l4 4" {...stroke(color)} />
    </Svg>
  );
}

export function BackIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M14.5 5.5L8 12l6.5 6.5" {...stroke(color)} />
    </Svg>
  );
}

export function ChevronIcon({ size = 18, color = colors.muted }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M9.5 5.5L16 12l-6.5 6.5" {...stroke(color)} />
    </Svg>
  );
}

export function HeartIcon({ size = 22, color = colors.ink, filled = false }: IconProps & { filled?: boolean }) {
  // Saved: filled solid blue, so it's clear at a glance.
  return (
    <Svg {...base(size)}>
      <Path
        d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0112 7.6a4.1 4.1 0 017.5 2.3c0 5.2-7.5 9.6-7.5 9.6z"
        {...stroke(filled ? colors.accent : color)}
        fill={filled ? colors.accent : "none"}
      />
    </Svg>
  );
}

export function ShareIcon({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 14.5V4M8 7.5L12 3.5l4 4" {...stroke(color)} />
      <Path d="M7 11H5.75a1.25 1.25 0 00-1.25 1.25v6.5c0 .7.56 1.25 1.25 1.25h12.5c.7 0 1.25-.56 1.25-1.25v-6.5c0-.7-.56-1.25-1.25-1.25H17" {...stroke(color)} />
    </Svg>
  );
}

export function DownloadIcon({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 4v11M8 11.5l4 4 4-4M5 19.5h14" {...stroke(color)} />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color = colors.success }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M5 12.5l4.2 4.2L19 7" {...stroke(color)} />
    </Svg>
  );
}

export function InfoIcon({ size = 18, color = colors.muted }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx="12" cy="12" r="8.5" {...stroke(color)} />
      <Path d="M12 11v5M12 8v.01" {...stroke(color)} />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} />
    </Svg>
  );
}

export function CalendarIcon({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x="4" y="5.5" width="16" height="14.5" rx="2.5" {...stroke(color)} />
      <Path d="M8 3.5v4M16 3.5v4M4 10h16" {...stroke(color)} />
    </Svg>
  );
}
