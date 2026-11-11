# Givezy charity dashboard: 60-second product demo (draft 11/11/2026)

A product demo for charities, 1920 x 1080, 30 frames a second, with a South African voiceover and music. Every screen
is the real charity dashboard demo (`/demo/dashboard`), captured from the website, so it always matches what charities
see. All names and figures are the demo's made-up sample data, and the video says so in a corner label.

Scenes: 1 "Your charity's giving, all in one place." · 2 Overview · 3 Donations (rows arrive, Record a gift) · 4 Donors
(one donor with a follow-up, a tag and a note) · 5 Thank donors (typed, confirmed, "Sent to 14 donors.") · 6 Monthly
donations · 7 Campaigns · 8 s18A receipts · 9 "Giving made easy." with "Try the demo dashboard" and givezy.co.za.

## Make the video

From the repo root (needs ffmpeg and the Playwright Chromium that is already installed):

1. Start the website (`npm run build && npm run start -- -p 3200`), then
   `DEMO_URL=http://localhost:3200 node docs/dashboard-video/capture.mjs` takes the screens into `shots/` (not kept in
   git; run it again whenever the dashboard changes).
2. `node docs/dashboard-video/build.mjs` embeds the fonts, logo and screens into `video.built.html`.
3. `node docs/dashboard-video/render.mjs out-silent.mp4` draws all 1 800 frames. `--stills 9 23.6` writes still frames.
4. `python3 docs/dashboard-video/mix.py` (in the folder with the silent MP4, `vo.mp3` and `music.mp3`) adds the voice and
   music and makes the WhatsApp copy.

The words are in `video.html` (`CAPS`), the camera, cursor and clicks in its script (`cam`, `cur`, `CLICKS`, `SHOTS`).
The voice is Higgsfield ElevenLabs v4, preset voice Zoe (`d0374db1-44b9-4f05-939e-0a9ae9dbbe6a`) with the
`[South African accent]` tag, as chosen for the first video; the music is ElevenLabs Music v2.5. The script is in `mix.py`.
