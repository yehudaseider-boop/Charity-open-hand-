import { parseRandToCents } from "@shared/money";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { CampaignCard } from "@/components/campaign-card";
import { Field } from "@/components/field";
import { CheckIcon } from "@/components/icons";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { CheckRow, SwitchRow } from "@/components/switch-row";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { gifts as sampleGifts } from "@/data/giving";
import { LabelPicker } from "@/components/label-picker";
import { useLabelSuggestions } from "@/lib/use-labels";
import { cleanLabel, LEGACY_KIND_LABELS } from "@shared/donations/labels";
import { useAccount } from "@/lib/account";
import { useCharity } from "@/lib/directory";
import { loadDetails, saveDetails, forgetDetails } from "@/lib/donor-details";
import { rand } from "@/lib/format";
import { openGivingPage, refreshAfterGiving } from "@/lib/give-flow";
import { GIVE_IN_APP } from "@/lib/give-entry";
import { haptic } from "@/lib/haptics";
import { openSite, openUrl } from "@/lib/open-site";
import { afterPaymentMessage, centsToInput, checkReady, lastLabel, paymentStatus, quickAmounts, startPayment, type ReadyReply, type RememberedDetails } from "@/lib/pay-api";
import { donateUrl, SITE_URL } from "@/lib/website";
import { colors, fonts, radius, space } from "@/theme/tokens";

/**
 * Give inside the app, on one screen, in as few taps as possible: past amounts are one tap, what
 * the gift counts as starts from last time, and the donor's details can be remembered on the
 * phone. The button shows the exact total and goes straight to the payment provider's own secure
 * page for the card; the app never sees a card number. The server re-checks the total.
 *
 * Before the form shows, the server says whether giving in the app is open (if not, the donor
 * gives on the website), whether this charity can take a payment now, and whether the chosen
 * campaign is still running. After the payment page closes, the app asks whether it went
 * through: paid is thanked, anything else keeps the form so the donor can try again.
 */
