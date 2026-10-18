import { parseRandToCents } from "@shared/money";
import { isValidSaIdNumber } from "@shared/sa-id";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { CampaignCard } from "@/components/campaign-card";
import { Field } from "@/components/field";
import { GiftSent, type SentGift } from "@/components/gift-sent";
import { Blob } from "@/components/blob";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { CheckRow, SwitchRow } from "@/components/switch-row";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { gifts as sampleGifts, givenElsewhere as sampleElsewhere, sampleGoals } from "@/data/giving";
import { LabelPicker } from "@/components/label-picker";
import { useLabelSuggestions } from "@/lib/use-labels";
import { cleanLabel, LEGACY_KIND_LABELS } from "@shared/donations/labels";
import { useAccount } from "@/lib/account";
import { useCharity } from "@/lib/directory";
import { loadDetails, saveDetails, forgetDetails } from "@/lib/donor-details";
import { jhbToday, rand } from "@/lib/format";
import { counts, goalProgress, type Goal } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-store";
import { loadIncome } from "@/lib/income-store";
import type { IncomeEntry } from "@/lib/ledger";
import { monthsInARow } from "@/lib/streak";
import { useStoredRecord } from "@/lib/use-stored-record";
import { tapAmounts } from "@shared/charity/suggested-amounts";
import { charityShareText } from "@/lib/share";
import { openGivingPage, refreshAfterGiving, SAVED_CARDS } from "@/lib/give-flow";
import { GIVE_IN_APP } from "@/lib/give-entry";
import { haptic } from "@/lib/haptics";
import { openSite, openUrl } from "@/lib/open-site";
import { afterPaymentMessage, afterPaymentTone, cardLabel, centsToInput, checkReady, lastLabel, newAttemptId, paymentStatus, quickAmounts, startPayment, type MessageTone, type ReadyReply, type RememberedDetails } from "@/lib/pay-api";
import { helpLine } from "@/lib/help";
import { donateUrl, SITE_URL } from "@/lib/website";
import { colors, fonts, radius, space } from "@/theme/tokens";

const noGoals: Goal[] = [];
const noIncome: IncomeEntry[] = [];

