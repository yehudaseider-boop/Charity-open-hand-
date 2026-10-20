import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rand } from "@/lib/format";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Blob } from "./blob";
import type { Goal } from "@/lib/goals";
import { Button, TextLink } from "./button";
import { GoalEditor } from "./goal-editor";
import { GoalRing } from "./goal-ring";
import { CheckIcon } from "./icons";
import { ShareButton } from "./share-button";
import { Text } from "./text";

/**
 * "Small yes first": after a first gift, one invitation to set a giving goal, with the gift already
 * counted. Only given on a first confirmed gift, to someone with no goal, and only once ever.
 */
export type GoalInvite = {
  jewish: boolean;
  labels: string[];
  signedIn: boolean;
  /** Where a goal stands with this gift counted. `targetCents` is null for a share of income not yet logged. */
  progressFor(goal: Goal): { percent: number | null; givenCents: number; targetCents: number | null };
  /** Keep the goal on the phone. False if it couldn't be saved. */
  save(goal: Goal): Promise<boolean>;
  /** Called once the invitation is on screen, so it never comes back. */
  shown(): void;
  goHome(): void;
};

export type SentGift = {
  /** The gift to the charity (not the contribution to Givezy). */
  cents: number;
  /** The optional contribution to Givezy paid with it. */
  contributionCents: number;
  monthly: boolean;
  email: string;
  /** Finished on the payment page, but the provider hasn't confirmed it yet. */
  confirming: boolean;
  /** The donor's main goal with this gift counted, if they set one and it counts. */
  goal: { name: string; percent: number; givenCents: number; targetCents: number } | null;
  /** Months in a row with a gift, this one included. */
  streak: number;
  badges: string[];
  /** Present only when the donor should be invited to set a goal now. */
  invite?: GoalInvite | null;
};

const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

/**
 * After a gift: the amount on blue, what it does in the charity's own words (left out when the
 * charity hasn't written one), the goal ring, the streak, a few honest badges, and sharing the cause
 * without the amount.
 */
