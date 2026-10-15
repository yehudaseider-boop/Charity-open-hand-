import { parseRandToCents } from "@shared/money";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { CheckRow, SwitchRow } from "@/components/switch-row";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { gifts as sampleGifts, type GivingKind } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { useCharity } from "@/lib/directory";
import { loadDetails, saveDetails, forgetDetails } from "@/lib/donor-details";
import { rand } from "@/lib/format";
import { openGivingPage, refreshAfterGiving } from "@/lib/give-flow";
import { GIVE_IN_APP } from "@/lib/give-entry";
import { givingKindLabels } from "@/lib/giving";
import { haptic } from "@/lib/haptics";
import { lastKind, quickAmounts, startPayment, type RememberedDetails } from "@/lib/pay-api";
import { SITE_URL } from "@/lib/website";
import { colors, fonts, radius, space } from "@/theme/tokens";

/**
 * Give inside the app, on one screen, in as few taps as possible: past amounts are one tap, what
 * the gift counts as starts from last time, and the donor's details can be remembered on the
 * phone. The button shows the exact total and goes straight to the payment provider's own secure
 * page for the card; the app never sees a card number. The server re-checks the total.
 */
export default function Give() {
  const insets = useSafeAreaInsets();
  const { slug, kind: kindParam } = useLocalSearchParams<{ slug: string; kind?: string }>();
  const { charity } = useCharity(slug);
  const account = useAccount();
  const preview = account.status === "preview";
  const history = preview ? sampleGifts : (account.live?.gifts ?? []);
  const quick = slug ? quickAmounts(history, slug) : [];

  const [amount, setAmount] = useState("");
  const startKind = kindParam && kindParam in givingKindLabels ? (kindParam as GivingKind) : slug ? lastKind(history, slug) : null;
  const [kind, setKind] = useState<GivingKind | null>(startKind);
  const [monthly, setMonthly] = useState(false);
  const [extra, setExtra] = useState(false);
  const [extraAmount, setExtraAmount] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState(account.email ?? "");
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(false);
  const [remembered, setRemembered] = useState<RememberedDetails | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [want18a, setWant18a] = useState(false);
  const [idNumber, setIdNumber] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // The monthly authorisation names an exact total: it counts only for the total that was ticked.
  const [authorisedTotal, setAuthorisedTotal] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadDetails(account.userId).then((d) => {
      if (!live || !d) return;
      setRemembered(d);
      setRemember(true);
      setFirst(d.first_name);
      setLast(d.last_name);
      setEmail(d.email);
      setPhone(d.phone);
    });
    return () => {
      live = false;
    };
  }, [account.userId]);

  if (!GIVE_IN_APP) {
    return (
      <View style={styles.screen}>
        <TopBar title="Give" />
        <View style={{ padding: space.gutter, gap: 12 }}>
          <Text variant="h2">Giving in the app isn&apos;t on yet</Text>
          <Text variant="bodyMuted">For now you can give on our website.</Text>
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }
  if (!charity) return <View style={styles.screen}><TopBar title="Give" /></View>;

  const gift = parseRandToCents(amount);
  const contribution = extra ? parseRandToCents(extraAmount) : 0;
  const total = gift !== null && contribution !== null ? gift + contribution : null;
  const authorised = monthly && total !== null && authorisedTotal === total;
  const s18aAvailable = charity.issues18a;
  const showDetailFields = !remembered || editingDetails;

  function check() {
    const e: Record<string, string> = {};
    if (!gift) e.amount = "Enter an amount in Rand, for example 180 or 180.50";
    if (extra && !contribution) e.extra = "Enter your contribution in Rand, or switch it off";
    if (!kind) e.giving_kind = "Choose what this donation counts as";
    if (!first.trim()) e.first_name = "Enter your first name";
    if (!last.trim()) e.last_name = "Enter your surname";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email address";
    if (s18aAvailable && want18a && !idNumber.trim()) e.id_number = "Enter your SA ID number for the s18A receipt";
    if (monthly && !authorised) e.monthly_authorised = "Please confirm you authorise the monthly payments";
    if (!agreed) e.agreed = "Please confirm so we can record your donation";
    if ((e.first_name || e.last_name || e.email) && remembered) setEditingDetails(true);
    return e;
  }

  async function give() {
    if (busy) return;
    const e = check();
    setErrors(e);
    setMessage(null);
    if (Object.keys(e).length || total === null) {
      haptic.tap();
      setMessage("Please check the highlighted fields.");
      return;
    }
    if (!SITE_URL) {
      setMessage(`This is the preview, so no payment is taken. On the live app this opens the secure payment page for ${rand(total)}.`);
      return;
    }
    setBusy(true);
    const details = {
      donor_type: "individual" as const,
      email: email.trim(),
      first_name: first.trim(),
      last_name: last.trim(),
      phone: phone.trim() || undefined,
      wants_18a: s18aAvailable && want18a,
      id_number: s18aAvailable && want18a ? idNumber.trim() || undefined : undefined,
      giving_kind: kind!,
      is_anonymous: anonymous,
      monthly,
      monthly_authorised: authorised,
      age_confirmed: agreed,
      popia_consent: agreed,
    };
    const r = await startPayment(SITE_URL, { slug: charity!.slug, giftCents: gift!, contributionCents: contribution ?? 0, shownTotalCents: total, details });
    if (!r.ok) {
      setBusy(false);
      setMessage(r.quote ? `${r.message} The total is now ${rand(r.quote.totalCents)}.` : r.message);
      if (r.quote) setAuthorisedTotal(null);
      if (r.fieldErrors) setErrors(r.fieldErrors);
      return;
    }
    const mine = { first_name: details.first_name, last_name: details.last_name, email: details.email, phone: details.phone ?? "" };
    if (remember) await saveDetails(account.userId, mine);
    else if (remembered) await forgetDetails(account.userId);
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
  const buttonLabel = total ? `Give ${rand(total)}${monthly ? " every month" : ""}` : "Give";

  return (
    <View style={styles.screen}>
      <TopBar title={`Give to ${charity.nameEn}`} fallback="/discover" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 10 }}>
            <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={err("amount")} placeholder="0" />
            {quick.length ? (
              <View style={styles.chips} accessibilityLabel="Amounts you gave before">
                {quick.map((c) => {
                  const on = gift === c;
                  return (
                    <Pressable key={c} onPress={() => { haptic.tap(); setAmount(String(c / 100)); }} accessibilityRole="button" accessibilityLabel={`Give ${rand(c)}`} accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.onInk }]}>{rand(c)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="label" style={{ color: colors.ink }}>Counts as (only you see this)</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {(Object.keys(givingKindLabels) as GivingKind[]).map((k) => {
                const on = kind === k;
                return (
                  <Pressable key={k} onPress={() => { haptic.tap(); setKind(k); }} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && { color: colors.onInk }]}>{givingKindLabels[k]}</Text>
                  </Pressable>
                );
              })}
            </View>
            {err("giving_kind") ? <Text variant="label" style={{ color: colors.danger }}>{err("giving_kind")}</Text> : null}
          </View>

          <SwitchRow label="Give every month" description="The same amount each month until you cancel." value={monthly} onChange={setMonthly} />
          <SwitchRow
            label="Add a contribution to Givezy"
            description={monthly ? "Optional. It helps us keep Givezy running, and repeats each month with your gift." : "Optional. It helps us keep Givezy running. Your gift to the charity stays whole."}
            value={extra}
            onChange={setExtra}
          />
          {extra ? <Field label="Contribution" prefix="R" keyboardType="decimal-pad" value={extraAmount} onChangeText={setExtraAmount} error={err("extra")} placeholder="0" /> : null}

          {showDetailFields ? (
            <View style={{ gap: 14 }}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>About you</Text>
              <Field label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" error={err("first_name")} />
              <Field label="Surname" value={last} onChangeText={setLast} autoComplete="family-name" error={err("last_name")} />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={err("email")} helper="Your confirmation is sent here." />
              <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={err("phone")} />
              <SwitchRow label="Remember my details on this phone" description="Your name, email and phone, so next time you don't type them. Never your ID number." value={remember} onChange={setRemember} />
            </View>
          ) : (
            <View style={styles.giver}>
              <View style={{ flex: 1 }}>
                <Text variant="label">Giving as</Text>
                <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 16 }} numberOfLines={1}>{first} {last}</Text>
                <Text variant="label" numberOfLines={1}>{email}</Text>
              </View>
              <Pressable onPress={() => setEditingDetails(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={{ fontFamily: fonts.bodySemibold, color: colors.blue }}>Change</Text>
              </Pressable>
            </View>
          )}

          {s18aAvailable ? (
            <>
              <SwitchRow label="I want an s18A receipt" description="For your tax return. This charity can issue them." value={want18a} onChange={setWant18a} />
              {want18a ? <Field label="SA ID number" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" error={err("id_number")} /> : null}
            </>
          ) : null}
          <SwitchRow label="Give anonymously" description="Your name won't appear publicly." value={anonymous} onChange={setAnonymous} />

          {monthly && total ? (
            <View style={{ gap: 8 }}>
              <Text variant="bodyMuted">
                Your first payment is today. After that we collect the same amount on this day of each month (the last day, in shorter months) from the same card, until you cancel. Monthly gifts are by card only. You can pause or cancel any time in the Giving tab.
              </Text>
              <CheckRow
                label={`I authorise Givezy to collect ${rand(total)} from my card every month until I cancel.`}
                value={authorised}
                onChange={(v) => setAuthorisedTotal(v ? total : null)}
                error={err("monthly_authorised")}
              />
            </View>
          ) : null}
        </ScrollView>
        {/* Pinned: the agreement and the Give button are always in reach. */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <CheckRow label="I am 18 or older, I agree to the Terms and Privacy Policy, and that Givezy records this donation." value={agreed} onChange={setAgreed} error={err("agreed") ?? err("age_confirmed") ?? err("popia_consent")} />

          {message ? <Text accessibilityRole="alert" style={{ color: SITE_URL ? colors.danger : colors.ink }}>{message}</Text> : null}
          <View style={{ gap: 8 }}>
            <Button label={busy ? "Opening the payment page" : buttonLabel} disabled={busy} onPress={give} />
            <Text variant="label" style={{ textAlign: "center" }}>
              {total ? `${rand(gift ?? 0)} to ${charity.nameEn}${contribution ? ` and ${rand(contribution)} to Givezy` : ""}. ` : ""}You enter your card on a secure payment page, never in the app.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.blue },
  footer: { paddingHorizontal: space.gutter, paddingTop: 12, gap: 10, backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: colors.hairline },
  giver: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
});
