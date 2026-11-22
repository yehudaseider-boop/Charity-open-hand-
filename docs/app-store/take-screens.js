const { chromium } = require('playwright');
const BREAD = 'hf_20261011_002939_f36bd191-cf6e-4347-a046-ffb5def7c7af';
const VEG = 'https://d8j0ntlcm91z4.cloudfront.net/user_3JMbY89afWySU23FksuSQhKkNXQ/hf_20261011_003002_378081f3-914c-4b04-96e8-d2314e88ea3e.png';
(async () => {
  const b = await chromium.launch();
  const base = 'http://localhost:8711';
  const pages = [
    ['1-welcome', '/', false],
    ['2-discover', '/discover', true],
    ['3-charity', '/charity/sandton-patient-care', true],
    ['4-home', '/home', true],
    ['5-progress', '/giving', true],
    ['6-receipts', '/receipts', true],
  ];
  const sets = [
    { dir: 'ios', vp: { width: 430, height: 932 }, q: '?preview=iphone' },
    { dir: 'android', vp: { width: 405, height: 720 }, q: '', dsf: 8/3 },
  ];
  for (const s of sets) for (const [name, path, welcomed] of pages) {
    const ctx = await b.newContext({ viewport: s.vp, deviceScaleFactor: s.dsf || 3 });
    // The sample "fresh bread" photo is swapped for the fruit-and-vegetables one (no religious imagery).
    await ctx.route(`**/${BREAD}.png`, async (r) => r.fulfill({ response: await ctx.request.get(VEG) }));
    const p = await ctx.newPage();
    await p.goto(base + '/' + s.q);
    await p.evaluate((w) => { localStorage.clear(); if (w) localStorage.setItem('nediv-lev.welcomed', '1'); }, welcomed);
    await p.goto(base + path + s.q, { waitUntil: 'networkidle' });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `/tmp/claude-0/store/${s.dir}/${name}.png` });
    await ctx.close();
  }
  await b.close();
})();
