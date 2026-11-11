# Checks a finished v2 video before it goes to Yehuda: run after mix2.py, from the same folder.
#   python3 check.py A
# Fails loudly on: wrong length or size, wrong frame size or rate, missing or clipped voice lines, lines that overlap
# or run past the end, loudness off target, peaks too hot, sound effects louder than the voice, a WhatsApp copy too big.
# What it cannot check: how the accent sounds. Only a person listening can judge that.
import json, re, subprocess, sys, wave
import numpy as np

TAKE = sys.argv[1] if len(sys.argv) > 1 else "A"
full, small = f"Givezy-dashboard-demo-v2-take{TAKE}.mp4", f"Givezy-dashboard-demo-v2-take{TAKE}-WhatsApp.mp4"
problems, notes = [], []
def bad(msg): problems.append(msg)

def probe(f):
    out = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", f]))
    v = next(s for s in out["streams"] if s["codec_type"] == "video"); a = [s for s in out["streams"] if s["codec_type"] == "audio"]
    return out["format"], v, a

for f, w, h, maxmb in [(full, 1920, 1080, 25), (small, 1280, 720, 5)]:
    fmt, v, a = probe(f)
    dur, mb = float(fmt["duration"]), int(fmt["size"]) / 1e6
    if abs(dur - 60) > 0.1: bad(f"{f}: lasts {dur:.2f} s, not 60")
    if (v["width"], v["height"]) != (w, h): bad(f"{f}: frame {v['width']}x{v['height']}, not {w}x{h}")
    if v["r_frame_rate"] != "30/1": bad(f"{f}: {v['r_frame_rate']} frames a second, not 30")
    if v.get("pix_fmt") != "yuv420p": bad(f"{f}: pixel format {v.get('pix_fmt')} may not play on phones")
    if not a: bad(f"{f}: no sound track")
    if mb > maxmb: bad(f"{f}: {mb:.1f} MB, over {maxmb} MB")
    notes.append(f"{f}: {dur:.2f} s, {v['width']}x{v['height']}, {mb:.1f} MB")

# Loudness and peaks of the full version.
log = subprocess.run(["ffmpeg", "-i", full, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
I = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1]); TP = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)[-1])
if abs(I + 14) > 1: bad(f"loudness {I} LUFS, target -14")
if TP > -0.9: bad(f"true peak {TP} dBFS, should stay under -1")
notes.append(f"loudness {I} LUFS, true peak {TP} dBFS")

# Voice lines: each fits, none overlap, none run past the end.
src = open("mix2.py").read()
PLACE = eval(re.search(r"PLACE = (\[.*?\])", src).group(1))
PLACE[8] = eval(re.search(r"PLACE\[8\] = (\{.*?\})", src).group(1))[TAKE]
# Word starts in each take (Whisper), for the lines whose words are synced to on-screen slams.
WORDS = {
    "A": {"hook": [0.00, 1.28, 2.40], "finale": [38.76, 39.74, 40.60, 41.40, 42.10, 43.18, 43.84]},
    "B": {"hook": [0.00, 1.24, 2.38], "finale": [38.12, 39.12, 39.90, 40.68, 41.42, 42.42, 43.12]},
    "C": {"hook": [0.00, 1.24, 2.36], "finale": [38.00, 38.96, 39.72, 40.62, 41.34, 42.36, 43.10]},
}[TAKE]
CUTS = json.load(open("cuts.json"))[TAKE]
ends = []
for i, ((a, b), at) in enumerate(zip(CUTS, PLACE)):
    e = at + (b - a); ends.append(e)
    if i + 1 < len(PLACE) and e > PLACE[i + 1] - 0.05: bad(f"line {i + 1} ends at {e:.2f} s, runs into line {i + 2} at {PLACE[i + 1]}")
    if e > 59.9: bad(f"line {i + 1} ends at {e:.2f} s, past the end")
    if b - a < 2.5: bad(f"line {i + 1} is only {b - a:.2f} s: probably clipped")