/** How a problem is named in "2 things to fix: ...". */
const FIELD_NAMES: Record<string, string> = {
  amount: "the amount", extra: "your contribution", first_name: "your first name", last_name: "your surname", email: "your email",
  phone: "your phone number", id_number: "your ID number", address_line1: "your street address", suburb: "your suburb", city: "your city or town",
  postal_code: "your postal code", dedication_kind: "the dedication", dedication_name: "the dedication", monthly_authorised: "the monthly authorisation",
  agreed: "the agreement tick", age_confirmed: "the agreement tick", popia_consent: "the agreement tick", message: "your message",
};
/** Which part of the form a problem is in, for scrolling to it. */
const SECTION_OF: Record<string, string> = {
  amount: "amount", extra: "extra", first_name: "details", last_name: "details", email: "details", phone: "details",
  id_number: "s18a", address_line1: "s18a", suburb: "s18a", city: "s18a", postal_code: "s18a", dedication_kind: "dedication",
  dedication_name: "dedication", monthly_authorised: "monthly", agreed: "agree", age_confirmed: "agree", popia_consent: "agree", message: "note",
};

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
  const { slug, kind: kindParam, label: labelParam, campaign: campaignParam, demo } = useLocalSearchParams<{ slug: string; kind?: string; label?: string; campaign?: string; demo?: string }>();
  const { charity, failed, retry } = useCharity(slug);
  const account = useAccount();
  const preview = account.status === "preview";
  const history = preview ? sampleGifts : (account.live?.gifts ?? []);
  const elsewhere = preview ? sampleElsewhere : (account.live?.elsewhere ?? []);
  const pastAmounts = slug ? quickAmounts(history, slug) : [];
  const owner = account.status === "signed-in" ? account.userId : null;
  const ownerKnown = !preview && account.status !== "loading" && account.status !== "agreeing";
  const goals = useStoredRecord<Goal[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadGoals, initial: preview ? sampleGoals : noGoals });
  const goal = goals.value[0] ?? null;
  // Income logged on the Progress tab, so a goal set as a share of income has its real target.
  const income = useStoredRecord<IncomeEntry[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadIncome, initial: noIncome });
  // "First gift" only when we know for sure: signed in, fresh giving history from the server, and none in it.
  const firstEver = account.status === "signed-in" && account.live !== null && !account.live.fromCache && account.live.gifts.length === 0;

  // Asked of the server once per visit (and on "Try again"). The preview has no server.
  const [ready, setReady] = useState<ReadyReply | undefined>(undefined);
  // One-tap amounts: the donor's own recent amounts first, then the ones the charity chose. Givezy
  // never suggests a figure of its own, so a new donor at a charity that chose none types the amount.
  const quick = tapAmounts(pastAmounts, ready?.ok ? ready.suggestedCents : []);
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
  // The donor's address, for the s18A receipt (SARS asks for it). With "my ID ending 1234" it can be left
  // empty: the server then uses the address from that same earlier gift.
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [town, setTown] = useState("");
  const [postal, setPostal] = useState("");
  // Signed in with an earlier s18A gift: reuse that ID number (the server fills it in; only the last four digits reach the phone).
  const [useSavedId, setUseSavedId] = useState(true);
  // Saved card (switched off until SAVED_CARDS is on in the app and on the server): pay with the one kept, or a new card.
  const [useSavedCard, setUseSavedCard] = useState(true);
  const [saveCard, setSaveCard] = useState(false);
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
  // What happened, as a red error or a calm note while we wait; `help` adds how to reach a person.
  const [message, setMessageState] = useState<{ text: string; tone: MessageTone | "info"; help?: boolean } | null>(null);
  const setMessage = (text: string | null, tone: MessageTone | "info" = "error", help = false) => setMessageState(text ? { text, tone, help } : null);
  // Where each part of the form sits, so a failed tap scrolls to the first thing to fix.
  const scrollRef = useRef<ScrollView>(null);
  const [sectionY, setSectionY] = useState<Record<string, number>>({});
  const at = (key: string) => (e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y;
    setSectionY((was) => (was[key] === y ? was : { ...was, [key]: y }));
  };
  const [busy, setBusy] = useState<false | "opening" | "checking">(false);
  // Two taps in the same frame both see busy as false; the ref stops the second at once.
  const busyRef = useRef(false);
  // A saved-card charge whose answer was lost is asked about again under the same id, never charged twice.
  const attemptRef = useRef<string | null>(null);
  // Paid (or finished and being confirmed), shown here for donors whose giving history won't show it.
  const [done, setDone] = useState<SentGift | null>(null);
  // Preview of the after-gift screen for design review: ?demo=sent.
  const [demoShown, setDemoShown] = useState(false);

  // The proud screen says thank you here, so the tabs' "a donation arrived" thank-you doesn't pop up again over it.
  const { arrived, dismissArrived } = account;
  useEffect(() => {
    if (done && arrived.length) dismissArrived();
  }, [done, arrived, dismissArrived]);

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
      .then((r) => live && setReady(r))
      // Anything unexpected shows "Try again", never an endless skeleton.
      .catch(() => live && setReady({ ok: false, message: "We couldn't reach Givezy. Please check your connection and try again." }));
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
          {serverFailed && !failed ? (
            <View style={{ gap: 12 }} accessibilityRole="alert">
              <Text variant="h2">We can&apos;t open giving in the app right now</Text>
              <Text variant="bodyMuted">Nothing has been charged. Check your connection and try again, or give on our website instead.</Text>
              <Button label="Try again" onPress={retryAll} />
              <Button label="Give on our website" variant="secondary" onPress={() => openUrl(websiteUrl)} />
              <Text variant="label">{helpLine()}</Text>
            </View>
          ) : failed ? (
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

  const finish = () => {
    dismissArrived();
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  };
  if (done) {
    return <GiftSent gift={done} charityName={charity.nameEn} impact={charity.impact ?? null} shareText={charityShareText(SITE_URL, charity)} onDone={finish} />;
  }

  // The campaign counts only once the server says it is still running (so a gift never quietly
  // goes to the charity in general because the app hadn't loaded it yet). The preview has no server.
  const campaignId = campaignParam && (server ? server.campaignOpen : (charity.campaigns ?? []).some((c) => c.id === campaignParam)) ? campaignParam : undefined;
  const campaignEnded = Boolean(campaignParam) && !campaignId;
  const campaign = campaignId ? ((charity.campaigns ?? []).find((c) => c.id === campaignId) ?? null) : null;
  const minGift = server?.minGiftCents ?? 0;
  const minExtra = server?.minContributionCents ?? 0;
  const maxGift = server?.maxGiftCents ?? null;
  const gift = parseRandToCents(amount);
  const contribution = extra ? parseRandToCents(extraAmount) : 0;
  const total = gift !== null && contribution !== null ? gift + contribution : null;
  const isMonthly = monthly && !campaignId;
  const authorised = isMonthly && total !== null && authorisedTotal === total;
  const s18aAvailable = server ? server.receiptsAvailable : charity.issues18a;
  const savedLast4 = server?.savedIdLast4 ?? null;
  const usingSavedId = s18aAvailable && want18a && Boolean(savedLast4) && useSavedId;
  const showDetailFields = !remembered || editingDetails;
  // Saved cards need a signed-in donor giving with their account's own email, and a once-off gift (monthly gifts are set up on the payment page).
  // Design review: ?demo=card shows the saved-card choices in the preview, which has no server.
  const demoCard = preview && demo === "card" && SAVED_CARDS;
  const cardsOpen = demoCard || (SAVED_CARDS && server?.savedCardsOpen === true && account.status === "signed-in" && !isMonthly && email.trim().toLowerCase() === (account.email ?? "").toLowerCase());
  const savedCard = demoCard ? { brand: "visa", last4: "4242", expires: "12/2030" } : cardsOpen ? (server?.savedCard ?? null) : null;
  const payWithSaved = Boolean(savedCard) && useSavedCard;
  const offerSave = cardsOpen && !payWithSaved;

  /** What the after-gift screen shows: this gift added to the goal and the streak, and honest badges. */
  function sentSummary(cents: number, mail: string, confirming: boolean): SentGift {
    const today = jhbToday();
    const rows = [...history, ...elsewhere, { date: today, cents, label: cleanLabel(label) }];
    const pr = goal && counts(goal, cleanLabel(label)) ? goalProgress(goal, rows, income.value, today) : null;
    const badges = [
      firstEver ? "First gift on Givezy" : null,
      isMonthly ? "Monthly giver" : null,
      s18aAvailable && want18a ? "s18A receipt at tax time" : null,
      pr && goal ? `Counts towards ${goal.name}` : null,
    ].filter((b): b is string => Boolean(b));
    return {
      cents,
      email: mail,
      confirming,
      goal: pr && goal && pr.targetCents ? { name: goal.name, percent: Math.floor((pr.givenCents * 100) / pr.targetCents), givenCents: pr.givenCents, targetCents: pr.targetCents } : null,
      streak: monthsInARow(rows.map((r) => r.date), today),
      badges,
    };
  }
  if (demo === "sent" && !SITE_URL && !demoShown) {
    setDemoShown(true);
    setDone(sentSummary(18_000, "sarah@example.co.za", false));
  }

  function check() {
    const e: Record<string, string> = {};
    if (!gift) e.amount = "Enter an amount in Rand, for example 180 or 180.50";
    else if (gift < minGift) e.amount = `The smallest donation is ${rand(minGift)}`;
    else if (maxGift !== null && gift > maxGift) e.amount = `The largest donation in the app is ${rand(maxGift)}. For more, please contact us.`;
    if (extra && !contribution) e.extra = "Enter your contribution in Rand, or switch it off";
    else if (extra && contribution !== null && contribution < minExtra) e.extra = `The smallest contribution is ${rand(minExtra)}, or switch it off`;
    if (!first.trim()) e.first_name = "Enter your first name";
    if (!last.trim()) e.last_name = "Enter your surname";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email address";
    if (s18aAvailable && want18a && !usingSavedId && !idNumber.trim()) e.id_number = "Enter your SA ID number for the s18A receipt";
    else if (s18aAvailable && want18a && !usingSavedId && !isValidSaIdNumber(idNumber)) e.id_number = "That doesn't look like a valid SA ID number. Check the 13 digits";
    if (s18aAvailable && want18a && !usingSavedId) {
      if (!street.trim()) e.address_line1 = "Enter your street address. SARS needs it on the receipt";
      if (!town.trim()) e.city = "Enter your city or town";
      if (!/^\d{4}$/.test(postal.trim())) e.postal_code = "Enter your 4-digit postal code";
    }
    if (usingSavedId && email.trim().toLowerCase() !== (account.email ?? "").toLowerCase()) e.id_number = `Your saved ID number goes with ${account.email}. Give with that email, or use a different number.`;
    if (dedicating && !dedicate) e.dedication_kind = "Choose in honour of or in memory of";
    if (dedicating && !dedicationName.trim()) e.dedication_name = "Enter their name, or switch the dedication off";
    if (isMonthly && !authorised) e.monthly_authorised = "Please confirm you authorise the monthly payments";
    if (!agreed) e.agreed = "Please confirm so we can record your donation";
    if ((e.first_name || e.last_name || e.email) && remembered) setEditingDetails(true);
    return e;
  }

  /** "2 things to fix: your surname and postal code." and scroll up to the first of them. */
  function showProblems(e: Record<string, string>) {
    const keys = Object.keys(e);
    const names = [...new Set(keys.map((k) => FIELD_NAMES[k] ?? "a highlighted field"))];
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    setMessage(names.length === 1 ? `One thing to fix: ${list}.` : `${names.length} things to fix: ${list}.`);
    const ys = keys.map((k) => sectionY[SECTION_OF[k] ?? ""]).filter((y): y is number => typeof y === "number");
    if (ys.length) scrollRef.current?.scrollTo({ y: Math.max(0, Math.min(...ys) - 12), animated: true });
  }

  async function give() {
    if (busy || busyRef.current) return;
    busyRef.current = true;
    try {
      await giveOnce();
    } finally {
      busyRef.current = false;
    }
  }

  async function giveOnce() {
    const e = check();
    setErrors(e);
    setMessage(null);
    if (Object.keys(e).length || total === null) {
      haptic.tap();
      showProblems(e);
      return;
    }
    if (!SITE_URL) {
      setMessage(`This is the preview, so no payment is taken. On the live app this opens the secure payment page for ${rand(total)}.`, "info");
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
      address_line1: s18aAvailable && want18a ? street.trim() || undefined : undefined,
      suburb: s18aAvailable && want18a ? suburb.trim() || undefined : undefined,
      city: s18aAvailable && want18a ? town.trim() || undefined : undefined,
      postal_code: s18aAvailable && want18a ? postal.trim() || undefined : undefined,
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
      {
        slug: charity!.slug,
        giftCents: gift!,
        contributionCents: contribution ?? 0,
        shownTotalCents: total,
        campaignId,
        useSavedId: usingSavedId || undefined,
        saveCard: (offerSave && saveCard) || undefined,
        useSavedCard: payWithSaved || undefined,
        attemptId: payWithSaved ? (attemptRef.current ??= newAttemptId()) : undefined,
        details,
      },
      undefined,
      usingSavedId || payWithSaved || (offerSave && saveCard) ? await account.accessToken() : null,
    );
    // A refusal ends this attempt. No answer keeps its id for the next tap, and so does "already
    // used with other details": the first tap may have charged, so a changed amount keeps hitting
    // the same id (and the server's refusal) until this screen is closed. A saved-card charge keeps
    // its id until we know it was paid or declined (below), so "try again" can never charge twice.
    if (!r.ok && !("noReply" in r) && !r.attemptMismatch) attemptRef.current = null;
    if (r.ok && !r.charged) attemptRef.current = null;
    if (!r.ok) {
      setBusy(false);
      // A declined saved card: offer the payment page, where another card can be used.
      if (r.savedCardDeclined) setUseSavedCard(false);
      if ("noReply" in r) {
        setMessage(
          payWithSaved
            ? "We couldn't hear back from Givezy, so we don't know yet whether your card was charged. Your details are still here. Tap Give again: we check first, and never charge twice."
            : "We couldn't reach Givezy, so nothing was charged. Your details are still here. Check your connection and tap Give again.",
          payWithSaved ? "wait" : "error",
        );
        return;
      }
      if (r.fieldErrors) {
        setErrors(r.fieldErrors);
        // A problem with a detail folded away under "Giving as" opens it, so it can be seen and fixed.
        if (remembered && ["first_name", "last_name", "email", "phone"].some((k) => r.fieldErrors?.[k])) setEditingDetails(true);
        showProblems(r.fieldErrors);
        return;
      }
      setMessage(r.quote ? `${r.message} The total is now ${rand(r.quote.totalCents)}.` : r.message);
      if (r.quote) setAuthorisedTotal(null);
      return;
    }
    const mine = { first_name: details.first_name, last_name: details.last_name, email: details.email, phone: details.phone ?? "" };
    if (remember) await saveDetails(account.userId, mine);
    else if (remembered) await forgetDetails(account.userId);

    let shown: "returned" | "closed" = "returned";
    // Paid with the saved card: there is no payment page, only the check below.
    if (!r.charged) {
      try {
        shown = await openGivingPage(r.redirectUrl, (u, returnTo) => WebBrowser.openAuthSessionAsync(u, returnTo, { preferEphemeralSession: true }));
      } catch {
        setBusy(false);
        setMessage("We couldn't open the payment page, so nothing was charged. Your details are still here: tap Give to try again.");
        return;
      }
    }
    // Closing the page doesn't say whether the donor paid: ask. Coming back from a finished
    // payment, the provider's confirmation can take a few seconds, so ask once more.
    setBusy("checking");
    let outcome = await paymentStatus(SITE_URL, r.reference, r.token);
    // A saved-card charge has no payment page to come back from, so "pending" is not an answer:
    // ask a few more times before giving up.
    const asks = r.charged ? 4 : shown === "returned" ? 1 : 0;
    for (let i = 0; i < asks && outcome === "pending"; i++) {
      await new Promise((ok) => setTimeout(ok, 3_000));
      outcome = await paymentStatus(SITE_URL, r.reference, r.token);
    }
    setBusy(false);
    // Back from the payment page, the website only sends the donor to the app once the gift is paid,
    // so "returned" with the provider still catching up counts. A saved-card charge counts only when paid.
    const finished = outcome === "paid" || (outcome === "pending" && shown === "returned" && !r.charged);
    // Paid or declined settles a saved-card attempt; anything else keeps its id, so "Give" asks again instead of charging again.
    if (r.charged && (outcome === "paid" || outcome === "failed")) attemptRef.current = null;
    if (!finished) {
      haptic.tap();
      const o = outcome === "paid" ? "pending" : outcome;
      setMessage(afterPaymentMessage(o, Boolean(r.charged)), afterPaymentTone(o), true);
      return;
    }
    haptic.success();
    void refreshAfterGiving(account.refresh);
    setDone(sentSummary(total, details.email, outcome !== "paid"));
  }

  const err = (k: string) => errors[k];
  const buttonLabel = busy === "opening" ? (payWithSaved ? "Charging your card" : "Opening the payment page") : busy === "checking" ? "Checking your payment" : total ? `Give ${rand(total)}${isMonthly ? " every month" : ""}` : "Give";
  // The goal question only makes sense when the goal counts some labels: Yes puts its label on the gift.
  const goalLabel = goal?.counts?.[0] ?? null;
  const counting = goal ? counts(goal, cleanLabel(label)) : false;

  return (
    <View style={styles.screen}>
      <TopBar title={`Giving to ${charity.nameEn}`} fallback="/discover" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.gutter, gap: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {campaign ? <CampaignCard campaign={campaign} compact /> : null}
          {campaignEnded ? (
            <View style={styles.note} accessibilityRole="alert">
              <Text>That campaign has ended. Your gift goes to {charity.nameEn}.</Text>
            </View>
          ) : null}
          {/* The amount, big, on blue, with what a gift does in the charity's own words. */}
          <View style={styles.amountCard} onLayout={at("amount")}>
            <Blob size={120} color={colors.orange} rotate={20} style={{ right: -48, top: -52 }} />
            <Blob size={90} color={colors.lilac} rotate={-15} stretch={1.2} style={{ left: -50, bottom: -64 }} />
            <Text style={styles.amountKicker}>Your gift</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountR}>R</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.lilac}
                accessibilityLabel="Amount in Rand"
                style={[styles.amountInput, amount.length > 9 ? { fontSize: 34, lineHeight: 44 } : amount.length > 6 ? { fontSize: 44, lineHeight: 54 } : null]}
              />
            </View>
            {charity.impact ? <Text style={styles.amountImpact}>{charity.impact}</Text> : null}
          </View>
          {err("amount") ? <Text variant="label" style={{ color: colors.danger }} accessibilityRole="alert">{err("amount")}</Text> : minGift ? <Text variant="label">At least {rand(minGift)}.</Text> : null}
          {quick.length ? (
          <View style={styles.chips} accessibilityLabel={pastAmounts.length ? "Amounts you gave before" : `Amounts suggested by ${charity.nameEn}`}>
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

          {goal && goalLabel ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.question}>Count this gift towards {goal.name}?</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {([true, false] as const).map((yes) => {
                  const on = counting === yes;
                  return (
                    <Pressable key={String(yes)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setLabel(yes ? goalLabel : null); }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.onInk }]}>{yes ? "Yes, count it" : "Not this time"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : goal ? (
            <Text variant="bodyMuted">Every gift counts towards {goal.name}.</Text>
          ) : null}
          {/* "Cover the card fee" stays hidden until the payment provider's rates are in the platform config: the fee is never a made-up figure. */}

          <LabelPicker value={label} onChange={setLabel} suggestions={labelSuggestions} />

          {campaignId ? null : <SwitchRow label="Give every month" description="The same amount each month until you cancel." value={monthly} onChange={setMonthly} />}
          <SwitchRow
            label="Add a contribution to Givezy"
            description={isMonthly ? "Optional. It helps us keep Givezy running, and repeats each month with your gift." : "Optional. It helps us keep Givezy running. Your gift to the charity stays whole."}
            value={extra}
            onChange={setExtra}
          />
          {extra ? <View onLayout={at("extra")}><Field label="Contribution" prefix="R" keyboardType="decimal-pad" value={extraAmount} onChangeText={setExtraAmount} error={err("extra")} placeholder="0" helper={minExtra ? `At least ${rand(minExtra)}.` : undefined} /></View> : null}

          {showDetailFields ? (
            <View style={{ gap: 14 }} onLayout={at("details")}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>About you</Text>
              <Field label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" error={err("first_name")} />
              <Field label="Surname" value={last} onChangeText={setLast} autoComplete="family-name" error={err("last_name")} />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={err("email")} helper="Your confirmation is sent here." />
              <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={err("phone")} />
              <SwitchRow label="Remember my details on this phone" description="Your name, email and phone, so next time you don't type them. Never your ID number." value={remember} onChange={setRemember} />
            </View>
          ) : (
            <View style={styles.giver} onLayout={at("details")}>
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
            <View style={{ gap: 18 }} onLayout={at("s18a")}>
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
              {want18a && !usingSavedId ? <Field label="SA ID number" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" maxLength={13} error={err("id_number")} helper="13 digits. Kept safely on our server for your receipt, never on this phone." /> : null}
              {want18a ? (
                <View style={{ gap: 10 }}>
                  <Text variant="label">
                    Your address. SARS needs it on the receipt.{usingSavedId ? " Leave it empty to use the address from your last s18A gift." : ""}
                  </Text>
                  <Field label="Street address" value={street} onChangeText={setStreet} autoComplete="street-address" error={err("address_line1")} />
                  <Field label="Suburb" value={suburb} onChangeText={setSuburb} error={err("suburb")} />
                  <Field label="City or town" value={town} onChangeText={setTown} autoComplete="postal-address-locality" error={err("city")} />
                  <Field label="Postal code" value={postal} onChangeText={setPostal} keyboardType="number-pad" autoComplete="postal-code" maxLength={4} error={err("postal_code")} />
                </View>
              ) : null}
            </View>
          ) : null}
          <SwitchRow
            label="Give anonymously"
            description={`Your name won't appear on public pages, campaign lists or live totals. ${charity.nameEn} still sees your details, because it needs them to record your donation${s18aAvailable ? " and issue your s18A receipt" : ""}.`}
            value={anonymous}
            onChange={setAnonymous}
          />

          <View onLayout={at("note")}>
          <Field
            label={`Message to ${charity.nameEn} (optional)`}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            error={err("message")}
            helper="The charity sees it with your donation."
          />
          </View>

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
            <View style={{ gap: 8 }} onLayout={at("dedication")}>
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

          {/* How you pay: the card kept for next time, or a new card on the payment page. */}
          {cardsOpen ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.question}>How would you like to pay?</Text>
              {savedCard ? (
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {([true, false] as const).map((saved) => {
                    const on = useSavedCard === saved;
                    return (
                      <Pressable key={String(saved)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setUseSavedCard(saved); }} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && { color: colors.onInk }]}>{saved ? cardLabel(savedCard) : "A different card"}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {offerSave ? (
                <SwitchRow
                  label="Save my card for next time"
                  description="Our payment partner keeps your card, not Givezy and not this app. It is only charged when you tap Give, and you can remove it any time in Account."
                  value={saveCard}
                  onChange={setSaveCard}
                />
              ) : null}
            </View>
          ) : null}

          {isMonthly && total ? (
            <View style={{ gap: 8 }} onLayout={at("monthly")}>
              <Text variant="bodyMuted">
                Your first payment is today. After that we collect the same amount on this day of each month (the last day, in shorter months) from the same card, until you cancel. Monthly donations are by card only. You can pause or cancel any time on the Progress tab.
              </Text>
              <CheckRow
                label={`I authorise Givezy to collect ${rand(total)} from my card every month until I cancel.`}
                value={authorised}
                onChange={(v) => setAuthorisedTotal(v ? total : null)}
                error={err("monthly_authorised")}
              />
            </View>
          ) : null}
          {/* The agreement, at the end of the form. Only the total and the Give button stay pinned. */}
          <View style={{ gap: 10 }} onLayout={at("agree")}>
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
          </View>
        </ScrollView>
        {/* Pinned: what happened (if anything), the exact total and the Give button. */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          {message ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={message.tone === "error" ? undefined : styles.waitNote}>
              <Text style={{ color: message.tone === "error" ? colors.danger : colors.ink }}>{message.text}</Text>
              {message.help ? <Text variant="label" style={{ marginTop: 4 }}>{helpLine()}</Text> : null}
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Button variant="cta" label={buttonLabel} disabled={busy !== false} onPress={give} />
            <Text variant="label" style={{ textAlign: "center" }}>
              {total ? `${rand(gift ?? 0)} to ${charity.nameEn}${contribution ? ` and ${rand(contribution)} to Givezy` : ""}. ` : ""}
              {payWithSaved && savedCard ? `Charged to your ${cardLabel(savedCard)}. Nothing is typed in the app.` : "You enter your card on a secure payment page, never in the app."}
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
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lightPurple, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
  footer: { paddingHorizontal: space.gutter, paddingTop: 12, gap: 10, backgroundColor: colors.cream, borderTopWidth: 1.5, borderTopColor: colors.lightPurple },
  amountCard: { padding: 20, gap: 4, borderRadius: radius.card, backgroundColor: colors.blue, overflow: "hidden" },
  amountKicker: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.lilac },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  amountR: { fontFamily: fonts.display, fontSize: 44, lineHeight: 56, color: colors.onInk },
  amountInput: { flex: 1, fontFamily: fonts.display, fontSize: 56, lineHeight: 64, color: colors.onInk, paddingVertical: 0, outlineStyle: "none" } as object,
  amountImpact: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22, color: colors.lilacSoft },
  question: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.navy },
  giver: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
  note: { padding: 14, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
  waitNote: { padding: 12, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
  links: { flexDirection: "row", gap: 18, marginLeft: 36 },
  link: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue, textDecorationLine: "underline" },
});
