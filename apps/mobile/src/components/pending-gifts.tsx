import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, TextLink } from "@/components/button";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { ddmmyyyy, hhmm, jhbDay } from "@/lib/format";
import { giftTotalWords } from "@/lib/give-checks";
import { refreshAfterGiving } from "@/lib/give-flow";
import { haptic } from "@/lib/haptics";
import { helpLine } from "@/lib/help";
import { confirmThen } from "@/lib/open-site";
import { afterPaymentMessage, expiredCheckMessage, paymentStatus } from "@/lib/pay-api";
import { settles, type PendingGift } from "@/lib/pending-gift";
import { dropPendingGift, loadPendingGifts, onPendingGiftsChange } from "@/lib/pending-gift-store";
import { SITE_URL } from "@/lib/website";
import { colors, fonts, radius } from "@/theme/tokens";

type Shown =
  | { kind: "checking" }
  | { kind: "waiting"; outcome: "pending" | "review" | "unknown"; at?: Date }
  | { kind: "done"; outcome: "paid" | "failed" | "not_found" | "reversed" | "expired" };

/**
 * A gift we haven't heard the end of (see lib/pending-gift.ts), shown at the top of Progress. This is where the
 * payment page's return link lands when the phone closed the app while the page was open: without it the donor
 * would see no thank-you and no way to check. When Progress opens, each waiting gift is asked about once, and again
 * on "Check again", until the server says paid, didn't go through, or not found; then it is forgotten. A gift kept while
 * Progress is already open is being handled by the give screen, so it isn't asked about twice: it waits for "Check again".
 */
