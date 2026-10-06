import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { type } from "@/theme/tokens";

type Variant = keyof typeof type;

/** Text in one of the design bible's type styles. */
export function Text({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText {...rest} style={[type[variant] as TextStyle, style]} />;
}

/** Hebrew text: right-to-left, aligned to its own start (the right). */
export function HebrewText({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return (
    <RNText
      {...rest}
      accessibilityLanguage="he"
      style={[type[variant] as TextStyle, { writingDirection: "rtl", textAlign: "right" }, style]}
    />
  );
}
