import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { seasonalAppeal } from "@/lib/jewish-calendar";
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
});
