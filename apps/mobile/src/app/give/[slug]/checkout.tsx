import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InfoIcon } from "@/components/icons";
import { Segmented } from "@/components/segmented";
import { EmptyState } from "@/components/states";
import { CheckRow, SwitchRow } from "@/components/switch-row";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { FEE_SETTINGS_ARE_SAMPLE, feeSettings } from "@/config/fees";
import type { GivingKind } from "@/data/giving";
import { findCharity } from "@/data/sample";
import { givingKindLabels } from "@/lib/giving";
import { randExact } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { calculateFees } from "@shared/fees";
import { isValidSaIdNumber } from "@shared/sa-id";
import { colors, radius, space, touch, type } from "@/theme/tokens";

type Errors = Partial<Record<"name" | "email" | "idNumber" | "orgName" | "regNumber" | "taxRef" | "address" | "city" | "postal" | "phone" | "age" | "consent" | "kind", string>>;

/** Screen 5: checkout. Guest by default. */
export default function Checkout() {
  const insets = useSafeAreaInsets();
  const state = useScreenState();
  const p = useLocalSearchParams<{ slug: string; cents?: string; frequency?: string; demo?: string }>();
  const charity = findCharity(p.slug);
  const cents = Number(p.cents);
  const monthly = p.frequency === "monthly";
  const demo = p.demo ?? "";

  const filled = demo.includes("filled") || demo.includes("18a");
  const [name, setName] = useState(filled ? "Sarah Levin" : "");
  const [email, setEmail] = useState(filled ? "sarah@example.co.za" : "");
  const [anonymous, setAnonymous] = useState(false);
  const [want18a, setWant18a] = useState(demo.includes("18a"));
  const [receiptFor, setReceiptFor] = useState<"me" | "company">("me");
  const [idNumber, setIdNumber] = useState(demo.includes("18a") ? "8506155009085" : "");
  const [orgName, setOrgName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [taxRef, setTaxRef] = useState("");
  const [address, setAddress] = useState(demo.includes("18a") ? "5 Test Road" : "");
  const [city, setCity] = useState(demo.includes("18a") ? "Johannesburg" : "");
  const [postal, setPostal] = useState(demo.includes("18a") ? "2192" : "");
  const [phone, setPhone] = useState(demo.includes("18a") ? "082 555 1234" : "");
  const [age, setAge] = useState(filled);
  const [consent, setConsent] = useState(filled);
  const [kind, setKind] = useState<GivingKind | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  // A link can carry any amount; calculateFees rejects non-whole, zero or below-minimum cents.
  const fees = useMemo(() => {
    try {
      return calculateFees(cents, feeSettings);
    } catch {
      return null;
    }
  }, [cents]);

  if (!charity || !fees) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: space.gutter }]}>
        <EmptyState title="Something's missing" body="Choose a charity and an amount first." action={{ label: "Back to Discover", onPress: () => router.replace("/discover") }} />
      </View>
    );
  }
  const can18a = charity.issues18a;

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = "Enter your name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email address";
    if (can18a && want18a) {
      if (receiptFor === "me") {
        if (!isValidSaIdNumber(idNumber)) e.idNumber = idNumber ? "That doesn't look like a valid SA ID number" : "Needed for an 18A receipt";
      } else {
        if (!orgName.trim()) e.orgName = "Enter the registered company name";
        if (!regNumber.trim()) e.regNumber = "Needed for an 18A receipt";
      }
      if (taxRef && !/^\d{10}$/.test(taxRef.replace(/\s/g, ""))) e.taxRef = "Income tax numbers are 10 digits";
      if (!address.trim()) e.address = "Needed for an 18A receipt";
      if (!city.trim()) e.city = "Needed for an 18A receipt";
      if (!/^\d{4}$/.test(postal.trim())) e.postal = "Postal code is 4 digits";
      if (!/^(\+27|0)\d{9}$/.test(phone.replace(/[\s()-]/g, ""))) e.phone = "Use a South African number, for example 082 123 4567";
    }
    if (!kind) e.kind = "Choose maaser, chomesh or general tzedaka";
    if (!age) e.age = "You must be 18 or older to give";
    if (!consent) e.consent = "Please agree so the charity can record your gift";
    return e;
  }

  function give() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    // Mock only: the real app hands over to the payment provider here.
    setTimeout(() => {
      router.replace({
        pathname: "/give/[slug]/done",
        params: { slug: charity!.slug, cents: String(cents), frequency: monthly ? "monthly" : "once", name: name.trim().split(" ")[0], r18a: can18a && want18a ? "1" : "0", kind: kind ?? "" },
      });
    }, 400);
  }

  const showErrorsDemo = demo.includes("errors");
  const shownErrors = showErrorsDemo && Object.keys(errors).length === 0 ? validate() : errors;

  return (
    <View style={styles.screen}>
      <TopBar title="Checkout" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + 32, gap: space.block }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {state === "error" ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Text style={{ fontFamily: "Archivo_600SemiBold", fontSize: 17, color: colors.danger }}>Payment didn&apos;t go through</Text>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>Nothing was charged. Check your card details and try again.</Text>
          </View>
        ) : null}

        <View style={{ gap: 4 }}>
          <Text variant="label">{monthly ? "Monthly gift to" : "Gift to"}</Text>
          <Text variant="h2">{charity.nameEn}</Text>
        </View>

        {/* Your details */}
        <View style={styles.section}>
          <Text variant="h2" style={styles.sectionTitle}>Your details</Text>
          <Field label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={shownErrors.name} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" helper="Your confirmation goes here." error={shownErrors.email} />
          <SwitchRow
            label="Give anonymously"
            description={`Hides your name on public pages and campaign lists. ${charity.nameEn} still sees it.`}
            value={anonymous}
            onChange={setAnonymous}
          />
        </View>

        {/* 18A */}
        <View style={styles.section}>
          {can18a ? (
            <>
              <SwitchRow
                label="I want an 18A receipt"
                description={`One receipt a year from ${charity.nameEn}, covering all your gifts.`}
                value={want18a}
                onChange={setWant18a}
              />
              {want18a ? (
                <View style={{ gap: 16 }}>
                  <Segmented
                    label="Receipt in the name of"
                    value={receiptFor}
                    onChange={setReceiptFor}
                    options={[
                      { value: "me", label: "Me" },
                      { value: "company", label: "A company" },
                    ]}
                  />
                  {receiptFor === "me" ? (
                    <Field label="SA ID number" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" error={shownErrors.idNumber} />
                  ) : (
                    <>
                      <Field label="Registered company name" value={orgName} onChangeText={setOrgName} error={shownErrors.orgName} />
                      <Field label="Registration number" value={regNumber} onChangeText={setRegNumber} error={shownErrors.regNumber} />
                    </>
                  )}
                  <Field label="Income tax number (optional)" value={taxRef} onChangeText={setTaxRef} keyboardType="number-pad" error={shownErrors.taxRef} />
                  <Field label="Street address" value={address} onChangeText={setAddress} autoComplete="street-address" error={shownErrors.address} />
                  <View style={styles.twoCol}>
                    <View style={{ flex: 3 }}><Field label="City" value={city} onChangeText={setCity} error={shownErrors.city} /></View>
                    <View style={{ flex: 2 }}><Field label="Postal code" value={postal} onChangeText={setPostal} keyboardType="number-pad" error={shownErrors.postal} /></View>
                  </View>
                  <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={shownErrors.phone} />
                  <Text variant="label">SARS requires these details on the receipt. Your ID and tax numbers are stored encrypted.</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.infoRow}>
              <InfoIcon />
              <Text variant="bodyMuted" style={{ flex: 1, fontSize: 16 }}>{charity.nameEn} doesn&apos;t issue 18A receipts. You can still give.</Text>
            </View>
          )}
        </View>

        {monthly ? (
          <View style={[styles.section, { gap: 8 }]}>
            <Text variant="h2" style={styles.sectionTitle}>Your account</Text>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
              Monthly gifts need a free account so you can pause or cancel any time. We&apos;ll email {email.trim() || "you"} a link to confirm it. No password needed.
            </Text>
          </View>
        ) : null}

        {/* Maaser, chomesh or general tzedaka: the donor chooses every time. */}
        <View style={[styles.section, { gap: 12 }]}>
          <View style={{ gap: 4 }}>
            <Text variant="h2" style={styles.sectionTitle}>This gift is from</Text>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>It counts towards that total on your Giving page. Only you see this.</Text>
          </View>
          <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="This gift is from">
            {(["maaser", "chomesh", "tzedaka"] as const).map((k) => {
              const selected = kind === k;
              return (
                <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setKind(k)} style={[styles.kind, selected && styles.kindOn]}>
                  <View style={[styles.dot, selected && styles.dotOn]} />
                  <Text style={[type.button, { fontSize: 17, color: selected ? colors.accent : colors.ink }]}>{givingKindLabels[k]}</Text>
                </Pressable>
              );
            })}
          </View>
          {shownErrors.kind ? <Text variant="label" style={{ color: colors.danger }}>{shownErrors.kind}</Text> : null}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Row label={monthly ? "Gift each month" : "Gift"} value={randExact(fees.amountCents)} />
          <Row
            label="Processing fee"
            value={randExact(fees.processingFeeLineCents)}
            tag={FEE_SETTINGS_ARE_SAMPLE ? "Sample rate, not final" : undefined}
          />
          <Text variant="label" style={{ marginTop: -4 }}>
            Covers our 3% platform fee and card processing. {charity.nameEn} receives 100% of your gift.
          </Text>
          <View style={styles.rule} />
          <Row label={monthly ? "Total each month" : "Total"} value={randExact(fees.totalCents)} strong />
        </View>

        {/* Payment (stub) */}
        <View style={styles.section}>
          <Text variant="h2" style={styles.sectionTitle}>Payment</Text>
          <View style={styles.payStub}>
            <Text style={{ fontFamily: "Archivo_600SemiBold", fontSize: 17 }}>Card</Text>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>You&apos;ll enter your card on the payment provider&apos;s secure page. We never see or store it.</Text>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <CheckRow label="I'm 18 or older." value={age} onChange={setAge} error={shownErrors.age} />
          <CheckRow label={`I agree my details are shared with ${charity.nameEn} so they can record my gift.`} value={consent} onChange={setConsent} error={shownErrors.consent} />
        </View>

        <View style={{ gap: 10 }}>
          <Button label={submitting || state === "loading" ? "Please wait" : "Give"} onPress={give} disabled={submitting || state === "loading"} style={submitting || state === "loading" ? { opacity: 0.6 } : undefined} />
          {Object.keys(errors).length ? (
            <Text variant="label" style={{ color: colors.danger, textAlign: "center" }} accessibilityLiveRegion="polite">Please check the highlighted fields.</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, tag, strong }: { label: string; value: string; tag?: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={strong ? styles.strong : { fontSize: 17 }}>{label}</Text>
        {tag ? <Text variant="label" style={{ color: colors.danger }}>{tag}</Text> : null}
      </View>
      <Text style={strong ? [styles.strong, { fontFamily: "Archivo_800ExtraBold", fontSize: 26 }] : { fontSize: 17 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  section: { gap: 16, paddingTop: space.block - 4, borderTopWidth: 1, borderTopColor: colors.hairline },
  sectionTitle: { fontSize: 20, lineHeight: 26 },
  twoCol: { flexDirection: "row", gap: 12 },
  infoRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  summary: { gap: 12, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rule: { height: 1, backgroundColor: colors.hairline },
  strong: { fontFamily: "Archivo_700Bold", fontSize: 18 },
  kind: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: touch, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  kindOn: { borderColor: colors.accent, borderWidth: 1.5 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.muted },
  dotOn: { borderColor: colors.accent, borderWidth: 6 },
  payStub: { gap: 4, padding: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, borderStyle: "dashed" },
  banner: { gap: 4, padding: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
});
