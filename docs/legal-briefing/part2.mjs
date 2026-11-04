// Sections 3 and 4: money flow and licensing, section 18A receipts.
export function part2(ctx, H) {
  const { TAG, w, wt, h1, h2, qlist, table, c } = H;
  const esc = ctx.esc;
  let out = "";

  // ===================================================================== 3
  out += `<section class="sec">${h1("s3", "3. Money flow and licensing questions")}
  ${h2("s3_1", "3.1 Split settlement straight to the charity")}
  ${table(["What", "Status", "Where to check"], [
    ["Each approved charity is registered with the provider as a \"subaccount\" (its own bank account), by a platform administrator pressing Connect. Each bank is mapped to the provider's own bank name.", TAG.proof, "src/lib/gateway/paystack.ts (createCharityAccount, BANK_NAMES)"],
    ["A payment is started with the charity's subaccount, a flat \"transaction charge\" equal to the contribution, and the provider's fee borne by the subaccount (the charity). Without a payout account the payment is refused, so a gift can never land with Givezy by mistake.", TAG.proof, "src/lib/gateway/paystack.ts (splitFields, splitOrNone)"],
    ["A gift is marked paid only when we ask the provider ourselves and it confirms success, in ZAR, for exactly the total we expected. Any other amount is held for a person and logged as an amount mismatch.", TAG.built, "src/lib/donations/confirm.ts; tests/payment-persistence.test.ts, tests/donation-confirmation.test.ts"],
    ["The split amounts and which side bore the fee, read off the provider's own dashboard.", TAG.no, "docs/go-live-checklist.md (Paystack test run, 02/11/2026)"],
    ["A charity that is not connected shows \"isn't taking online donations yet\".", TAG.built, "src/lib/donations/charity.ts"],
  ])}
  <p><b>What has been proven.</b> On 02/11/2026, in the provider's test mode, the demo charity was connected (to the founder's own bank account, as a stand-in) and a test gift of R50 with a R10 contribution (R60 in total) was paid with the provider's test card from the app. The provider's "payment succeeded" message arrived two seconds later and was processed once; the donor's confirmation and the charity's notification were written to the log. <b>Not yet done:</b> reading the split off the provider's dashboard (the site keeps only a trimmed copy of the message on purpose), the declined-card test, a monthly gift, a refund, a dispute, the deposit report, and the bank-account check. The provider's documents say a bank-account check costs R3 per successful request; the site runs one whenever an administrator changes a charity's bank details, which needs the founder's approval before launch.</p>
  ${wt("", "docs/go-live-checklist.md", "docs/paystack-test-script.md")}
  ${h2("s3_2", "3.2 What Givezy receives, and when")}
  <ul>
    <li><b>Only the optional contribution.</b> It is a flat amount per payment and arrives in Givezy's provider account. It is never part of the charity's line, never on a receipt, and the charity never sees it.</li>
    <li><b>Never a charity's gift.</b> With splitting switched on (${c("PAYSTACK_SPLITS=yes")}) a payment for a charity without a payout account is refused.</li>
    <li><b>Gifts a charity records by hand</b> (EFT, cash, debit order, imports) do not pass through Givezy at all, and carry no Givezy fee or contribution. Whether Givezy should charge for receipting them is undecided.</li>
    <li><b>Timing.</b> The provider decides when it pays out to the charity's bank and to Givezy. The settlement schedule is not recorded anywhere in our documents: to be confirmed with the provider. The charity's Deposits page lists each payout with its gifts, the provider's fee and the amount that reached the bank, and checks that every gift less its fee equals the deposit.</li>
  </ul>
  ${w("src/lib/donations/checkout.ts", "src/lib/donations/payouts.ts", "src/lib/charity/deposits.ts", "docs/go-live-checklist.md (Recorded gifts and fees; Deposit report)")}
  <p>${TAG.proof} The deposit report reads the provider's settlement answers. The provider's field names for settlements, and whether it filters by subaccount, are not confirmed; the code leaves out any settlement not shown to be the charity's.</p>

  ${h2("s3_3", "3.3 Refunds and chargebacks")}
  <p>Givezy has no instruction that sends a refund to the provider; refunds are made in the provider's own dashboard. What the code does when the provider reports one:</p>
  ${table(["Event reported by the provider", "What the system does", "Who decides"], [
    ["A full refund (the whole amount the donor paid, in rand)", "Marks the gift \"refunded\". It then drops out of the charity's totals and receipts. If the gift is on an issued s18A receipt, that receipt is withdrawn at once with a reason, and the donor's other gifts go back on the charity's list for a corrected receipt. The donor is not told.", "Automatic, as bookkeeping. No money moves."],
    ["A partial refund, a refund with no amount or in another currency, or one we cannot match", "Held on Admin, Payments with buttons \"Mark refunded\" and \"Mark charged back\", each with a confirmation, logged. A partial refund leaves the whole amount on the receipt (undecided).", "A Givezy administrator."],
    ["A dispute opened (chargeback)", "The gift is not changed. Any monthly donation it belongs to is paused. Givezy is emailed at once, because the provider sets a deadline for evidence.", "A Givezy administrator answers in the provider's dashboard."],
    ["A dispute resolved", "Logged only; held for a person. A dispute the charity wins leaves the gift \"charged back\" (undecided whether it may return to paid).", "A Givezy administrator."],
    ["A person marks a gift charged back", "The monthly donation it belongs to stops and the saved card is dropped. Any s18A receipt carrying it is withdrawn.", "A Givezy administrator."],
  ])}
  ${w("src/lib/donations/reverse.ts", "src/app/api/webhooks/[gateway]/route.ts", "src/app/admin/payments/", "tests/donation-reverse.test.ts")}
  <p>${TAG.proof} The provider's field names for refund and dispute messages are not confirmed; unrecognised messages are held, never acted on. The Terms still say the refund policy is "[to be confirmed]". See ${"{{Q:3:reversals}}"} and ${"{{Q:3:cpa}}"}.</p>

  ${h2("s3_4", "3.4 Monthly donations and the authorisation tick")}
  <p>The monthly box on the donate form says that the first payment is today, then the same amount on the same day each month (the last day in shorter months) from the same card, until the donor cancels; card payments only. The donor must tick:</p>
  <div class="quote">"I authorise Givezy to collect R[total] from my card every month until I cancel."</div>
  ${w("src/app/c/[slug]/donate/donate-flow.tsx (monthly_authorised)", "src/lib/donations/checkout.ts (consents insert)")}
  <ul>
    <li>The tick is stored as a consent record with the policy version and the time. The provider returns a reusable card authorisation code; we keep it encrypted. We never hold the card number.</li>
    <li>A daily scheduled job (06:15 UTC, 08:15 Johannesburg) collects what is due. A declined collection is retried about 24 hours and about 72 hours later (three attempts in all), then the monthly donation stops and the donor is emailed.</li>
    <li>The donor can pause, resume, cancel, or replace a declined card ("Update my card") on the website or in the app. A chargeback pauses or stops it. A collection the provider took for a different amount stays pending for a person.</li>
    <li>${TAG.proof} Not yet run against the provider. <b>Open:</b> a donor agrees to a fixed total, but the card charge (when rates exist) is recomputed each month; the draft emails for "could not collect" and "has stopped" are not approved; the terms for card-on-file are for Yosef.</li>
  </ul>
  ${w("src/lib/donations/monthly-job.ts", "src/lib/donations/schedule.ts (MAX_ATTEMPTS = 3, RETRY_AFTER_HOURS = 24, 72)", "src/lib/donations/recurring.ts", "vercel.json", "tests/monthly-job.test.ts, tests/monthly-schedule.test.ts")}

  ${h2("s3_5", "3.5 The proof-of-concept structure")}
  <p>There is no registered company. Registration and the company's email come after a first proof of concept. For the proof of concept the plan is a payment provider "Starter Business / Sole Proprietorship" account in the founder's personal name. It needs the founder's ID, a bank account and a bank confirmation letter. The provider states a lifetime collection cap of ZAR 1 000 000 for South African sole proprietorships, with an upgrade to a registered business later. <span class="muted">(This plan and the cap were supplied by the founder. They are not recorded in the code or the project documents, and the cap should be checked on the provider's own page.)</span></p>
  <p>What this means in practice, so that the risks can be named:</p>
  <ul>
    <li>The provider's merchant, and the party it can claim refunds, chargebacks and fees from, is the founder personally.</li>
    <li>Contributions land in the founder's account. Charities' gifts do not: they settle straight to the charities' accounts.</li>
    <li>The Terms and Privacy Policy cannot yet name an operator (they show "[to be confirmed]" for the company name, number and address and for the Information Officer).</li>
    <li>Our own go-live checklist and launch plan still assume company documents for the provider's business verification. They will be updated to match this plan.</li>
    <li>What happens to the provider account, the connected charity accounts and the contracts when the company is registered is not yet known.</li>
  </ul>
  ${w("src/config/legal.ts", "docs/go-live-checklist.md (Givezy's registered details; Paystack items)", "docs/launch-plan.md")}

  ${h2("s3_6", "3.6 The dedication, message and label fields")}
  <p>A donor can type three pieces of free text with a gift: a <b>private label</b> (up to 80 characters; only the donor sees it), a <b>dedication</b> ("in honour of" or "in memory of" and a name of up to 80 characters), and a <b>message to the charity</b> (up to 500 characters). The donor and the charity see the dedication and the message; they are never printed on an s18A receipt and they are wiped when the donor asks for erasure. We found no public page that shows a donor's name, message or dedication. "Give anonymously" hides the donor's name from public pages, campaign lists and live totals, but not from the charity.</p>
  <p>The text that <i>is</i> public is what charities publish: their profile, up to 12 photos, updates of up to 500 characters and campaigns. It is published as soon as it is posted (profile content is checked at approval), and Givezy administrators can remove any of it. Typed text is stripped of control and direction-override characters; there is no word filtering.</p>
  ${w("src/lib/donations/dedication.ts", "src/lib/donations/validation.ts", "src/app/c/[slug]/page.tsx", "docs/decisions.md (Dedications; Real photos and updates)")}

  <h2>3.7 Questions on money flow and licensing</h2>
  ${qlist(3)}
</section>`;

  // ===================================================================== 4
  out += `<section class="sec pb">${h1("s4", "4. Section 18A receipts")}
  <p>This is the core for both readers. A section 18A receipt lets a donor claim a tax deduction for a gift to an approved public benefit organisation. Givezy issues the receipt <i>for</i> the charity, under a mandate the charity signs.</p>
  ${table(["What", "Status", "Where to check"], [
    ["The rules for who can get a receipt and what is on it, enforced inside the database function that issues it (one receipt, one transaction)", TAG.built, "supabase/migrations/20261009000003_issue_receipts.sql, 20261009000008_receipt_identity.sql; tests/receipts-db.test.ts"],
    ["Planning, numbering, void and re-issue, two approvals before anything is issued", TAG.built, "src/lib/receipts/plan.ts, issue.ts, runs.ts; tests/receipts.test.ts, tests/receipt-runs.test.ts"],
    ["Printing the PDF with Chrome on the hosted site; emailing it to the donor", TAG.proof, "src/lib/receipts/pdf.ts, email.ts (email provider not set up)"],
    ["The statement wording and the list of particulars", TAG.no, "src/config/receipts.ts (draft, for Yosef)"],
    ["The receipting mandate text", TAG.no, "none in the repository"],
  ])}
  ${h2("s4_1", "4.1 What Givezy issues, and the switch")}
  <p>For a charity that a platform administrator has confirmed as s18A-approved <i>and</i> that has a signed mandate, Givezy issues one receipt per donor for all paid gifts in the tax year where the donor ticked "I want an s18A receipt", including gifts the charity recorded by hand (EFT, cash, debit orders, imports). The receipt amount is the sum of the gift amounts only, worked out inside the database, never passed in. Real receipts are switched off: the issuing job refuses to write anything until two settings (${c("RECEIPTS_ENABLED=yes")} and ${c("RECEIPT_WORDING_CONFIRMED=yes")}) are set, so until Yosef confirms the wording every receipt is a marked draft. The first real run would be March 2027, for the 2026/27 tax year.</p>
  ${w("src/config/receipts.ts", "supabase/migrations/20261009000003_issue_receipts.sql", "docs/launch-plan.md")}
  ${h2("s4_2", "4.2 The mandate: how it is recorded")}
  <ul>
    <li>A charity that holds an s18A reference uploads the SARS s18A approval letter and the signed receipting mandate, with the date it was signed. Givezy sends the mandate to the charity to sign; there is no template in the repository.</li>
    <li>A platform administrator (with the second step) checks the documents and ticks "s18A confirmed" and "mandate confirmed". The system then stores the mandate's signing date (midnight Johannesburg time of that date) and the file's location. A charity cannot set these fields itself: a database rule refuses it.</li>
    <li>A charity can issue only when it is s18A-confirmed and has a mandate date. A gift paid <i>before</i> the mandate date is never receipted.</li>
    <li>The administrator can also set up s18A later for a charity approved without it; the charity is then emailed.</li>
  </ul>
  ${w("src/app/admin/charities/[id]/actions.ts", "src/app/charity-admin/[id]/application/actions.ts", "supabase/migrations/20261007000001_charity_onboarding.sql", "src/lib/receipts/plan.ts (charityCanIssue)")}
  ${h2("s4_3", "4.3 When, how often, and numbering")}
  <ul>
    <li><b>Once a year per donor, after the tax year ends.</b> The tax year runs from 1 March to the end of February and is named by the year it ends: 2026/27 is 01/03/2026 to 28/02/2027 (stored as 2027, as SARS numbers it). The job refuses to run before the year has ended, and a charity can approve only the last two closed years.</li>
    <li><b>Two approvals.</b> The charity checks and approves its list (donor, number of gifts, amount, total) on its dashboard; Givezy then signs off. If the list changed in between (a refund, a late payment), nothing is issued and it goes back to the charity. A fingerprint of the list is compared.</li>
    <li><b>Numbering.</b> <code>CODE-2027-0042</code>: the charity's short code, the tax year, and a four-digit running number that is sequential per charity. The number is taken from a counter inside the same database transaction that writes the receipt and is never reused; a withdrawn receipt keeps its number.</li>
    <li><b>Delivery.</b> The PDF is emailed to the donor (once email is set up) and is available in the donor's account and app. A donor's "tax pack" is a separate summary marked as not a tax receipt.</li>
    <li><b>A gift confirmed after the receipt was issued</b> is left for a person: withdraw the receipt and issue it again with the late gift on it.</li>
  </ul>
  ${w("src/lib/receipts/plan.ts (taxYearIsClosed)", "src/lib/receipts/runs.ts (fingerprintPlan, closedTaxYears)", "supabase/migrations/20261006000001_core_schema.sql (next_receipt_number)", "supabase/migrations/20261015000005_receipt_numbers_past_9999.sql", "src/lib/dates.ts")}
  ${h2("s4_4", "4.4 What is printed")}
  <p>The receipt is two A4 pages built from a stored snapshot of every printed field, so the PDF can be reproduced exactly later. A sample is in Appendix B.</p>
  <ul>
    <li><b>Page 1, the certificate:</b> receipt number; title "Section 18A receipt"; the charity's legal name, NPO number, PBO number, s18A reference and address; the donor's name and type (Individual, Company or Trust); registration number (company or trust, in full); South African ID number and income tax number (last 4 digits only); the donor's address; date or dates of donation; nature of donation; number of donations; the amount in figures and in words; the tax year; the date issued; and the statement below. Footer: "Issued through Givezy on behalf of [charity], PBO number [..]. Amounts are the donations only."</li>
    <li><b>Page 2, the donation summary:</b> every gift with its reference (GZ-...), the date received, the nature and the amount, with the total.</li>
    <li><b>Not printed:</b> a signature or signer's name, the charity's logo, phone or email, the charity's trading name, and the donor's email or phone.</li>
  </ul>
  <p><b>The statement, word for word</b> (draft, not confirmed by Yosef):</p>
  <div class="quote">"This receipt is issued by {charity} for the purposes of section 18A of the Income Tax Act, 1962, for the donations listed on this receipt, received during {period}. {charity} confirms that these donations have been or will be used exclusively for the objects of the organisation in carrying on its public benefit activities."</div>
  <p class="small muted">{charity} is replaced by the charity's legal name and {period} by the tax year dates, for example "01/03/2025 to 28/02/2026".</p>
  ${w("src/lib/receipts/html.ts", "src/lib/receipts/details.ts", "src/config/receipts.ts", "src/lib/receipts/words.ts; tests/receipt-words.test.ts, tests/receipts.test.ts")}
  ${h2("s4_5", "4.5 Nature of donation, and a known weakness")}
  <p>For online gifts the nature of donation prints "Card (online)". For gifts a charity recorded by hand it prints the method it recorded: "EFT (bank transfer)", "Cash", "Debit order", "Another giving programme" or "Other". <b>The weakness:</b> every online gift is printed as "Card (online)" and the text is frozen in the receipt. That is true while the provider takes cards only; it would be wrong for life if instant EFT or debit orders are added online. The fix (storing the method on the gift when it is confirmed) is not built.</p>
  ${w("src/lib/receipts/details.ts (donationNature)", "src/lib/charity/recorded-gifts.ts (RECORDED_METHODS)", "docs/go-live-checklist.md (Receipt \"nature of donation\")")}
  ${h2("s4_6", "4.6 Donor ID and tax numbers, and the covered card charge")}
  <ul>
    <li><b>At checkout</b> a donor who ticks s18A must give an SA ID number (13 digits, a real date, check digit) and an address; an income tax number is optional (checked with SARS's Modulus 10 rule). A company gives its CIPC registration number and a trust its trust number. The full numbers are encrypted (AES-256-GCM) with a key held outside the database; only the last 4 digits are stored in plain text.</li>
    <li><b>On the receipt</b> only the last 4 digits of an ID or tax number print; a company or trust registration number prints in full. Printing full numbers would mean decrypting at issue time and keeping them in the receipt: see ${"{{Q:4:fullid}}"}.</li>
    <li><b>The card charge a donor covers</b> (when the provider's rates exist) is paid to the charity's line, but the receipt sums gift amounts only. This was built that way because a covered charge is not a gift; it is a question for you: ${"{{Q:4:cover}}"}.</li>
  </ul>
  ${w("src/lib/donations/checkout.ts (encrypt, receiptIdentity)", "src/lib/crypto.ts", "src/lib/sa-id.ts", "src/lib/sars-numbers.ts", "supabase/migrations/20261009000003_issue_receipts.sql (sum of amount_cents)")}
  ${h2("s4_7", "4.7 Void and re-issue")}
  <ul>
    <li>An issued receipt cannot be edited or deleted. A database rule allows only two changes: attaching the PDF once, and withdrawing it with a reason.</li>
    <li>A platform administrator withdraws a receipt with a written reason of at least five characters; the audit log records who and why. The gifts on it then go back on the charity's list, and a replacement is issued after the charity approves and Givezy signs off.</li>
    <li>A full refund or chargeback withdraws the receipt automatically (3.3).</li>
    <li><b>Weaknesses:</b> a withdrawn receipt sends the donor no notice, so the PDF already in their inbox still looks valid; a replacement is not automatically linked to the withdrawn receipt; a part-refunded gift keeps its whole amount on the receipt.</li>
  </ul>
  ${w("supabase/migrations/20261006000001_core_schema.sql (guard_receipt_immutable)", "supabase/migrations/20261009000016_review_fixes.sql", "src/app/admin/receipts/actions.ts (voidReceipt)", "tests/receipts-db.test.ts")}
  ${h2("s4_8", "4.8 One receipt per donor identity, per charity, per year")}
  <p>A unique rule in the database allows only one issued receipt per charity, donor, identity and tax year. The identity is a keyed fingerprint of the ID, tax or registration number typed at checkout (never the number itself), so two people who give with one email address get separate receipts. If one person typed different numbers, two receipts are issued and listed for a person to check.</p>
  ${w("supabase/migrations/20261009000008_receipt_identity.sql", "src/lib/crypto.ts (receiptIdentity)", "src/lib/receipts/plan.ts")}
  ${h2("s4_9", "4.9 SARS particulars: what the receipt prints")}
  <p>The list of particulars below is the one recorded in our go-live checklist from the SARS notice effective 1 March 2023 (GN 3631) and section 18A(2). We could not open the gazette from the build environment, so Yosef must check the list itself.</p>
  ${table(["Particular", "Printed?", "Where / how"], [
    ["Charity's name", "Yes", "Page 1: legal name (English)"],
    ["Charity's address", "Yes", "Page 1. The job refuses to issue a receipt without it"],
    ["Charity's trading name, where different", "No", "Only the legal name prints"],
    ["Charity's NPO / PBO / s18A reference", "Yes, those held", "Page 1, under the charity's name"],
    ["Donor's name", "Yes", "Page 1"],
    ["Donor's address", "Yes", "Page 1. Refused without it"],
    ["Donor's nature (natural person, company, trust)", "Yes", "Page 1: \"Donor (Individual / Company / Trust)\""],
    ["Donor's identification or registration number", "Partly", "Individual: last 4 digits of the ID. Company or trust: full registration number"],
    ["Donor's income tax reference number", "Partly", "Last 4 digits only, when given"],
    ["Donor's contact details", "No", "Email and phone are left off"],
    ["Date(s) and amount of the donation", "Yes", "Dates on page 1; each gift on page 2; total in figures and in words"],
    ["Nature of the donation", "Yes", "Page 1 and page 2 (see 4.5)"],
    ["Statement that the donation has been or will be used exclusively for the objects", "Yes (draft)", "Page 1, quoted in 4.4"],
    ["Receipt number and date issued", "Yes", "Page 1"],
    ["Signature and signer's name", "No", "A real certificate from another charity had one; for Yosef to decide who signs when Givezy issues under a mandate"],
  ])}
  ${w("src/lib/receipts/html.ts", "src/lib/receipts/details.ts (missingForSars)", "docs/go-live-checklist.md (SARS s18A receipt particulars since 1 March 2023)")}
  <h2>4.10 Questions on receipts</h2>
  ${qlist(4)}
</section>`;
  return out;
}
