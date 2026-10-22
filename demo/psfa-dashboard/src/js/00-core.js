(function () {
'use strict';

/* ============================================================
   Givezy dashboard demo for PSFA. Everything here is made up and
   lives in the visitor's own browser. Money is whole cents.
   ============================================================ */

const KEY = 'givezy-psfa-demo-v3';
const NB = ' ';
const LAPSED_DAYS = 180;
const NEW_DAYS = 30;
const MAX_GIFT_CENTS = 100000000; // R1 000 000

/* ---------- small helpers ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/** R1 250 and R34.57: no cents when they are zero. */
function rand(cents) {
  const n = Math.round(Number(cents) || 0);
  const a = Math.abs(n);
  const r = Math.floor(a / 100), c = a % 100;
  const whole = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  return (n < 0 ? '-' : '') + 'R' + whole + (c ? '.' + String(c).padStart(2, '0') : '');
}
/** 1250.00 for spreadsheets. */
function plain(cents) {
  const n = Math.round(cents), a = Math.abs(n);
  return (n < 0 ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
}

/* ---------- dates: yyyy-mm-dd strings, Johannesburg time ---------- */
function todaySA() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const toUTC = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (ymd, n) => fromUTC(toUTC(ymd) + n * 86400000);
const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
const fmtDate = (ymd) => (ymd ? ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4) : '');
const monthKey = (ymd) => ymd.slice(0, 7);
function addMonths(key, n) {
  let y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (key) => MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);
const monthLong = (key) => MONTHS_LONG[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);
const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();
/** South African tax year: 1 March to the end of February, named for the year it ends in. */
const taxYearOf = (ymd) => (+ymd.slice(5, 7) >= 3 ? +ymd.slice(0, 4) + 1 : +ymd.slice(0, 4));
const taxYearRange = (y) => ({ from: (y - 1) + '-03-01', to: y + '-02-' + String(daysInMonth(y + '-02')) });
function realDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const t = toUTC(ymd);
  return fromUTC(t) === ymd;
}
/** dd/mm/yyyy or yyyy-mm-dd to yyyy-mm-dd, or null. */
function parseDateInput(s) {
  s = String(s || '').trim();
  let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
  let ymd = null;
  if (m) ymd = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) ymd = s;
  return ymd && realDate(ymd) ? ymd : null;
}
/** "1250", "1 250.50", "R1,250.00", "250,50" to whole cents, or null. */
function parseRand(s) {
  s = String(s == null ? '' : s).replace(/[R\s ]/gi, '');
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, c = ''] = s.split('.');
  return +r * 100 + +(c + '00').slice(0, 2);
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/* ---------- CSV ---------- */
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
const toCsv = (header, rows) => '﻿' + [header].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

