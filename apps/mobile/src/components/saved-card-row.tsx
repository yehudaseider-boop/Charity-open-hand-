import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "@/lib/account";
import { SAVED_CARDS } from "@/lib/give-flow";
import { haptic } from "@/lib/haptics";
import { confirmThen, notify } from "@/lib/open-site";
import { cardLabel, fetchSavedCard, removeSavedCard, type SavedCard } from "@/lib/pay-api";
import { SITE_URL } from "@/lib/website";
import { colors, radius } from "@/theme/tokens";
import { TextLink } from "./button";
import { Text } from "./text";

/**
 * The card kept for once-off gifts, with a way to remove it at once. Shown only when saved cards are on
 * (in the app and on the server), the donor is signed in, and a card is saved. The card itself is kept by
 * the payment partner: this only knows its brand and last four digits.
 */
export function SavedCardRow() {
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  const { accessToken } = account;
  const [card, setCard] = useState<SavedCard | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!SAVED_CARDS || !signedIn || !SITE_URL) return;
    let live = true;
    (async () => {
      const token = await accessToken();
      if (!token) return;
      const r = await fetchSavedCard(SITE_URL, token);
      if (live) setCard(r.ok ? r.card : null);
    })();
    return () => {
      live = false;
    };
  }, [signedIn, accessToken]);

  if (!SAVED_CARDS || !signedIn || !card) return null;

  const remove = () =>
    confirmThen("Remove your saved card?", "Your next gift will use the payment page. You can save a card again on any gift.", "Remove card", async () => {
      setBusy(true);
      const token = await accessToken();
      const r = token ? await removeSavedCard(SITE_URL, token) : { ok: false as const, message: "Please sign in again." };
      setBusy(false);
      if (r.ok) {
        haptic.success();
        setCard(null);
      } else notify("Card not removed", r.message);
    });

  return (
    <View style={styles.card} accessible={false}>
      <Text variant="label">Saved card</Text>
      <Text style={styles.name}>{cardLabel(card)}</Text>
      {card.expires ? <Text variant="bodyMuted" style={{ fontSize: 15 }}>Expires {card.expires}. Kept by our payment partner, not by Givezy.</Text> : null}
      <TextLink label={busy ? "Removing…" : "Remove card"} onPress={remove} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: 16, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  name: { fontSize: 18, fontWeight: "600", color: colors.navy },
});