export function GiftSent({ gift, charityName, impact, shareText, onDone }: { gift: SentGift; charityName: string; impact: string | null; shareText: string | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const invite = gift.confirming ? null : (gift.invite ?? null);
  const [phase, setPhase] = useState<"invite" | "editing" | "set">("invite");
  const [made, setMade] = useState<Goal | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const marked = useRef(false);
  const shown = invite?.shown;
  useEffect(() => {
    if (shown && !marked.current) {
      marked.current = true;
      shown();
    }
  }, [shown]);
  const progress = made && invite ? invite.progressFor(made) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.top, { paddingTop: insets.top + 28 }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Blob size={170} color={colors.orange} rotate={25} style={{ right: -95, top: insets.top - 110 }} />
          <Blob size={130} color={colors.lilac} rotate={-20} stretch={1.2} style={{ left: -100, bottom: -60 }} />
        </View>
        {gift.confirming ? null : <View style={styles.tick}><CheckIcon size={28} color={colors.blue} /></View>}
        <Text style={styles.kicker} accessibilityRole="header">
          {gift.monthly
            ? `${gift.confirming ? "Confirming your monthly donation" : "Monthly donation set up"} · ${rand(gift.cents)} a month`
            : `${gift.confirming ? "Confirming your gift" : "Gift sent"} · ${rand(gift.cents)} to ${charityName}`}
        </Text>
        {gift.contributionCents > 0 ? <Text style={styles.sub}>And {rand(gift.contributionCents)} to Givezy{gift.monthly ? " a month" : ""}. Thank you.</Text> : null}
        <Text style={styles.big}>
          {gift.confirming ? "Waiting for the payment provider to confirm. This usually takes a minute." : (impact ?? `Thank you for giving to ${charityName}.`)}
        </Text>
        <Text style={styles.sub}>
          {gift.confirming
            ? `Your confirmation goes to ${gift.email} in a minute. Please don't pay again.`
            : `A confirmation is on its way to ${gift.email}.`}
        </Text>
      </View>

      <View style={styles.body}>
        {gift.confirming ? (
          <View style={styles.streak}>
            <Text style={{ flex: 1, color: colors.navy, fontSize: 16, lineHeight: 22 }}>
              Your gift shows in Progress, with your goal and streak, as soon as it&apos;s confirmed. You don&apos;t need to do anything else.
            </Text>
          </View>
        ) : null}

        {!gift.confirming && gift.goal ? (
          <View style={styles.card}>
            <GoalRing percent={gift.goal.percent} size={96} stroke={10} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardKicker}>{gift.goal.name}</Text>
              <Text style={styles.cardAmount}>{rand(gift.goal.givenCents)}</Text>
              <Text variant="bodyMuted" style={{ fontSize: 15 }}>of {rand(gift.goal.targetCents)}</Text>
            </View>
          </View>
        ) : null}

        {!gift.confirming && gift.streak > 1 ? (
          <View style={styles.streak}>
            <View style={styles.streakDot} />
            <Text style={{ flex: 1, color: colors.navy, fontFamily: fonts.bodySemibold, fontSize: 16 }}>{months(gift.streak)} in a row of giving.</Text>
          </View>
        ) : null}

        {!gift.confirming && gift.badges.length ? (
          <View style={styles.badges}>
            {gift.badges.map((b) => (
              <View key={b} style={styles.badge}><Text style={styles.badgeText}>{b}</Text></View>
            ))}
          </View>
        ) : null}

        {invite && phase === "invite" ? (
          <View style={styles.invite}>
            <Text variant="h2" accessibilityRole="header">Make it a habit</Text>
            <Text variant="bodyMuted">Set a yearly giving goal. Your first gift already counts.</Text>
            <Button variant="cta" label="Set my goal" onPress={() => setPhase("editing")} />
            <TextLink label="Maybe later" onPress={invite.goHome} />
          </View>
        ) : null}

        {invite && phase === "editing" ? (
          <View style={{ gap: 10 }}>
            {saveFailed ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                We couldn&apos;t save your goal on this phone. Nothing was lost: please try again, or set it later on the Progress tab.
              </Text>
            ) : null}
            <GoalEditor
              initial={null}
              labels={invite.labels}
              jewish={invite.jewish}
              title="Set your goal"
              cancelLabel="Back"
              onCancel={() => setPhase("invite")}
              onSave={async (g) => {
                const ok = await invite.save(g);
                setSaveFailed(!ok);
                if (ok) {
                  setMade(g);
                  setPhase("set");
                }
              }}
            />
          </View>
        ) : null}

        {invite && phase === "set" && made && progress ? (
          <View style={{ gap: 10 }}>
            <View style={styles.card}>
              {progress.targetCents && progress.percent !== null ? <GoalRing percent={progress.percent} size={96} stroke={10} /> : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.cardKicker}>{made.name}</Text>
                <Text style={styles.cardAmount}>{rand(progress.givenCents)}</Text>
                <Text variant="bodyMuted" style={{ fontSize: 15 }}>
                  {progress.targetCents
                    ? `of ${rand(progress.targetCents)}. Your first gift is already counted.`
                    : "so far, your first gift counted. Log your income on the Progress tab to see your target."}
                </Text>
              </View>
            </View>
            {invite.signedIn ? null : (
              <View style={styles.streak}>
                <Text style={{ flex: 1, color: colors.navy, fontSize: 16, lineHeight: 22 }}>
                  Sign in with {gift.email} and your gifts are counted towards your goal.
                </Text>
                <TextLink label="Sign in" onPress={() => router.push("/account")} />
              </View>
            )}
          </View>
        ) : null}

        <View style={{ gap: 8, alignItems: "center" }}>
          <ShareButton text={shareText} label={`Share ${charityName} on WhatsApp`} />
          <Text variant="label">Share the cause. Your amount stays private.</Text>
        </View>

        <Button label="Done" onPress={invite ? invite.goHome : onDone} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { backgroundColor: colors.blue, paddingHorizontal: space.gutter, paddingBottom: 64, gap: 10, overflow: "hidden" },
  tick: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.lilac },
  big: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.onInk },
  sub: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.lilacSoft },
  body: { paddingHorizontal: space.gutter, marginTop: -40, gap: space.block },
  card: { flexDirection: "row", alignItems: "center", gap: 18, padding: 18, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.lightPurple },
  cardKicker: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
  cardAmount: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.navy },
  streak: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  streakDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.orange },
  invite: { gap: 10, padding: 18, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.lightPurple },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.lightPurple },
  badgeText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.navy },
});