/* ============================================================
   Seed data (same every time it is made, relative to today)
   ============================================================ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seed(today) {
  const rnd = mulberry32(20261022);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const donors = [], gifts = [], monthly = [];
  let did = 0, gid = 0, mid = 0;
  const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
  const D = (first, last, o) => {
    const d = Object.assign({
      id: 'd' + (++did), type: 'individual', first, last, org: '', email: slug(first + ' ' + last) + '@example.com',
      phone: '082 555 ' + String(1000 + did * 37).slice(-4), tags: [], notes: [], reminders: [],
      wants18a: rnd() < 0.65, anonymous: rnd() < 0.1, noNews: false, thankedAt: null,
    }, o || {});
    donors.push(d); return d;
  };
  const refOf = (n) => 'GZ-' + ((n * 7919 + 104729) % 1679616).toString(36).toUpperCase().padStart(4, '0').slice(-5) + String(n % 10);
  const G = (donor, date, amount, o) => {
    gid++;
    gifts.push(Object.assign({
      id: 'g' + gid, ref: refOf(gid), donorId: donor.id, date, amount, method: 'card', status: 'paid',
      monthlyId: null, campaignId: null, wants18a: donor.wants18a, recorded: false,
    }, o || {}));
  };
  const amounts = [10000, 15000, 18000, 25000, 36000, 50000, 72000, 100000, 150000];
  const ago = (n) => addDays(today, -n);
  const thisKey = monthKey(today);

  // Monthly donors: [first, last, rand per month, months ago it started, charge day, status]
  const monthlySpecs = [
    ['Lerato', 'Dlamini', 100000, 8, 16, 'active'],
    ['Priya', 'Naidoo', 50000, 6, 10, 'active'],
    ['Thabo', 'Mokoena', 36000, 7, 7, 'active'],
    ['Ayesha', 'Patel', 36000, 4, 22, 'active'],
    ['David', 'Cohen', 25000, 5, 13, 'active'],
    ['Sarah', 'Levin', 18000, 7, 4, 'active'],
    ['James', 'van der Merwe', 18000, 5, 19, 'paused'],
    ['Fatima', 'Essop', 18000, 6, 11, 'cancelled'],
    ['Daniel', 'Katz', 50000, 9, 3, 'retrying'],
  ];
  const byName = {};
  for (const [first, last, amt, back, day, st] of monthlySpecs) {
    const d = D(first, last, { wants18a: true });
    byName[first] = d;
    const startKey = addMonths(thisKey, -back);
    const startedAt = startKey + '-' + String(Math.min(day, 28)).padStart(2, '0');
    const m = { id: 'm' + (++mid), donorId: d.id, amount: amt, startedAt, status: st === 'retrying' ? 'active' : st, pausedAt: null, endedAt: null, chargeDay: Math.min(day, 28), retrying: st === 'retrying' };
    if (st === 'paused') m.pausedAt = ago(12);
    if (st === 'cancelled') m.endedAt = ago(20);
    monthly.push(m);
    for (let k = -back; k <= 0; k++) {
      const key = addMonths(thisKey, k);
      const date = key + '-' + String(Math.min(day, 28)).padStart(2, '0');
      if (date > today) continue;
      if (m.pausedAt && date >= m.pausedAt) continue;
      if (m.endedAt && date >= m.endedAt) continue;
      if (m.retrying && key === thisKey) continue;
      G(d, date, amt, { monthlyId: m.id, wants18a: true });
    }
  }

  // Once-off givers
  const people = [
    ['Michael', 'Friedman', 'repeat'], ['Nomsa', 'Khumalo', 'repeat'], ['Pieter', 'Botha', 'repeat'], ['Gary', 'Smith', 'repeat'],
    ['Hannah', 'Greenberg', 'repeat'], ['Zanele', 'Ndlovu', 'repeat'], ['Leah', 'Blumenthal', 'repeat'], ['Sipho', 'Zulu', 'repeat'],
    ['Karen', 'Marais', 'once'], ['Bongani', 'Radebe', 'once'], ['Naledi', 'Mahlangu', 'once'],
    ['Henry', 'Barnard', 'lapsed'], ['Johan', 'Pretorius', 'lapsed'], ['Aisha', 'Cassim', 'lapsed'],
    ['Megan', 'Jacobs', 'new'], ['Kagiso', 'Sithole', 'new'], ['Ruth', 'Adams', 'new'],
  ];
  for (const [first, last, kind] of people) {
    const d = D(first, last);
    if (kind === 'repeat') {
      const n = between(3, 6);
      const days = [between(4, 40)];
      for (let i = 1; i < n; i++) days.push(between(30, 330));
      days.sort((a, b) => a - b);
      days.forEach((x, i) => G(d, ago(x), pick(amounts.slice(0, 7)), i === 0 ? {} : {}));
    } else if (kind === 'once') {
      G(d, ago(between(40, 140)), pick(amounts.slice(0, 6)));
    } else if (kind === 'lapsed') {
      const n = between(2, 4);
      for (let i = 0; i < n; i++) G(d, ago(between(215, 460)), pick(amounts.slice(0, 7)));
    } else {
      G(d, ago(between(3, 25)), pick(amounts.slice(1, 7)));
    }
  }
  // Organisations
  for (const org of ['Hillcrest Rotary Club', 'Table Bay Dental (Pty) Ltd']) {
    const d = D('', '', { type: 'organisation', org, email: slug(org) + '@example.com', wants18a: true, tags: ['Business'] });
    const n = between(2, 3);
    for (let i = 0; i < n; i++) G(d, ago(between(20, 300)), pick([100000, 250000, 500000]));
  }

  // Gifts that are not monthly: method mix, and some belong to the campaign
  const campStart = ago(120), campEnd = addDays(today, 6);
  for (const g of gifts) {
    if (g.monthlyId) continue;
    const r = rnd();
    g.method = r < 0.7 ? 'card' : r < 0.9 ? 'eft' : 'cash';
    g.recorded = g.method !== 'card';
    if (g.date >= campStart && g.date <= campEnd && rnd() < 0.9) g.campaignId = 'c1';
  }
  // A refund, to show the status
  const someGift = gifts.find((g) => !g.monthlyId && g.date >= ago(60));
  if (someGift) someGift.status = 'refunded';

  const raised = gifts.filter((g) => g.campaignId === 'c1' && g.status === 'paid').reduce((t, g) => t + g.amount, 0);
  const target = Math.max(500000, Math.round(raised / 0.6 / 100000) * 100000);

  // Thanked: everyone except the new givers
  const newest = new Set(people.filter((p) => p[2] === 'new').map((p) => p[0]));
  for (const d of donors) d.thankedAt = newest.has(d.first) ? null : ago(between(15, 200));

  // Tags, notes, a follow-up that is due
  byName.Lerato.tags = ['Major donor'];
  byName.Priya.tags = ['Volunteer'];
  byName.Priya.notes = [{ id: 'n1', text: 'Offered to help at the school visit day.', at: ago(9) + 'T10:00:00' }];
  byName.Priya.reminders = [{ id: 'r1', text: 'Phone about the school visit day', due: today, done: false }];
  byName.Lerato.notes = [{ id: 'n2', text: 'Prefers an email to a phone call.', at: ago(30) + 'T09:30:00' }];
  const biz = donors.filter((d) => d.type === 'organisation');
  biz.forEach((d) => (d.tags = ['Business']));

  const sentThanks = donors.filter((d) => ['Sarah', 'Thabo'].includes(d.first)).map((d) => d.id);
  const appealTo = donors.filter((d) => d.email).slice(0, 14).map((d) => d.id);
  return {
    v: 1,
    seededOn: today,
    donors, gifts, monthly,
    campaigns: [{ id: 'c1', title: 'A term of school breakfasts', description: 'Helps feed children at school for a whole term.', targetCents: target, startsAt: campStart, endsAt: campEnd, status: 'active' }],
    sent: [
      { id: 's1', kind: 'thank', subject: 'Thank you from PSFA', body: 'Dear {first_name},\n\nThank you for your gift to PSFA.\n\nWith thanks,\nThe PSFA team', to: sentThanks, at: ago(12) + 'T09:12:00' },
      { id: 's2', kind: 'appeal', subject: 'Meals for the new term', body: 'Dear {first_name},\n\nA new school term is starting. If you can, a gift to PSFA helps children eat at school.\n\nWith thanks,\nThe PSFA team', to: appealTo, at: ago(21) + 'T08:40:00', segment: 'Everyone' },
    ],
    profile: { name: 'PSFA', description: 'Peninsula School Feeding Association feeds children at early childhood centres, primary schools, high schools and TVET colleges in and around Cape Town.', city: 'Cape Town', suburb: '', contactEmail: 'donations@example.org' },
    updates: [{ id: 'u1', text: 'Thank you to everyone who gave this month. We will share more news here soon.', at: ago(6) + 'T08:00:00', image: '' }],
    team: [
      { id: 't1', name: 'Chantal', email: 'chantal@example.org', role: 'Owner', status: 'active' },
      { id: 't2', name: 'Charles', email: 'charles@example.org', role: 'Admin', status: 'active' },
    ],
    segments: [],
    lapsedDays: LAPSED_DAYS,
    tried: {},
    nextId: 1000,
  };
}

/* ============================================================
   State: kept in the visitor's browser only
   ============================================================ */
