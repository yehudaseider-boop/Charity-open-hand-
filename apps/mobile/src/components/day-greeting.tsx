import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { dayLine, greeting, seasonalAppeal, weekAhead } from "@/lib/jewish-calendar";
import { useJewishMode } from "@/lib/jewish-mode";
import { colors, fonts, radius } from "@/theme/tokens";
import { Text } from "./text";

/** A gentle prompt in the weeks before Rosh Hashana, Purim and Pesach. Nothing the rest of the year. */
export function SeasonalCard() {
  const now = useNow();
  const jewish = useJewishMode();
  const appeal = jewish ? seasonalAppeal(now) : null;
  if (!appeal) return null;
  return (
    <View accessible style={styles.card}>
      <Text style={styles.cardTitle}>{appeal.title}</Text>
      <Text style={styles.cardBody}>{appeal.body}</Text>
    </View>
  );
}

/**
 * With "Jewish calendar and maaser" on: the greeting for the day, today's Hebrew date (it changes at
 * sunset) and what is coming this week, above the Home heading. Nothing when the switch is off.
 */
export function DayLine() {
  const now = useNow();
  const jewish = useJewishMode();
  if (!jewish) return null;
  const hello = greeting(now);
  const ahead = weekAhead(now)[0];
  return (
    <View accessible style={{ gap: 2 }}>
      <Text style={styles.kicker}>{[hello, dayLine(now)].filter(Boolean).join(" · ")}</Text>
      {ahead ? <Text variant="bodyMuted" style={{ fontSize: 15, lineHeight: 21 }}>{ahead}</Text> : null}
    </View>
  );
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  cardBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 21, color: colors.blue },
});
