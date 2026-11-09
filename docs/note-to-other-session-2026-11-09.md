# Note to the other Givezy session (09/11/2026)

From the session that built the dashboard demo and the speed work. Yehuda asked me to check we weren't overwriting each other. We aren't: the test branch (`milestone-1-foundation`) is one straight line with no reverts, and the CRM plan commits (0b12e9b, 4955509) sit on top of this work. Four things to know before your next change.

## 1. The shared layout must not read the request (ce04fdc)

Every page was being rebuilt in Frankfurt on each visit, because the header and footer read the sign-in, the cookies and the headers. Home, For charities, FAQ, Privacy and Terms are now built ahead and served from Vercel's cache.

`tests/header-cache.test.ts` fails if `src/app/layout.tsx`, `src/components/site-header.tsx`, `src/components/page-footer.tsx` or `src/components/legal.tsx` import `next/headers`, `getViewer`, `currentFocus` or `cookies()`.

If you need something per person in the header, add it to `/api/viewer` and show it in `src/components/header-nav.tsx`. Don't read it in the layout.

## 2. How the header works now

- Pages arrive showing "Sign in". The browser asks `/api/viewer` (never cached) only when a sign-in cookie exists, then shows Account and the dashboard links. The answer is kept for the tab.
- A charity's own link and the dashboard demo keep their own plain header and footer. A page asks for one with `<ChromeMark kind="focus" | "demo" />`, placed in the `/c/[slug]`, `/donate/return` and `/demo` layouts. CSS does the rest.
- `src/proxy.ts` only checks the sign-in with Supabase when a sign-in cookie is present.
- Home and the cause list use `src/lib/supabase/public.ts`, which reads no cookies. Home is rebuilt every 5 minutes.

Full reasoning: `docs/decisions.md`, "A faster website: public pages served from cache".

## 3. Scrolling fixes (6834a55)

New pages opened part way down and drifted up to the top. `<html>` now has `data-scroll-behavior="smooth"`; please keep it. The charity search also no longer loses the keyboard while results load.

## 4. The other branches (checked 09/11/2026)

| Branch | State | Verdict |
|---|---|---|
| `main` | Inside the test branch, 70 commits behind | Safe |
| `ci-checks`, `jolly-johnson`, `review-2026-10-20` | Already merged | Safe, can be deleted |
| `vercel-setup` | One commit (14/10) adding an hourly job; replaced by the daily job on 22/10 | Old, don't merge |
| `charming-dirac` | 30 commits from 08/10, old name and old maaser/chomesh wording | Old, don't merge |
| `givezy-charity-portal-prototype` | Clickable prototype under `src/portal-demo`, no live code | Parked, no clash |
| `demo-site` | One unfinished commit (22/10), waiting on Yehuda's yes | Clashes, see below |

`demo-site` conflicts with this work in `src/proxy.ts`, `vercel.json` and `src/app/receipts/[id]/route.ts`. It also adds a `/demo` page and sign-in on the same `/demo` address as the dashboard demo, and `src/app/demo/layout.tsx` would give that page the demo header when `DEMO_MODE=yes`. Don't merge it until Yehuda decides which demo he shows people.

Old religious wording still appears in 6 files on the test branch, as internal names only (database tables `maaser_*`, the stored key `nediv-lev.maaser-target`, the `giving_kind` option values, the app's old-goal conversion). Renaming them would break saved data, so they stay. Only the code was searched for those words, not every screen.

## Please don't, without asking Yehuda

- Push to `main`.
- Merge `demo-site`.
