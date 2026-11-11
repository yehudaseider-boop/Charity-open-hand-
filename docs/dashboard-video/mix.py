# Mixes the voiceover (one Higgsfield ElevenLabs v4 take, voice "Zoe" with the South African accent tag) and the music
# bed into the silent render, then makes a WhatsApp copy under 5 MB. Run from this folder with the three files beside it:
#   python3 mix.py   (needs Givezy-dashboard-demo-60s-silent.mp4, vo.mp3, music.mp3)
# Each line is cut from vo.mp3 at its pause (word timings from a Whisper transcript) and placed at its scene's start.
import subprocess
LINES = [  # (start in vo.mp3, end in vo.mp3, where it plays in the video), seconds
    (0.00, 2.85, 0.4),   # Your charity's giving. All in one place.
    (3.15, 8.15, 5.9),   # This is your Givezy dashboard. See your month at a glance, and where every gift came from.
    (8.45, 13.6, 13.5),  # Every donation lands in one list. And you can add EFT and cash gifts yourself.
    (13.9, 18.45, 20.7), # Open any donor to see their gifts, with your notes, tags and follow-ups.
    (18.75, 24.0, 27.6), # Write one thank-you, and everyone who gave that month gets it, with their own first name.
    (24.25, 29.1, 35.8), # Monthly donations look after themselves. A declined card is tried again, automatically.
    (29.65, 33.55, 41.9),# Raise for something specific, and show donors how close you are.
    (33.85, 38.2, 47.9), # And your section eighteen A receipt list? It builds itself, all year.
    (38.65, 44.85, 53.4),# Givezy. Giving, made easy. Try the demo dashboard at givezy dot co dot za.
]
parts, labels = [], []
for i, (a, b, at) in enumerate(LINES):
    d = int(at * 1000)
    parts.append(f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={b - a - 0.06:.2f}:d=0.06,adelay={d}|{d}[v{i}]")
    labels.append(f"[v{i}]")
fc = ";".join(parts) + ";" + "".join(labels) + f"amix=inputs={len(LINES)}:normalize=0,apad=whole_dur=60,atrim=0:60,asplit=2[vo][key];"
fc += "[2:a]atrim=0:60,volume=0.42,afade=t=in:d=0.8,afade=t=out:st=57.5:d=2.5[mus];"
fc += "[mus][key]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[duck];"  # music dips under the voice
fc += "[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "Givezy-dashboard-demo-60s-silent.mp4", "-i", "vo.mp3", "-i", "music.mp3", "-filter_complex", fc,
                "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", "Givezy-dashboard-demo-60s.mp4"], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "Givezy-dashboard-demo-60s.mp4", "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow",
                "-b:v", "560k", "-maxrate", "800k", "-bufsize", "1600k", "-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart", "Givezy-dashboard-demo-60s-WhatsApp.mp4"], check=True)
print("written Givezy-dashboard-demo-60s.mp4 and Givezy-dashboard-demo-60s-WhatsApp.mp4")
