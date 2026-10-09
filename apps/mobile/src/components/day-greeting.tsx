import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { dayLine, greeting, seasonalAppeal } from "@/lib/jewish-calendar";
import { colors, radius } from "@/theme/tokens";
import { Text } from "./text";

/** "Good Shabbos" / "Chag sameach" and today's Hebrew date, refreshed while the app is open. */
export function DayGreeting() {
  const now = useNow();
  const hello = greeting(now);
  return (
    <View style={{ gap: 2 }} accessibilityRole="text">
      {hello ? <Text style={styles.hello}>{hello}</Text> : null}
      <Text variant="label">{dayLine(now)}</Text>
    </View>
  );
}

/** A gentle prompt in the weeks before Rosh Hashana, Purim and Pesach. Nothing the rest of the year. */
export function SeasonalCard() {
  const appeal = seasonalAppeal(useNow());
  if (!appeal) return null;
  return (
    <Pressable onPress={() => router.push("/discover")} accessibilityRole="button" accessibilityHint="Find a charity" style={styles.card}>
      <Text style={styles.cardTitle}>{appeal.title}</Text>
      <Text variant="bodyMuted">{appeal.body}</Text>
    </Pressable>
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
  hello: { fontFamily: "Archivo_700Bold", fontSize: 18, color: colors.accent },
  card: { gap: 4, padding: 16, borderRadius: radius.card, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.hairline },
  cardTitle: { fontFamily: "Archivo_700Bold", fontSize: 17, color: colors.ink },
});
