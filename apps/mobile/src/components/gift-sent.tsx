import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rand } from "@/lib/format";
import { colors, fonts, radius, space } from "@/theme/tokens";
import type { Goal } from "@/lib/goals";
import { Button, TextLink } from "./button";
import { GoalEditor } from "./goal-editor";
import { GoalRing } from "./goal-ring";
import { Bubbles, People } from "./people";
import { CheckIcon } from "./icons";
import { ShareButton } from "./share-button";
import { Text } from "./text";

/**
 * "Small yes first": after a first gift, one invitation to set a giving goal, with the gift already
 * counted. Only given on a first confirmed gift, to someone with no goal, and only once ever.
 */
export type GoalInvite = {
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
  const { width } = useWindowDimensions();
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
      {/* The thank-you moment, in the For charities page's look (30/10/2026): white, people giving,
          soft bubbles drifting round them, the words in deep ink with the amount line in blue. */}
      <View style={[styles.top, { paddingTop: insets.top + 20 }]}>
        <Bubbles
          items={[
            { size: 280, color: colors.lilacSoft, at: { left: -140, top: insets.top - 80 } },
            { size: 220, color: colors.peach, at: { right: -110, top: insets.top + 120 } },
            { size: 16, color: colors.orange, float: true, at: { left: 34, top: insets.top + 150 } },
            { size: 30, color: colors.blue, ring: true, float: true, at: { right: 30, top: insets.top + 40 } },
            { size: 10, color: colors.blue, float: true, at: { right: 70, top: insets.top + 230 } },
          ]}
        />
        <View style={styles.art}>
          <People name={gift.confirming ? "mailSent" : "loveIt"} width={gift.confirming ? Math.min(190, width - 140) : Math.min(120, width - 200)} />
          {gift.confirming ? null : <View style={styles.tick}><CheckIcon size={24} color={colors.onInk} /></View>}
        </View>
        <Text style={styles.kicker} accessibilityRole="header">
          {gift.monthly
            ? gift.confirming
              ? `Confirming your monthly donation · ${rand(gift.cents)} a month`
              : `${rand(gift.cents)} a month to ${charityName}, set up`
            : gift.confirming
              ? `Confirming your gift · ${rand(gift.cents)} to ${charityName}`
              : `${rand(gift.cents)} to ${charityName}, done`}
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
              Your gift shows in Progress, with your goal and streak, as soon as it&apos;s confirmed. If no confirmation email comes, the payment didn&apos;t go through: you can give again from the charity&apos;s page.
            </Text>
          </View>
        ) : null}

        {!gift.confirming && gift.goal ? (
          <View style={styles.blueCard}>
            <Bubbles
              items={[
                { size: 90, color: colors.lilac, ring: true, at: { right: -30, bottom: -34 } },
                { size: 14, color: colors.orange, float: true, at: { right: 26, top: 20 } },
              ]}
            />
            <GoalRing percent={gift.goal.percent} size={96} stroke={10} onBlue />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.blueKicker} numberOfLines={2}>{gift.goal.name}</Text>
              <Text style={styles.blueAmount}>{rand(gift.goal.givenCents)}</Text>
              <Text style={styles.blueSub}>of {rand(gift.goal.targetCents)}</Text>
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
            <Bubbles items={[{ size: 120, color: colors.peach, at: { right: -44, top: -50 } }, { size: 12, color: colors.orange, float: true, at: { right: 30, top: 24 } }]} />
            <Text variant="h2" accessibilityRole="header">Make it a <Text variant="h2" style={styles.key}>habit</Text></Text>
            <Text variant="bodyMuted">Set a giving goal for this tax year, and watch it fill up as you give.</Text>
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
                    ? `of ${rand(progress.targetCents)}.${progress.givenCents > 0 ? " Your first gift is already counted." : ""}`
                    : `so far${progress.givenCents > 0 ? ", your first gift counted" : ""}. Log your income on the Progress tab to see your target.`}
                </Text>
              </View>
            </View>
            {invite.signedIn ? null : (
              <View style={styles.streak}>
                <Text style={{ flex: 1, color: colors.navy, fontSize: 16, lineHeight: 22 }}>
                  Sign in with {gift.email} and your gifts are counted towards your goal.
                </Text>
                <TextLink label="Sign in" onPress={() => router.dismissTo("/account")} />
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.shareSpot}>
          <ShareButton text={shareText} label={`Share ${charityName} on WhatsApp`} />
          <Text variant="label">Share the cause. Your amount stays private.</Text>
        </View>

        <Button label="Done" onPress={invite ? invite.goHome : onDone} />
        {/* Straight to the gift history, with the giving screens closed behind it. */}
        <TextLink label="See your giving" onPress={() => router.dismissTo("/giving")} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.gutter, paddingBottom: 28, gap: 10, overflow: "hidden" },
  art: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
  tick: { position: "absolute", left: "50%", bottom: 0, marginLeft: 38, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, borderWidth: 4, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.blue },
  big: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.navy },
  sub: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.muted },
  body: { paddingHorizontal: space.gutter, gap: 20 },
  card: { flexDirection: "row", alignItems: "center", gap: 18, padding: 20, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  cardKicker: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
  cardAmount: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 36, color: colors.navy },
  blueCard: { flexDirection: "row", alignItems: "center", gap: 18, padding: 20, borderRadius: radius.card, backgroundColor: colors.blue, overflow: "hidden" },
  blueKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 19, color: colors.lilacSoft },
  blueAmount: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 36, color: colors.onInk },
  blueSub: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.lilacSoft },
  streak: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: radius.card, backgroundColor: colors.peach },
  streakDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.orange },
  invite: { gap: 12, padding: 22, borderRadius: radius.card, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  key: { color: colors.blue },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.lilacSoft, borderWidth: 1.5, borderColor: colors.lightPurple },
  badgeText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.navy },
  shareSpot: { gap: 8, alignItems: "center", paddingVertical: 4 },
});
