import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { Drop } from "@/components/splash";
import { FadeUp } from "@/components/fade-up";
import { CheckIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { SkeletonBlock } from "@/components/states";
import { TargetEditor } from "@/components/target-editor";
import { Text } from "@/components/text";
import { ddmmyyyy } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { givingYearRange, hebrewYearFor, monthsLeftInGivingYear } from "@/lib/hebrew-year";
import { useAccount } from "@/lib/account";
import { saveTarget } from "@/lib/targets";
import { notify } from "@/lib/open-site";
import { hasBeenWelcomed, markWelcomed } from "@/lib/welcome";
import { colors, fonts, radius, space, touch, type } from "@/theme/tokens";

const STEPS = 3;

const how = [
  { title: "Find a charity here", body: "See what each charity does and whether it issues s18A receipts." },
  { title: "Give on our website", body: "Tap Give and our website opens. You choose the amount and pay there securely." },
  { title: "It all comes back to the app", body: "Sign in with the email you gave with. Your donations, receipts, maaser and chomesh show up here." },
];

/**
 * First open: three short screens (what Givezy is, how giving works, an
 * optional maaser target). Skippable, and shown once per phone.
 * `?welcome=1&step=2` shows it again for design review.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const p = useLocalSearchParams<{ welcome?: string; step?: string }>();
  const forced = p.welcome === "1";
  const [seen, setSeen] = useState<boolean | null>(forced ? false : null);
  const [step, setStep] = useState(() => Math.min(STEPS, Math.max(1, Number(p.step) || 1)));

  useEffect(() => {
    if (!forced) hasBeenWelcomed().then(setSeen);
  }, [forced]);

  // Android's back button steps back through the welcome rather than closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step <= 1) return false;
      setStep(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  if (seen === null) return <View style={styles.screen} />;
  if (seen) return <Redirect href="/discover" />;

  const finish = () => {
    markWelcomed();
    router.replace("/discover");
  };
  const next = () => {
    setStep((s) => Math.min(STEPS, s + 1));
  };

  const now = new Date();
  const hYear = hebrewYearFor(now);

  const skip =
    step < STEPS ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Skip the introduction" hitSlop={8} onPress={finish} style={[styles.skip, { top: insets.top + 8 }]}>
        <Text style={[type.button, { fontSize: 16, color: colors.blue }]}>Skip</Text>
      </Pressable>
    ) : null;

  const dots = (
    <View style={styles.dots} accessible accessibilityLabel={`Step ${step} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={[styles.dot, i + 1 === step && styles.dotOn]} />
      ))}
    </View>
  );

  if (step === 1) {
    return (
      <View style={styles.screen}>
        <View style={styles.hero}>
          <LinearGradient colors={[colors.lilacSoft, colors.cream]} locations={[0, 1]} style={StyleSheet.absoluteFill} />
          <View style={{ position: "absolute", right: -50, top: insets.top + 40 }}><Drop size={190} color={colors.lilac} rotate={22} opacity={0.5} /></View>
          <View style={{ position: "absolute", left: -40, bottom: 10 }}><Drop size={140} color={colors.orange} rotate={-34} opacity={0.28} /></View>
          <View style={{ position: "absolute", left: "52%", bottom: 40 }}><Drop size={60} color={colors.blue} rotate={74} opacity={0.2} /></View>
          <FadeUp style={styles.heroLogo}>
            <Logo width={260} tagline />
          </FadeUp>
          {skip}
        </View>

        <View style={[styles.content, { paddingBottom: insets.bottom + space.md }]}>
          <FadeUp>
            <Text variant="hero" accessibilityRole="header">
              Give to the causes that carry our community.
            </Text>
            <Text variant="bodyMuted" style={styles.support}>
              Find charities, give on our website, and keep your maaser and chomesh in one place.
            </Text>
          </FadeUp>
          <View style={styles.actions}>
            {dots}
            <Button label="Next" onPress={next} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {skip}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: insets.top + 56, paddingBottom: insets.bottom + space.md, gap: space.block }}
      >
        {step === 2 ? (
          <FadeUp key="how" style={{ flex: 1, gap: space.block }}>
            <Text variant="h1" accessibilityRole="header">
              Giving happens on our website.
            </Text>
            <View style={{ gap: 20 }}>
              {how.map((s, i) => (
                <View key={s.title} style={styles.step}>
                  <View style={styles.number}>
                    <Text style={styles.numberText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 18 }}>{s.title}</Text>
                    <Text variant="bodyMuted">{s.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.promise}>
              <View style={{ marginTop: 3 }}>
                <CheckIcon />
              </View>
              <Text style={{ flex: 1, fontSize: 17 }}>Givezy charges no fee on donations.</Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={styles.actions}>
              {dots}
              <Button label="Next" onPress={next} />
            </View>
          </FadeUp>
        ) : (
          <FadeUp key="target" style={{ gap: space.md }}>
            <Text variant="h1" accessibilityRole="header">
              Keep track of your maaser.
            </Text>
            <Text variant="bodyMuted">Optional. Set a target and the app shows how much you have given towards it. You can change it any time on the Giving tab.</Text>
            {/* Targets are saved per person, so wait until we know who is using the phone. */}
            {account.status === "loading" ? (
              <SkeletonBlock height={320} />
            ) : (
            <TargetEditor
              initial={null}
              title="Your target"
              yearEnd={ddmmyyyy(givingYearRange(hYear).end)}
              monthsLeft={monthsLeftInGivingYear(now, hYear)}
              onSave={async (t) => {
                haptic.success();
                const saved = await saveTarget(t, account.status === "signed-in" ? account.userId : null);
                if (!saved.ok) {
                  notify("Your target was not saved", "It could not be saved on this phone. Please try again, or skip for now and set it later on the Giving tab.");
                  return;
                }
                finish();
              }}
              onCancel={finish}
              cancelLabel="Skip for now"
            />
            )}
            {dots}
          </FadeUp>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, overflow: "hidden" },
  hero: { flex: 1, minHeight: 300, overflow: "hidden", borderBottomLeftRadius: 48, borderBottomRightRadius: 48 },
  heroLogo: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  logo: { position: "absolute", left: space.gutter, zIndex: 2 },
  skip: { position: "absolute", right: space.gutter, zIndex: 3, minHeight: touch, minWidth: touch, alignItems: "flex-end", justifyContent: "center" },
  content: { paddingHorizontal: space.gutter, marginTop: 24 },
  support: { marginTop: 12, fontSize: 17, lineHeight: 25 },
  actions: { marginTop: space.block, gap: 16 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.lilac },
  dotOn: { width: 28, backgroundColor: colors.orange },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  number: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: fonts.display, fontSize: 19, color: colors.onInk },
  promise: { flexDirection: "row", gap: 10, padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
});
