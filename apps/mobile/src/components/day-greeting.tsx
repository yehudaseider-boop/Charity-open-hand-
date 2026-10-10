import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { dayLine, greeting, seasonalAppeal, weekAhead } from "@/lib/jewish-calendar";
import { colors, fonts, radius } from "@/theme/tokens";
import { Text } from "./text";

/**
 * "Good Shabbos" / "Chag sameach", today's Hebrew date (it changes at sunset) and
 * where the week is at ("Rosh Chodesh Cheshvan starts tonight: Sunday and Monday"),
 * refreshed every minute while the app is open.
 */
export function DayGreeting() {
  const now = useNow();
  const hello = greeting(now);
  return (
    <View style={{ gap: 2 }} accessibilityRole="text">
      {hello ? <Text style={styles.hello}>{hello}</Text> : null}
      <Text variant="label">{dayLine(now)}</Text>
      {weekAhead(now).map((line) => (
        <Text key={line} style={styles.week}>{line}</Text>
      ))}
    </View>
  );
}

/** A gentle prompt in the weeks before Rosh Hashana, Purim and Pesach. Nothing the rest of the year. */
export function SeasonalCard() {
  const appeal = seasonalAppeal(useNow());
  if (!appeal) return null;
  return (
    <View accessible style={styles.card}>
      <Text style={styles.cardTitle}>{appeal.title}</Text>
      <Text variant="bodyMuted">{appeal.body}</Text>
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
  week: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.indigo, marginTop: 2 },
  hello: { fontFamily: fonts.bodySemibold, fontSize: 18, color: colors.indigo },
  card: { gap: 4, padding: 16, borderRadius: radius.card, backgroundColor: colors.honeySoft, borderWidth: 1, borderColor: colors.honey },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
});
