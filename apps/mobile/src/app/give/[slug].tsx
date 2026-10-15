import { parseRandToCents } from "@shared/money";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/states";
import { CheckRow, SwitchRow } from "@/components/switch-row";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { useAccount } from "@/lib/account";
import { useCharity } from "@/lib/directory";
import { rand } from "@/lib/format";
import { IN_APP_GIVING, openGivingPage, refreshAfterGiving } from "@/lib/give-flow";
import { givingKindLabels } from "@/lib/giving";
import { haptic } from "@/lib/haptics";
import { requestQuote, startPayment, type DonorDetails, type Pricing } from "@/lib/pay-api";
import { SITE_URL } from "@/lib/website";
import { colors, radius, space } from "@/theme/tokens";
import type { GivingKind } from "@/data/giving";

/**
 * Give a once-off or monthly gift inside the app. The donor chooses the amount, what it counts as and who
 * they are here; the card is entered on the payment provider's own secure page, opened in a sheet.
 * The app never sees a card number. Only reachable when the in-app giving switch is on.
 */
export default function Give() {
  const insets = useSafeAreaInsets();
  const { slug, kind: kindParam } = useLocalSearchParams<{ slug: string; kind?: string }>();
  const { charity } = useCharity(slug);
  const account = useAccount();

  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<GivingKind | null>(kindParam && kindParam in givingKindLabels ? (kindParam as GivingKind) : null);
  const [extra, setExtra] = useState(false);
  const [extraAmount, setExtraAmount] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState(account.email ?? "");
  const [phone, setPhone] = useState("");
  const [want18a, setWant18a] = useState(false);
  const [idNumber, setIdNumber] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [dedicate, setDedicate] = useState<"honour" | "memory" | null>(null);
  const [dedicationName, setDedicationName] = useState("");
  const [monthly, setMonthly] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [age, setAge] = useState(false);
  const [consent, setConsent] = useState(false);

  const [quote, setQuote] = useState<Pricing | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!IN_APP_GIVING || !SITE_URL) {
    return (
      <View style={styles.screen}>
        <TopBar title="Give" />
        <EmptyState title="Giving in the app isn't on yet" body="For now you can give on our website." action={{ label: "Back", onPress: () => router.back() }} />
      </View>
    );
  }
  if (!charity) {
    return (
      <View style={styles.screen}>
        <TopBar title="Give" />
      </View>
    );
  }

  const gift = parseRandToCents(amount);
  const contribution = extra ? parseRandToCents(extraAmount) : 0;
  const s18aAvailable = charity.issues18a;

  const details = (): DonorDetails => ({
    donor_type: "individual",
    email: email.trim(),
    first_name: first.trim(),
    last_name: last.trim(),
    phone: phone.trim() || undefined,
    wants_18a: s18aAvailable && want18a,
    id_number: s18aAvailable && want18a ? idNumber.trim() || undefined : undefined,
    giving_kind: kind ?? "tzedaka",
    is_anonymous: anonymous,
    dedication_kind: dedicate ?? undefined,
    dedication_name: dedicate ? dedicationName.trim() : undefined,
    monthly,
    monthly_authorised: monthly && authorised,
    age_confirmed: age,
    popia_consent: consent,
  });

  function localErrors() {
    const e: Record<string, string> = {};
    if (gift === null || gift === 0) e.amount = "Enter an amount in Rand, for example 180 or 180.50";
    if (extra && (contribution === null || contribution === 0)) e.extra = "Enter your contribution in Rand, or switch it off";
    if (!kind) e.kind = "Choose what this donation counts as";
    if (!first.trim()) e.first_name = "Enter your first name";
    if (!last.trim()) e.last_name = "Enter your surname";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email address";
    if (s18aAvailable && want18a && !idNumber.trim()) e.id_number = "Enter your SA ID number for the s18A receipt";
    if (!age) e.age_confirmed = "You must be 18 or older to give";
    if (!consent) e.popia_consent = "Please agree so we can record your donation";
    return e;
  }

  async function review() {
    const e = localErrors();
    setErrors(e);
    setMessage(null);
    if (Object.keys(e).length) {
      haptic.tap();
      return;
    }
    setBusy(true);
    const r = await requestQuote(SITE_URL!, charity!.slug, gift!, contribution ?? 0);
    setBusy(false);
    if (r.ok) setQuote(r.quote);
    else setMessage(r.message);
  }

  async function pay() {
    if (!quote || busy) return;
    if (monthly && !authorised) {
      setErrors((e) => ({ ...e, monthly_authorised: "Please confirm you authorise the monthly payments" }));
      return;
    }
    setBusy(true);
    setMessage(null);
    const r = await startPayment(SITE_URL!, {
      slug: charity!.slug,
      giftCents: quote.amountCents,
      contributionCents: quote.contributionCents,
      shownTotalCents: quote.totalCents,
      details: details(),
    });
    if (!r.ok) {
      setBusy(false);
      setMessage(r.message);
      if (r.quote) {
        // The total changed: the donor must see and authorise the new amount.
        setQuote(r.quote);
        setAuthorised(false);
      }
      if (r.fieldErrors) {
        setErrors(r.fieldErrors);
        // Only the authorisation is answered on this step; anything else is fixed on the form.
        const onForm = Object.keys(r.fieldErrors).some((k) => k !== "monthly_authorised");
        if (onForm) {
          setQuote(null);
          setAuthorised(false);
        }
      }
      return;
    }
    try {
      await openGivingPage(r.redirectUrl, (u, returnTo) => WebBrowser.openAuthSessionAsync(u, returnTo, { preferEphemeralSession: true }));
      void refreshAfterGiving(account.refresh);
      router.replace("/giving");
    } catch {
      setMessage("We couldn't open the payment page. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k];
  return (
    <View style={styles.screen}>
      <TopBar title={`Give to ${charity.nameEn}`} fallback="/discover" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {quote ? (
            <View style={{ gap: 18 }}>
              <Text variant="h2">Check your gift</Text>
              <View style={styles.summary}>
                <Row label={`To ${charity.nameEn}`} value={rand(quote.amountCents)} />
                {quote.contributionCents > 0 ? <Row label="To Givezy" value={rand(quote.contributionCents)} /> : null}
                <Row label={monthly ? "You pay today, then every month" : "You pay"} value={rand(quote.totalCents)} strong />
              </View>
              {dedicate && dedicationName.trim() ? (
                <Text variant="bodyMuted">{dedicate === "honour" ? "In honour of" : "In memory of"} {dedicationName.trim()}</Text>
              ) : null}
              {monthly ? (
                <>
                  <Text variant="bodyMuted">
                    Your first payment is today. After that we collect the same amount on this day of each month (the last day, in shorter months) from the same card, until you cancel. Monthly gifts are by card only. You can pause or cancel any time in the Giving tab.
                  </Text>
                  <CheckRow
                    label={`I authorise Givezy to collect ${rand(quote.totalCents)} from my card every month until I cancel.`}
                    value={authorised}
                    onChange={(v) => {
                      setAuthorised(v);
                      if (v) {
                        setErrors(({ monthly_authorised: _, ...rest }) => rest);
                        setMessage(null);
                      }
                    }}
                    error={err("monthly_authorised")}
                  />
                </>
              ) : null}
              <Text variant="bodyMuted">Counts as {kind ? givingKindLabels[kind] : ""}. Only you see this. You enter your card on a secure payment page, not in the app.</Text>
              {message ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message}</Text> : null}
              <Button label="Continue to payment" disabled={busy} onPress={pay} />
              <Button label="Change something" variant="secondary" disabled={busy} onPress={() => { setQuote(null); setAuthorised(false); setMessage(null); }} />
            </View>
          ) : (
            <>
              <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={err("amount")} placeholder="0" />

              <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="This donation counts as">
                <Text variant="label" style={{ color: colors.ink }}>What does this donation count as? Only you see this.</Text>
                {(Object.keys(givingKindLabels) as GivingKind[]).map((k) => {
                  const on = kind === k;
                  return (
                    <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setKind(k); }} style={[styles.choice, on && styles.choiceOn]}>
                      <Text style={{ fontSize: 17, color: on ? colors.blue : colors.ink }}>{givingKindLabels[k]}</Text>
                    </Pressable>
                  );
                })}
                {err("kind") || err("giving_kind") ? <Text variant="label" style={{ color: colors.danger }}>{err("kind") ?? err("giving_kind")}</Text> : null}
              </View>

              <SwitchRow label="Give every month" description="The same amount each month until you cancel." value={monthly} onChange={(v) => { setMonthly(v); if (!v) setAuthorised(false); }} />
              <SwitchRow label="Add a contribution to Givezy" description={monthly ? "Optional. It helps us keep Givezy running, and repeats each month with your gift." : "Optional. It helps us keep Givezy running. Your gift to the charity stays whole."} value={extra} onChange={setExtra} />
              {extra ? <Field label="Contribution" prefix="R" keyboardType="decimal-pad" value={extraAmount} onChangeText={setExtraAmount} error={err("extra")} placeholder="0" /> : null}

              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>About you</Text>
              <Field label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" error={err("first_name")} />
              <Field label="Surname" value={last} onChangeText={setLast} autoComplete="family-name" error={err("last_name")} />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={err("email")} helper="Your confirmation is sent here." />
              <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={err("phone")} />

              {s18aAvailable ? (
                <>
                  <SwitchRow label="I want an s18A receipt" description="For your tax return. This charity can issue them." value={want18a} onChange={setWant18a} />
                  {want18a ? <Field label="SA ID number" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" error={err("id_number")} /> : null}
                </>
              ) : null}
              <SwitchRow label="Give anonymously" description="The charity won't see your name." value={anonymous} onChange={setAnonymous} />

              {/* Optional: in honour of, or in memory of, someone. */}
              <SwitchRow label="Dedicate this donation" description="In honour of, or in memory of, someone. The charity sees the name; it is not on your s18A receipt." value={dedicate !== null} onChange={(v) => setDedicate(v ? "memory" : null)} />
              {dedicate ? (
                <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Dedication">
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["honour", "memory"] as const).map((k) => {
                      const on = dedicate === k;
                      return (
                        <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setDedicate(k); }} style={[styles.choice, { flex: 1 }, on && styles.choiceOn]}>
                          <Text style={{ fontSize: 17, color: on ? colors.blue : colors.ink }}>{k === "honour" ? "In honour of" : "In memory of"}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Field label="Their name" value={dedicationName} onChangeText={setDedicationName} autoCapitalize="words" maxLength={80} error={err("dedication_name")} />
                </View>
              ) : null}

              <CheckRow label="I am 18 or older." value={age} onChange={setAge} error={err("age_confirmed")} />
              <CheckRow label="I agree to the Terms and Privacy Policy, and that Givezy records this donation." value={consent} onChange={setConsent} error={err("popia_consent")} />

              {message ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message}</Text> : null}
              <Button label="Review" disabled={busy} onPress={review} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={{ flexShrink: 1, fontWeight: strong ? "600" : "400" }}>{label}</Text>
      <Text style={{ fontWeight: strong ? "600" : "400" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  choice: { minHeight: 52, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, justifyContent: "center", backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.blue, borderWidth: 1.5 },
  summary: { backgroundColor: colors.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, padding: 16, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
