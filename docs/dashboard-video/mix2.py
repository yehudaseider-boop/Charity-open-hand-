# Version 2 sound: voice lines, a music bed that dips under the voice, and sound effects made here from the cue list
# in v2.html (window.SFX), so each whoosh and pop lands on its motion. Run from this folder with these files beside it:
#   Givezy-dashboard-demo-v2-silent.mp4, vo.mp3 (first take), vo2.mp3 (the four new lines), music.mp3,
#   vo3.mp3 (closing line re-read so "co dot za" ends in "za", 11/11/2026)
#   python3 mix2.py
import re, subprocess, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)

def env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)

def noise(n): return rng.standard_normal(n)

def lowpass(x, k):  # k per sample in 0..1, may vary
    y = np.zeros_like(x); acc = 0.0
    k = np.broadcast_to(k, x.shape)
    for i in range(len(x)):
        acc += k[i] * (x[i] - acc); y[i] = acc
    return y

def sweep(f0, f1, dur):
    n = int(dur * SR); f = np.linspace(f0, f1, n); return np.sin(2 * np.pi * np.cumsum(f) / SR)

def make(kind):
    if kind == "hit":
        n = int(0.5 * SR); return 0.9 * sweep(120, 45, 0.5) * env(n, 0.002, 0.16) + 0.35 * lowpass(noise(n), 0.25) * env(n, 0.001, 0.04)
    if kind == "thump":
        n = int(0.4 * SR); return 1.0 * sweep(90, 40, 0.4) * env(n, 0.002, 0.12)
    if kind == "pop":
        n = int(0.12 * SR); return 0.55 * sweep(900, 300, 0.12) * env(n, 0.001, 0.035)
    if kind == "tick":
        n = int(0.03 * SR); return 0.35 * np.sin(2 * np.pi * 2400 * np.arange(n) / SR) * env(n, 0.0005, 0.008)
    if kind == "click":
        n = int(0.05 * SR); return 0.6 * (np.sin(2 * np.pi * 1300 * np.arange(n) / SR) + 0.4 * noise(n)) * env(n, 0.0005, 0.012)
    if kind == "ding":
        n = int(0.9 * SR); t = np.arange(n) / SR
        return 0.32 * (np.sin(2 * np.pi * 1318.5 * t) + 0.5 * np.sin(2 * np.pi * 1975.5 * t) + 0.25 * np.sin(2 * np.pi * 2637 * t)) * env(n, 0.002, 0.28)
    if kind in ("whoosh", "suck"):
        n = int(0.5 * SR); u = np.linspace(0, 1, n)
        shape = np.sin(np.pi * u) ** 2 if kind == "whoosh" else u ** 3
        k = 0.01 + 0.08 * shape  # darker, so it reads as air moving, not hiss
        return 0.6 * lowpass(noise(n), k) * shape * 0.35  # kept well under the voice (Yehuda, 11/11/2026: too loud twice)
    if kind == "riser":
        n = int(1.2 * SR); u = np.linspace(0, 1, n)
        return 0.06 * (lowpass(noise(n), 0.02 + 0.2 * u) * 2 + 0.4 * sweep(200, 900, 1.2)) * u ** 2
    if kind == "type":
        out = np.zeros(int(2.3 * SR)); t = 0.0
        while t < 2.2:
            i = int(t * SR); c = make("tick") * (0.6 + 0.6 * rng.random()); out[i:i + len(c)] += c[: len(out) - i]; t += 0.05 + 0.07 * rng.random()
        return out
    raise ValueError(kind)

html = open("v2.html").read()
cues = [(float(a), b) for a, b in re.findall(r'\[([\d.]+), "(\w+)"\]', html.split("window.SFX = [")[1].split("];")[0])]
fx = np.zeros(int(61 * SR))
for at, kind in cues:
    s = make(kind); i = int(at * SR); fx[i:i + len(s)] += s[: len(fx) - i]
fx = np.clip(fx * 0.5, -1, 1)
with wave.open("sfx.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((fx * 32767).astype(np.int16).tobytes())

# Voice lines: (input index: 1 = vo.mp3, 2 = vo2.mp3, 5 = vo3.mp3; start; end; where it plays), seconds. Cut points from Whisper word timings.
LINES = [
    (2, 0.00, 3.65, 0.1),     # Bank references. Spreadsheets. Receipts by hand.
    (2, 4.00, 7.95, 4.4),     # Meet Givezy. Your charity's giving, all in one place.
    (2, 8.05, 13.45, 9.3),    # Follow one gift. Aisha gives from her phone, and it lands in your dashboard as soon as it's paid.
    (1, 13.9, 18.45, 16.4),   # Open any donor to see their gifts, with your notes, tags and follow-ups.
    (1, 18.75, 24.0, 22.2),   # Write one thank-you, and everyone who gave that month gets it, with their own first name.
    (1, 24.25, 29.1, 28.9),   # Monthly donations look after themselves. A declined card is tried again, automatically.
    (1, 29.65, 33.55, 34.8),  # Raise for something specific, and show donors how close you are.
    (1, 33.85, 38.2, 40.4),   # And your section eighteen A receipt list? It builds itself, all year.
    (2, 13.60, 19.75, 46.5),  # Donations, donors, thank-yous, campaigns and receipts. All of it, in one dashboard.
    (5, 0.00, 6.11, 53.6),    # Givezy. Giving, made easy. Try the demo dashboard at givezy dot co dot za.
]
parts, labels = [], []
for i, (src, a, b, at) in enumerate(LINES):
    d = int(at * 1000)
    parts.append(f"[{src}:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={b - a - 0.06:.2f}:d=0.06,adelay={d}|{d}[v{i}]")
    labels.append(f"[v{i}]")
fc = ";".join(parts) + ";" + "".join(labels) + f"amix=inputs={len(LINES)}:normalize=0,apad=whole_dur=60,atrim=0:60,asplit=2[vo][key];"
fc += "[3:a]atrim=0:60,volume=0.5,afade=t=in:d=0.4,afade=t=out:st=57.5:d=2.5[mus];"
fc += "[mus][key]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=350[duck];"
fc += "[4:a]atrim=0:60,volume=0.85,pan=stereo|c0=c0|c1=c0[fx];"
fc += "[duck][vo][fx]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "Givezy-dashboard-demo-v2-silent.mp4", "-i", "vo.mp3", "-i", "vo2.mp3", "-i", "music.mp3", "-i", "sfx.wav", "-i", "vo3.mp3",
                "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", "Givezy-dashboard-demo-v2.mp4"], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "Givezy-dashboard-demo-v2.mp4", "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow",
                "-b:v", "560k", "-maxrate", "800k", "-bufsize", "1600k", "-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart", "Givezy-dashboard-demo-v2-WhatsApp.mp4"], check=True)
print("written Givezy-dashboard-demo-v2.mp4 and Givezy-dashboard-demo-v2-WhatsApp.mp4")