let S = null;
let storageOk = true;
let lastSnap = null;

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.v === 1 && Array.isArray(s.donors)) return s; }
  } catch (e) { storageOk = false; }
  return null;
}
function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; }
}
function initState() { S = loadState() || seed(todaySA()); saveState(); }
function resetState() { S = seed(todaySA()); lastSnap = null; saveState(); }
/** Take a copy to go back to, then change things and save. */
function change(fn) {
  lastSnap = JSON.stringify(S);
  fn(S);
  saveState();
}
function undoLast() {
  if (!lastSnap) return false;
  S = JSON.parse(lastSnap); lastSnap = null; saveState(); return true;
}
const newId = (p) => p + (++S.nextId);
const tried = (k) => { if (!S.tried[k]) { S.tried[k] = true; saveState(); } };

/* ============================================================
   Derived figures
   ============================================================ */
const paidGifts = () => S.gifts.filter((g) => g.status === 'paid');
const donorById = (id) => S.donors.find((d) => d.id === id);
const campaignById = (id) => S.campaigns.find((c) => c.id === id);
const donorName = (d) => (d ? (d.type === 'organisation' ? d.org : (d.first + ' ' + d.last).trim()) || 'Donor' : 'Donor');
const donorFirst = (d) => (d.type === 'organisation' ? d.org : d.first || 'friend');

