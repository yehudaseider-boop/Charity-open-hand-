@AGENTS.md

# Nadiv Lev: project rules

- The build brief is the source of truth; `docs/decisions.md` records changes and open questions. `docs/go-live-checklist.md` is the go-live list: update it whenever a new go-live step or open decision comes up, and bring it up when go-live is discussed.
- Money is integer cents (bigint) in ZAR. Percentages are integer ppm. Never floats.
- Fee, VAT, minimum and tax-year values live only in `src/config/platform.ts`.
- Display: `R1 250` and `R30` (no cents when they are zero), `R34.57` when there are cents, dd/mm/yyyy, SA English, Johannesburg time.
- Never invent a fee or rate. Gateway rates stay null until Yehuda supplies them.
- Nothing outside the gateway adapter may reference a specific gateway.
- Every table has row-level security. Money and receipt writes are server-only (service role).
- Hebrew text: `lang="he" dir="rtl"`. Check pages at 375px wide.
- Brand: the Nadiv Lev brand kit. The name is always "Nadiv Lev". Colours live only in `src/app/globals.css` and `apps/mobile/src/theme/tokens.ts`: cream pages, ink text, indigo headlines, deep coral for buttons and links, one coral accent per screen, sage for progress and the s18A badge. Fraunces (600, 20 px and up) for headlines, Inter for everything else, Heebo for Hebrew. Sentence case, no all-caps buttons, no exclamation marks. Write "s18A receipt".
- Run `npm test`, `npm run typecheck` and `npm run lint` before committing.

# Phone app (apps/mobile)

- **The phone app is now Givezy** (renamed from Nadiv Lev, 13/10/2026). Its look follows the Givezy logo, not the Nadiv Lev kit below: cream pages (#FEFDF7), navy text (#102848), blue (#1848A8) for headlines, buttons, links and tabs, one bright orange (#F88038) accent per screen (graphics only, never small or large text: it fails contrast), lilac (#CCB3FB) for soft highlight cards, Fredoka for headlines, Inter for body, Heebo for Hebrew, pill buttons, big soft corners, the logo's splash (`src/components/splash.tsx`): the lilac, orange and blue shapes are images cut from the logo, never redrawn, and always all three together when used as the mark. Colours live only in `apps/mobile/src/theme/tokens.ts`. The website, emails and receipts still carry the Nadiv Lev kit until their own rename pass. The deep link scheme (`nedivlev://`) and storage keys (`nediv-lev.*`) are unchanged on purpose: renaming them would break the website's return link and people's saved data.

- Expo + Expo Router (routes in `apps/mobile/src/app`). Donor-facing; charity and admin screens stay on the website.
- Brand tokens live only in `apps/mobile/src/theme/tokens.ts`. Follow `apps/mobile/AGENTS.md` for Expo rules.
- The app never handles card details and has no card fields or amount-to-pay screen of its own. Payment happens on our website's payment page: "Give on our website" opens the phone's browser, or, when the in-app giving switch is on (`EXPO_PUBLIC_IN_APP_GIVING=yes`, off by default), the same page in an in-app sheet ("Continue to payment"). Keep the switch off in store builds until Apple's and Google's donation rules are checked (see `docs/go-live-checklist.md`). Never name a specific gateway in app copy.
- `src/lib/fees.ts` and `src/lib/money.ts` stay dependency-free so the app can share them.
- Review screenshots: `npx expo export --platform web`, serve `dist`, open with `?preview=iphone`.
