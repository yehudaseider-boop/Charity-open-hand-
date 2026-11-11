# Finds where each of the ten voice lines starts and ends in each take, and writes cuts.json for mix2.py.
# Each line runs from inside the pause before its first word to just into the pause before the next line, so no
# word is clipped. First-word times come from a Whisper transcript of each take (Higgsfield sandbox, base.en).
#   python3 cuts.py        (in the folder with takeA.mp3, takeB.mp3, takeC.mp3)
import json, re, subprocess
FIRST = {
    "A": [0.00, 3.96, 8.34, 14.10, 19.04, 24.46, 29.69, 33.90, 38.76, 45.10],
    "B": [0.00, 3.84, 8.30, 14.08, 18.84, 24.18, 29.62, 33.54, 38.12, 44.48],
    "C": [0.00, 3.98, 8.26, 13.94, 18.70, 24.02, 29.50, 33.58, 38.00, 44.32],
}
out = {}
for k, starts in FIRST.items():
    f = f"take{k}.mp3"
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))
    log = subprocess.run(["ffmpeg", "-i", f, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"], capture_output=True, text=True).stderr
    sil = [(float(a), float(b)) for a, b in re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)", log)]
    # The pause at each line break: the last pause that begins before the next line's first word.
    gaps = [[s for s in sil if s[0] < st][-1] for st in starts[1:]]
    for g, st in zip(gaps, starts[1:]):
        assert g[1] - g[0] >= 0.15 and abs(g[1] - st) < 0.5, (k, g, st)
    cuts = []
    for i in range(10):
        a = 0.0 if i == 0 else max(gaps[i - 1][0] + 0.03, gaps[i - 1][1] - 0.2)
        b = dur if i == 9 else gaps[i][0] + 0.10
        cuts.append((round(a, 2), round(b, 2)))
    out[k] = cuts
    print(k, cuts)
json.dump(out, open("cuts.json", "w"))
