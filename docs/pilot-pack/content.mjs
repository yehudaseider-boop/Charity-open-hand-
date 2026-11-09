// The words of the pilot pack. Every fact here comes from the code or docs named in README.md.
// House style (CLAUDE.md): sentence case, SA English, R1 250 / R34.57, dd/mm/yyyy, "s18A receipt",
// no exclamation marks, no em dashes, never the payment gateway's name ("our payment provider").

export function body({ cfg, logo, splash, today }) {
  const rand = (cents) => {
    const r = Math.floor(cents / 100);
    const c = cents % 100;
    const whole = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `R${whole}${c ? "." + String(c).padStart(2, "0") : ""}`;
  };
  const review = `${cfg.applicationReviewWorkingDays} working ${cfg.applicationReviewWorkingDays === 1 ? "day" : "days"}`;
  const minGift = rand(cfg.minDonationCents);
  const maxGift = rand(cfg.maxDonationCents);
  const minContribution = rand(cfg.minContributionCents);
  const late = cfg.taxYear.lateDetailsUntil;
  const months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const lateDay = `${late.day} ${months[late.month]}`;
  const open = (title, text) => `<div class="open"><p><b class="t">${title}</b> ${text}</p></div>`;
  const head = (n, title, lead) => `<div class="badge">${n}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}`;

  return `
<!-- Cover -->
<div class="cover">
  <div class="meta">
    <img class="logo" src="${logo}" alt="Givezy">
    <img class="splash" src="${splash}" alt="">
  </div>
  <div class="hero">
    <div class="ring"></div><div class="dot"></div>
    <h1>Charity pilot pack</h1>
    <p>How to sign up, set up and run your charity on Givezy, in plain words.</p>
  </div>
  <div>
    <span class="draft">Draft for Yehuda to review, ${today}</span>
    <p class="for">For the director or administrator of one of the first charities trying Givezy. Read it once from start to finish, then keep it next to you while you apply. The last page is a checklist to tick before you go live.</p>
    <p class="for small">Words in square brackets, like [to be agreed], are still to be filled in by Givezy.</p>
  </div>
</div>

<!-- Contents -->
<div class="section">
  <h1>What's <span class="k">in this pack</span></h1>
  <ul class="toc">
    <li><b>1</b>What Givezy does for your charity</li>
    <li><b>2</b>What it costs and how the money moves</li>
    <li><b>3</b>Before you start</li>
    <li><b>4</b>Signing up, step by step</li>
    <li><b>5</b>A tour of your dashboard</li>
    <li><b>6</b>Getting donations</li>
    <li><b>7</b>s18A receipts and SARS</li>
    <li><b>8</b>Privacy and security</li>
    <li><b>9</b>The pilot</li>
    <li><b>10</b>Checklist before you go live</li>
  </ul>

  <h2>Givezy in one minute</h2>
  <div class="two">
    <div class="soft"><h3>Free to list</h3><p>No sign-up fee and no monthly fee. Givezy takes no fee from your donations.</p></div>
    <div class="soft"><h3>Paid to you</h3><p>Each donation goes into your own bank account through our payment provider. The provider's card fee comes off each donation.</p></div>
    <div class="soft"><h3>Receipts done</h3><p>With s18A approval and our signed receipting mandate, Givezy issues your donors' s18A receipts in your name, once a year.</p></div>
    <div class="soft"><h3>One dashboard</h3><p>Donations, donors, monthly donors, campaigns, updates, thank-yous and downloads for your bookkeeper, in one place.</p></div>
  </div>

  <h2>What is still being finished</h2>
  <p>Givezy is being tested before it opens to the public. A few things are not final yet, and this pack says so where it matters:</p>
  <ul>
    <li>The payment provider's card fee will be confirmed before going live.</li>
    <li>The Terms, Privacy Policy and s18A receipt wording are with our attorney. s18A receipts can't be issued for real until the wording is approved.</li>
    <li>The phone app is a test version on iPhone (TestFlight) for now.</li>
  </ul>
</div>

<!-- 1 -->
<div class="section">
  ${head(1, `What Givezy <span class="k">does for your charity</span>`, "Givezy is a South African giving platform. Donors find registered charities and give once or every month. You get the money in your own bank account and a dashboard to look after your donors.")}

  <h2>For your donors</h2>
  <ul>
    <li>They find you by name, cause or area, or land straight on your page from a link, a QR code or a button on your website.</li>
    <li>They give once or every month, from ${minGift} a gift. They type their card on our payment provider's secure page. Givezy never sees or stores card details.</li>
    <li>Every gift lands in one list in their Givezy account, with their s18A receipts ready at tax time.</li>
    <li>Monthly donors can pause, restart or cancel themselves, any time, from their account.</li>
  </ul>

  <h2>For you</h2>
  <table>
    <thead><tr><th>What</th><th>What it means for you</th></tr></thead>
    <tbody>
      <tr><td>Your own public page</td><td>Your photo, what you do, how donations are used, suggested amounts and a thank-you note. It goes public once your application is approved.</td></tr>
      <tr><td>Donations and donors</td><td>Every donation and every donor in one place, including gifts that reached you by EFT or cash, which you can record yourself.</td></tr>
      <tr><td>Monthly donors</td><td>Donors can give the same amount every month until they cancel. You see who gives monthly, and when a card is declined.</td></tr>
      <tr><td>Campaigns with a goal</td><td>Raising for something specific, like winter food parcels or a new roof? Donors watch the campaign fill up.</td></tr>
      <tr><td>Thank and update donors</td><td>Post photos and updates, send a monthly thank-you, and email news or an appeal. Givezy sends the emails, so you never handle donors' addresses.</td></tr>
      <tr><td>Downloads for your bookkeeper</td><td>Donations, donors and bank deposits as spreadsheet files (CSV), and an annual report for your board or AGM.</td></tr>
      <tr><td>s18A receipts</td><td>If you have s18A approval and sign our receipting mandate, Givezy issues and emails your donors' s18A receipts in your name, once a year.</td></tr>
    </tbody>
  </table>

  <div class="soft">
    <p><b>Try it first, with sample data.</b> The For charities page on the Givezy website has a link, "Try the dashboard with sample data". It shows the dashboard filled with made-up donations, so you can look around before you apply.</p>
  </div>
</div>

<!-- 2 -->
<div class="section">
  ${head(2, `What it costs and <span class="k">how the money moves</span>`, "Short version: listing is free, Givezy takes nothing from your donations, and the payment provider's card fee comes off each donation.")}

  <table>
    <thead><tr><th>Cost</th><th>What you pay</th></tr></thead>
    <tbody>
      <tr><td>Signing up and listing</td><td>Nothing. No sign-up fee and no monthly fee.</td></tr>
      <tr><td>Givezy platform fee</td><td>None. Givezy charges no platform fee and no processing fee on donations.</td></tr>
      <tr><td>Card fee</td><td>Our payment provider charges a fee on each card payment. Each side pays it on its own share: your charity pays the fee on its donation, and Givezy pays the fee on any contribution a donor adds for Givezy. Your part comes off the donation before the money reaches your bank. The exact fee will be confirmed before going live.</td></tr>
    </tbody>
  </table>

  <h2>How a donation reaches you</h2>
  <ol class="steps">
    <li><b>The donor gives</b>They choose an amount (from ${minGift}, up to ${maxGift} online) and pay on our payment provider's secure page.</li>
    <li><b>The payment provider confirms it</b>A gift only counts as paid once the provider confirms it. Until then it shows as waiting.</li>
    <li><b>The money goes to your bank account</b>The provider pays your gifts into your own bank account in one deposit a day, with its fees taken off. Givezy never holds your donations.</li>
    <li><b>You match it to your bank statement</b>Your dashboard's Deposits page shows each deposit, the gifts it is made of, each fee and what reached your bank, so it matches your bank statement line for line.</li>
  </ol>

  <h2>The donor's optional contribution to Givezy</h2>
  <p>On the give form, a donor can add a separate contribution to Givezy with amount buttons (R10, R15, R20 or Other, at least ${minContribution}). R10 is chosen at the start, and a visible "No thanks" sets it to nothing. It is not part of your donation, it is never on the s18A receipt, and it does not show on your dashboard.</p>

  <h2>Covering the card fee</h2>
  <p>Once the card fee is confirmed, donors will also see an optional box to cover it, so you receive the full gift. The s18A receipt is always for the gift only.</p>

  <h2>Gifts that don't come through Givezy</h2>
  <p>An EFT, cash, a debit order or a gift through another giving programme can be recorded on your dashboard (one at a time, or many from a spreadsheet). No card fee or contribution applies, and if the donor wants one, the gift goes on their yearly s18A receipt with their other gifts to you.</p>

  ${open("To be confirmed before going live:", "the card fee itself (we will tell you the rate before going live), and whether Givezy charges anything for receipting gifts you record yourself. [to be agreed]")}
</div>

<!-- 3 -->
<div class="section">
  ${head(3, `Before <span class="k">you start</span>`, "Applying takes one sitting if your papers are ready. You can also save and come back any time: everything saves as you go.")}

  <h2>Who can sign up</h2>
  <ul>
    <li><b>A registered NPO or PBO.</b> The application asks for your NPO number or your PBO reference number (or both).</li>
    <li><b>s18A receipts need s18A approval from SARS.</b> Organisations without s18A approval are welcome too. Donors can still give; no tax receipts are issued.</li>
    <li><b>The person who applies becomes the owner</b> of your charity on Givezy. Choose someone who will stay involved, because some things only the owner can do (see section 5).</li>
  </ul>

  <h2>Documents to have ready</h2>
  <p class="muted">PDFs or clear photos (JPG or PNG), up to 4 MB each. You can upload straight from your phone.</p>
  <table>
    <thead><tr><th>Document</th><th>When it's needed, and what it must show</th></tr></thead>
    <tbody>
      <tr><td>Bank confirmation letter <span class="who">Everyone</span></td><td>A letter from your bank showing the account is in the organisation's name, with the account number and branch code. Donations are paid into this account.</td></tr>
      <tr><td>PBO approval letter</td><td>If you give a PBO number: the SARS letter confirming your PBO status.</td></tr>
      <tr><td>s18A approval letter</td><td>If you give an s18A reference number: the SARS letter that lets you issue s18A receipts.</td></tr>
      <tr><td>Signed receipting mandate</td><td>If you give an s18A reference number. It authorises Givezy to issue s18A receipts in your name. We send you the mandate to sign; you upload the signed copy and type the date it was signed.</td></tr>
      <tr><td>NPO registration certificate, other papers</td><td>Optional. The upload list also takes these, if they help us check your registration.</td></tr>
    </tbody>
  </table>

  <h2>Details to have ready</h2>
  <ul>
    <li><b>Your organisation:</b> the name donors will see, your registered legal name exactly as on your NPO or PBO documents (it appears on s18A receipts), and your NPO number (it looks like 123-456 NPO), PBO reference and s18A reference, as they apply.</li>
    <li><b>Registered address:</b> the address on your registration documents. It also appears on s18A receipts.</li>
    <li><b>A contact person:</b> full name, email and, if you like, a phone number. We email this person about your application and your page.</li>
    <li><b>Bank account:</b> bank, account holder (the organisation's name), account number and branch code.</li>
    <li><b>A phone with an authenticator app</b> (see the next page).</li>
  </ul>

  <div class="soft"><p><b>How long the check takes.</b> A person at Givezy checks every application by hand and reviews it within ${review} of you submitting it.</p></div>
</div>

<!-- 4 -->
<div class="section">
  ${head(4, `Signing up, <span class="k">step by step</span>`, "Yehuda will send you an invitation link. When you open it, your charity's name is already filled in.")}

  <h2>Getting in</h2>
  <ol class="steps">
    <li><b>Type your organisation's name and your email</b>On the "List your charity" page, then press "Email me a code". There is no password: each time you sign in, Givezy emails you a code.</li>
    <li><b>Type the code from the email</b>You can come back to your application from any device the same way.</li>
    <li><b>Agree to the terms</b>Tick that you agree to the Terms and Privacy Policy and that you are 18 or older.</li>
    <li><b>Set up the second step on your phone (about two minutes)</b>Givezy asks every charity user for a second step when signing in, because your dashboard holds donors' details. See the box below.</li>
  </ol>

  <div class="block"><div class="ring"></div><div class="dot"></div><div class="inner">
    <h3>What is an authenticator app?</h3>
    <p>A free app on your phone that shows a new 6-digit code every 30 seconds or so. When you sign in, Givezy asks for the code that is on your phone right then. Someone who learns your email still can't get in without your phone.</p>
    <p>Good choices are Google Authenticator, Microsoft Authenticator or Authy. Install one, then on the Givezy screen: scan the QR code with the app (or type the key shown underneath), type the 6-digit code it shows, and press "Confirm and continue". You do this once. After that, each sign-in is the email code plus the code from the app.</p>
    <p>Lost or changed your phone? Givezy can reset it once we've checked it's you, using your contact person's details.</p>
  </div></div>

  <h2 class="section">The application: six short steps</h2>
  <p>A progress bar shows how many steps are done. You can skip a step and come back to it.</p>
  <ol class="steps">
    <li><b>Your organisation</b>Name donors will see, registered legal name, NPO, PBO and s18A numbers. About two minutes.</li>
    <li><b>Registered address</b>As on your registration documents.</li>
    <li><b>Contact person</b>Who we email about your application and your page. You can change it later.</li>
    <li><b>Bank account</b>Where donations are paid. It must be in the organisation's name. It is stored encrypted, and only the last four digits are ever shown.</li>
    <li><b>Documents</b>Upload the papers from section 3. A tick shows next to each one that's done.</li>
    <li><b>Submit</b>Tick four declarations: you are authorised to act for the organisation; the information and documents are true and correct; you agree to the Terms and Privacy Policy, including the section for charities; and you will use donors' information only to record donations and thank donors, keep it secure under POPIA, and never sell or share it. Then press "Submit for review".</li>
  </ol>
  <p class="muted">Once submitted, it can't be taken back, and you can't change your details or bank account while we review them. Check the bank details twice.</p>

  <h2>What happens next</h2>
  <ol class="steps">
    <li><b>We check it within ${review}</b>A person checks your registration, bank letter and approvals, then emails your contact person. If something needs fixing, we say exactly what, and you can update the application and send it again.</li>
    <li><b>While you wait</b>Write your public profile, add a cover photo, and add your team (you can add people once your application is sent).</li>
    <li><b>You're approved</b>Givezy connects your charity to our payment provider so you can receive online donations (we do this for you). Your page opens to donors.</li>
    <li><b>Getting started</b>Your dashboard shows a short list that ticks itself off: add a cover photo, tell donors what you do and where gifts go, post your first update, and start a campaign if you're raising for something specific.</li>
  </ol>
</div>

<!-- 5 -->
<div class="section">
  ${head(5, `A tour of <span class="k">your dashboard</span>`, "On a laptop the pages are listed down the side in four groups. On a phone they are one row you scroll sideways.")}

  <table>
    <thead><tr><th>Page</th><th>What it's for</th></tr></thead>
    <tbody>
      <tr><td>Overview</td><td>This month so far, this tax year, monthly donors and donor count; recent donations; where gifts come from; "Needs you this week" (new donors, declined monthly donations, campaigns about to end); shortcuts to share your page.</td></tr>
      <tr><td>Donations</td><td>Every donation, with filters by date and status. Record a gift that reached you another way, or import many from a spreadsheet: we check every row first and nothing is saved until you press Import. Download as CSV.</td></tr>
      <tr><td>Deposits <span class="muted small">(under Donations)</span></td><td>Each deposit our payment provider made into your bank account: the gifts in it, each fee, and what reached your bank. Downloads as CSV for your bookkeeper.</td></tr>
      <tr><td>Monthly donations</td><td>Donors who give the same amount every month, collected on the same day each month. Donors pause, restart or cancel it themselves; you can't change it from here.</td></tr>
      <tr><td>Campaigns</td><td>Raise for one thing at a time, with a goal and, if you like, a last day. Up to 3 at a time. The money comes to you like any other donation.</td></tr>
      <tr><td>s18A receipts</td><td>The yearly list of s18A receipts to check and approve, every receipt issued in your name, and the SARS submission page (see section 7).</td></tr>
      <tr><td>Annual report</td><td>One tax year on one page for your board or AGM: raised, donors, monthly and once-off, the best month, campaigns and s18A receipts. Save it as a PDF; the figures also come as CSV.</td></tr>
      <tr><td>Donors</td><td>Everyone who has given: their gifts, your own tags, follow-up reminders (for example, a call to say thank you) and saved lists. Import donors from a spreadsheet; Givezy never emails people you import. Download as CSV.</td></tr>
      <tr><td>Thank donors</td><td>Write one thank-you a month; we email it to everyone who gave that month, with their first name. Donors can stop these emails any time.</td></tr>
      <tr><td>Email donors</td><td>Send news or an appeal. Givezy sends it, replies go to your contact email, donors who asked not to get emails are left out, and nobody gets more than 4 from you in a month.</td></tr>
      <tr><td>Team</td><td>Who can sign in to your dashboard: the owner and admins.</td></tr>
      <tr><td>Public profile</td><td>Your page: name, what you do, how donations are used, an impact line, suggested amounts, a thank-you note, website, categories, logo and cover photo.</td></tr>
      <tr><td>Photos and updates</td><td>Show donors the real work, on your page and in the Givezy app. Only post photos you have permission to share, and never show a family who receives help without their consent.</td></tr>
      <tr><td>Application</td><td>Your application and its status, your documents, and your contact person.</td></tr>
    </tbody>
  </table>

  <h2>Owner and admins</h2>
  <p>Admins can do almost everything. A few things are for the owner only, because they involve money, donors' inboxes or donors' ID numbers:</p>
  <div class="two">
    <div class="soft"><h3>Owner only</h3><ul class="small">
      <li>Bank account details</li>
      <li>Contact person details</li>
      <li>Adding and removing team members</li>
      <li>Importing donors</li>
      <li>Emailing donors, sending the monthly thank-you, emailing an update</li>
      <li>Your SARS details and the IT3(d) downloads</li>
    </ul></div>
    <div class="soft"><h3>Owner and admins</h3><ul class="small">
      <li>Seeing donations, donors and deposits</li>
      <li>Recording and importing gifts</li>
      <li>Campaigns, profile, photos and updates</li>
      <li>The QR poster, give links and website button</li>
      <li>Downloads (CSV) and the annual report</li>
      <li>The s18A receipts list</li>
    </ul></div>
  </div>
  <p class="muted small" style="margin-top:3mm">After an action, the dashboard says what just happened and, where it can be taken back, offers "Undo". Where it can't be taken back, it asks first.</p>
</div>

<!-- 6 -->
<div class="section">
  ${head(6, `Getting <span class="k">donations</span>`, "Your page is ready to share once you're approved. These are the ways in, all on your dashboard.")}

  <table>
    <thead><tr><th>Way in</th><th>How it works</th></tr></thead>
    <tbody>
      <tr><td>Your Givezy page</td><td>Share the link from your Overview, or press "Share on WhatsApp". Donors also find you by searching Givezy.</td></tr>
      <tr><td>Give link with an amount</td><td>On the QR poster page, choose an amount and once-off or every month. People who use the link or scan its QR code start with that selected; they can still change it.</td></tr>
      <tr><td>QR poster</td><td>Print it for a notice board, your front desk or a table at an event. People point their phone camera at the code and land on your page, ready to give.</td></tr>
      <tr><td>Website button</td><td>A "Give with Givezy" button for your own website. Donors who press it see only your charity. These gifts show as "Website button" on your Donations page.</td></tr>
      <tr><td>Campaigns</td><td>Each campaign has its own "Share this campaign" link.</td></tr>
    </tbody>
  </table>
  <p>The Overview's "Where gifts come from" shows which of these is working: your page, a shared link, the QR poster, the app or your website button.</p>

  <h2>Monthly giving</h2>
  <ul>
    <li>Any donor can choose "every month". The same amount is collected by card on the same day each month, until they cancel.</li>
    <li>Donors pause, restart or cancel it themselves. You can't change a donor's monthly donation, so nobody has to ask you.</li>
    <li>When a card is declined, you see it on Monthly donations and under "Needs you this week".</li>
  </ul>

  <h2>The phone app</h2>
  <p>There is a Givezy phone app for donors, where they can find charities, see campaigns and read your updates. For now it is a test version on iPhone, through Apple's TestFlight, for the people testing Givezy. It is not in the app stores yet, and we can't give a date. While it is being tested, giving from the app opens our website.</p>

  <div class="soft"><h3>A few ideas that cost nothing</h3><ul>
    <li>Put the QR poster up where people already wait or gather.</li>
    <li>Add the link to your email signature and WhatsApp status.</li>
    <li>Post an update with a photo after each project, and send the monthly thank-you.</li>
  </ul></div>
</div>

<!-- 7 -->
<div class="section">
  ${head(7, `s18A receipts <span class="k">and SARS</span>`, "Givezy prepares and sends your donors' s18A receipts in your name. You check the list first, and you submit your own IT3(d) to SARS.")}

  <h2>What has to be in place</h2>
  <ul>
    <li><b>Your s18A approval</b>, confirmed by Givezy from your SARS letter.</li>
    <li><b>Your signed receipting mandate</b>, with the date it was signed. Gifts paid before that date can't go on a receipt.</li>
  </ul>
  <p>Only when both are in place can Givezy issue s18A receipts for you. If you get s18A approval after you join, send Givezy the SARS letter and the signed mandate and we set it up.</p>

  <h2>How the yearly run works</h2>
  <p>The SARS tax year runs from 1 March to the end of February. Receipts are issued once a year, after it ends: one receipt per donor for all their gifts to you that tax year, for the gift amounts only.</p>
  <ol class="steps">
    <li><b>The list appears</b>After the tax year ends, your s18A receipts page shows the donors who asked for a receipt, how many gifts, and how much.</li>
    <li><b>You check it and approve</b>Check the names and amounts. If a name looks wrong or someone is missing, don't approve yet: tell us. Until Givezy signs off, you can take your approval back.</li>
    <li><b>Givezy signs off</b>We check the list, then the receipts are issued and each donor gets theirs by email. Every receipt issued in your name is listed on your dashboard.</li>
  </ol>

  <h2>Donors who give before adding their details</h2>
  <p>An s18A receipt needs the donor's SA ID number (or a company's or trust's registration number) and address. A donor can choose "Add my details after paying" and add them later on the thank-you page or from their account. Until they do, that gift gets no receipt, and your list shows it as "details missing". For the tax year just closed, they can add details until ${lateDay}.</p>

  <h2>Your IT3(d) return to SARS</h2>
  <p>Each charity submits its own IT3(d) to SARS; Givezy prepares the file for you. The owner goes to s18A receipts, then "SARS submission (IT3(d))", fills in your SARS details once (income tax reference number, legal form and registration number), chooses the tax year, and sees anything that must be fixed first.</p>
  <ul>
    <li><b>Up to 50 receipts:</b> download the capture sheet (a spreadsheet) and type it into the IT3-01 form on eFiling.</li>
    <li><b>More than 50:</b> download the SARS data file, which your accountant or a SARS-registered submitter sends to SARS.</li>
  </ul>
  <p>Check your first submission with your accountant.</p>

  ${open("Not final yet:", `the s18A receipt wording is with our attorney, so receipts can't be issued for real until it is approved. The ${lateDay} cut-off and parts of the IT3(d) file are still being confirmed with an accountant.`)}
</div>

<!-- 8 -->
<div class="section">
  ${head(8, `Privacy <span class="k">and security</span>`, "Your dashboard holds people's names, emails and giving. This is what you see, what you don't, and how it is protected.")}

  <table>
    <thead><tr><th>On your dashboard</th><th>What you see</th></tr></thead>
    <tbody>
      <tr><td>You see</td><td>Donors who gave to you: name, contact details, amount, their message, and whether they asked for an s18A receipt.</td></tr>
      <tr><td>You never see</td><td>Card details (Givezy never sees or stores them either), any part of a donor's ID or tax number, donors' contributions to Givezy, or anything about other charities.</td></tr>
      <tr><td>Anonymous donors</td><td>Anonymous on public pages only. You see their details, because you need them to record donations.</td></tr>
      <tr><td>The one exception</td><td>The IT3(d) files for SARS hold donors' full ID numbers, because SARS requires them. Only the owner can download them, and on the page an ID shows only its last 4 digits.</td></tr>
    </tbody>
  </table>

  <h2>How your account is protected</h2>
  <ul>
    <li><b>A second step on every sign-in:</b> the email code plus the code from your authenticator app, for the owner and every admin.</li>
    <li><b>Bank details:</b> stored encrypted; only the last four digits are ever shown.</li>
    <li><b>Changing the bank account after you've applied:</b> this can't be done from the dashboard. Send Givezy a new bank confirmation letter. We check it, make the change, and email your contact person. Online donations pause until we have connected the new account.</li>
    <li><b>Contact person:</b> only the owner can change it. If the email or phone changes, we tell the old address too. We use these details to check it's really you before we reset a sign-in or change the bank account.</li>
    <li><b>Downloads</b> are limited to a few at a time and recorded, so we can see who downloaded what.</li>
  </ul>

  <h2>What we ask of you</h2>
  <ul>
    <li>Give dashboard access only to people who need it, and remove them on the Team page when they leave.</li>
    <li>Use donors' information only to record donations and thank donors, keep it secure, and never sell or share it (you agree to this when you submit).</li>
    <li>Keep downloaded files, especially the IT3(d) files, somewhere safe, and delete copies you no longer need.</li>
  </ul>
  ${open("Still with our attorney:", "the Terms, the Privacy Policy, and the privacy wording about the owner downloading donors' ID numbers for SARS.")}
</div>

<!-- 9 -->
<div class="section">
  ${head(9, `The <span class="k">pilot</span>`, "You are one of the first charities to use Givezy. The point of the pilot is to find what's confusing or broken before anyone else meets it.")}

  <h2>What we ask of you</h2>
  <ol class="steps">
    <li><b>Use it as you really would</b>Apply, write your profile, add your team, share your page, record a gift, download a file. Try it on your phone too.</li>
    <li><b>Try the awkward moments</b>A declined card, a slow connection, a form left half filled in. These matter as much as the smooth path.</li>
    <li><b>Tell us when something goes wrong</b>Say what you were doing, what you expected, and what you saw. A screenshot helps. Note the date and time.</li>
    <li><b>Tell us what's unclear</b>Any word you had to guess at, or any step where you weren't sure what would happen next.</li>
    <li><b>Give us feedback</b>[how and when: a short call or a few questions, to be agreed]</li>
  </ol>

  <h2>What Givezy does in return</h2>
  <p>[to be agreed, for example: help through sign-up, how quickly reported problems are answered, and how you hear when something is fixed]</p>

  <div class="block"><div class="ring"></div><div class="dot"></div><div class="inner">
    <h3>How to reach Yehuda</h3>
    <p>[Yehuda's contact details]</p>
    <p>On the dashboard, where it says to contact us, you can also reply to any email Givezy has sent you.</p>
  </div></div>

  <h2>Pilot terms</h2>
  <table>
    <tbody>
      <tr><td>Where the pilot runs</td><td>[test site or live site, to be agreed]</td></tr>
      <tr><td>Dates</td><td>[to be agreed]</td></tr>
      <tr><td>Real donations during the pilot</td><td>[to be agreed]</td></tr>
      <tr><td>Cost during the pilot</td><td>[to be agreed]</td></tr>
      <tr><td>Leaving the pilot</td><td>[to be agreed]</td></tr>
    </tbody>
  </table>
</div>

<!-- 10 -->
<div class="section">
  ${head(10, `Checklist <span class="k">before you go live</span>`, "Tick each one. If one is stuck, tell Yehuda.")}

  <h2>Before you apply</h2>
  <ul class="tick">
    <li><span class="box"></span><span>NPO number or PBO reference number to hand<span class="note">And your s18A reference, if you have one.</span></span></li>
    <li><span class="box"></span><span>Bank confirmation letter, account in the organisation's name</span></li>
    <li><span class="box"></span><span>PBO approval letter, s18A approval letter and signed receipting mandate, if they apply</span></li>
    <li><span class="box"></span><span>The owner chosen, with an authenticator app on their phone</span></li>
  </ul>

  <h2>Applying</h2>
  <ul class="tick">
    <li><span class="box"></span><span>Signed in with the email code, agreed to the terms, second step set up</span></li>
    <li><span class="box"></span><span>All six application steps done, bank details checked twice</span></li>
    <li><span class="box"></span><span>Submitted for review<span class="note">We review it within ${review}.</span></span></li>
  </ul>

  <h2>Once approved</h2>
  <ul class="tick">
    <li><span class="box"></span><span>"Connected to receive online donations" is ticked on your Overview<span class="note">Givezy does this for you.</span></span></li>
    <li><span class="box"></span><span>Cover photo, what you do and how donations are used, on your public profile</span></li>
    <li><span class="box"></span><span>Team members added, each with their own sign-in</span></li>
    <li><span class="box"></span><span>First update posted</span></li>
    <li><span class="box"></span><span>Page link shared, QR poster printed, or website button added</span></li>
    <li><span class="box"></span><span>A first small gift seen on Donations, then on Deposits, then on your bank statement</span></li>
    <li><span class="box"></span><span>s18A receipts set up, if you have s18A approval<span class="note">Givezy confirms your SARS letter and signed mandate.</span></span></li>
    <li><span class="box"></span><span>The card fee confirmed to you by Givezy</span></li>
  </ul>
</div>
`;
}
