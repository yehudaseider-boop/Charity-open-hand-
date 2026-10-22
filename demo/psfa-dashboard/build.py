#!/usr/bin/env python3
"""Builds the PSFA dashboard demo into a folder you can drag onto Netlify.

    python3 demo/psfa-dashboard/build.py demo/psfa-dashboard/dist

The demo is plain HTML, CSS and JavaScript: no server, no build tools. Everything in it is made up and
lives in the visitor's browser (localStorage). Money is whole cents.
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'dist')
shutil.rmtree(OUT, ignore_errors=True)
for d in ('assets', 'js', 'css'):
    os.makedirs(os.path.join(OUT, d))
for f in os.listdir(os.path.join(HERE, 'assets-src')):
    shutil.copy(os.path.join(HERE, 'assets-src', f), os.path.join(OUT, 'assets', f))
fonts = open(os.path.join(HERE, 'src/css/fonts.css')).read().replace('url(assets/', 'url(../assets/').replace('url("assets/', 'url("../assets/')
open(os.path.join(OUT, 'css/app.css'), 'w').write(fonts + '\n' + open(os.path.join(HERE, 'src/css/app.css')).read())
js_dir = os.path.join(HERE, 'src/js')
files = sorted(os.listdir(js_dir))  # 00-core first, 90-boot last (it closes the wrapper)
open(os.path.join(OUT, 'js/app.js'), 'w').write('\n'.join(open(os.path.join(js_dir, f)).read() for f in files))
html = open(os.path.join(HERE, 'src/index.html')).read()
open(os.path.join(OUT, 'index.html'), 'w').write(html)
print('built', OUT)