function factsAll(today) {
  const by = {};
  for (const d of S.donors) by[d.id] = { count: 0, total: 0, first: null, last: null, largest: 0, monthly: null, group: null };
  for (const g of paidGifts()) {
    const f = by[g.donorId]; if (!f) continue;
    f.count++; f.total += g.amount; f.largest = Math.max(f.largest, g.amount);
    if (!f.first || g.date < f.first) f.first = g.date;
    if (!f.last || g.date > f.last) f.last = g.date;
  }
  for (const m of S.monthly) {
    const f = by[m.donorId]; if (!f) continue;
    if (m.status === 'active') f.monthly = 'active';
    else if (m.status === 'paused' && f.monthly !== 'active') f.monthly = 'paused';
  }
  for (const d of S.donors) {
    const f = by[d.id];
    if (!f.count) continue;
    if (diffDays(f.first, today) <= NEW_DAYS) f.group = 'new';
    else if (diffDays(f.last, today) > S.lapsedDays) f.group = 'lapsed';
    else if (f.count === 1) f.group = 'once';
    else f.group = 'repeat';
  }
  return by;
}
const GROUPS = [
  { key: 'new', label: 'New', hint: 'First donation in the last 30 days' },
  { key: 'repeat', label: 'Coming back', hint: 'Gave more than once, and in the last 6 months' },
  { key: 'once', label: 'Gave once', hint: 'One donation, in the last 6 months' },
  { key: 'lapsed', label: 'Lapsed', hint: 'Nothing in the last 6 months' },
];
const lapsedText = () => (S.lapsedDays === 180 ? '6 months' : plural(Math.round(S.lapsedDays / 30), 'month'));

function monthTotals(today, n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addMonths(monthKey(today), -i));
  const by = new Map(keys.map((k) => [k, { key: k, total: 0, monthly: 0, once: 0, count: 0 }]));
  for (const g of paidGifts()) {
    const r = by.get(monthKey(g.date)); if (!r) continue;
    r.total += g.amount; r.count++;
    if (g.monthlyId) r.monthly += g.amount; else r.once += g.amount;
  }
  return keys.map((k) => by.get(k));
}

/** Monthly donors giving at the end of each month (today for this one), and who began or stopped. */
function monthlyTrend(today, n) {
  const tomorrow = addDays(today, 1);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addMonths(monthKey(today), -i);
    const from = key + '-01', to = addMonths(key, 1) + '-01';
    const cutoff = to > tomorrow ? tomorrow : to;
    let running = 0, cents = 0, started = 0, stopped = 0;
    for (const m of S.monthly) {
      const ended = m.status === 'cancelled' || m.status === 'failed' ? (m.endedAt || today) : null;
      const paused = m.status === 'paused' ? (m.pausedAt || today) : null;
      if (m.startedAt >= from && m.startedAt < to) started++;
      if (ended && ended >= from && ended < to) stopped++;
      if (m.startedAt < cutoff && (!ended || ended >= cutoff) && (!paused || paused >= cutoff)) { running++; cents += m.amount; }
    }
    out.push({ key, running, cents, started, stopped });
  }
  return out;
}

function monthlyState(m) {
  if (m.status === 'active') return m.retrying ? 'retrying' : 'running';
  if (m.status === 'paused') return 'paused';
  return m.status === 'failed' ? 'stopped' : 'cancelled';
}
const MONTHLY_LABELS = { running: 'Running', retrying: 'Declined, trying again', paused: 'Paused by the donor', stopped: 'Stopped', cancelled: 'Cancelled by the donor' };

function campaignStats(c) {
  const g = paidGifts().filter((x) => x.campaignId === c.id);
  const raised = g.reduce((t, x) => t + x.amount, 0);
  return { raised, donors: new Set(g.map((x) => x.donorId)).size, count: g.length, percent: c.targetCents ? Math.min(100, Math.floor((raised * 100) / c.targetCents)) : null };
}
const campaignRunning = (c, today) => c.status === 'active' && c.startsAt <= today && (!c.endsAt || c.endsAt >= today);

/* ---------- exports ---------- */
function splitName(name) {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return p.length <= 1 ? { first: '', last: p[0] || '' } : { first: p.slice(0, -1).join(' '), last: p[p.length - 1] };
}
function salesforceRows(facts) {
  return S.donors.filter((d) => facts[d.id].count).map((d) => {
    const f = facts[d.id];
    const org = d.type === 'organisation';
    const n = org ? { first: '', last: d.org } : { first: d.first, last: d.last };
    return [n.first, n.last, d.email, d.phone, org ? d.org : '', 'Givezy',
      'Givezy donor: ' + f.count + (f.count === 1 ? ' gift, ' : ' gifts, ') + rand(f.total) + ' in total, first gift ' + fmtDate(f.first) + ', last gift ' + fmtDate(f.last)];
  });
}

window.__G = { S: () => S }; // for tests only
const CORE = { KEY, NB, LAPSED_DAYS, NEW_DAYS, MAX_GIFT_CENTS };
