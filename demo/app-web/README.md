# Givezy app demo (web)

The donor app's web build inside a phone frame, with sample data only (no server, no payment). Built 29/10/2026 from
`apps/mobile` with `experiments.baseUrl` set to `/a` and the bracketed sample impact line blanked in the bundle. It is a
copy of built files, not source: rebuild from `apps/mobile` when the app changes.

Vercel does not publish any folder called `node_modules`, so after exporting, rename `a/assets/node_modules` to
`a/assets/nm` and replace `assets/node_modules` with `assets/nm` in the two JS files that name it
(`entry-*.js` and `_layout-*.js`). Without this the fonts are missing and the app shows a blank screen.
