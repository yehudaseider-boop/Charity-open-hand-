# Charity onboarding pack (draft 10/11/2026)

An 11-page fillable PDF for a charity joining Givezy: what Givezy does, the 7 steps and timeline, how we check, what to prepare, four pages of boxes the charity types into on screen, and a go-live checklist with a sign-off. Draft for Yehuda to review; words in square brackets (the contact email and number) are still to be filled in.

Source: Yossi's "Givezy Charity Onboarding Process" document (10/11/2026), checked against what the product does today.

## Rebuild

From the repo root, with Node 22 or later and the Playwright Chromium that is already installed:

1. `npm install --no-save pdf-lib` (adds the fillable-field library without changing package.json).
2. `node docs/charity-onboarding/build.mjs` writes `onboarding.html`. The words are in `content.mjs`, the look in `template.html`. The review time and smallest gift are read from `src/config/platform.ts`; the illustrations come from `src/components/illustration-art.ts`. The build stops if an em dash, an exclamation mark or a gateway name slips into the words, or if the card fee rates are filled in (then check what the pack says about fees).
3. `node docs/charity-onboarding/render.mjs` makes `Givezy-charity-onboarding-pack.pdf` (A4) and lays real form fields over it. It stops if any page has too much on it, if two fields share a name, or if Chrome makes a different number of pages.

`PACK_DATE=dd/mm/yyyy` changes the date on the pages.

## Where the pack follows the product, not the process document

| Process document | Pack says | Why |
|---|---|---|
| Files up to 10 MB | Up to 4 MB | The site accepts 4 MB (`MAX_UPLOAD_BYTES`): the host refuses anything over 4.5 MB |
| Import files with `donor_ref`, `id_or_reg_number`, ISO dates, +27 phones | The two real templates: donor file (12 columns) and gift file (20 columns), dd/mm/yyyy, plain rand | That is what the import pages accept (`CONTACT_TEMPLATE_HEADINGS`, `TEMPLATE_HEADINGS`) |
| Roles Admin, Finance, Fundraiser, Viewer | Owner and Admin | The team page has only those two |
| Documents: 12 kinds | All 12 listed; the site has 5 named upload types plus "Other supporting document" | The extra ones go in as "Other" today |
| 18A | s18A | House style |

## Left out on purpose

- Everything under "Open questions to decide" in the process document (SARS Public Notice 6762, Givezy as IT3(d) submitter, the money flow, relaxed checks for pilot charities, who builds the application form).
- Pricing: the document says "pricing tier agreed verbally", and no tier is written down.
- ID numbers, the bank account number and the TCS PIN: the pack tells charities not to type or email them, and to use the secure application instead.
- The charity "Sozo" named in the document's example file name (the pack uses "Sample").

## Things to confirm before it goes to a charity

- The service agreement and data processing agreement exist, and the board resolution and receipting mandate templates are ready.
- Whether "Givezy checks within 2 working days" (the site's promise, `applicationReviewWorkingDays`) and the document's "documents and checks, day 1 to 5" are told together. The pack uses the document's days and does not repeat the 2.
- The contact email and number for the last page.
- Names typed in an alphabet other than Latin may not show in the boxes (the PDF uses a standard font).
