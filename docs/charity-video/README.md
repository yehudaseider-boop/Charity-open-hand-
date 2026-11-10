# Givezy for charities: 45-second motion graphic (draft 10/11/2026)

An original SaaS-style explainer for charities, 1920 x 1080, 30 frames a second, silent. Made from code, so words,
timing and colours are easy to change. The style follows the brand rules in CLAUDE.md; every number and name on screen
is sample data, the same made-up donors as the website's sample screens.

Scenes: 1 logo, "Giving made easy." · 2 the paperwork problem · 3 the dashboard · 4 giving on a phone · 5 s18A receipts ·
6 donors and thank-yous · 7 paid to your bank, free to list · 8 live in about 10 working days · 9 close with givezy.co.za.

## Make the video

From the repo root (needs ffmpeg and the Playwright Chromium that is already installed):

1. `node docs/charity-video/build.mjs` embeds the fonts, logo and icons into `video.built.html`.
2. `node docs/charity-video/render.mjs` draws all 1 350 frames at exact times and encodes `Givezy-for-charities-45s.mp4`
   (about 4 MB, about a minute). `node docs/charity-video/render.mjs out.mp4 --stills 7.4 14.5` writes still frames instead.

The words are in `video.html` (the HTML), the timing in its script (`SC` lists when each scene shows). Open
`video.built.html` in a browser and call `renderAt(12.5)` in the console to see any moment.
