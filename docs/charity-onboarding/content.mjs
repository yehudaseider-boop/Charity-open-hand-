// The words and pages of the charity onboarding brochure (draft 10/11/2026). Source: Yossi's onboarding process
// document of 10/11/2026, checked against what the product does today (platform.ts, validation.ts, the import
// templates, the team page). Where the two differ, the product wins; docs/charity-onboarding/README.md lists each one.
// House style (CLAUDE.md): sentence case, SA English, R1 250, dd/mm/yyyy, "s18A receipt", no exclamation marks,
// no em dashes, never the payment gateway's name ("the card provider").

export const PAGES = 5;

export function body({ logo, splash, today, art }) {

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
    <div class="pills"><span>Every charity checked</span><span>s18A receipts made for you</span><span>Your own bank account</span></div>
    <div class="bottom">
      <span class="draft">Draft for Yehuda to review, ${today}</span>
      <p class="for">For the director or administrator of a charity joining Givezy. Read pages 2 and 3, fill in pages 4 and 5 on screen, and send the file back to us with your documents.</p>
      <p class="for small">Words in square brackets are still to be filled in by Givezy.</p>
    </div>
    ${pic("findingTheWay", "right:14mm;bottom:12mm;width:50mm;")}`);

  // ---- 2. about Givezy and the five steps, on one page
  const step = (title, what, when) => `<li><b>${title}</b> <span class="when">${when}</span><span class="what">${what}</span></li>`;
  const aboutSteps = page("", `
    ${head("About Givezy", "Givezy, and how you get started", "Givezy is a South African website and app for giving to registered charities. People find your charity, give once or every month, and keep every gift and s18A receipt in one account.")}
    <div class="cards">
      <div class="card"><b>Checked by a person</b><p>We check every charity's registration and bank details by hand before it can take a gift.</p></div>
      <div class="card"><b>Straight to your bank</b><p>Donations go to your own bank account. The card provider's fee comes off each donation before it reaches you.</p></div>
      <div class="card"><b>s18A receipts made for you</b><p>If you are approved for s18A, each donor gets one s18A receipt a tax year, made for you.</p></div>
      <div class="card"><b>Your donors, your thank-yous</b><p>You see what you need to thank donors and record their gifts. You never see a donor's ID number.</p></div>
    </div>
    <h2>Five steps, live within 5 working days</h2>
    <ol class="st big">
      ${step("Meet and demo", "We show you Givezy and check it's a fit.", "Before you start")}
      ${step("Quick approval", "Send us your PBO number and SARS s18A approval. We check them with SARS and confirm by email, usually the same day.", "Day 1")}
      ${step("Your details and training", "Once approved, you add the rest of your details, your bank account and your s18A receipt template, so we can automate your receipts and IT3(d) reporting. At the same time you get short training videos to watch at your own pace.", "Days 1 to 3")}
      ${step("Team training", "A one-hour session with your team to answer questions and walk through your dashboard.", "Day 3 or 4")}
      ${step("Pre-launch", "We set up your account, import your donors, and send them an email inviting them to download the Givezy app and give through it.", "Days 4 and 5")}
    </ol>`);

  // ---- 3. what to send
  const doc = (name, label, note = "") => tick(name, label, note);
  const send = page("", `
    ${head("What to send", "Documents to send us", "Tick each one off as you go. Send them as files with this pack.")}
    <div class="two">
      <div class="panel"><h2>Every charity</h2>
        ${doc("d_npo", "NPO registration certificate")}
        ${doc("d_founding", "Founding document, signed", "Your MOI, constitution or trust deed. Trusts also send the Letter of Authority.")}
        ${doc("d_bank", "Bank confirmation letter", "Less than 3 months old, in your charity's legal name.")}
        ${doc("d_id", "Certified ID of your signatory and main contact", "Both sides of a smart ID card.")}
        ${doc("d_address", "Proof of your charity's address", "Less than 3 months old.")}
        ${doc("d_resolution", "Board resolution authorising Givezy", "We give you the template.")}
        ${doc("d_mandate", "Signed receipting mandate", "We give you the template.")}
        ${doc("d_logo", "Your logo and 3 to 6 photos", "Logo at least 1000 by 1000 pixels. Photos at least 1600 by 900.")}
      </div>
      <div>
        <div class="panel"><h2>If it applies to you</h2>
          ${doc("d_cipc", "CIPC registration certificate", "If you are an NPC.")}
          ${doc("d_pbo", "SARS PBO approval letter")}
          ${doc("d_s18a", "s18A approval from SARS")}
          ${doc("d_receipt", "A recent s18A receipt of yours", "So we can match your wording and numbers.")}
          ${doc("d_afs", "Latest annual financial statements", "Optional. Shown to donors as a badge.")}
        </div>
        <div class="soft"><h3>How to send files</h3><ul>
          <li>PDF is best. A clear phone photo is fine.</li>
          <li>Up to 4 MB each, one document per file.</li>
          <li>Name them like Sample_NPO_Certificate.pdf.</li>
          <li>Certified copies: certified in the last 3 months.</li>
        </ul></div>
      </div>
    </div>
    <div class="open"><p><b class="t">Keep these off email.</b> Do not type or email ID numbers, your bank account number or your SARS TCS PIN. You enter them on Givezy's secure application, and we show you how on the kickoff call.</p></div>`);

  // ---- 4. fill in: your charity and your people
  const person = (k, who) => grid(3, text(`${k}_name`, who) + text(`${k}_mobile`, "Mobile") + text(`${k}_email`, "Email"));
  const fill1 = page("fill", `
    ${head("Fill in, 1 of 2", "Your charity and your people")}
    ${sec("Your charity", grid(2, text("legal_name", "Legal name") + text("trading_name", "Trading name, if different") + pick("entity_type", "Type of organisation", ["Choose", "NPC", "Voluntary association", "Trust"]) + text("npo_number", "NPO number", { hint: "like 123-456 NPO" }) + text("cipc_number", "CIPC number", { hint: "NPCs only" }) + text("phys_1", "Street address") + text("phys_suburb", "Suburb") + text("phys_city", "City") + text("phys_code", "Postal code") + text("post_addr", "Postal address, if different")))}
    ${sec("Tax and bank", `<div class="tkrow">${tick("is_pbo", "We have PBO status")}${tick("is_s18a", "We can issue s18A receipts")}</div>`, grid(3, text("pbo_ref", "PBO reference number") + text("last_receipt", "Last receipt number issued this tax year") + text("bank_name", "Bank") + text("bank_branch", "Branch code") + pick("bank_type", "Account type", ["Choose", "Cheque or current", "Savings", "Transmission"])), `<p class="muted small">Type into the boxes on screen. Your account number goes on the secure application, not here.</p>`)}
    ${sec("Who we work with", person("main", "Main contact: full name"), person("fin", "Finance contact: full name"), person("sig", "Signatory (a director or trustee): full name"))}
    ${sec("Who needs a login", [1, 2].map((i) => grid(3, text(`user_${i}_name`, "Full name") + pick(`user_${i}_role`, "Owner (manages the team) or Admin", ["Choose", "Owner", "Admin"]) + text(`user_${i}_email`, "Email"))).join(""))}`);

  // ---- 5. fill in: profile, donors, sign off
  const fill2 = page("fill", `
    ${head("Fill in, 2 of 2", "Your profile and your donors", "What donors see in the app and on the website, then a few questions about your donors.")}
    ${sec("In your own words", grid(1, text("desc_short", "Short description", { hint: "one or two sentences, up to 160 characters", h: "11mm", multi: true })), grid(1, text("story", "Your story", { hint: "150 to 500 words", h: "28mm", multi: true })), grid(2, text("pub_email", "Public email") + text("pub_phone", "Public phone") + text("website", "Website") + text("social", "Facebook or Instagram")), `<div class="tkrow solo">${tick("photo_consent", "We have permission from everyone we can recognise in our photos, and from a parent or guardian for any child.")}</div>`)}
    ${sec("Your donors", grid(2, text("donor_count", "Roughly how many donors do you have?") + pick("donor_system", "Where are their details now?", ["Choose", "A spreadsheet", "Another donor system", "Nowhere yet"])), `<div class="tkrow four">${tick("ch_eft", "EFT")}${tick("ch_card", "Card")}${tick("ch_debit", "Debit order")}${tick("ch_cash", "Cash")}</div>`, `<p class="muted small">We send you a simple spreadsheet to fill in: one row for each donor with their name, email and, if you have them, phone and address.</p>`, `<div class="tkrow solo">${tick("popia_ok", "Our donors gave us their details lawfully, and we may contact them about our work.")}</div>`)}
    ${sec("Sign off", grid(3, text("so_name", "Full name") + text("so_role", "Role") + text("so_date", "Date", { hint: "dd/mm/yyyy" })), `<p class="muted small">By typing your name you confirm the details in this pack are correct.</p>`)}
    <div class="block"><div class="ring"></div><div class="dot"></div><div class="inner">
      <h2>Send it back to us</h2>
      <p>Save this PDF and email it, with your documents, to [Givezy contact email to be added]. Stuck? Call or message [Givezy contact number to be added] and a person will help.</p>
    </div></div>`);

  return [cover, aboutSteps, send, fill1, fill2].join("\n");
}
