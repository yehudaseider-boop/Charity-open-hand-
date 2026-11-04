// The content of the briefing. Every statement about behaviour carries a "Where to check" line.
import { part2 } from "./part2.mjs";
import { part3 } from "./part3.mjs";
import { part4 } from "./part4.mjs";

export function sections(ctx) {
  const { questions, pages, psv, worked, it3dResult, tests, logo, esc } = ctx;
  const toc = (ctx.toc = []);

  // ---- helpers
  const TAG = {
    built: '<span class="tag built">Built and tested</span>',
    proof: '<span class="tag proof">Built, not yet proven</span>',
    no: '<span class="tag no">Not built or not decided</span>',
  };
  const w = (...refs) => `<p class="where"><b>Where to check:</b> ${refs.map((r) => `<code>${esc(r)}</code>`).join(", ")}</p>`;
  const wt = (text, ...refs) => `<p class="where"><b>Where to check:</b> ${text}${refs.length ? " " : ""}${refs.map((r) => `<code>${esc(r)}</code>`).join(", ")}</p>`;
  const h1 = (key, text, cls = "") => { toc.push({ key, text, level: 1 }); return `<h1 id="${key}" class="${cls}">${text}</h1>`; };
  const TOC_SUBS = new Set(["s2_3", "s3_1", "s3_5", "s4_2", "s4_4", "s4_9", "s5_5", "s6_1", "s6_5", "s7_2", "s7_5", "s9_1", "s9_3"]);
  const h2 = (key, text, inToc = false) => { if (inToc || TOC_SUBS.has(key)) toc.push({ key, text, level: 2 }); return `<h2 id="${key}">${text}</h2>`; };
  const AUD = { A: "Attorney", T: "Accountant", B: "Both" };
  const qlist = (sec) => `<p class="small">Questions ${questions.filter((q) => q.section === sec)[0].id} to ${questions.filter((q) => q.section === sec).at(-1).id} are set out in Appendix A, with the reason for each and space for the answer.</p>`;
  const qlistFull = (sec) =>
    `<ol class="qlist">${questions.filter((q) => q.section === sec).map((q) => `<li><span class="qid">${q.id}</span><span><span class="tag aud">${AUD[q.audience]}</span> ${q.text}</span></li>`).join("")}</ol>`;
  const rows = (arr) => arr.map((r) => `<tr>${r.map((c, i) => `<td${i === r.length - 1 && r.rightLast ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>`).join("");
  const table = (head, body, cols = head[1] === "Status" ? '<colgroup><col style="width:55%"><col style="width:15%"><col style="width:30%"></colgroup>' : "") => `<table>${cols}<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows(body)}</tbody></table>`;
  const c = (s) => `<code>${esc(s)}</code>`;

  let out = "";

  // ===================================================================== cover
  out += `<section class="cover">
  <div class="brand"><img src="${logo}" alt="Givezy"></div>
  <div>
    <h1 class="title">Givezy:<br><span>briefing for legal and tax review</span></h1>
    <div class="rule"></div>
    <div class="meta">
      <div><b>Draft for review, 04/11/2026</b></div>
      <div>Prepared for Yosef, to share with the accountant</div>
      <div class="statusline">Status: test only, nothing live</div>
    </div>
  </div>
  <div>
    <h3 style="margin-top:0">How to read the status labels</h3>
    <div class="legend">
      <div>${TAG.built}</div><div class="small">The code exists and automated tests cover it. Where a test needed the real payment provider or SARS, it does not belong here.</div>
      <div>${TAG.proof}</div><div class="small">The code exists, but it has never run against the real payment provider (beyond the single test donation described in 3.1) or against SARS. It may need changes.</div>
      <div>${TAG.no}</div><div class="small">Nothing is built, or a decision is still open.</div>
    </div>
    <p class="note">Everything described here runs on a test website with a test database. No real donation has ever been taken. Each statement about how the system behaves has a small grey "Where to check" line naming the file in the code, so a technical reviewer can confirm it. Wording on the website that is quoted here is a draft awaiting Yosef.</p>
  </div>
</section>`;

  // ===================================================================== contents (filled later)
  out += `<section class="pb">${h1("contents", "Contents")}
  <!--TOC-->
  <h3>How the numbering works</h3>
  <p class="small">Sections are numbered 0 to 10 and the appendices A to E. Every question has a number made from its section and its order, for example <b>Q4.3</b> is the third question in section 4. All questions are repeated in Appendix A with a line for the answer. Dates are dd/mm/yyyy. Money is in Rand, for example R1 250 and R34.57. Where the code works in whole cents, this document converts to Rand.</p>
</section>`;

  // ===================================================================== 1 summary
  out += `<section class="pb summary">${h1("s1", "1. Summary for busy readers")}
  <p><b>What Givezy is.</b> A website and phone app where people give to registered South African charities. The donor pays by card on the payment provider's own page (Paystack, a South African payment provider). The gift is split by the provider and goes straight to the charity's own bank account. Givezy also issues the yearly section 18A tax receipt for a charity that has signed a mandate, and prepares the file the charity itself sends to SARS (the IT3(d) report). Givezy has no registered company yet.</p>
  <p><b>Where we are.</b> Test site and test database only. One test donation has been paid end to end in the provider's test mode (02/11/2026). Declined card, monthly giving and refund tests are still to do. Email sending is not set up: emails are only written to a log. The phone app sends people to the website to give, because in-app giving is switched off until Apple and Google confirm in writing.</p>
  <h2>The money flow in six lines</h2>
  <ol>
    <li>The donor chooses a charity and an amount (minimum R30) and pays by card on the provider's page. Givezy never sees card details.</li>
    <li>The donor may add a separate contribution to Givezy (unticked by default, minimum R10). Givezy charges no fee on donations.</li>
    <li>The provider splits the payment: the gift goes to the charity's own bank account through a "subaccount"; the contribution stays with Givezy's provider account. Nothing is pooled.</li>
    <li>The provider's own charge is carried by the charity, out of its gift. The provider has not yet given us its rates, so we show no figure.</li>
    <li>A gift counts as paid only when the provider itself confirms the exact amount in rand. A refund or a dispute is held for a person to decide, except a full refund, which marks the gift refunded.</li>
    <li>After each tax year ends (1 March to the end of February) Givezy issues one s18A receipt per donor per charity, and the charity reports to SARS itself.</li>
  </ol>
  <h2>The eight questions that matter most</h2>
  <ol>
    <li><b>{{Q:3:licence}}</b> Does the way we run payments need a licence or registration? <b>{{Q:3:poc}}</b> and <b>{{Q:3:cap}}</b>: the proof-of-concept structure (the founder as sole-proprietor merchant) and the provider's ZAR 1 000 000 cap.</li>
    <li><b>{{Q:4:platform}}</b> and <b>{{Q:4:mandate}}</b>: can a platform issue s18A receipts under a signed mandate, and what must the mandate say?</li>
    <li><b>{{Q:4:wording}}</b> and <b>{{Q:4:fullid}}</b>: the exact receipt wording and particulars, and whether the full ID number must print (today only the last 4 digits).</li>
    <li><b>{{Q:4:cover}}</b>: does a card charge the donor chooses to cover form part of the deductible amount?</li>
    <li><b>{{Q:5:nop}}</b> and <b>{{Q:5:interim}}</b>: which SARS Nature of Person a non-profit company, trust or association uses, and whether SARS expects an interim IT3(d) from a charity that receipts once a year.</li>
    <li><b>{{Q:6:roles}}</b>, <b>{{Q:6:erasure}}</b> and <b>{{Q:6:marketing}}</b>: responsible party or operator, what we keep after erasure, and the rules for charities emailing their donors.</li>
    <li><b>{{Q:3:reversals}}</b> and <b>{{Q:3:cpa}}</b>: who bears refunds and chargebacks, and cooling-off or refund rules for donations and monthly donations.</li>
    <li><b>{{Q:8:vat}}</b> and <b>{{Q:8:income}}</b>: VAT and the tax treatment of Givezy's own income (donor contributions).</li>
  </ol>
  <h2>What we ask of each of you</h2>
  <div class="two">
    <div><p><b>Yosef (attorney).</b> Answer the questions marked Attorney or Both in Appendix A. Approve or amend the draft wording in 7.5. Advise on the proof-of-concept structure before the first live donation, and on the receipt mandate.</p></div>
    <div><p><b>The accountant.</b> Answer the questions marked Accountant or Both. Check the SARS assumptions in 5.5 and the money flow in section 3. Advise on VAT and tax for Givezy (section 8) and on how a charity should book the gift, the contribution and the provider's fee.</p></div>
  </div>
</section>`;

  // ===================================================================== 2 what Givezy is
  const svg = `<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Money flow: donor to payment provider, then the gift to the charity's bank account and the contribution to Givezy">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#1749B5"/></marker></defs>
  <g font-family="DM Sans, Arial, sans-serif" font-size="12" fill="#0E1B3D">
    <rect x="10" y="85" width="120" height="70" rx="12" fill="#F4F1FF" stroke="#ECE8F6"/>
    <text x="70" y="115" text-anchor="middle" font-weight="700">Donor</text>
    <text x="70" y="133" text-anchor="middle" font-size="10.5" fill="#4A5878">pays by card</text>
    <rect x="215" y="70" width="170" height="100" rx="12" fill="#1749B5"/>
    <text x="300" y="104" text-anchor="middle" font-weight="700" fill="#fff">Payment provider</text>
    <text x="300" y="122" text-anchor="middle" font-size="10.5" fill="#fff">own hosted card page</text>
    <text x="300" y="138" text-anchor="middle" font-size="10.5" fill="#fff">splits the payment</text>
    <text x="300" y="154" text-anchor="middle" font-size="10.5" fill="#fff">(nothing is pooled)</text>
    <rect x="520" y="10" width="170" height="80" rx="12" fill="#F4F1FF" stroke="#ECE8F6"/>
    <text x="605" y="40" text-anchor="middle" font-weight="700">Charity's own bank account</text>
    <text x="605" y="58" text-anchor="middle" font-size="10.5" fill="#4A5878">the gift, less the provider's charge</text>
    <text x="605" y="73" text-anchor="middle" font-size="10.5" fill="#4A5878">(charity bears it)</text>
    <rect x="520" y="150" width="170" height="80" rx="12" fill="#FFEBDD" stroke="#ECE8F6"/>
    <text x="605" y="180" text-anchor="middle" font-weight="700">Givezy's provider account</text>
    <text x="605" y="198" text-anchor="middle" font-size="10.5" fill="#4A5878">only the optional contribution,</text>
    <text x="605" y="213" text-anchor="middle" font-size="10.5" fill="#4A5878">a separate flat amount</text>
    <line x1="132" y1="120" x2="213" y2="120" stroke="#1749B5" stroke-width="2.2" marker-end="url(#ar)"/>
    <text x="172" y="112" text-anchor="middle" font-size="10">gift + optional</text>
    <text x="172" y="136" text-anchor="middle" font-size="10">contribution</text>
    <line x1="387" y1="100" x2="518" y2="55" stroke="#1749B5" stroke-width="2.2" marker-end="url(#ar)"/>
    <text x="455" y="62" text-anchor="middle" font-size="10">gift</text>
    <line x1="387" y1="140" x2="518" y2="185" stroke="#1749B5" stroke-width="2.2" marker-end="url(#ar)"/>
    <text x="458" y="178" text-anchor="middle" font-size="10">contribution</text>
    <text x="350" y="245" text-anchor="middle" font-size="10" fill="#4A5878">Givezy sends the instructions (amounts, which charity). Givezy never holds the charity's gift.</text>
  </g></svg>`;

  out += `<section class="sec pb">${h1("s2", "2. What Givezy is and who is who")}
  <p>Givezy is run by the founder, Yehuda. There is no registered company yet: registration and the company's own email come after a first proof of concept (see 3.5 and section 8). Where this document says "we" it means Givezy.</p>
  ${h2("s2_1", "2.1 The parties")}
  ${table(["Party", "What it does", "Personal information it handles"], [
    ["<b>Donor</b>", "Chooses a charity and an amount, pays by card, may ask for an s18A receipt and may add a contribution to Givezy. Must be 18 or older.", "Name, email, optional phone; for an s18A receipt: SA ID number, optional income tax number, address."],
    ["<b>Charity</b>", "A South African charity (NPO or PBO) that applies, is checked by hand and is listed. Its gifts go to its own bank account. It may sign a receipting mandate with Givezy. It reports its own receipts to SARS.", "Its donors' details, and its own contact people and bank details."],
    ["<b>Givezy</b>", "Runs the website and app, checks charities, issues s18A receipts under the mandate, builds the SARS files for each charity, and takes the optional contribution. It is not a bank and does not hold a charity's gift.", "Everything in section 6."],
    ["<b>Payment provider</b>", "Paystack, a South African payment provider. Shows its own card page, takes the payment, splits it, pays the charity's share to the charity's bank account and the contribution to Givezy's account with it. During the proof of concept the account is the founder's personal sole-proprietor account.", "Card details (never seen by Givezy), donor email, amount, the charity's bank details."],
    ["<b>Supabase</b>", "Database, sign-in by emailed code, and file storage. Project in Frankfurt (eu-central-1).", "All personal information in section 6; ID numbers and bank numbers are encrypted before storage."],
    ["<b>Vercel</b>", "Hosts the website and runs the daily scheduled job. Frankfurt (fra1).", "Passes everything through; logs."],
    ["<b>An email provider</b>", "Resend is planned for emails (receipts, confirmations, sign-in codes). Not set up. Today emails are only written to a log, without personal details.", "Recipient email address, message text, receipt PDFs."],
    ["<b>Apple and Google</b>", "Run the app stores. In-app giving is switched off until both confirm in writing that it is allowed; meanwhile the app opens the website to give.", "Developer accounts only; the app never handles card details."],
  ])}
  ${w("src/config/platform.ts", "src/lib/gateway/paystack.ts", "vercel.json", "src/lib/email/index.ts", "docs/go-live-checklist.md (hosting, email, app sections)")}
  ${h2("s2_2", "2.2 How the money moves")}
  <div class="fig">${svg}<p class="cap">Figure 1. The gift and the contribution travel in one card payment but are settled to different accounts by the provider.</p></div>
  ${h2("s2_3", "2.3 Worked example: a once-off gift of R500")}
  <p>These figures were produced on 04/11/2026 by running the code that prices a gift (${c("priceDonation")} with the settings in ${c("src/config/platform.ts")}), not by hand. The donor chooses whether to add a contribution; the R50 below is only an illustration, because there is no default and no suggestion in the code.</p>
  ${table(["Line", "A. Gift only", "B. Gift plus a R50 contribution"], [
    ["The donor pays in total", `<b>${worked.noContribution.shown.totalCents}</b>`, `<b>${worked.withContribution.shown.totalCents}</b>`],
    ["Gift to the charity (before the provider's charge)", worked.noContribution.shown.amountCents, worked.withContribution.shown.amountCents],
    ["Contribution to Givezy", worked.noContribution.shown.contributionCents, worked.withContribution.shown.contributionCents],
    ["Card charge the donor chose to cover", "R0 (box not shown: rates unknown)", "R0 (box not shown: rates unknown)"],
    ["The provider's own charge", "To be confirmed with the provider", "To be confirmed with the provider"],
    ["Who bears the provider's charge", "The charity, out of its gift", "The charity, out of its gift"],
    ["The charity's bank account receives", "R500 less the provider's charge (to be confirmed)", "R500 less the provider's charge (to be confirmed)"],
    ["Givezy's account receives", "R0", "R50 (the flat charge; to be read off the provider's dashboard)"],
    ["Amount printed on the s18A receipt", "R500", "R500 (the contribution is never on a receipt)"],
  ])}
  <div class="box">
    <p><b>Why no provider figure.</b> The three provider settings are empty on purpose until the provider gives us its rate sheet: percentage <code>null</code>, fixed amount <code>null</code>, and whether those rates include VAT <code>null</code>. We do not guess a rate. Because they are empty, the "cover the card charge" box is hidden from donors. When the rates exist, the code adds the smallest amount that leaves the charity with the full R500 after the provider charges its percentage plus fixed amount on the whole payment, rounded up to the cent. A donor's contribution under R10 is refused ("${esc(worked.contributionBelowMinimum)}").</p>
  </div>
  <p><b>Who bears the provider's fee.</b> The setting ${c("gatewayChargePaidBy")} is <code>"charity"</code> (decided 14/10/2026): the provider's charge comes out of the charity's gift. On the provider's side this is requested per payment with a flat "transaction charge" equal to the contribution and the fee bearer set to the subaccount.</p>
  ${wt("", "src/lib/fees.ts", "src/lib/donations/card-charge.ts", "src/lib/gateway/paystack.ts (splitFields)", "docs/legal-briefing/samples/worked-example.json")}
  ${h2("s2_4", "2.4 The settings that define the numbers")}
  <p>All fee, VAT, minimum and tax-year values live in one file and nowhere else. Quoted exactly:</p>
  ${table(["Setting", "Value in the code", "Meaning"], [
    ["minDonationCents", "3 000 (R30)", "Smallest gift to a charity."],
    ["minContributionCents", "1 000 (R10)", "Smallest optional contribution to Givezy, when the box is ticked."],
    ["maxDonationCents", "100 000 000 (R1 000 000)", "Largest single gift accepted online."],
    ["fees.gatewayChargePaidBy", "\"charity\"", "The charity bears the provider's charge."],
    ["fees.gatewayPercent / gatewayFixedCents / gatewayRatesIncludeVat", "null / null / null", "Provider rates: not yet supplied."],
    ["vat.enabled / vat.ratePercent", "false / \"15\"", "VAT is off until Givezy is VAT-registered; the rate is 15%."],
    ["taxYear.startMonth", "3", "Tax year starts 1 March and ends at the end of February."],
    ["donor.minimumAge", "18", "Donors must be 18 or older."],
    ["applicationReviewWorkingDays", "2", "We promise to review a charity's application within 2 working days."],
  ])}
  ${w("src/config/platform.ts")}
  <p class="small muted">There is no platform fee and no processing fee on donations (decision of 08/10/2026). The database still has columns for a platform fee and VAT on a fee; the code writes R0 into both on every donation.</p>
  ${wt("", "src/lib/donations/checkout.ts (platform_fee_cents: 0, fee_vat_cents: 0)", "supabase/migrations/20261006000001_core_schema.sql")}
</section>`;
  const H = { TAG, w, wt, h1, h2, qlist, table, c, AUD };
  return out + part2(ctx, H) + part3(ctx, H) + part4(ctx, H);
}