# No words dropped: each line starts at or before its first word and runs on to the pause right before the next
# line's first word (a cut inside a mid-line pause, like "tried again, | automatically", would pass the quiet check
# below but drop words; this catches it). First-word times per take, from Whisper.
FIRST = {
    "A": [0.00, 3.96, 8.34, 14.10, 19.04, 24.46, 29.69, 33.90, 38.76, 45.10],
    "B": [0.00, 3.84, 8.30, 14.08, 18.84, 24.18, 29.62, 33.54, 38.12, 44.48],
    "C": [0.00, 3.98, 8.26, 13.94, 18.70, 24.02, 29.50, 33.58, 38.00, 44.32],
}[TAKE]
for i, (a, b) in enumerate(CUTS):
    if a > FIRST[i] + 0.2: bad(f"line {i + 1} starts at {a:.2f} s, after its first word at {FIRST[i]:.2f} s")
    if i + 1 < len(CUTS) and not (FIRST[i + 1] - 0.6 <= b <= FIRST[i + 1] + 0.05):
        bad(f"line {i + 1} ends at {b:.2f} s, not in the pause before line {i + 2} (first word {FIRST[i + 1]:.2f} s): words may be dropped")

# Each cut lands in a pause: the take is quiet for 60 ms either side of every cut point (no word cut in half).
take = subprocess.run(["ffmpeg", "-v", "error", "-i", f"take{TAKE}.mp3", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
x = np.frombuffer(take, np.int16) / 32767.0
speech = np.sqrt((x ** 2).mean())
def level(t, span=0.05):
    i, j = max(0, int((t - span) * 16000)), int((t + span) * 16000)
    seg = x[i:j]; return np.sqrt((seg ** 2).mean()) if len(seg) else 0
for i, (a, b) in enumerate(CUTS):
    for t, where in [(a, "start"), (b, "end")]:
        if 0.05 < t < len(x) / 16000 - 0.05 and level(t) > speech * 0.35: bad(f"line {i + 1} {where} cut at {t:.2f} s lands on speech")

# Sound effects stay under the voice: the loudest whoosh is well below the average voice level.
w = wave.open("sfx.wav"); fx = np.frombuffer(w.readframes(w.getnframes()), np.int16) / 32767.0; sr = w.getframerate()
html = open("v2.html").read()
cues = [(float(a), b) for a, b in re.findall(r'\[([\d.]+), "(\w+)"\]', html.split("window.SFX = [")[1].split("];")[0])]
whoosh = max(np.sqrt((fx[int(t * sr):int((t + 0.5) * sr)] ** 2).mean()) for t, k in cues if k in ("whoosh", "suck"))
# Yehuda approved the level on 11/11/2026 (about 7.7 dB under the voice) after asking twice for softer whooshes.
if 20 * np.log10(whoosh / speech) > -7.0: bad(f"whooshes {20 * np.log10(whoosh / speech):.1f} dB under the voice: louder than the level Yehuda approved (-7.7 dB)")
notes.append(f"loudest whoosh {20 * np.log10(whoosh / speech):.1f} dB under the voice")

# Words and slams land together: each synced word is said within 0.25 s of its hit on screen.
hits = sorted(t for t, k in cues if k == "hit")
for name, line, words in [("hook", 0, WORDS["hook"]), ("finale", 8, WORDS["finale"])]:
    a0 = CUTS[line][0]
    for wt in words:
        said = PLACE[line] + (wt - a0)
        near = min(abs(h - said) for h in hits + [51.1])
        if near > 0.25: bad(f"{name}: word said at {said:.2f} s but nearest slam is {near:.2f} s away")

# Voice is present where each line plays in the final mix.
mix = subprocess.run(["ffmpeg", "-v", "error", "-i", full, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
m = np.frombuffer(mix, np.int16) / 32767.0
for i, ((a, b), at) in enumerate(zip(CUTS, PLACE)):
    seg = m[int((at + 0.3) * 16000):int((at + (b - a) - 0.3) * 16000)]
    if np.sqrt((seg ** 2).mean()) < 0.02: bad(f"line {i + 1} seems silent in the final mix at {at} s")

print("\n".join(notes))
if problems:
    print("\nPROBLEMS:"); print("\n".join(" - " + p for p in problems)); sys.exit(1)
print(f"\nTake {TAKE}: all checks passed. Accent still needs a person to listen.")
