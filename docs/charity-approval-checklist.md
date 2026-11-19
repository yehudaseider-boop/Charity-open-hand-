# Charity approval checklist (DRAFT for Yehuda and Yosef, 18/11/2026)

Money goes straight from the donor to the charity. A charity that isn't real is real money gone, so approving is the most important job in Admin. The Admin approval form (Admin, Charities, the application, "Decision") now asks for every check below, one tick each, and for who was spoken to and when. Both are kept in the audit trail.

We promise charities a review within 2 working days (`src/config/platform.ts`). Someone has to look at new applications that often: `ADMIN_NOTIFY_EMAIL` hears about each one.

## Before you start

- The application shows no "incomplete" warning (the system checks the required details and documents).
- Admin shows a red "Another charity here has the same NPO or PBO number" warning when one does. Find out why before going further: a copy, a typo, or someone borrowing a real charity's number.

## The five checks (each one must be done, then ticked)

1. **Registration.** Look the NPO number up on the public NPO register, and the PBO number (if one is given) on SARS's public list of approved PBOs. The registered name there must match the name on the application. *To confirm with Yosef: the exact registers and web addresses to use, so this page can name them.*
2. **Documents.** Open every uploaded document. Each must be readable, current and for this organisation (not another with a similar name).
3. **Bank.** The bank confirmation letter must show the same name as the registered name, and the account number on it must match the one entered. (Admin shows the last four digits, and the bank check result.)
4. **A person.** Speak to a named person at the organisation, on a phone number or email you found yourself (the register, their website, a directory), not only the one on the application. Confirm that they applied, who signs for the organisation, and what the money is for. Write down who you spoke to and when. Check the page's history: if the contact email or phone was changed recently (Admin warns about 30 days when resetting a second step), don't use that number.
5. **Real and active.** Its website or social pages (or a reference from someone you trust) show an organisation that matches the application.

## Extra care (stop and ask first)

- Another charity here has the same registration number or bank details.
- The contact details changed recently, or only a free email address is given.
- The bank account name doesn't match the registered name.
- Pressure to hurry, or a request to switch on payments before the checks are done.
- Asking for s18A receipts without the SARS approval letter and a signed receipting mandate (Admin asks for both before the s18A badge).

## The decision

- **All five checks passed:** tick them, write who you spoke to, and approve. The charity gets an email. It is public and shows the Verified badge. It can only receive money once it is connected to the payment provider (a separate step in Admin).
- **Something needs fixing:** use "Send back for changes". The charity sees what to fix.
- **Something is wrong:** don't approve. Write down what you found and tell Yehuda.

## If a charity turns out not to be real, or is suspected not to be

1. **Suspend it in Admin at once** (give a reason). It is hidden and can't receive donations.
2. **Look at Admin, Payments** for gifts to it, so you know what was given and when. Money already paid out to the charity can't be taken back by Givezy.
3. **Tell Yehuda** the same day, with the reason and the gifts affected.
4. **Donors:** decide who tells the donors who gave, and what it says. *Wording and any legal duty to be confirmed with Yosef before anything is sent.*
5. **Reporting:** whether and to whom this must be reported is for Yosef to confirm. *Not decided here.*
6. Keep the audit trail: it shows who approved the charity and what they checked.

## Still to decide (Yehuda and Yosef)

- Who signs off approvals, and whether a second person looks at any of them.
- The exact registers and web addresses for check 1.
- The wording for donors, and the reporting duties, in the section above.
- Who checks new applications when the usual person is away (the 2 working days promise).
