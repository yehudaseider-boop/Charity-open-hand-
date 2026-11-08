# Legal and tax briefing (draft 04/11/2026)
Regenerate from the repo root, in this order (needs Node, `npx tsx`, Playwright and `pdftoppm`):
1. `npx tsx docs/legal-briefing/make-samples.ts` writes the worked example, sample receipt and sample IT3(d) file to `samples/`.
2. `node docs/legal-briefing/render-samples.mjs` turns the sample receipt into page images.
3. `node docs/legal-briefing/build.mjs` writes `briefing.html` (content is in `questions.mjs`, `sections.mjs`, `part2.mjs` to `part4.mjs`).
4. `node docs/legal-briefing/render.mjs` makes `Givezy-legal-and-tax-briefing.pdf` (two passes, so the contents page numbers are right). `samples/test-run.json` holds the test counts quoted in 9.3: update it after a new test run.
