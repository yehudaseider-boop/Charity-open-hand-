import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { dayLine, greeting, seasonalAppeal, weekAhead } from "@/lib/jewish-calendar";
import { ddmmyyyy, jhbToday } from "@/lib/format";
import { useJewishMode } from "@/lib/jewish-mode";
import { colors, fonts, radius } from "@/theme/tokens";
import { Text } from "./text";

/**
 * "Good Shabbos" / "Chag sameach", today's Hebrew date (it changes at sunset) and
 * where the week is at ("Rosh Chodesh Cheshvan starts tonight: Sunday and Monday"),
 * refreshed every minute while the app is open.
 */
export function DayGreeting({ large = false }: { large?: boolean }) {
  const now = useNow();
  const jewish = useJewishMode();
  if (!jewish) {
    // For everyone: the time of day in Johannesburg and today's date.
    return (
      <View style={{ gap: 2 }} accessibilityRole="text">
        <Text accessibilityRole={large ? "header" : undefined} style={large ? styles.helloLarge : styles.hello}>{plainGreeting(now)}</Text>
        <Text variant="label">{weekday(now)} {ddmmyyyy(jhbToday())}</Text>
      </View>
    );
  }
  const hello = greeting(now);
  return (
    <View style={{ gap: 2 }} accessibilityRole="text">
      {hello || large ? <Text accessibilityRole={large ? "header" : undefined} style={large ? styles.helloLarge : styles.hello}>{hello || "Discover"}</Text> : null}
      <Text variant="label">{dayLine(now)}</Text>
      {weekAhead(now).map((line) => (
        <Text key={line} style={styles.week}>{line}</Text>
      ))}
    </View>
  );
}

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

/** "Good morning" before 12:00, "Good afternoon" until 17:00, then "Good evening" (Johannesburg time). */
export function plainGreeting(now: Date): string {
  const hour = (now.getUTCHours() + 2) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function weekday(now: Date): string {
  return WEEKDAYS[new Date(now.getTime() + 2 * 3_600_000).getUTCDay()];
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
  week: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.blue, marginTop: 2 },
  helloLarge: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.blue },
  hello: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.blue },
  card: { gap: 4, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  cardBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
});
