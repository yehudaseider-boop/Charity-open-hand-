/**
 * The help guide the charity dashboard's help assistant answers from. Written from the dashboard's own code
 * (src/app/charity-admin and the libraries it uses), with the on-screen wording in quotes, so the assistant can
 * point people to the right page and button. Plain TypeScript, no imports.
 *
 * Rules for whoever edits it: never add a fee, rate, date or rule the code doesn't have; no religious wording;
 * SA English; "s18A receipt" exactly so; dates dd/mm/yyyy; Rand as R1 250. When a page changes, change its section
 * and GUIDE_VERSION together.
 */

export type GuideSection = {
  id: string;
  title: string;
  /** The dashboard route pattern for linking, for example "/charity-admin/[id]/receipts", or "" when there is none. */
  path: string;
  /** Who can see or do it, in plain words. */
  roles?: string;
  body: string;
};

export const GUIDE_VERSION = "2026-11-21";

export const DASHBOARD_GUIDE: GuideSection[] = [
  // Getting in and finding your way
  {
    id: "sign-in",
    title: "Signing in",
    path: "/login",
    roles: "Everyone",
    body: `No password is needed. On the sign-in page, type your email and press "Email me a sign-in code". We email you a code: type it in the box "Code from the email" and press "Sign in". Nothing arrived? Check spam, or press "ask for a new email".

Charity accounts also need a second step, because the dashboard holds donors' details. The first time, the page "Set up a second step" asks you to use an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy: press "Set up authenticator app", scan the code with the app, then type the 6-digit code it shows. It takes a minute, once. After that, each time you sign in you see "Enter your code": open the app and type the 6-digit code for Givezy, then press "Continue".

If a code doesn't work, check it and try again. After too many tries the page asks you to wait 15 minutes. Lost or changed your phone? Givezy can reset the second step once we've checked it's you: contact us (see "Talk to a person").`,
  },
  {
    id: "your-charities",
    title: "Your charities",
    path: "/charity-admin",
    roles: "Everyone in a charity's team",
    body: `"Your charities" lists every charity you help manage, each with its status. Press a charity's name (or "Dashboard") to open its dashboard. Each box also has quick links to "Application" and "Public profile". To list another organisation, use "Apply to list another organisation" at the bottom.`,
  },
  {
    id: "navigation",
    title: "Finding your way around the dashboard",
    path: "/charity-admin/[id]",
    roles: "Everyone in the team",
    body: `The menu is down the side on a laptop and one scrolling row on a phone. It has four groups:
- Giving: "Overview", "Donations", "Monthly donations", "Campaigns", "s18A receipts", "Annual report".
- People: "Donors", "Donor journeys", "Team", "Activity". "Donor journeys" has four tabs along the top of its pages: "Journeys", "Keeping donors", "Thank donors" and "Email donors".
- Your page: "Public profile", "Photos and updates".
- Set-up: "Application".

Pages your role can't use are left out of the menu and the tabs: "Journeys", "Thank donors" and "Email donors" need a role that may message donors (without it, "Donor journeys" opens on "Keeping donors"); "Public profile" and "Photos and updates" need a role that may change your page; "Application" is for the owner and admins.

At the top there is a search box ("Search donations by name or email") and "See your public page" once you are approved. The "QR poster", "Website button", "Record a gift" and "Deposits" pages are reached from buttons on the Overview and Donations pages.

If Givezy staff open your dashboard to help you, a note at the top says so. Anything they save there is real.`,
  },
  {
    id: "roles",
    title: "Roles and what each can do",
    path: "/charity-admin/[id]/team",
    roles: "Everyone can read this; only the owner changes roles",
    body: `There are five roles. There is one owner per charity, and ownership isn't handed over on the dashboard.
- Owner: everything, including the team, roles and the bank account.
- Admin: everything except the team and the bank account.
- Finance: s18A receipts, downloads, the bank account and payouts (view only). Can't email donors or change your page.
- Fundraiser: thanking and emailing donors, the donor journey and your public page. No receipts, downloads or bank details.
- Viewer: sees the dashboard, donors' names and totals. No contact details, and can't change anything.

In more detail: approving or declining s18A receipts and all downloads (donors, gifts, the annual report figures, the IT3(d) files) are for owner, admin and finance. Recording gifts (EFT, cash, imports) is for owner, admin and finance. The application is for owner and admin. Deposits are for the owner and finance.

Some things stay with the owner alone: the team and roles, the charity's own contact details, its SARS registration details, the bank account, importing donor lists, the "Remind to add their details" email and adding existing donors to a journey (general or win-back).

If your role doesn't allow something, the page says so plainly and nothing is changed. Ask your charity's owner if you need it.`,
  },
  {
    id: "undo",
    title: "Undo, and \"What just happened\"",
    path: "",
    roles: "Taking an action back needs the same role as doing it",
    body: `After most actions, a panel at the top of the page says what just happened, offers one next step, and has an "Undo" button. Undo works for 30 minutes after the action. After that, change it again by hand.

Things you can undo include: saving your profile, a new logo or cover image, your video or focus card, donation emails on or off, starting or ending a campaign, posting or removing an update or photo, your thank-you note, approving or correcting one s18A receipt, approving the year's receipt list, recording a gift, importing gifts, importing donors, adding or changing a team member's role, saving or switching a donor journey, and adding donors to a journey (only for those who haven't had an email yet).

Some things can never be taken back, so the page asks first: submitting your application, any email to donors (a monthly thank-you, a personal thank-you, news or an appeal, an s18A details reminder), declining an s18A receipt (the donor is emailed), removing recorded gifts, removing imported donors and removing a team member.`,
  },
  {
    id: "weekly-limit",
    title: "One message a week, and donors who opt out",
    path: "",
    roles: "Applies to every message from your charity",
    body: `Givezy sends each donor at most one message a week from your charity. This counts everything together: a personal thank-you, an s18A details reminder, a news email or appeal, the monthly thank-you and donor journey emails. The week starts on Monday. It is counted per email address, so someone who gave as themselves and as their company still gets one message a week.

What this means on each page:
- Donors: "Say thank you" is replaced by "Messaged this week" until Monday.
- Thank donors: anyone who already had a message this week is left out and the page tells you how many; press "Send the rest" from the Monday after.
- Email donors: the check shows how many are left out because of this.
- Donor journey: an email that meets a week with another message waits for the next week.

Email donors also has its own limit: nobody gets more than 4 emails from you in 30 days.

Donors can stop your emails with one link in every email. Anyone who asked not to get emails is always left out, and the Donors list shows "Asked not to get thank-you emails from charities" where that applies. Givezy never emails people you imported with "Import donors".`,
  },

  // Overview
  {
    id: "overview",
    title: "Overview",
    path: "/charity-admin/[id]",
    roles: "Everyone in the team",
    body: `The Overview is your home page once you are approved. At the top are three buttons: "Print a QR poster", "Website button" and "Record a gift".

Below that you'll find:
- "Getting started", until everything is set up.
- "Needs you this week", once your first donation is in.
- Four figures: "This month so far", this tax year, "Every month" (monthly donations running) and "Donors". Each opens the matching list.
- "Donations by month", "Where gifts come from", "Recent donations" ("See all donations") and "Your biggest supporters".
- Cards for "Campaigns", "Your donors" (the groups New, Coming back, Gave once and Lapsed), "Keeping donors" and "s18A receipts".
- A link "Download paid donations (CSV)" (for owner, admin and finance).

Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included. The payment provider's card fee comes off each donation before it reaches your bank.

If you've set your own figure for what one gift pays for (on Public profile), the Overview shows what this tax year's gifts paid for.

If your page isn't approved yet, the Overview shows where your application stands instead.`,
  },
  {
    id: "getting-started",
    title: "Getting started checklist",
    path: "/charity-admin/[id]",
    roles: "Everyone sees it; each step's \"Open\" button shows only to roles that may do it",
    body: `"Getting started" on the Overview ticks itself off from what is really done. Nothing is ticked by hand. The steps:
- "Connected to receive online donations": Givezy does this for you once you're approved.
- "Bank details saved and checked": Givezy checks the account is in your charity's name. After approval, Givezy adds or changes your bank account for you, with your bank's confirmation letter.
- "Add your logo and a cover photo" and "Tell donors what you do and where gifts go" (Public profile).
- "Write your thank-you note" (Thank donors).
- "Add your SARS details for s18A receipts" (only if you issue s18A receipts; the owner does this).
- "Switch on your donor journey".
- "Post your first update".
- "Give your team their own logins" (optional; the owner does this).

Press "Open" next to a step to go where it is done. If you can't do a step, it says who does. Under the steps are the share tools: copy your link, "Share on WhatsApp", the QR poster, a give link with an amount and the website button.

When every step that counts is done, it says "You're all set" once, with "Hide this".`,
  },
  {
    id: "needs-you-this-week",
    title: "Needs you this week",
    path: "/charity-admin/[id]",
    roles: "Everyone in the team",
    body: `"Needs you this week" on the Overview lists what needs a person, each line with one button to the page where you do it. A line only shows when there is something to do:
- New donors in the last 7 days not yet thanked personally ("Say thank you").
- Monthly donations declined this month and being tried again, and monthly donors who paused in the last 30 days ("See who").
- Monthly donors who stopped in the last 30 days, with what that was a month.
- Donors who asked for an s18A receipt but haven't added the details SARS needs.
- Donors who haven't given in your lapsed period.
- Follow-ups you set on a donor, due today or earlier.
- Campaigns ending within a week ("Share it again").
- Donations refunded or charged back in the last 30 days ("See them").

If nothing needs you, it says "Nothing needs you this week." If part of it couldn't be checked, it names that part, says nothing was changed, and offers "Try again".`,
  },

  // Application and status
  {
    id: "application",
    title: "Your application",
    path: "/charity-admin/[id]/application",
    roles: "Owner and admin; the contact person and bank account steps are the owner's",
    body: `The application has five steps and then Submit. Everything saves as you go, so you can stop and come back.
1. "Your organisation": the name donors will see, your registered legal name, and your NPO or PBO number (and s18A reference number if you have one).
2. "Registered address": it appears on s18A receipts.
3. "Contact person": who we email about your application and your page.
4. "Bank account": where donations are paid. It must be in the organisation's name. Only the last four digits are ever shown.
5. "Documents": a bank confirmation letter; a PBO approval letter if you gave a PBO number; your s18A approval and signed receipting mandate if you gave an s18A reference. PDFs or clear photos, up to 4 MB each.
6. Submit: tick the declarations and press "Submit for review".

Submitting can't be taken back, and your details are locked while we review them. A person checks every application by hand within 2 working days and emails your contact person.

Statuses: "Draft", "Waiting for review", "Approved", "Changes needed" (the reason is shown; make the changes and submit again) and "Suspended" (your page is paused: it is hidden, donors can't give and monthly donations aren't collected; past donations and receipts are kept. Contact Givezy to sort it out).

After approval, only the owner can change the contact person, on this page.`,
  },
  {
    id: "bank-account",
    title: "Your bank account",
    path: "/charity-admin/[id]/application",
    roles: "Owner sets it before submitting; owner and finance can see it",
    body: `Donations are paid into your charity's bank account. Only the owner can enter it, in the "Bank account" step of the application, before the application is submitted. It is stored encrypted, and only the last four digits are ever shown. Givezy checks it is in your charity's name before you go live.

Once your application is submitted or approved, you can't change the bank account yourself. Givezy adds or changes it for you, with your bank's confirmation letter: contact us to do it. Givezy uses your charity's contact details to check who is asking before changing a bank account, so keep the contact person up to date.

Admins, fundraisers and viewers don't see bank details or deposits.`,
  },
  {
    id: "deposits",
    title: "Deposits (payouts to your bank)",
    path: "/charity-admin/[id]/donations/deposits",
    roles: "Owner and finance",
    body: `Open it from Donations, "Deposits". The payment provider pays your gifts into your bank account in one deposit a day, with its fees taken off. Each deposit shows the gifts it is made of, each fee, anything taken back (a refund or chargeback) and what reached your bank, so it matches your bank statement line for line.

Labels you may see: "On its way", "Payout failed", "Adds up" and "Doesn't add up yet".

Downloads: "Download all" as "CSV", "Excel" or "For Xero". "For Xero" is a bank statement file for a clearing account in Xero (for example "Givezy donations"): each deposit becomes the donations in, the card fees out and the deposit out to your bank. In Xero: Accounting, Bank accounts, your clearing account, Import a statement. Ask your bookkeeper to set up the clearing account once.

Not in deposits: gifts you recorded yourself (EFT, cash), which never pass through the payment provider, and donors' contributions to Givezy, which go to Givezy.

s18A receipts are for the gift, not what reached the bank, less any part of it that was refunded.`,
  },

  // Donations
  {
    id: "donations",
    title: "Donations",
    path: "/charity-admin/[id]/donations",
    roles: "Everyone sees the list; downloads for owner, admin and finance",
    body: `Donations lists every donation that went through, newest first. Unpaid and failed payments are not shown to charities.

Filter with:
- The search box ("Search name or email").
- Period: "Any time", "This month", "Last month", "This tax year", "Last tax year" or "Choose dates" (fill in From and To as dd/mm/yyyy).
- Campaign, and where the gift came from ("Website", "App", "WhatsApp", "Shared link", "QR poster", "Website button", "Recorded by you").
- The tabs "All", "Paid", "Refunded", "Charged back".

The total at the top counts everything the filters match, not just one page, and says what refunds or chargebacks were not counted.

Labels on a donation include "s18A requested", "Anonymous publicly" (hidden on public pages only; you still see who it is), "Partly refunded", "Recorded: EFT (bank transfer)" and the campaign.

Downloads (owner, admin and finance): "Download paid donations (CSV)", "Same in Excel" and "Every status". The download matches what is on screen.

Buttons at the top: "Deposits" (owner and finance), "Import from a file" and "Record a gift" (owner, admin and finance).

Press a donation to see its details: when it was paid, how it came in, the donor's details, any message or dedication, and its s18A receipt if one has been issued.`,
  },
  {
    id: "record-gift",
    title: "Record an offline gift (EFT, cash, debit order)",
    path: "/charity-admin/[id]/donations/record",
    roles: "Owner, admin and finance",
    body: `For a gift that reached you another way, so it counts in your totals, the donor's history and, if they want one, their yearly s18A receipt. Only record money that has reached your bank account or your hands.

Steps:
1. Press "Record a gift" on the Overview or Donations.
2. Under "The gift": "Date it came in" (not in the future), "Amount (R)" (for example 1250 or 1250.00), "How it came in" ("EFT (bank transfer)", "Cash", "Debit order", "Another giving programme", "Other"), a campaign if you have one, and a "Reference". The bank reference stops the same gift being recorded twice.
3. Under "Who gave it": a person, a company or a trust, their name, "Email" (their s18A receipt is emailed here) and phone.
4. If they want an s18A receipt, tick it and add their SA ID number (13 digits) for a person, or the registration number for a company or trust, and their street address. The income tax number is optional.
5. Press "Record this gift".

If your charity can't issue s18A receipts through Givezy yet, the gift is kept with the choice for when it can.

Undo works for 30 minutes. After that, you can remove a recorded gift until it is on an issued s18A receipt (see "Remove a gift you recorded").`,
  },
  {
    id: "import-gifts",
    title: "Import donations from a spreadsheet",
    path: "/charity-admin/[id]/donations/import",
    roles: "Owner, admin and finance",
    body: `For many gifts that came in another way, for example from a bank statement or another giving programme. Go to Donations, "Import from a file".

1. Press "Download the template (CSV)" and fill in one gift per row. Every row needs Date (dd/mm/yyyy), Amount (1250 or 1250.00) and Email, plus the donor's first name and surname, or the organisation's name. For an s18A receipt: s18A set to yes, their SA ID number (or a company's CIPC number or a trust's number) and their address. Optional: method, campaign (its exact title), phone and a reference.
2. Save it as CSV (in Excel: File, Save as, CSV). Up to 1 000 gifts and 1 MB per file.
3. Choose the file, pick "How these gifts came in" (used where a row has no method), and press "Check the file". Nothing is saved yet.
4. Read the result: how many gifts are ready, "Rows to fix" and any warnings. Rows with problems are left out.
5. Tick the confirmation and press "Import N gifts".

Undo works for 30 minutes. Each import is listed under "Earlier imports", where "Remove these N gifts" takes the whole file out (asked first, can't be undone).

An amount like 1,250 splits into two columns: write it as 1250, or put it in quotes.`,
  },
  {
    id: "remove-recorded-gift",
    title: "Remove a gift you recorded",
    path: "/charity-admin/[id]/donations",
    roles: "Owner, admin and finance",
    body: `A gift you recorded or imported can be removed until it is on an s18A receipt Givezy has issued.
- One gift: open it from Donations. Under "A mistake?" press "Remove this gift", then "Yes, remove". Then record it again with the right details.
- A whole import: Donations, "Import from a file", "Earlier imports", "Remove these N gifts".

Removing can't be undone, but you can record or import the gifts again. Removed gifts no longer count in your totals or on any s18A receipt.

If it is already on an issued receipt, it can't be removed here: tell Givezy, because only Givezy can withdraw and re-issue a receipt. Card gifts made through Givezy can't be changed or removed by you either: tell Givezy.`,
  },
  {
    id: "refunds-chargebacks",
    title: "Refunds and chargebacks",
    path: "/charity-admin/[id]/donations",
    roles: "Everyone in the team",
    body: `A refunded donation shows as "Refunded", and one the donor's bank reversed shows as "Charged back". A gift refunded in part shows what is left, marked "Partly refunded" or "Refunded in parts". Refunded and charged-back amounts are not counted in your totals, and the total on Donations says how much was left out.

Use the tabs "Refunded" and "Charged back" on Donations to see them. "Needs you this week" on the Overview lists those from the last 30 days.

There is no refund button on the dashboard. If a card gift needs changing, tell Givezy.

s18A receipts only cover what is left of each gift. Refunded and charged-back donations are left out of the IT3(d) files.`,
  },

  // Monthly donations
  {
    id: "monthly",
    title: "Monthly donations",
    path: "/charity-admin/[id]/monthly",
    roles: "Everyone in the team (viewers don't see contact details)",
    body: `Donors who give the same amount every month. Givezy collects it on the day of the month they chose. Donors pause, restart or cancel it themselves; you can't change it from the dashboard.

At the top: "Running" (what comes in a month, from how many donors), "Paused or ended", and "Stopped this tax year" (opens "Monthly donors who stopped").

Tabs: "All", "Running", "Paused", "Stopped or cancelled". You can also search by name or email.

Each monthly donation shows its amount a month and one of these labels:
- "Running".
- "Card declined, trying again".
- "Paused by the donor".
- "Stopped: card declined".
- "Cancelled".
It also shows when it started, how many payments and how much in total, and the next collection date.

Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included.`,
  },
  {
    id: "declined-card",
    title: "What a declined card means",
    path: "/charity-admin/[id]/monthly",
    roles: "Everyone in the team",
    body: `Once-off gifts: a payment that didn't go through (a declined card, or someone who left the payment page) never shows on your dashboard. Only donations that went through appear. The donor can simply try again.

Monthly donations: if the card is declined, nothing is charged that time and the donation shows "Card declined, trying again". Givezy emails the donor that it could not collect, that nothing was charged, and gives them a link to put in a different card. Givezy tries the same card up to three times over the next few days.

If all three tries fail, the monthly donation stops and shows "Stopped: card declined". Nothing more is charged to that card. The donor is emailed that it stopped, with the link to carry on with a new card.

You can't change a donor's card or restart their monthly donation for them. What you can do:
- See who: "Needs you this week" on the Overview, or Monthly donations, "Running" tab.
- Get in touch with donors who stopped, from "Monthly donors who stopped".
- Add them to your win-back journey (owner).`,
  },
  {
    id: "stopped-monthly",
    title: "Monthly donors who stopped",
    path: "/charity-admin/[id]/monthly/stopped",
    roles: "Everyone sees it; download for owner, admin and finance; adding to win-back is the owner's",
    body: `Donors whose monthly donation was cancelled or stopped in the period you choose, newest first, so you can get in touch. A paused donation is not counted, and nor is a donor who has since started a new monthly donation to you.

Periods: "This tax year", "Last tax year", "Last 30 days". The top shows how many stopped and what is "No longer coming in" a month. Each line shows when it ended and why, and their last donation.

"Download this list (CSV)" is for owner, admin and finance.

The owner can tick donors (or "add everyone on this list") and press "Add ticked donors to win-back journey". See "Win-back journey".`,
  },

  // Campaigns
  {
    id: "campaigns",
    title: "Start, share and end a campaign",
    path: "/charity-admin/[id]/campaigns",
    roles: "Everyone sees them; owner, admin and fundraiser start and end them",
    body: `A campaign raises for one thing, like winter food parcels or a new roof. Donors give to it in the Givezy app or on your Givezy page and see how close you are to the goal. The money comes to you like any other donation. You can run up to 3 at a time.

To start one, under "Start a campaign":
1. "Campaign name" (short and clear).
2. "What it's for" (optional, up to 500 characters, real numbers only).
3. "Goal in Rand" (for example 50000).
4. "Last day" (leave empty to keep it open until you end it).
5. Press "Start campaign". Undo works for 30 minutes.

Campaigns appear to donors once your application is approved.

Under "Running now", each campaign shows a goal ring, what was raised and how many donations, and:
- "See who gave" (Donations filtered to it).
- "Emails for this campaign's donors" (its own donor journey).
- "Share this campaign": copy its link or "Share on WhatsApp".
- "End": donors can't give to it any more; donations already made stay with you. Undo works for 30 minutes.

Ended campaigns move to "Ended", with "See who gave" and "Tell them how it went" (Email donors, set to the people who gave to it).`,
  },

  // s18A receipts
  {
    id: "s18a-receipts",
    title: "How s18A receipts work",
    path: "/charity-admin/[id]/receipts",
    roles: "Everyone sees the page; owner, admin and finance approve or decline",
    body: `Givezy issues s18A receipts in your charity's name, for donors who asked for one. Your charity can only issue them once it has confirmed s18A approval and a signed receipting mandate; until then the page says so, and donors are told when they give.

One receipt is issued for each donor, once a year, after the tax year ends. The tax year runs from 1 March to the end of February. Each receipt lists that donor's paid donations to you in that year (gifts you recorded included) and shows the donations only, never a contribution to Givezy.

The yearly steps:
1. The tax year ends.
2. Your list shows as "ready to approve". You check it and approve it (see "Approve the year's s18A receipts").
3. Givezy checks the list and signs it off.
4. The receipts are issued and each donor gets theirs by email.

The page also shows "Who has a receipt" per tax year, the "Yearly list" of issued receipts ("CSV" or "Excel", for owner, admin and finance) and every receipt with "Issued" or "Withdrawn", and "Emailed" or "Not emailed".

The receipt goes to the donor and shows their ID or tax number, which charities don't see on the dashboard. If an issued receipt needs correcting, tell Givezy: only Givezy can withdraw and re-issue one.`,
  },
  {
    id: "approve-receipts",
    title: "Approve the year's s18A receipts",
    path: "/charity-admin/[id]/receipts",
    roles: "Owner, admin and finance",
    body: `After the tax year ends, s18A receipts shows a card for that year: "ready to approve", with counts "to check", "approved" and "declined".

You can check each receipt one by one (press a donor's name to open its preview; see "Check one s18A receipt"), or check the names and amounts in the list and approve them all.

1. Press "Approve all". It asks first and says how many receipts and the total.
2. Press "Yes, approve all". If you already approved every one by one, the button is "Send N approved receipts to Givezy" instead.
3. Nothing is issued yet: the card now says it is waiting for Givezy to check it and sign it off. Then each donor gets their receipt by email.

Until Givezy signs it off, you can press Undo (for 30 minutes) or "Take back my approval", and approve again later. Once signed off, the receipts are issued.

Good to know:
- Amounts come only from recorded donations and can't be typed over. Someone missing or an amount wrong? Record or correct the gift on Donations, or tell Givezy.
- If payments from the last days of the tax year are still waiting for the payment provider, the page warns you; you may want to wait a day or two.
- If the list changes while you look (a gift paid or refunded), nothing is approved and the page shows the new list to approve again.
- If Givezy sends your approval back, the card says why.`,
  },
  {
    id: "check-one-receipt",
    title: "Check one s18A receipt: approve, correct or decline",
    path: "/charity-admin/[id]/receipts",
    roles: "Owner, admin and finance",
    body: `Open a receipt from the year's list on s18A receipts. The page "Check an s18A receipt" shows the donor, the number of donations, the total and a "Preview, not issued" of the receipt. Nothing goes to the donor until you approve it and Givezy signs off your list.

Your decision:
- "Approve this receipt": the name, address and donations look right. Undo works for 30 minutes, or press "Back to To check" any time until the list goes to Givezy.
- "Correct the name or address, then approve": fix a spelling or the address, then "Save and approve". The change is made on the donor's recorded details for these donations, so the receipt and your IT3(d) file match. An ID or tax number can't be changed here: ask the donor to ask for a correction from their Givezy account (Account, Your data).
- "Decline and email the donor": it is left out of your list and Givezy emails the donor to contact you on your charity's phone or email. You can add "A note for your records" (not sent). The email can't be taken back. To decline, your charity's contact phone and email must be set (Application, Contact person).
- A declined receipt can be put back with "Back to To check" (the donor isn't emailed) until Givezy signs off your list.

"Next to check" takes you to the next one. A receipt marked "Changed since" had a gift refunded or paid late after you approved it: check it again.`,
  },
  {
    id: "s18a-details-missing",
    title: "Donors with s18A details missing, and reminders",
    path: "/charity-admin/[id]/donors",
    roles: "Everyone sees the list; only the owner sends reminders",
    body: `A donor who asks for an s18A receipt may add their details after paying. Until they add the ID or registration number and the address SARS needs, their gifts can't go on a receipt. Givezy never receipts without them.

To see who: Donors, then the s18A receipt filter "Details missing" (or the line on "Needs you this week"). Each donor shows what is still needed. On the s18A receipts page the same gifts show under "Details missing". Where it says so, the donor can still add them on Givezy; where it says too late, the donor can ask you for a receipt directly.

To remind them (owner, once your page is live):
1. On "Details missing", tick the donors, or "Choose everyone on this list".
2. Press "Remind to add their details", then "Yes, send them".

Each donor gets one email from your charity, sent by Givezy, saying what is still needed and where to add it. You never see their ID or registration number. Anyone who had a message from you this week, turned off your emails or has added their details since is skipped. Up to 2 000 donors at a time. Reminders can't be taken back.`,
  },
  {
    id: "it3d",
    title: "Download the IT3(d) file for SARS",
    path: "/charity-admin/[id]/receipts/sars",
    roles: "Owner, admin and finance; the charity's SARS details are the owner's",
    body: `Open s18A receipts, then "SARS submission (IT3(d))" (it shows once receipts have been issued). Your charity submits its own IT3(d); Givezy doesn't send anything to SARS.

1. Choose the "Tax year" and the "Period" ("First six months", 1 March to 31 August, or "Full tax year"), then "Check this period".
2. Read "What goes to SARS" (receipts, donors, donations, total) and match it with your books. Only issued s18A receipts and donations paid in the period count.
3. Fix anything listed under "Fix first". The page links to where each is fixed, or says to contact Givezy.
4. Download:
- "eFiling capture sheet (.xlsx)" for up to 50 receipts, typed into the IT3-01 form on eFiling. It downloads even with problems, marked on their rows.
- "SARS data file (.psv)" for any number, sent by your accountant or SARS-registered submitter over SARS HTTPS. It needs the Source Identifier SARS gives, and downloads once the problems are fixed. Choose "Live file" or "Test file for the SARS test environment".

Both files hold donors' full ID numbers: keep them safe, share them only with your accountant or submitter, and delete them once submitted. Check the first submission with your accountant.

Each download is listed under "History". "Mark as uploaded to SARS" keeps your own note (date and reference); Givezy doesn't check it with SARS.

If a period has no receipts, SARS wants a nil declaration, done on eFiling.`,
  },
  {
    id: "sars-details",
    title: "Your charity's SARS details",
    path: "/charity-admin/[id]/receipts/sars",
    roles: "Owner only",
    body: `The IT3(d) files need details about your charity. On "SARS submission (IT3(d))", under "Your charity's SARS details", the owner fills in the "Income tax reference number" (your charity's own 10-digit number from SARS, as on its SARS letters), the legal form and the "Registration number", then presses "Save SARS details". Undo works for 30 minutes.

Your contact person and their phone and email go in the files too: change them on Application, Contact person (owner only).

Other roles see whether the tax reference is on file, not the number.`,
  },
  {
    id: "annual-report",
    title: "Annual report",
    path: "/charity-admin/[id]/report",
    roles: "Everyone sees it; the CSV is for owner, admin and finance",
    body: `A one-page summary of a tax year for your board or funders. Choose the tax year at the top (the current one says "so far").

It shows what was raised and the average donation, donors (new and returning), monthly and once-off donations, month by month with the best month, campaigns, and how many donors asked for an s18A receipt and how many have one. If you've set your own figure for what one gift pays for, it shows what donors paid for. Refunds and chargebacks are listed separately and not counted.

"Save as PDF" opens the print window: choose "Save as PDF" there. "Download the figures (CSV)" is for owner, admin and finance.`,
  },

  // Donors
  {
    id: "donors",
    title: "Donors",
    path: "/charity-admin/[id]/donors",
    roles: "Everyone sees names and totals; viewers don't see contact details",
    body: `Everyone who has given to your charity, plus people you imported. Anonymous donors are anonymous on public pages only: you see their details because you need them to record donations.

Ways to narrow the list:
- Groups: "All", "New" (first donation in the last 30 days), "Coming back", "Gave once" and "Lapsed" (nothing in your lapsed period, 180 days unless you change it).
- s18A receipt: "Everyone", "Asked for an s18A receipt", "Didn't ask", "Details missing".
- Your tags and saved lists.
- "Search name or email", and "Sort by" (usual order is most given first).

Labels include "Gives monthly", "Monthly paused", "s18A requested", "s18A details missing", "Anonymous publicly" and "Imported, no gifts yet".

On the list you can "Say thank you" to a donor. When you pick a group, tag or search, "Keep this list" lets you save it ("Save this list") and, for one group or one tag, "Email these donors".

Buttons at the top: "Download donors (CSV)", "Excel" and "For Salesforce" (owner, admin and finance), and "Import donors (CSV)" (owner).

Press a donor's name to open their page.`,
  },
  {
    id: "donor-page",
    title: "One donor: notes, follow-ups and tags",
    path: "/charity-admin/[id]/donors",
    roles: "Everyone sees it; owner, admin and fundraiser add notes, follow-ups and tags",
    body: `A donor's page shows "Giving to you" (total, number of gifts, first, latest and largest gift, by campaign and how they gave), "Their story with you" (gifts, messages you sent and s18A receipts, newest first) and their latest gifts.

You can also keep track of them:
- "Follow-ups": "What to do" and "When", then "Add follow-up". Mark one "Done" (with "Undo") or "Remove" it. Follow-ups that are due show on "Needs you this week".
- "Tags": your own labels for finding donors later, for example Board member or Volunteer. Type one and press "Add tag"; "Take off" removes it.
- "Notes": only people who manage your charity on Givezy see notes. Donors can ask what's held about them, so write what you'd be happy for them to read.

To thank a donor personally, use "Say thank you" on the Donors list.`,
  },
  {
    id: "donor-settings",
    title: "Lapsed period, tags and saved lists",
    path: "/charity-admin/[id]/donors",
    roles: "Owner, admin and fundraiser",
    body: `At the bottom of Donors, open "Settings: lapsed donors, tags and saved lists".
- "Lapsed after this many days without a gift": between 30 and 730. Givezy's default is 180 (about 6 months). Press "Save". This changes who counts as Lapsed on the Overview and Donors.
- "Your tags": "Delete tag" takes the tag off every donor (asked first). The donors themselves are not changed.
- "Your saved lists": "Remove list".

To save a list: choose a group, tag or search on Donors, then under "Keep this list" give it a name and press "Save this list". Saved lists show at the top of Donors and can be chosen on Email donors.`,
  },
  {
    id: "say-thank-you",
    title: "Send a personal thank-you to one donor",
    path: "/charity-admin/[id]/donors",
    roles: "Owner, admin and fundraiser",
    body: `Once your page is live:
1. Go to Donors (or press "Say thank you" on "Needs you this week").
2. Under the donor, open "Say thank you".
3. Write "Your thank-you" (plain text, up to 1 000 characters). They see their first name above it and your charity's name below. Replies go to your contact email.
4. Press "Send thank-you", then "Yes, send it". An email can't be called back once it's sent.

Givezy sends it for you, so you never need their address. The list then shows "Last thanked personally on" with the date.

The button doesn't show for a donor who asked not to get thank-you emails, whose details were erased, or who already had a message from you this week ("Messaged this week", until Monday). Personal means a few at a time: after many in an hour, the page asks you to try again later.`,
  },
  {
    id: "import-donors",
    title: "Import your existing donor list",
    path: "/charity-admin/[id]/donors/import",
    roles: "Owner only, once Givezy has approved your charity",
    body: `For the donor list you already keep, before those people give through Givezy. Givezy never emails the people you import: they aren't sent appeals, thank-yous or anything else.

1. Donors, "Import donors (CSV)", then "Download the template (CSV)".
2. One person per row: a First name and Surname, or an Organisation. Optional: Email (each only once), Phone (a South African number), Address, Address line 2, Suburb, City and Postal code (4 digits), a Note, and Tags separated by semicolons. Up to 1 000 people and 1 MB per file.
3. Set the phone and postal code columns to Text before you save, so the 0 in front isn't dropped. Leave ID and tax numbers out: they aren't imported or kept.
4. Choose the file and press "Check the file". If any row has a problem, nothing is imported: fix those rows, save as CSV again and check again.
5. Tick the confirmation and press "Import N donors".

Imported people show as "Imported, no gifts yet", and "Has now given" once they give. Undo works for 30 minutes. Under "Earlier imports", the owner can remove a whole file (asked first, can't be undone).`,
  },
  {
    id: "keeping-donors",
    title: "Keeping donors",
    path: "/charity-admin/[id]/keeping",
    roles: "Everyone sees it; download for owner, admin and finance; win-back is the owner's",
    body: `How many of last tax year's donors gave again, and who to get in touch with. Only donations that went through count; refunds don't. Gifts you recorded yourself count.

Choose "This tax year" or "Last tax year", then a list:
- "Gave last tax year, not since".
- "Gave in an earlier year, not since".
- "Gave more than last year".
- "Gave less than last year".

Each donor shows their contact details (not for viewers), amounts and last donation. "Download this list (CSV)" is for owner, admin and finance.

On the first two lists, the owner can tick donors (or "add everyone on this list") and press "Add ticked donors to win-back journey".

Givezy sends a donor at most one message a week from you.`,
  },

  // Messaging donors
  {
    id: "thank-donors",
    title: "Thank donors for a whole month",
    path: "/charity-admin/[id]/thank-donors",
    roles: "Owner, admin and fundraiser send; others see what was sent",
    body: `Write one thank-you and Givezy emails it to everyone who gave in that month, with their first name. You don't need their addresses, and they can stop these emails at any time. One thank-you per month. Your page must be live.

1. Open Thank donors. Under "A thank-you for a whole month", each of the last three months you haven't thanked yet (this month included) shows how many donors gave.
2. Write "Your thank-you" (plain text, up to 1 000 characters). Each donor sees their own first name above it, and nothing about other donors.
3. Press "Send thank-you", then "Yes, send it". It can't be taken back. For the current month, people who give later that month won't get it.

Anyone who already had a message from you this week is left out, and the page tells you how many. A send that stops part way shows "not finished": press "Send the rest" (from the Monday after for those messaged this week). Nobody gets it twice.

Everything sent is listed under "Sent".`,
  },
  {
    id: "thank-you-note",
    title: "Your thank-you note after each gift",
    path: "/charity-admin/[id]/thank-donors",
    roles: "Owner, admin and fundraiser",
    body: `Every donor gets a thank-you email from Givezy as soon as their gift is confirmed. You can add a short note of your own to it. The same note shows on the thank-you page after they pay and in the Givezy app.

1. Open Thank donors, "The thank-you email after each gift".
2. Type "Your thank-you note (optional)": plain words in your own voice, up to 300 characters. Line breaks are kept. No web addresses or formatting. A preview shows how the email looks.
3. Press "Save". Undo works for 30 minutes.

"Back to Givezy's wording" removes your note. The same note can also be edited on Public profile ("Thank-you note to donors").`,
  },
  {
    id: "email-donors",
    title: "Email donors: news and appeals",
    path: "/charity-admin/[id]/email-donors",
    roles: "Owner, admin and fundraiser send; others see what was sent",
    body: `Send your donors news or an appeal. Givezy sends it for you, so you never handle their addresses. Replies go to your contact email. Your page must be live.

1. "Who it goes to": "All your donors", a donor group, a saved list, a tag, or the people who gave to a campaign.
2. "Subject" (what donors see in their inbox) and "Your message" (plain text, up to 5 000 characters; use real numbers only). Each donor sees "Dear" and their first name above it, your charity's name below, and a link to stop these emails.
3. Press "Check who it goes to". It shows how many donors, and who is left out: those who asked not to get emails, those who had a message from you this week, and donors who have only given by EFT, cash or a file you imported (left out for now).
4. Press "Send me a test" to see it in your own inbox.
5. Press "Send to N donors", then "Yes, send it". Sent emails can't be called back. Keep the page open while it sends.

Nobody gets more than 4 emails from you in 30 days. If a send stops part way, press "Send the rest" under "Sent".

From Photos and updates, "Email this to your donors" starts an email from that update.`,
  },
  {
    id: "donor-journey",
    title: "Donor journey: welcome emails for new donors",
    path: "/charity-admin/[id]/journey",
    roles: "Everyone sees it; owner, admin and fundraiser write and switch it; adding existing donors is the owner's",
    body: `A few short emails from you, so a gift turns into a relationship. You write them once; Givezy sends each in your name with the donor's first name. Donors can stop them with one link.

Journeys: the "Donor journey" (everyone's first gift), the "Win-back journey" (donors you add), and one per campaign ("Give a campaign its own journey").

To set one up (Donor journeys, then the "Journeys" tab):
1. Under "Your emails", the journey starts where the donor joins and asks "What would you like to happen first?". Press "Send an email", choose how many days to wait, and write it; every box starts empty with a grey hint, and "Show me an example" fills in sample wording you can change. Each email can have one picture (optional, once pictures are switched on for journeys), with a few words saying what it shows. Then "What would you like next?" adds the next email. Up to five emails. For each, set the days: the first goes 0 to 30 days after someone joins, each next one 7 to 180 days after the one before. Plain words, no web addresses: Givezy adds a button to your page and the stop link. Use "Preview this email" to check it.
2. Press "Save emails". Changes apply from each donor's next email.
3. Under "On or off", press "Switch it on" (once your page is live).

Emails go out each morning. "Switch it off" stops all emails and new joiners; everyone keeps their place. "Who is on it" shows who is waiting for which email.

Once it is on, the owner can "Add your existing donors" (those who gave before), who begin at email 1. Undo works for 30 minutes, only for those who haven't had an email yet.`,
  },
  {
    id: "win-back",
    title: "Win-back journey",
    path: "/charity-admin/[id]/journey",
    roles: "Owner, admin and fundraiser write it; only the owner adds donors",
    body: `Emails for donors you'd like to come back. Donors join only when you add them, and anyone who gives again leaves it.

1. On Donor journeys, "Journeys" tab, open "Win-back journey". Write its emails, "Save emails", then "Switch it on".
2. Go to "Monthly donors who stopped" or "Keeping donors" (the lists "Gave last tax year, not since" or "Gave in an earlier year, not since").
3. Tick the donors, or "add everyone on this list", and press "Add ticked donors to win-back journey".
4. The next page shows who will be added and who is left out. Press "Add N donors", then "Yes, add them".

They start at email 1. You can take this back for 30 minutes, only for those who haven't had an email yet. Donors whose details were erased can't be chosen.`,
  },

  // Team and activity
  {
    id: "team-add",
    title: "Add a team member",
    path: "/charity-admin/[id]/team",
    roles: "Owner only",
    body: `Give someone their own login, with the access their job needs. You can add people once your application is sent to Givezy.

1. Open Team. Under "Give someone access", type "Their email address". They sign in with this address.
2. Choose "Their role": Admin (the default), Finance, Fundraiser or Viewer. Each choice says what it allows.
3. Press "Give access".

Givezy emails them how to sign in. The first time they sign in, they set up a second step on their phone. Everyone except a viewer sees donors' contact details, so add only people you trust with them.

If they already have access, nothing changes: change their role in the list instead. Undo works for 30 minutes. Adding many people in one go is limited; the page asks you to wait an hour if you reach it.`,
  },
  {
    id: "team-change-remove",
    title: "Change a team member's role, or remove them",
    path: "/charity-admin/[id]/team",
    roles: "Owner only; everyone can see who has access",
    body: `"Who has access" lists everyone on the team with their role and since when.

Change a role:
1. Under the person's name, choose the new "Role".
2. Press "Change role".
It applies the next time they open a page. Undo works for 30 minutes. The owner's own role isn't changed here.

Remove someone:
1. Press "Remove" next to their name.
2. Press "Yes, remove".
They lose access to your dashboard and donors' details straight away, and Givezy lets them know. This can't be undone, but you can add them again later.

Anyone else in the team sees a note to ask the owner.`,
  },
  {
    id: "activity",
    title: "Activity: who did what",
    path: "/charity-admin/[id]/activity",
    roles: "Everyone in the team",
    body: `Activity shows who did what on your dashboard, newest first: for example receipts approved or declined, downloads, the SARS files, bank and team changes and the donor journey. The latest 100 things are shown. If it can't load, it says so and nothing is changed: reload the page to try again.`,
  },

  // Your page
  {
    id: "public-profile",
    title: "Edit your charity's public profile",
    path: "/charity-admin/[id]/profile",
    roles: "Everyone sees it; owner, admin and fundraiser change it",
    body: `Your profile goes public once your application is approved. "View your public page" opens it.

Under "Details":
- "Name", "What you do" (who you help and how) and "How donations are used" (specific is best).
- "Your impact line": one line in your own numbers, up to 140 characters, shown with your photo in the app.
- "Suggested amounts": up to three amounts donors can tap. Leave them empty and donors type their own.
- "Thank-you note to donors" (up to 300 characters), "Website" and "Categories".
- "What one gift pays for (optional)": "One costs (R)", "Called (one)" and "Called (many)", for example school breakfast and school breakfasts. Donors then see what their gift pays for.
Press "Save profile". Donors see the changes straight away. Undo works for 30 minutes.

"Logo" (a square image works best) and "Cover image" (about 3 times wider than tall): choose a JPG, PNG or WebP up to 4 MB and press "Upload".

The same page has the focus card, your video and donation emails.`,
  },
  {
    id: "focus-and-video",
    title: "Focus card and video",
    path: "/charity-admin/[id]/profile",
    roles: "Owner, admin and fundraiser",
    body: `On Public profile:

"What we're focused on right now": one thing you want donors to know about now. Between the days you choose it shows as a highlighted card at the top of your public page and your page in the Givezy app, with a button to give.
1. Choose one of your running campaigns (the give button goes to it), or write a "Title" (up to 80 characters).
2. "Short message" (up to 200 characters).
3. "First day it shows" and "Last day it shows" (up to 62 days after the first day).
4. Press "Save focus". "Remove focus" takes it off. One at a time. Givezy doesn't send a notification about it.

"Video": paste the "Link to your video on YouTube or Vimeo" (it must be public) and press "Add video" or "Save video". It shows on your page as "Watch our video" and in the app. Visitors load nothing from YouTube or Vimeo until they press play. "Remove video" takes it off.

Each can be undone for 30 minutes.`,
  },
  {
    id: "donation-emails",
    title: "Email me when a donation comes in",
    path: "/charity-admin/[id]/profile",
    roles: "Owner, admin and fundraiser",
    body: `On Public profile, the "Emails" card has "Email me when a donation comes in", sent to your contact email. The email shows the amount only, never who gave. Tick or untick it and press "Save". When it is off, you can still see every donation on the dashboard. Undo works for 30 minutes.`,
  },
  {
    id: "updates",
    title: "Photos and updates",
    path: "/charity-admin/[id]/updates",
    roles: "Everyone sees them; owner, admin and fundraiser post and remove",
    body: `Show donors the real work. Updates and photos appear on your page on the website and in the Givezy app once your application is approved. Only post photos you have permission to share, and never show a family who receives help without their consent.

Post an update:
1. "Your update": what you did with donations lately, up to 500 characters, real numbers only.
2. Optional: a "Photo" (JPG, PNG or WebP, up to 4 MB) and a "Video link" (a public YouTube or Vimeo video).
3. Press "Post update".

Under "Your updates", "Email this to your donors" starts an email from it (for roles that may email donors). Updates aren't edited in place: remove one and post it again.

Photos: up to 12. Choose a "Photo", add a "Caption (optional)" (up to 120 characters) and press "Add photo". Remove one to add another.

"Remove" takes an update or photo off at once. Undo works for 30 minutes.`,
  },
  {
    id: "share-page",
    title: "Share your page",
    path: "/charity-admin/[id]",
    roles: "Everyone in the team",
    body: `Ways to share, each tagged so Donations shows where gifts came from:
- Copy your page's link, or "Share on WhatsApp": in "Getting started" on the Overview.
- A campaign: Campaigns, "Share this campaign".
- A printed QR code: "Print a QR poster".
- A link or QR code with an amount already chosen: QR poster, "Give link with an amount".
- A button on your own website: "Website button".

Gifts then show on Donations and the Overview as "Shared link", "WhatsApp", "QR poster" or "Website button". Sharing works once your charity is approved and listed.`,
  },
  {
    id: "qr-poster",
    title: "QR poster and give links with an amount",
    path: "/charity-admin/[id]/poster",
    roles: "Everyone in the team, once your charity is approved",
    body: `A printable A4 poster with your charity's name and a large QR code to your Givezy page, for a notice board, front desk or event table. People point their phone camera at the code and land on your page, ready to give. If you issue s18A receipts, the poster says so.

1. Overview, "Print a QR poster".
2. Press "Print poster". In the print window, choose "Save as PDF" to email it or send it to a print shop.
3. "Download the QR code only" saves just the code as an image.

"Give link with an amount": type an "Amount in Rand" (optional), choose "Once-off" or "Every month", and press "Show my link". The link to copy and the QR code on the poster then open your give form with that choice already selected. Donors can still change it. The page shows the amounts allowed; leave it empty for your page without an amount.`,
  },
  {
    id: "website-button",
    title: "Add a give button to your website",
    path: "/charity-admin/[id]/website-button",
    roles: "Everyone in the team, once your charity is approved",
    body: `Put a "Give with Givezy" button on your own website. Donors who press it land on your Givezy page and see only your charity. Gifts made this way show as "Website button" on Donations.

1. Overview, "Website button".
2. Under "Make your button", choose the "Colour" (Blue or White), the "Words on the button" ("Give with Givezy" or "Donate"), and where it goes (your Givezy page or a running campaign). A preview shows it.
3. "1. Copy the button code": press "Copy code". Or "Or copy just the link" with "Copy link", for your own button, an email or a newsletter.
4. "2. Add it to your website": open the steps for WordPress, Wix, Squarespace, or "Anything else, or your web designer". It takes about five minutes.

Stuck? Send Givezy your website address and we'll help you put it up.`,
  },

  // Downloads
  {
    id: "downloads",
    title: "All the downloads in one place",
    path: "/charity-admin/[id]/donations",
    roles: "Owner, admin and finance (deposits: owner and finance)",
    body: `- Donations: "Download paid donations (CSV)", "Same in Excel", "Every status" (Donations, matching your filters; also on the Overview).
- Donors: "Download donors (CSV)", "Excel", "For Salesforce" (Donors).
- Keeping donors and Monthly donors who stopped: "Download this list (CSV)".
- Annual report: "Download the figures (CSV)".
- s18A receipts: "Yearly list" as "CSV" or "Excel".
- SARS submission (IT3(d)): "eFiling capture sheet (.xlsx)" and "SARS data file (.psv)".
- Deposits: "CSV", "Excel", "For Xero" (owner and finance).
- Import templates: Donations, "Import from a file", and Donors, "Import donors (CSV)", each have "Download the template (CSV)".

Downloads are listed on Activity. Files with donors' details should be kept safe.`,
  },

  // Limits and help
  {
    id: "what-givezy-does-not-do",
    title: "What Givezy does not do",
    path: "",
    body: `- Card details: donors pay on the payment provider's secure page. Givezy never sees their card, and the dashboard never shows card details.
- ID and tax numbers: you never see a donor's ID or tax number on the dashboard. They appear only on the donor's own s18A receipt and in the IT3(d) files (for owner, admin and finance), which the law requires.
- Monthly donations: you can't pause, restart, cancel or change a donor's monthly donation or card. Donors do this themselves.
- Refunds: there is no refund button. If a card gift needs changing, tell Givezy.
- Issued s18A receipts: you can't withdraw or re-issue one. Only Givezy can.
- Bank account after approval: Givezy changes it for you, with your bank's confirmation letter.
- SARS: Givezy doesn't send your IT3(d) to SARS and can't see what SARS received.
- Imported donors: Givezy never emails people you imported.
- Notifications: Givezy doesn't send donors a notification about your focus card.`,
  },
  {
    id: "fees",
    title: "Fees and what reaches your bank",
    path: "/charity-admin/[id]/donations/deposits",
    roles: "Deposits: owner and finance",
    body: `The dashboard doesn't show Givezy's charges or the card rates. For any question about fees or rates, ask the Givezy team.

What the dashboard does show:
- Amounts on the Overview, Donations and Monthly donations are the donations only. Any contribution a donor chose to add for Givezy is not included; it goes to Givezy.
- The payment provider's card fee comes off each donation before it reaches your bank.
- Deposits shows each deposit with the gifts in it, each fee taken off and what reached your bank.
- s18A receipts are for the gift, not what reached the bank.`,
  },
  {
    id: "talk-to-a-person",
    title: "Talk to a person at Givezy",
    path: "",
    roles: "Everyone",
    body: `You can reach a person at Givezy:
- Email: hello@givezy.co.za
- WhatsApp: 078 616 0489

Contact us for anything the dashboard can't do for you: changing your bank account, correcting or re-issuing an issued s18A receipt, a card gift that needs changing, resetting your second step after losing your phone, a paused page, help putting the website button up, or something on the SARS page you can't fix yourself. You can also reply to any email Givezy has sent you.

When something goes wrong on a page, it says what happened and that nothing was changed, and usually offers "Try again".`,
  },
];
