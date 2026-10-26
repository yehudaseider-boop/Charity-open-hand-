#!/usr/bin/env python3
"""Builds the Givezy charity dashboard sales demo into one self-contained HTML file.

    python3 demo/charity-dashboard/build.py

Writes dist/givezy-charity-dashboard-demo.html (a whole page: double-click it, works offline) and
dist/artifact.html (the same page without the outer html/head/body tags, for the hosted link), plus a zip
of the first. Fonts and pictures are put inside the file, so nothing is fetched from anywhere.
"""
import base64, os, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dist")
os.makedirs(OUT, exist_ok=True)

def read(p): return open(os.path.join(HERE, p), encoding="utf-8").read()
def data_uri(p, mime): return f"data:{mime};base64," + base64.b64encode(open(os.path.join(HERE, p), "rb").read()).decode()

fonts = (
    '@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:700 800;font-display:swap;'
    f'src:url({data_uri("assets/fonts/bricolage.woff2", "font/woff2")}) format("woff2");}}\n'
    '@font-face{font-family:"DM Sans";font-style:normal;font-weight:400 700;font-display:swap;'
    f'src:url({data_uri("assets/fonts/dm-sans.woff2", "font/woff2")}) format("woff2");}}\n'
)
css = fonts + read("src/app.css")
js = read("src/data.js") + "\n" + read("src/screens.js") + "\n" + read("src/app.js")
body = read("src/body.html").replace("{{logo}}", data_uri("assets/logo.png", "image/png")).replace("{{splash}}", data_uri("assets/splash.png", "image/png"))
title = "Givezy dashboard demo"
head = f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="robots" content="noindex">\n<style>\n{css}\n</style>\n'
inner = f"{body}\n<script>\n{js}\n</script>\n"

open(os.path.join(OUT, "artifact.html"), "w", encoding="utf-8").write(head + inner)
full = ('<!doctype html>\n<html lang="en-ZA">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f"{head}</head>\n<body>\n{inner}</body>\n</html>\n")
page = os.path.join(OUT, "givezy-charity-dashboard-demo.html")
open(page, "w", encoding="utf-8").write(full)
with zipfile.ZipFile(os.path.join(OUT, "givezy-charity-dashboard-demo.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.write(page, "givezy-charity-dashboard-demo.html")
    z.writestr("READ ME.txt", "Givezy charity dashboard demo (sample data only).\r\n\r\nDouble-click givezy-charity-dashboard-demo.html to open it in your browser. It works without internet.\r\nNothing in it is real: no emails are sent and no money moves. Reset demo (top right) puts it back to the start.\r\n")
print("built", page, os.path.getsize(page) // 1024, "KB")
