import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fonts, type } from "@/theme/tokens";

type Variant = keyof typeof type;

/** Text in one of the design bible's type styles. */
export function Text({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText maxFontSizeMultiplier={HEADINGS.has(variant) ? 1.4 : 2} {...rest} style={[type[variant] as TextStyle, style]} />;
}

/** Hebrew text: right-to-left, aligned to its own start (the right). */
export function HebrewText({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return (
    <RNText
      maxFontSizeMultiplier={HEADINGS.has(variant) ? 1.4 : 2}
      {...rest}
      accessibilityLanguage="he"
      style={[
        type[variant] as TextStyle,
        { writingDirection: "rtl", textAlign: "right", fontFamily: HEADINGS.has(variant) ? fonts.hebrewBold : fonts.hebrew },
        style,
      ]}
    />
  );
}

const HEADINGS = new Set<Variant>(["hero", "h1", "h2", "amount"]);
