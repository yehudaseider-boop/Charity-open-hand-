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

## Version 2 (11/11/2026): "Follow one gift"

Faster and bolder, after Yehuda found the first cut too plain. One demo donor's gift (Aisha Example, R350 a month, all
from the demo's sample data) is followed from her phone into the dashboard, then the dashboard is shown doing the work:
kinetic headlines that slam in as the voice says them, the real dashboard flying together in 3D layers, rebuilt cards
with numbers that count up (stat card, donor card, campaign rings, monthly bars, s18A receipt cards), 14 thank-yous
flying to 14 donors, a 3D wall of the real screens, and sound effects on every move.

1. `node docs/dashboard-video/build.mjs v2.html` (after capture.mjs).
2. `node docs/dashboard-video/render.mjs Givezy-dashboard-demo-v2-silent.mp4 --page v2.built.html`
3. In the folder with that MP4, `music.mp3` and the voice takes (`takeA.mp3`, `takeB.mp3`, `takeC.mp3`, each all ten
   lines read in one go so the accent stays the same): `python3 cuts.py` finds where each line starts and ends,
   `python3 mix2.py A` mixes take A (voice, ducked music, and sound effects made from the cue list in v2.html,
   `window.SFX`), and `python3 check.py A` checks the result.
4. `check.py` must pass before a file goes out. It checks length, frame size, loudness and peaks, that no line is
   clipped or drops words, that lines don't overlap or run past the end, that the finale's words land on their slams,
   that whooshes stay at the level Yehuda approved, and that the WhatsApp copy is under 5 MB. It was tested by
   breaking a cut on purpose three ways. It cannot hear the accent: a person listens to every new take before it is used.

Lesson (11/11/2026): the first v2 mix joined three separate recordings and the accent drifted near the end. Always
record the whole script as one take, with `[strong South African accent]` on every line and stability 0.8.

The phone screens in v2 are drawn for the video in the app's look (give screen, thank-you, the thank-you email); the
app itself needs its server to show real screens. Everything on the dashboard side is the demo's real data.