export function PendingGifts() {
  const account = useAccount();
  const preview = account.status === "preview";
  const known = !preview && account.status !== "loading" && account.status !== "agreeing";
  const owner = account.status === "signed-in" ? account.userId : null;
  // A gift left waiting before signing in, given with this account's email, is shown here too (pending-gift-store).
  const accountEmail = account.status === "signed-in" ? account.email : null;
  const [gifts, setGifts] = useState<PendingGift[]>([]);
  // What each gift shows, by charity. A settled one stays on screen (paid, didn't go through) until dismissed.
  const [shown, setShown] = useState<Record<string, Shown>>({});
  const [settled, setSettled] = useState<PendingGift[]>([]);
  const asked = useRef(new Set<string>());
  const { refresh } = account;

  const ask = useCallback(
    async (g: PendingGift) => {
      const reference = g.reference;
      if (!reference || !g.token || !SITE_URL) return;
      setShown((s) => ({ ...s, [g.slug]: { kind: "checking" } }));
      const outcome = await paymentStatus(SITE_URL, reference, g.token);
      if (settles(outcome)) {
        await dropPendingGift(owner, g.slug, reference);
        setSettled((list) => [...list.filter((x) => x.slug !== g.slug), g]);
        setShown((s) => ({ ...s, [g.slug]: { kind: "done", outcome: outcome as "paid" | "failed" | "not_found" | "reversed" | "expired" } }));
        if (outcome === "paid") {
          haptic.success();
          // The gift arrives in the history, and the app's own "a donation arrived" thank-you shows.
          void refreshAfterGiving(refresh);
        }
        return;
      }
      setShown((s) => ({ ...s, [g.slug]: outcome === "unknown"
            ? // No answer from our server: no check time, and never "still confirming".
              { kind: "waiting", outcome: "unknown" }
            : { kind: "waiting", outcome: outcome === "review" ? "review" : "pending", at: new Date() } }));
    },
    [owner, refresh],
  );

  useEffect(() => {
    if (!known) return;
    let live = true;
    const load = (askNow: boolean) =>
      loadPendingGifts(owner, accountEmail).then((list) => {
        if (!live) return;
        setGifts(list);
        if (!askNow) return;
        for (const g of list) {
          const key = `${owner ?? "-"}:${g.slug}:${g.reference ?? g.attemptId}`;
          if (asked.current.has(key)) continue;
          asked.current.add(key);
          void ask(g);
        }
      });
    void load(true);
    const off = onPendingGiftsChange(() => void load(false));
    return () => {
      live = false;
      off();
    };
  }, [known, owner, accountEmail, ask]);

  const open = (g: PendingGift) => router.push({ pathname: "/give/[slug]", params: { slug: g.slug } });
  const dismiss = (slug: string) => {
    setSettled((list) => list.filter((x) => x.slug !== slug));
    setShown((s) => {
      const next = { ...s };
      delete next[slug];
      return next;
    });
  };

  const cards = [...settled, ...gifts.filter((g) => !settled.some((x) => x.slug === g.slug))];
  if (!known || cards.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {cards.map((g) => {
        const s: Shown = shown[g.slug] ?? { kind: "waiting", outcome: "pending" };
        // What the Give button charged, with the card charge named when there was one (older saved gifts have none).
        const total = giftTotalWords(g.summary);
        const sent = new Date(g.sentAt);
        const when = `${hhmm(sent)} on ${ddmmyyyy(jhbDay(sent))}`;
        if (s.kind === "done" && s.outcome === "expired") {
          // The check link is past its 30 days (23/11/2026): nothing more to ask, so it is forgotten on the phone and
          // says where the gift is now. Signed out, one clear next step: sign in to see it.
          return (
            <View key={g.slug} style={[styles.card, styles.waiting]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={styles.title}>We can&apos;t check this gift any more</Text>
              <Text style={styles.body}>{`${total} to ${g.charityName}, started at ${when}. ${expiredCheckMessage(owner !== null)}`}</Text>
              <View style={styles.actions}>
                {owner === null ? <Button label="Sign in to see your gifts" onPress={() => { dismiss(g.slug); router.navigate("/account"); }} /> : null}
                <TextLink label="Done" onPress={() => dismiss(g.slug)} />
              </View>
              <Text variant="label">{helpLine()}</Text>
            </View>
          );
        }
        if (s.kind === "done") {
          const line =
            s.outcome === "paid"
              ? `Your gift of ${total} to ${g.charityName} went through. Thank you.`
              : s.outcome === "failed"
                ? `Your gift of ${total} to ${g.charityName} didn't go through, so nothing was charged.`
                : s.outcome === "reversed"
                  ? `Your gift of ${total} to ${g.charityName} was refunded, so nothing is owed on it.`
                  : `We couldn't find a payment for your gift of ${total} to ${g.charityName}, so nothing was charged.`;
          return (
            <View key={g.slug} style={[styles.card, s.outcome === "paid" ? styles.paid : styles.problem]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={styles.title}>{s.outcome === "paid" ? "Your gift went through" : "Your gift didn't go through"}</Text>
              <Text style={styles.body}>{line}</Text>
              <View style={styles.actions}>
                {s.outcome === "failed" || s.outcome === "not_found" ? <Button label="Try again" onPress={() => { dismiss(g.slug); open(g); }} /> : null}
                <TextLink label="Done" onPress={() => dismiss(g.slug)} />
              </View>
            </View>
          );
        }
        if (!g.reference) {
          // A saved-card charge whose answer was lost: only the give screen can ask again (under the same attempt id).
          return (
            <View key={g.slug} style={[styles.card, styles.waiting]} accessibilityRole="alert">
              <Text style={styles.title}>Your gift may still be going through</Text>
              <Text style={styles.body}>{`${total} to ${g.charityName} from your saved card, started at ${when}. Open it and tap Give: we check first, and never charge twice.`}</Text>
              <Button label="Open your gift" onPress={() => open(g)} />
              <Text variant="label">{helpLine()}</Text>
            </View>
          );
        }
        const checking = s.kind === "checking";
        return (
          <View key={g.slug} style={[styles.card, styles.waiting]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.title}>Checking your gift</Text>
            <Text style={styles.body}>
              {`${total} to ${g.charityName}, started at ${when}. `}
              {checking
                ? "Asking the payment provider whether it went through…"
                : s.kind === "waiting" && s.outcome === "unknown"
                  ? afterPaymentMessage("unknown")
                  : s.kind === "waiting" && s.outcome === "review"
                  ? `Something about this payment needs a person to look at it. Please don't pay again. A person will look at it. To ask about it, contact us.${s.at ? ` Last checked at ${hhmm(s.at)}.` : ""}`
                  : `We haven't heard yet whether it went through. If you finished paying, please don't pay again.${s.kind === "waiting" && s.at ? ` Last checked at ${hhmm(s.at)}.` : ""}`}
            </Text>
            <Button label={checking ? "Checking your payment…" : "Check again"} disabled={checking} onPress={() => void ask(g)} />
            <View style={styles.actions}>
              {g.charged ? null : (
                <TextLink
                  label="I didn't pay: remove it"
                  onPress={() =>
                    confirmThen(
                      "Remove this gift?",
                      "Only if you closed the payment page without paying. If you did pay, the gift still arrives and you'll get an email.",
                      "Remove",
                      () => void (g.reference ? dropPendingGift(owner, g.slug, g.reference) : undefined),
                      "Keep it",
                    )
                  }
                />
              )}
            </View>
            <Text variant="label">{helpLine()}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 18, borderRadius: radius.card, borderWidth: 1.5 },
  waiting: { backgroundColor: colors.lilacSoft, borderColor: colors.lightPurple },
  paid: { backgroundColor: colors.lilacSoft, borderColor: colors.sage },
  problem: { backgroundColor: colors.peach, borderColor: colors.peach },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.navy },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 },
});