export default function Give() {
  const insets = useSafeAreaInsets();
  const { slug, kind: kindParam, label: labelParam, campaign: campaignParam } = useLocalSearchParams<{ slug: string; kind?: string; label?: string; campaign?: string }>();
  const { charity, failed, retry } = useCharity(slug);
  const account = useAccount();
  const preview = account.status === "preview";
  const history = preview ? sampleGifts : (account.live?.gifts ?? []);
  const quick = slug ? quickAmounts(history, slug) : [];

  // Asked of the server once per visit (and on "Try again"). The preview has no server.
  const [ready, setReady] = useState<ReadyReply | undefined>(undefined);
  const [readyAttempt, setReadyAttempt] = useState(0);
  const [amount, setAmount] = useState("");
  // Starts from the label passed in (older links pass ?kind=), else the one used last time at this charity.
  const legacy = kindParam && Object.hasOwn(LEGACY_KIND_LABELS, kindParam) ? LEGACY_KIND_LABELS[kindParam] : null;
  const startLabel = cleanLabel(labelParam) || legacy || (slug ? lastLabel(history, slug) : null);
  const [label, setLabel] = useState<string | null>(startLabel);
  const labelSuggestions = useLabelSuggestions();
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
  // Signed in with an earlier s18A gift: reuse that ID number (the server fills it in; only the last four digits reach the phone).
  const [useSavedId, setUseSavedId] = useState(true);
  const [note, setNote] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  // Switched on, the donor still chooses "in honour of" or "in memory of": never chosen for them.
  const [dedicating, setDedicating] = useState(false);
  const [dedicate, setDedicate] = useState<"honour" | "memory" | null>(null);
  const [dedicationName, setDedicationName] = useState("");
  const [agreed, setAgreed] = useState(false);
  // The monthly authorisation names an exact total: it counts only for the total that was ticked.
  const [authorisedTotal, setAuthorisedTotal] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<false | "opening" | "checking">(false);
  // Paid (or finished and being confirmed), shown here for donors whose giving history won't show it.
  const [done, setDone] = useState<null | { cents: number; email: string; confirming: boolean }>(null);

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

  const { accessToken } = account;
  useEffect(() => {
    if (!GIVE_IN_APP || !SITE_URL || !slug) return;
    let live = true;
    accessToken()
      .then((token) => checkReady(SITE_URL, slug, campaignParam, undefined, token))
      .then((r) => live && setReady(r));
    return () => {
      live = false;
    };
  }, [slug, campaignParam, readyAttempt, accessToken]);

  const websiteUrl = slug ? donateUrl(SITE_URL, slug, label, campaignParam) : null;
  const closedHere = !GIVE_IN_APP || (ready && !ready.ok && ready.closed);
  if (closedHere) {
    return (
      <View style={styles.screen}>
        <TopBar title="Give" />
        <View style={{ padding: space.gutter, gap: 12 }}>
          <Text variant="h2">Give on our website</Text>
          <Text variant="bodyMuted">Giving inside the app isn&apos;t on yet. Our website takes you through it in a minute.</Text>
          <Button label="Give on our website" onPress={() => openUrl(websiteUrl)} />
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const waitingForServer = Boolean(SITE_URL) && ready === undefined;
  const serverFailed = ready && !ready.ok && !ready.closed;
  // Loading (undefined), not found (null) or could not load: never a blank screen.
  if (!charity || waitingForServer || serverFailed) {
    const retryAll = () => {
      retry();
      setReady(undefined);
      setReadyAttempt((n) => n + 1);
    };
    return (
      <View style={styles.screen}>
        <TopBar title="Give" />
        <View style={{ padding: space.gutter, gap: space.md }}>
          {failed || serverFailed ? (
            <ErrorState body="We couldn't load this charity. Check your connection and try again." onRetry={retryAll} />
          ) : charity === null ? (
            <EmptyState title="Charity not found" body="It may have been removed from the directory." action={{ label: "Back to Discover", onPress: () => router.replace("/discover") }} />
          ) : (
            <>
              <SkeletonBlock height={64} />
              <SkeletonBlock height={220} />
            </>
          )}
        </View>
      </View>
    );
  }

  const server = ready?.ok ? ready : null;
  if (server && !server.accepting) {
    return (
      <View style={styles.screen}>
        <TopBar title="Give" />
        <View style={{ padding: space.gutter }}>
          <EmptyState title="Not taking donations yet" body={`${charity.nameEn} can't take online donations right now. Please try again later.`} action={{ label: "Back", onPress: () => router.back() }} />
        </View>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.screen}>
        <TopBar title="Thank you" />
        <View style={{ padding: space.gutter, gap: 14, alignItems: "center" }}>
          <View style={styles.badge}>
            <CheckIcon size={34} color={colors.onInk} />
          </View>
          <Text variant="h1" style={{ fontSize: 30, lineHeight: 36, textAlign: "center" }} accessibilityRole="header">Thank you</Text>
          <Text style={styles.doneBody}>
            {done.confirming
              ? `We're confirming your ${rand(done.cents)} to ${charity.nameEn}. Your confirmation email goes to ${done.email} in a minute. Please don't pay again.`
              : `Your ${rand(done.cents)} to ${charity.nameEn} went through. A confirmation is on its way to ${done.email}.`}
          </Text>
          <Button label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/discover"))} style={{ alignSelf: "stretch" }} />
        </View>
      </View>
    );
  }

  // The campaign counts only once the server says it is still running (so a gift never quietly
  // goes to the charity in general because the app hadn't loaded it yet). The preview has no server.
  const campaignId = campaignParam && (server ? server.campaignOpen : (charity.campaigns ?? []).some((c) => c.id === campaignParam)) ? campaignParam : undefined;
  const campaignEnded = Boolean(campaignParam) && !campaignId;
  const campaign = campaignId ? ((charity.campaigns ?? []).find((c) => c.id === campaignId) ?? null) : null;
  const minGift = server?.minGiftCents ?? 0;
  const minExtra = server?.minContributionCents ?? 0;
  const gift = parseRandToCents(amount);
  const contribution = extra ? parseRandToCents(extraAmount) : 0;
  const total = gift !== null && contribution !== null ? gift + contribution : null;
  const isMonthly = monthly && !campaignId;
  const authorised = isMonthly && total !== null && authorisedTotal === total;
  const s18aAvailable = server ? server.receiptsAvailable : charity.issues18a;
  const savedLast4 = server?.savedIdLast4 ?? null;
  const usingSavedId = s18aAvailable && want18a && Boolean(savedLast4) && useSavedId;
  const showDetailFields = !remembered || editingDetails;

  function check() {
    const e: Record<string, string> = {};
    if (!gift) e.amount = "Enter an amount in Rand, for example 180 or 180.50";
    else if (gift < minGift) e.amount = `The smallest donation is ${rand(minGift)}`;
    if (extra && !contribution) e.extra = "Enter your contribution in Rand, or switch it off";
    else if (extra && contribution !== null && contribution < minExtra) e.extra = `The smallest contribution is ${rand(minExtra)}, or switch it off`;
    if (!first.trim()) e.first_name = "Enter your first name";
    if (!last.trim()) e.last_name = "Enter your surname";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email address";
    if (s18aAvailable && want18a && !usingSavedId && !idNumber.trim()) e.id_number = "Enter your SA ID number for the s18A receipt";
    if (usingSavedId && email.trim().toLowerCase() !== (account.email ?? "").toLowerCase()) e.id_number = `Your saved ID number goes with ${account.email}. Give with that email, or use a different number.`;
    if (dedicating && !dedicate) e.dedication_kind = "Choose in honour of or in memory of";
    if (dedicating && !dedicationName.trim()) e.dedication_name = "Enter their name, or switch the dedication off";
    if (isMonthly && !authorised) e.monthly_authorised = "Please confirm you authorise the monthly payments";
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
    setBusy("opening");
    const details = {
      donor_type: "individual" as const,
      email: email.trim(),
      first_name: first.trim(),
      last_name: last.trim(),
      phone: phone.trim() || undefined,
      wants_18a: s18aAvailable && want18a,
      id_number: s18aAvailable && want18a && !usingSavedId ? idNumber.trim() || undefined : undefined,
      message: note.trim() || undefined,
      giving_label: cleanLabel(label) ?? undefined,
      is_anonymous: anonymous,
      dedication_kind: dedicating && dedicate ? dedicate : undefined,
      dedication_name: dedicating ? dedicationName.trim() : undefined,
      monthly: isMonthly,
      monthly_authorised: authorised,
      age_confirmed: agreed,
      popia_consent: agreed,
    };
    const r = await startPayment(
      SITE_URL,
      { slug: charity!.slug, giftCents: gift!, contributionCents: contribution ?? 0, shownTotalCents: total, campaignId, useSavedId: usingSavedId || undefined, details },
      undefined,
      usingSavedId ? await account.accessToken() : null,
    );
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

    let shown: "returned" | "closed";
    try {
      shown = await openGivingPage(r.redirectUrl, (u, returnTo) => WebBrowser.openAuthSessionAsync(u, returnTo, { preferEphemeralSession: true }));
    } catch {
      setBusy(false);
      setMessage("We couldn't open the payment page. Please try again.");
      return;
    }
    // Closing the page doesn't say whether the donor paid: ask. Coming back from a finished
    // payment, the provider's confirmation can take a few seconds, so ask once more.
    setBusy("checking");
    let outcome = await paymentStatus(SITE_URL, r.reference, r.token);
    if (outcome === "pending" && shown === "returned") {
      await new Promise((ok) => setTimeout(ok, 3_000));
      outcome = await paymentStatus(SITE_URL, r.reference, r.token);
    }
    setBusy(false);
    const finished = outcome === "paid" || (outcome === "pending" && shown === "returned");
    if (!finished) {
      haptic.tap();
      setMessage(afterPaymentMessage(outcome === "paid" ? "pending" : outcome));
      return;
    }
    haptic.success();
    void refreshAfterGiving(account.refresh);
    // A signed-in donor giving with their account's email sees the thank-you in the Giving tab
    // (already open underneath; replace would stack a second tab bar). Anyone else, here.
    const intoHistory = account.status === "signed-in" && (account.email ?? "").toLowerCase() === details.email.toLowerCase();
    if (intoHistory) router.dismissTo("/giving");
    else setDone({ cents: total, email: details.email, confirming: outcome !== "paid" });
  }

  const err = (k: string) => errors[k];
  const buttonLabel = busy === "opening" ? "Opening the payment page" : busy === "checking" ? "Checking your payment" : total ? `Give ${rand(total)}${isMonthly ? " every month" : ""}` : "Give";

  return (
    <View style={styles.screen}>
      <TopBar title={`Give to ${charity.nameEn}`} fallback="/discover" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {campaign ? <CampaignCard campaign={campaign} compact /> : null}
          {campaignEnded ? (
            <View style={styles.note} accessibilityRole="alert">
              <Text>That campaign has ended. Your gift goes to {charity.nameEn}.</Text>
            </View>
          ) : null}
          <View style={{ gap: 10 }}>
            <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={err("amount")} placeholder="0" helper={minGift ? `At least ${rand(minGift)}.` : undefined} />
            {quick.length ? (
              <View style={styles.chips} accessibilityLabel="Amounts you gave before">
                {quick.map((c) => {
                  const on = gift === c;
                  return (
                    <Pressable key={c} onPress={() => { haptic.tap(); setAmount(centsToInput(c)); }} accessibilityRole="button" accessibilityLabel={`Give ${rand(c)}`} accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.onInk }]}>{rand(c)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <LabelPicker value={label} onChange={setLabel} suggestions={labelSuggestions} />

          {campaignId ? null : <SwitchRow label="Give every month" description="The same amount each month until you cancel." value={monthly} onChange={setMonthly} />}
          <SwitchRow
            label="Add a contribution to Givezy"
            description={isMonthly ? "Optional. It helps us keep Givezy running, and repeats each month with your gift." : "Optional. It helps us keep Givezy running. Your gift to the charity stays whole."}
            value={extra}
            onChange={setExtra}
          />
          {extra ? <Field label="Contribution" prefix="R" keyboardType="decimal-pad" value={extraAmount} onChangeText={setExtraAmount} error={err("extra")} placeholder="0" helper={minExtra ? `At least ${rand(minExtra)}.` : undefined} /> : null}

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
              {want18a && savedLast4 ? (
                <View style={{ gap: 8 }}>
                  <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Your ID number">
                    {([true, false] as const).map((saved) => {
                      const on = useSavedId === saved;
                      return (
                        <Pressable key={String(saved)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setUseSavedId(saved); }} style={[styles.chip, on && styles.chipOn]}>
                          <Text style={[styles.chipText, on && { color: colors.onInk }]}>{saved ? `My ID ending ${savedLast4}` : "A different number"}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {useSavedId ? <Text variant="label">From your last s18A gift. Kept safely on our server, never on this phone.</Text> : null}
                  {useSavedId && err("id_number") ? <Text variant="label" style={{ color: colors.danger }}>{err("id_number")}</Text> : null}
                </View>
              ) : null}
              {want18a && !usingSavedId ? <Field label="SA ID number" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" error={err("id_number")} /> : null}
            </>
          ) : null}
          <SwitchRow
            label="Give anonymously"
            description={`Your name won't appear on public pages, campaign lists or live totals. ${charity.nameEn} still sees your details, because it needs them to record your donation${s18aAvailable ? " and issue your s18A receipt" : ""}.`}
            value={anonymous}
            onChange={setAnonymous}
          />

          <Field
            label={`Message to ${charity.nameEn} (optional)`}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            error={err("message")}
            helper="The charity sees it with your donation."
          />

          {/* Optional: in honour of, or in memory of, someone. */}
          <SwitchRow
            label="Dedicate this donation"
            description="In honour of, or in memory of, someone. The charity sees the name; it is not on your s18A receipt."
            value={dedicating}
            onChange={(v) => {
              setDedicating(v);
              if (!v) setDedicate(null);
            }}
          />
          {dedicating ? (
            <View style={{ gap: 8 }}>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Dedication">
                {(["honour", "memory"] as const).map((k) => {
                  const on = dedicate === k;
                  return (
                    <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setDedicate(k); }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.onInk }]}>{k === "honour" ? "In honour of" : "In memory of"}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {err("dedication_kind") && !dedicate ? <Text variant="label" style={{ color: colors.danger }}>{err("dedication_kind")}</Text> : null}
              <Field label="Their name" value={dedicationName} onChangeText={setDedicationName} autoCapitalize="words" maxLength={80} error={err("dedication_name")} />
            </View>
          ) : null}

          {isMonthly && total ? (
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
          <CheckRow
            label={`I am 18 or older. I agree to the Terms and the Privacy Policy, and that my details are shared with ${charity.nameEn} so they can record my donation.`}
            value={agreed}
            onChange={setAgreed}
            error={err("agreed") ?? err("age_confirmed") ?? err("popia_consent")}
          />
          <View style={styles.links}>
            <Pressable onPress={() => openSite("/terms")} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.link}>Read the Terms</Text>
            </Pressable>
            <Pressable onPress={() => openSite("/privacy")} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.link}>Read the Privacy Policy</Text>
            </Pressable>
          </View>

          {message ? <Text accessibilityRole="alert" style={{ color: SITE_URL ? colors.danger : colors.ink }}>{message}</Text> : null}
          <View style={{ gap: 8 }}>
            <Button label={buttonLabel} disabled={busy !== false} onPress={give} />
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
  note: { padding: 14, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
  links: { flexDirection: "row", gap: 18, marginLeft: 36 },
  link: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue, textDecorationLine: "underline" },
  badge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center", marginTop: 12 },
  doneBody: { fontSize: 17, lineHeight: 25, textAlign: "center" },
});
