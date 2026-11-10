// The words and pages of the charity onboarding brochure (draft 10/11/2026). Source: Yossi's onboarding process
// document of 10/11/2026, checked against what the product does today (platform.ts, validation.ts, the import
// templates, the team page). Where the two differ, the product wins; docs/charity-onboarding/README.md lists each one.
// House style (CLAUDE.md): sentence case, SA English, R1 250, dd/mm/yyyy, "s18A receipt", no exclamation marks,
// no em dashes, never the payment gateway's name ("the card provider").

export const PAGES = 11;

export function body({ cfg, logo, splash, today, art }) {
  const rand = (cents) => {
    const r = Math.floor(cents / 100);
    const c = cents % 100;
    return `R${String(r).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${c ? "." + String(c).padStart(2, "0") : ""}`;
  };
  const minGift = rand(cfg.minDonationCents);

  // Soft colour splashes bleeding off the page edges, three arrangements in turn (the logo's own shapes and colours).
  const bg = (c, w, pos) => `<i class="bg ${c}" style="width:${w}mm;height:${w}mm;${pos}"></i>`;
  const DECO = [
    bg("peach", 80, "right:-30mm;bottom:20mm") + bg("ring", 46, "left:-22mm;bottom:-16mm") + bg("or", 8, "right:60mm;bottom:20mm") + bg("bl", 5, "left:34mm;bottom:34mm"),
    bg("lil", 92, "left:-36mm;bottom:26mm") + bg("lav", 36, "right:-14mm;bottom:-12mm") + bg("or", 10, "left:60mm;bottom:22mm") + bg("ring-or", 24, "right:30mm;bottom:48mm"),
    bg("peach", 70, "left:-30mm;bottom:-22mm") + bg("lil", 60, "right:-24mm;bottom:30mm") + bg("bl", 7, "left:70mm;bottom:20mm") + bg("or", 6, "left:42mm;bottom:40mm"),
  ];
  const COVER = bg("lil", 104, "left:-42mm;bottom:-44mm") + bg("peach", 140, "right:-50mm;bottom:-40mm") + bg("lav", 30, "right:-8mm;top:46mm") + bg("or", 11, "left:96mm;bottom:104mm") + bg("bl", 6, "right:70mm;bottom:96mm") + bg("ring-or", 22, "left:14mm;bottom:112mm");
  // One of the website's own illustrations, placed in the empty corner of a page.
  const pic = (name, style) => `<div class="pic" style="${style}">${art[name]}</div>`;
  let n = 0;
  const page = (cls, inner) => {
    n += 1;
    const foot = cls === "cover" ? "" : `<div class="foot"><span>Givezy charity onboarding · Draft ${today}</span><span>Page ${n} of ${PAGES}</span></div>`;
    const deco = cls === "cover" ? COVER : DECO[n % DECO.length];
    return `<section class="page ${cls}">${deco}${inner}${foot}</section>`;
  };
  // A blue colour-block header with the ring and dot bleeding off its edges, like the website's blue sections.
  const head = (kicker, title, lead) =>
    `<div class="hd"><div class="hr"></div><div class="hdot"></div><div class="kicker">${kicker}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</div>`;
  const sec = (title, ...parts) => `<div class="panel"><h2>${title}</h2>${parts.join("")}</div>`;

  // ---- fillable fields. data-n is the field's name in the PDF; the renderer turns each into a real form field.
  const text = (name, label, { w = "", h = "", multi = false, hint = "" } = {}) =>
    `<label class="fl" style="${w ? `grid-column: span ${w};` : ""}"><span class="lab">${label}${hint ? ` <i>${hint}</i>` : ""}</span><span class="f${multi ? " multi" : ""}" data-n="${name}" data-k="text" ${multi ? 'data-multi="1"' : ""} style="${h ? `height:${h};` : ""}"></span></label>`;
  const pick = (name, label, options, { w = "" } = {}) =>
    `<label class="fl" style="${w ? `grid-column: span ${w};` : ""}"><span class="lab">${label}</span><span class="f sel" data-n="${name}" data-k="select" data-opts="${options.join("|")}"></span></label>`;
  const tick = (name, label, note = "") =>
    `<div class="tk"><span class="f chk" data-n="${name}" data-k="check"></span><span class="tt">${label}${note ? `<span class="note">${note}</span>` : ""}</span></div>`;
  const grid = (cols, inner) => `<div class="grid" style="grid-template-columns: repeat(${cols}, 1fr);">${inner}</div>`;

  // ---- 1. cover
  const cover = page("cover", `
    <div class="meta"><img class="logo" src="${logo}" alt="Givezy"><img class="splash" src="${splash}" alt=""></div>
    <div class="hero">
      <div class="ring"></div><div class="dot"></div>
      <div class="kicker">Charity onboarding pack</div>
      <h1>Giving made easy.</h1>
      <p>Getting your charity started on Givezy: what happens, what to prepare, and the details we need from you.</p>
    </div>
    <div class="pills"><span>Every charity checked</span><span>s18A receipts made for you</span><span>Free to list</span></div>
    <div class="bottom">
      <span class="draft">Draft for Yehuda to review, ${today}</span>
      <p class="for">For the director or administrator of a charity joining Givezy. Read pages 2 to 6, then fill in pages 7 to 10 on screen and send the file back to us. Page 11 is your go-live checklist.</p>
      <p class="for small">Words in square brackets are still to be filled in by Givezy.</p>
    </div>
    ${pic("findingTheWay", "right:14mm;bottom:12mm;width:50mm;")}`);

  // ---- 2. what Givezy is
  const about = page("", `
    ${head("About Givezy", "What Givezy does for your charity", "Givezy is a South African website and app for giving to registered charities. People find your charity, give once or every month, and keep every gift and s18A receipt in one account.")}
    <div class="cards">
      <div class="card"><b>Checked by a person</b><p>A person looks at each charity's registration documents and bank details before it can take a gift. That check is what donors trust.</p></div>
      <div class="card"><b>Listing is free</b><p>There is no sign-up or monthly fee. The card provider's fee comes off each donation, and the rest goes straight to your charity's own bank account.</p></div>
      <div class="card"><b>s18A receipts made for you</b><p>If your charity is approved to issue s18A receipts, your donors' receipts are made for you, one for each donor each tax year (1 March to the end of February).</p></div>
      <div class="card"><b>Donors stay yours to thank</b><p>You see what you need to thank donors and record their gifts. You never see a donor's ID number, and a donor can give anonymously.</p></div>
    </div>
    <div class="block"><div class="ring"></div><div class="dot"></div><div class="inner">
      <h2>Your charity dashboard</h2>
      <p>One place to see your donations and donors, thank donors, email them news or an appeal, follow your deposits into the bank, and print a QR poster or add a give button to your own website. Nothing to install.</p>
    </div></div>
    ${pic("workingTogether", "right:14mm;bottom:20mm;width:52mm;")}
    <div class="soft" style="max-width:118mm"><h3>How people give</h3>
      <p>Donors pay on the card provider's own secure page. Givezy never sees a card number and never holds the money. The smallest gift is ${minGift}. A donor can add an optional contribution to Givezy, shown on its own line before they pay.</p></div>`);

  // ---- 3. the seven steps
  const steps = page("", `
    ${head("The steps", "Seven steps, about 10 working days", "Our target is 10 working days from your signed agreement to going live. Stages 3 and 5 run side by side, so a slow document never holds up your donor list.")}
    <table class="steps">
      <thead><tr><th>#</th><th>Stage</th><th>Who</th><th>When</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Meet and demo</td><td>Givezy</td><td>Before day 0</td></tr>
        <tr><td>2</td><td>Agreement and kickoff</td><td>Givezy and you</td><td>Day 0 to 1</td></tr>
        <tr><td>3</td><td>Documents and checks</td><td>You send, we check</td><td>Day 1 to 5</td></tr>
        <tr><td>4</td><td>Account setup</td><td>Givezy</td><td>Day 3 to 6</td></tr>
        <tr><td>5</td><td>Donor list</td><td>You prepare, we import</td><td>Day 2 to 7</td></tr>
        <tr><td>6</td><td>Training and test gift</td><td>Both</td><td>Day 7 to 9</td></tr>
        <tr><td>7</td><td>Go-live</td><td>You, with our support</td><td>Day 10</td></tr>
      </tbody>
    </table>
    <p class="muted small">We move to the next stage only when the current one has passed its test, shown below as "Done when".</p>
    <ol class="st">
      <li><b>Meet and demo.</b> We confirm your charity is a registered NPO, NPC or trust, and whether it has PBO and s18A status. You name a main contact and a finance contact. <span class="done">Done when we both agree it is a fit.</span></li>
      <li><b>Agreement and kickoff.</b> We send the service agreement, the data processing agreement and this pack. An authorised director or trustee signs. A 30-minute kickoff call sets your dates. <span class="done">Done when both agreements are signed and your go-live date is set.</span></li>
      <li><b>Documents and checks.</b> You fill in pages 7 to 10 and send the documents on pages 5 and 6. We check each one against the public registers and the bank, and send anything missing back as one list. <span class="done">Done when every item is marked verified.</span></li>
      <li><b>Account setup.</b> We create your account, load your profile and campaigns, set up your logins, set up your s18A receipt with your PBO number and signatory, and connect your verified bank account. You approve your public profile in writing. <span class="done">Done when your profile is approved and your finance contact has signed off the receipt.</span></li>
      <li><b>Donor list.</b> You prepare your donors using our template (page 10) and confirm they can lawfully be contacted. We check the file, send back a list of any errors, import the clean file and give you totals to match against your own records. <span class="done">Done when your totals match.</span></li>
      <li><b>Training and test gift.</b> A 60-minute session for your team on the dashboard, adding donors, campaigns, reports and s18A receipts. Then we make one small real gift from start to finish. <span class="done">Done when the test s18A receipt is right in every field and the money reached your bank account.</span></li>
      <li><b>Go-live.</b> We make your charity live and visible, and give you a launch email, a WhatsApp message and a QR code. You tell your donors. <span class="done">Done when your first gift arrives.</span></li>
    </ol>
    <div class="soft"><h3>After go-live</h3><p>A check-in at 30 days to hear what is working and what is not. After the tax year ends (end of February) we make your s18A receipts for the year.</p></div>`);

  // ---- 4. how we check + file rules
  const checks = page("", `
    ${head("Checks and files", "How we check, and how to send documents", "We check against the source, not only the PDF you send, and we keep a record of every check: the date, who did it and the result.")}
    <table class="chk2">
      <thead><tr><th>What we check</th><th>How</th><th>If it fails</th></tr></thead>
      <tbody>
        <tr><td>Your NPO is registered and in good standing</td><td>NPO register search by your NPO number; the name must match</td><td>We cannot go live</td></tr>
        <tr><td>Your company is active (NPCs)</td><td>CIPC search; directors match your list</td><td>We query it with you</td></tr>
        <tr><td>PBO and s18A status are current</td><td>SARS approval letter, and your TCS PIN on eFiling</td><td>You go live without s18A receipts until it is sorted</td></tr>
        <tr><td>The bank account is yours</td><td>Bank confirmation letter, and a check of name, number and branch with the bank</td><td>No payouts until it is sorted</td></tr>
        <tr><td>Your signatory may sign</td><td>Name is on your director or trustee list and the board resolution</td><td>We ask for a new resolution</td></tr>
        <tr><td>Identity of signatory and contact</td><td>Certified ID matches the details you gave</td><td>We ask for a new copy</td></tr>
        <tr><td>You may fundraise</td><td>We read the objects clause of your founding document</td><td>We query it with you</td></tr>
        <tr><td>Photos of identifiable people</td><td>You confirm you have consent, especially for children</td><td>We remove the photo</td></tr>
      </tbody>
    </table>
    <div class="soft"><h3>Sending documents</h3><ul>
      <li>PDF is best. A phone photo (JPG or PNG) is fine if all four corners and every word are clear.</li>
      <li>Up to 4 MB per file, and one document per file.</li>
      <li>Name each file like this: <b>CharityName_DocumentType.pdf</b>, for example Sample_NPO_Certificate.pdf.</li>
      <li>Certified copies must be certified in the last 3 months. Bank letters and proof of address must also be less than 3 months old.</li>
    </ul></div>
    <div class="open"><p><b class="t">Keep these off email.</b> Please do not type ID numbers, your bank account number or your SARS TCS PIN into this PDF, and do not email them. They go through Givezy's secure application, and we will walk you through it on the kickoff call.</p></div>
    ${pic("shareOnline", "right:16mm;bottom:20mm;width:46mm;")}
    <p class="muted small" style="max-width:120mm">Later changes: if you ever change your bank account, we need a new bank letter and a signed request from an authorised signatory before payouts move. This protects you from fraud.</p>`);

  // ---- 5. what to prepare (1)
  const row = (item, req, fmt, note = "") => `<tr><td>${item}</td><td>${req}</td><td>${fmt}${note ? `<span class="note">${note}</span>` : ""}</td></tr>`;
  const prep1 = page("", `
    ${head("What to prepare", "Your documents and details, part 1", "Typed details go on pages 7 to 10. Documents are sent as files. &quot;If applicable&quot; items become required when your charity has that status, for example s18A.")}
    <h2>Legal registration</h2>
    <table class="prep"><thead><tr><th>Item</th><th>Needed</th><th>Format</th></tr></thead><tbody>
      ${row("Legal name and trading name", "Required", "Typed", "Exactly as on your registration documents")}
      ${row("Type of organisation", "Required", "Typed", "NPC, voluntary association or trust")}
      ${row("NPO registration certificate", "Required", "PDF", "Your NPO number is also typed, like 123-456 NPO")}
      ${row("CIPC registration certificate", "NPCs", "PDF", "Registration number typed, like 2020/123456/08")}
      ${row("Founding document: MOI, constitution or trust deed", "Required", "PDF, signed", "Trusts also send the Letter of Authority from the Master")}
      ${row("Physical and postal address", "Required", "Typed", "Printed on s18A receipts")}
      ${row("What your charity does", "Required", "Typed, up to 500 words", "Shown to donors in the app")}
    </tbody></table>
    <h2>Tax status</h2>
    <table class="prep"><thead><tr><th>Item</th><th>Needed</th><th>Format</th></tr></thead><tbody>
      ${row("SARS PBO approval letter (section 30)", "If applicable", "PDF", "PBO reference number typed")}
      ${row("s18A approval (in the SARS letter or separate)", "If applicable", "PDF", "Without it, donors get normal receipts, not s18A receipts")}
      ${row("Tax Compliance Status (TCS) PIN", "If you are a PBO", "Secure application only", "We verify on SARS eFiling. Refreshed every year")}
      ${row("Income tax reference number", "If applicable", "Secure application only", "10 digits")}
      ${row("A recent s18A receipt of yours", "If applicable", "PDF", "So we can match your wording and numbering")}
      ${row("The last receipt number you issued this tax year", "If applicable", "Typed", "We carry on from it so numbers stay unique")}
      ${row("Your registered representative on SARS eFiling", "If applicable", "Typed", "Name only")}
      ${row("Latest annual financial statements", "Optional", "PDF", "Builds donor trust. Shown as a badge if you send it")}
    </tbody></table>`);

  // ---- 6. what to prepare (2)
  const prep2 = page("", `
    ${head("What to prepare", "Your documents and details, part 2")}
    <h2>Banking and people</h2>
    <table class="prep"><thead><tr><th>Item</th><th>Needed</th><th>Format</th></tr></thead><tbody>
      ${row("Bank confirmation letter", "Required", "PDF, stamped or digitally issued", "Less than 3 months old, in your charity's legal name")}
      ${row("Bank, branch code and account type", "Required", "Typed", "Must match the letter. The account number goes in the secure application")}
      ${row("List of directors, trustees or committee", "Required", "Typed", "Name, role, email and mobile. No ID numbers here")}
      ${row("ID of your signatory and main contact", "Required", "PDF, certified copy", "Smart ID card: both sides")}
      ${row("Proof of your charity's address", "Required", "PDF", "Less than 3 months old: a utility bill, lease or bank statement")}
      ${row("Board resolution authorising Givezy", "Required", "PDF, signed", "Template from Givezy. Names who may sign and who may use the account")}
      ${row("Signed receipting mandate", "Required", "PDF, signed", "Template from Givezy")}
      ${row("Who needs a login", "Required", "Typed", "Name, email, mobile, and Owner or Admin")}
    </tbody></table>
    <h2>Your public profile</h2>
    <table class="prep"><thead><tr><th>Item</th><th>Needed</th><th>Format</th></tr></thead><tbody>
      ${row("Logo", "Required", "SVG, or PNG with a clear background", "At least 1000 by 1000 pixels. We also need a square version for the app icon")}
      ${row("Brand colours", "Optional", "Hex codes", "Up to 2, for example #1A6B4F")}
      ${row("Cover photos", "Required", "JPG or PNG", "3 to 6 photos, at least 1600 by 900 pixels. You confirm you have consent from anyone you can recognise")}
      ${row("Short description", "Required", "Typed, up to 160 characters", "Shown on your charity's card")}
      ${row("Your story", "Required", "Typed, 150 to 500 words", "")}
      ${row("Campaigns at launch", "Optional", "Typed", "Name, goal in rand, start and end dates, description")}
      ${row("Website and social links", "Optional", "Typed", "")}
      ${row("Public email and phone", "Required", "Typed", "Shown to donors")}
    </tbody></table>`);

  // ---- 7. fill in: your charity
  const fill1 = page("fill", `
    ${head("Fill in, 1 of 4", "Your charity", "Type straight into the boxes on screen. Save the file and send it back to us when pages 7 to 10 are done. Leave a box empty if it does not apply.")}
    ${sec("Registration", grid(2, text("legal_name", "Legal name") + text("trading_name", "Trading name, if different") + pick("entity_type", "Type of organisation", ["Choose", "NPC", "Voluntary association", "Trust"]) + text("npo_number", "NPO number", { hint: "like 123-456 NPO" }) + text("cipc_number", "CIPC registration number", { hint: "NPCs, like 2020/123456/08" }) + text("year_started", "Year started")))}
    ${sec("Addresses", grid(2, text("phys_1", "Physical address, line 1") + text("phys_2", "Line 2") + text("phys_suburb", "Suburb") + text("phys_city", "City") + text("phys_code", "Postal code") + text("post_same", "Postal address, if different", { hint: "all on one line" })))}
    ${sec("Tax status", `<div class="tkrow">${tick("is_pbo", "We have PBO status")}${tick("is_s18a", "We are approved to issue s18A receipts")}</div>`, grid(2, text("pbo_ref", "PBO reference number") + text("s18a_ref", "s18A reference, if separate") + text("last_receipt", "Last receipt number issued this tax year") + text("efiling_rep", "Registered representative on eFiling", { hint: "name only" })))}
    ${sec("Banking", grid(2, text("bank_name", "Bank") + pick("bank_type", "Account type", ["Choose", "Cheque or current", "Savings", "Transmission"]) + text("bank_branch", "Branch code") + `<div class="tkrow solo">${tick("bank_legal_name", "The account is in our charity's legal name")}</div>`), `<p class="muted small">Your account number, ID numbers and TCS PIN stay off this form. We collect them through the secure application.</p>`)}`);

  // ---- 8. fill in: people
  const person = (k, who) => grid(4, text(`${k}_name`, `${who}: full name`, { w: 2 }) + text(`${k}_role`, "Role") + text(`${k}_mobile`, "Mobile") + text(`${k}_email`, "Email", { w: 4 }));
  const small = (k, i) => grid(4, text(`${k}_${i}_name`, "Full name", { w: 1 }) + text(`${k}_${i}_role`, "Role") + text(`${k}_${i}_mobile`, "Mobile") + text(`${k}_${i}_email`, "Email"));
  const fill2 = page("fill", `
    ${head("Fill in, 2 of 4", "Your people")}
    ${sec("Who we work with", person("main", "Main contact"), person("fin", "Finance contact"), person("sig", "Authorised signatory (a director or trustee)"))}
    ${sec("Directors, trustees or committee", `<p class="muted small">Name, role, email and mobile. We ask for ID copies separately.</p>`, [1, 2, 3, 4].map((i) => small("dir", i)).join(""))}
    ${sec("Who needs a login", `<p class="muted small">Owner can manage the team. Admin can use everything else.</p>`, [1, 2, 3].map((i) => grid(4, text(`user_${i}_name`, "Full name") + pick(`user_${i}_role`, "Owner or Admin", ["Choose", "Owner", "Admin"]) + text(`user_${i}_mobile`, "Mobile") + text(`user_${i}_email`, "Email"))).join(""))}`);

  // ---- 9. fill in: public profile
  const fill3 = page("fill", `
    ${head("Fill in, 3 of 4", "Your public profile", "This is what donors see in the app and on the website. Write it the way you would say it to a donor.")}
    ${sec("In your own words", grid(1, text("desc_short", "Short description", { hint: "up to 160 characters, shown on your card", h: "12mm", multi: true })), grid(1, text("story", "Your story", { hint: "150 to 500 words", h: "40mm", multi: true })))}
    ${sec("Campaigns at launch", [1, 2].map((i) => grid(4, text(`camp_${i}_name`, "Campaign name", { w: 2 }) + text(`camp_${i}_goal`, "Goal in rand", { hint: "numbers only" }) + text(`camp_${i}_dates`, "Dates", { hint: "dd/mm/yyyy to dd/mm/yyyy" }) + text(`camp_${i}_desc`, "What it is for", { w: 4 }))).join(""))}
    ${sec("Contact and links", grid(2, text("pub_email", "Public email") + text("pub_phone", "Public phone") + text("website", "Website") + text("social", "Social links") + text("colour_1", "Brand colour 1", { hint: "hex, like #1A6B4F" }) + text("colour_2", "Brand colour 2")), `<div class="tkrow solo">${tick("photo_consent", "I confirm we have permission from every person we can recognise in our photos, and from a parent or guardian for any child.")}</div>`)}`);

  // ---- 10. fill in: donor list
  const fill4 = page("fill", `
    ${head("Fill in, 4 of 4", "Your donors and past gifts", "You do not have to move your donors to Givezy, but it saves you re-typing and lets you thank and email them from your dashboard.")}
    ${sec("Your donors today", grid(2, text("donor_count", "Roughly how many donors do you have?") + pick("donor_system", "Where are their details now?", ["Choose", "A spreadsheet", "Another donor system", "Nowhere yet"])), `<p class="lab" style="margin-top:1mm">How do your donors give today?</p><div class="tkrow four">${tick("ch_eft", "EFT")}${tick("ch_card", "Card")}${tick("ch_debit", "Debit order")}${tick("ch_cash", "Cash")}</div>`)}
    <div class="soft"><h3>Your donor file</h3>
      <p>We give you a template (a CSV file that opens in Excel) in your dashboard. One row for each donor, with these columns:</p>
      <p class="cols">First name · Surname · Organisation · Email · Phone · Address · Address line 2 · Suburb · City · Postal code · Note · Tags</p>
      <p>A row needs a name or organisation and an email. Phone and address can stay empty. We check the file, send back a list of any rows that did not work, and you fix them in your own file.</p></div>
    <div class="soft"><h3>Gifts from before Givezy</h3>
      <p>If you want past gifts on record, we give you a second template. One row for each gift, from the start of this tax year at least:</p>
      <p class="cols">Date · Amount · Method · Donor type · First name · Surname · Organisation · Registration number · Email · Phone · s18A · ID number · Tax number · Address · Address line 2 · Suburb · City · Postal code · Campaign · Reference</p>
      <p>Write dates as dd/mm/yyyy, for example 05/03/2026. Write amounts in rand with numbers only, for example 1250.00. For an s18A receipt we need the donor's name, address and ID or registration number.</p></div>
    <div class="panel"><div class="tkrow solo">${tick("popia_ok", "I confirm our donors gave their details to us lawfully, and that we may contact them about our work.")}</div></div>
    ${pic("boxes", "right:12mm;bottom:20mm;width:48mm;")}`);

  // ---- 11. go-live checklist
  const go = page("", `
    ${head("Go-live", "Your go-live checklist", "We tick these off with you. When every box is ticked, your charity goes live.")}
    <div class="soft cl">
      ${tick("gl_1", "Service agreement and data processing agreement signed")}
      ${tick("gl_2", "All required documents verified")}
      ${tick("gl_3", "Bank account verified and payout set")}
      ${tick("gl_4", "Profile, logo, photos and campaigns approved by you")}
      ${tick("gl_5", "s18A receipt signed off, or s18A switched off")}
      ${tick("gl_6", "Receipt numbers carry on from your last number")}
      ${tick("gl_7", "Donor list imported and your totals match")}
      ${tick("gl_8", "Logins created and training done")}
      ${tick("gl_9", "Test gift made, with a correct s18A receipt")}
      ${tick("gl_10", "Launch message and QR code sent to you")}
    </div>
    <h2>Sign off</h2>
    <p class="muted small">By typing your name you confirm the details in this pack are correct to the best of your knowledge.</p>
    ${grid(3, text("so_name", "Full name") + text("so_role", "Role") + text("so_date", "Date", { hint: "dd/mm/yyyy" }))}
    ${pic("dreamGift", "right:14mm;bottom:20mm;width:46mm;")}
    <div class="block"><div class="ring"></div><div class="dot"></div><div class="inner">
      <h2>Send this file back to us</h2>
      <p>Save the PDF after you fill it in and email it to [Givezy contact email to be added], with your documents. If you get stuck, call or message [Givezy contact number to be added] and a person will help.</p>
    </div></div>`);

  return [cover, about, steps, checks, prep1, prep2, fill1, fill2, fill3, fill4, go].join("\n");
}
