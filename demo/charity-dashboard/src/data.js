/* Sample data for the Givezy charity dashboard demo. Everything here is made up: the charity is "Sample
   Charity" and every donor's surname is a placeholder word (Example, Sample, Demo...), so nobody mistakes it
   for a real person. Gifts are generated relative to today, the same way every time (seeded), so the
   dashboard always looks current. Money is whole cents. Times are Johannesburg (UTC+2, no daylight saving). */
"use strict";

const DAY = 86400000;
const JHB = 2 * 3600000;

/** Johannesburg calendar parts for a moment. */
function jhb(ms) {
  const d = new Date(ms + JHB);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
}
/** A Johannesburg wall-clock time as a moment. */
function atJhb(y, m, d, hh = 12, mi = 0) { return Date.UTC(y, m - 1, d, hh, mi) - JHB; }
function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function addMonths(y, m, n) { const t = y * 12 + (m - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
/** SARS tax year, named by the year it ends (March 2026 to February 2027 is 2027). */
function taxYearOf(ms) { const p = jhb(ms); return p.m >= 3 ? p.y + 1 : p.y; }

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CAMPAIGN_ID = "winter";

/** The donors. Surnames are placeholder words on purpose. */
const DONORS = [
  { id: "d01", name: "Naledi Example", email: "naledi@example.com", s18a: true },
  { id: "d02", name: "Johan Sample", email: "johan@example.com", s18a: true, monthly: { cents: 50000, day: 1, since: 9 } },
  { id: "d03", name: "Fatima Demo", email: "fatima@example.com", s18a: true, monthly: { cents: 25000, day: 5, since: 11 } },
  { id: "d04", name: "Sipho Placeholder", email: "sipho@example.com", s18a: false },
  { id: "d05", name: "Priya Specimen", email: "priya@example.com", s18a: true, monthly: { cents: 100000, day: 25, since: 7 } },
  { id: "d06", name: "Thabo Mock", email: "thabo@example.com", s18a: false },
  { id: "d07", name: "Annelie Testcase", email: "annelie@example.com", s18a: true },
  { id: "d08", name: "Lindiwe Example", email: "lindiwe@example.com", s18a: true },
  { id: "d09", name: "David Sample", email: "david@example.com", s18a: false, monthly: { cents: 15000, day: 15, since: 5 } },
  { id: "d10", name: "Zanele Demo", email: "zanele@example.com", s18a: true },
  { id: "d11", name: "Ruan Placeholder", email: "ruan@example.com", s18a: false },
  { id: "d12", name: "Ayesha Specimen", email: "ayesha@example.com", s18a: true },
  { id: "d13", name: "Kagiso Mock", email: "kagiso@example.com", s18a: false, monthly: { cents: 10000, day: 1, since: 10 } },
  { id: "d14", name: "Megan Testcase", email: "megan@example.com", s18a: true, monthly: { cents: 36000, day: 10, since: 4 } },
  { id: "d15", name: "Yusuf Example", email: "yusuf@example.com", s18a: true, monthly: { cents: 20000, day: 20, since: 8 } },
  { id: "d16", name: "Nomsa Sample", email: "nomsa@example.com", s18a: false },
  { id: "d17", name: "Pieter Demo", email: "pieter@example.com", s18a: true },
  { id: "d18", name: "Refilwe Placeholder", email: "refilwe@example.com", s18a: false },
  { id: "d19", name: "Grace Specimen", email: "grace@example.com", s18a: true, monthly: { cents: 75000, day: 28, since: 6 } },
  { id: "d20", name: "Bongani Mock", email: "bongani@example.com", s18a: false },
  { id: "d21", name: "Chloe Testcase", email: "chloe@example.com", s18a: true },
  { id: "d22", name: "Bartholomew-Alexander Ntokozo van der Merwe-Example", email: "bartholomew.alexander.vandermerwe@example.com", s18a: true },
  { id: "d23", name: "Sizwe Example", email: "sizwe@example.com", s18a: true },
];

const ONCE_AMOUNTS = [10000, 15000, 20000, 25000, 30000, 36000, 50000, 50000, 75000, 100000, 150000, 250000];

/** Builds the whole sample dashboard for "now". */
function buildSample(now) {
  const rnd = seeded(20261026);
  const t = jhb(now);
  const start = addMonths(t.y, t.m, -11);
  const startMs = atJhb(start.y, start.m, 1, 0, 0);
  const campaign = {
    id: CAMPAIGN_ID,
    title: "Winter blanket drive",
    goalCents: 3000000,
    startsAt: atJhb(t.y, t.m, t.d, 9) - 42 * DAY,
    endsAt: atJhb(t.y, t.m, t.d, 23, 59) + 20 * DAY,
  };
  // Johan's monthly donation falls due yesterday, so its declined charge is fresh and its retry is still ahead.
  const yesterday = jhb(now - DAY).d;
  const donors = DONORS.map((d) => ({ id: d.id, name: d.name, email: d.email, s18a: d.s18a, notes: [], followUps: [], monthly: d.monthly ? { ...d.monthly, day: d.id === "d02" ? yesterday : d.monthly.day } : null }));
  const gifts = [];
  let n = 0;
  const add = (g) => { gifts.push({ id: `g${String(++n).padStart(4, "0")}`, campaignId: null, via: "card", status: "paid", ...g }); };

  // Monthly donations: one charge a month on the donor's day, from the month they started.
  for (const d of donors) {
    if (!d.monthly) continue;
    for (let i = d.monthly.since; i >= 0; i--) {
      const mo = addMonths(t.y, t.m, -i);
      const day = Math.min(d.monthly.day, daysIn(mo.y, mo.m));
      const at = atJhb(mo.y, mo.m, day, 6, 5);
      if (at > now || at < startMs) continue;
      // Johan's card was declined this month: nothing was charged, and it will be tried again.
      const declined = d.id === "d02" && i === 0;
      add({ donorId: d.id, cents: d.monthly.cents, at, kind: "monthly", status: declined ? "declined" : "paid" });
    }
  }

  // Once-off gifts, a few most days. The campaign takes about half of the gifts while it runs.
  const onceDonors = donors.filter((d) => d.id !== "d01" && d.id !== "d23");
  for (let ms = startMs; ms <= now; ms += DAY) {
    const p = jhb(ms);
    const count = rnd() < 0.55 ? 1 : rnd() < 0.5 ? 2 : 0;
    for (let k = 0; k < count; k++) {
      const at = atJhb(p.y, p.m, p.d, 8 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
      if (at > now - 3600000) continue;
      const donor = onceDonors[Math.floor(rnd() * onceDonors.length)];
      const cents = ONCE_AMOUNTS[Math.floor(rnd() * ONCE_AMOUNTS.length)];
      const inCampaign = at >= campaign.startsAt && rnd() < 0.6;
      const via = rnd() < 0.12 ? "eft" : "card";
      add({ donorId: donor.id, cents, at, kind: "once", campaignId: inCampaign ? CAMPAIGN_ID : null, via });
    }
  }
  // Naledi has given twice before: the walkthrough's new gift is her third.
  add({ donorId: "d01", cents: 50000, at: now - 160 * DAY, kind: "once", via: "card" });
  add({ donorId: "d01", cents: 100000, at: now - 61 * DAY, kind: "once", via: "card" });
  // One very large recorded gift (over a year ago, so it doesn't flatten the 12-month chart), and one odd
  // amount with cents, to show both read well.
  add({ donorId: "d23", cents: 25000000, at: now - 400 * DAY, kind: "once", via: "eft" });
  add({ donorId: "d10", cents: 3457, at: now - 33 * DAY, kind: "once", via: "card" });

  gifts.sort((a, b) => a.at - b.at);

  // s18A receipts: gifts from donors who gave their s18A details. Issued after about two weeks; newer ones
  // wait as drafts. Numbers run per tax year in the order issued.
  const counters = {};
  for (const g of gifts) {
    const d = donors.find((x) => x.id === g.donorId);
    if (g.status !== "paid" || !d.s18a) { g.receipt = null; continue; }
    if (now - g.at > 14 * DAY) {
      const ty = taxYearOf(g.at);
      counters[ty] = (counters[ty] || 0) + 1;
      g.receipt = { status: "issued", number: `SC-${ty}-${String(counters[ty]).padStart(4, "0")}`, issuedAt: g.at + 14 * DAY };
    } else {
      g.receipt = { status: "draft" };
    }
  }

  // A few notes and follow-ups the charity wrote earlier.
  const find = (id) => donors.find((d) => d.id === id);
  find("d05").notes.push({ id: "n1", text: "Met at the open day. Interested in sponsoring a full term.", at: now - 30 * DAY });
  find("d08").notes.push({ id: "n2", text: "Prefers EFT. Asked for the banking details again.", at: now - 9 * DAY });
  find("d22").notes.push({ id: "n3", text: "Long-time supporter. Likes a phone call rather than email.", at: now - 75 * DAY });
  find("d17").followUps.push({ id: "f1", what: "Send photos from the winter drive", due: dayKey(now) });

  return { now, campaign, donors, gifts, counters };
}

function dayKey(ms) { const p = jhb(ms); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }
