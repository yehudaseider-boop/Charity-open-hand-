/* Givezy charity dashboard sales demo: the screens and what the buttons do. Plain JavaScript, no libraries.
   Nothing leaves this page: no server, no emails, no payments. What the presenter does is kept in this
   browser only (and only if the browser allows it), and "Reset demo" puts everything back. */
"use strict";

// ---------- Formatting (the dashboard's own rules) ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** R1 250, R30, R34.57: a space for thousands, cents only when there are some. */
function rand(cents) {
  const neg = cents < 0; const abs = Math.abs(Math.round(cents));
  const r = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const c = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}R${r}${c === "00" ? "" : `.${c}`}`;
}
const pad = (n) => String(n).padStart(2, "0");
function date(ms) { const p = jhb(ms); return `${pad(p.d)}/${pad(p.m)}/${p.y}`; }
function time(ms) { const p = jhb(ms); return `${pad(p.hh)}:${pad(p.mi)}`; }
function plural(n, one, many) { return `${n} ${n === 1 ? one : many || `${one}s`}`; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
/** "Today at 14:32", "Yesterday", or the date. */
function when(ms) {
  const k = dayKey(ms); const today = dayKey(state.now);
  if (k === today) return `Today at ${time(ms)}`;
  if (k === dayKey(state.now - DAY)) return `Yesterday at ${time(ms)}`;
  return date(ms);
}
function monthKey(ms) { const p = jhb(ms); return p.y * 12 + p.m - 1; }

// ---------- State ----------
const STORE = "givezy-sales-demo-v2";
let state;
let lastAction = null; // { text, next: {label, route}, before: snapshot } : what happened, undo, what next
let saving = null; // what is saving right now, for the status line

function fresh() {
  const s = buildSample(Date.now());
  s.mode = "full";
  s.walk = { gift: false, receipt: false, note: false, payout: false };
  s.newGiftId = null;
  s.declinedLinkSent = false;
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const s = JSON.parse(raw); if (s && s.gifts && dayKey(s.now) === dayKey(Date.now())) return s; }
  } catch (e) { /* storage blocked: start fresh */ }
  return fresh();
}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* fine: the demo still works */ } }
const snapshot = () => JSON.stringify(state);

const donorOf = (g) => state.donors.find((d) => d.id === g.donorId);
const paid = () => state.gifts.filter((g) => g.status === "paid");

// ---------- Figures ----------
function totals() {
  const nowKey = monthKey(state.now);
  const ty = taxYearOf(state.now);
  const p = paid();
  const sum = (list) => list.reduce((t, g) => t + g.cents, 0);
  const month = p.filter((g) => monthKey(g.at) === nowKey);
  const last = p.filter((g) => monthKey(g.at) === nowKey - 1);
  const year = p.filter((g) => taxYearOf(g.at) === ty);
  const running = state.donors.filter((d) => d.monthly);
  const donorIds = new Set(p.map((g) => g.donorId));
  return {
    monthCents: sum(month), monthCount: month.length, lastCents: sum(last),
    ty, yearCents: sum(year), yearCount: year.length,
    monthlyCents: running.reduce((t, d) => t + d.monthly.cents, 0), monthlyCount: running.length,
    donorCount: donorIds.size, allCents: sum(p),
  };
}
function lastTwelveMonths() {
  const nowKey = monthKey(state.now);
  const out = [];
  for (let k = nowKey - 11; k <= nowKey; k++) out.push({ key: k, y: Math.floor(k / 12), m: (k % 12) + 1, cents: 0 });
  for (const g of paid()) { const row = out.find((r) => r.key === monthKey(g.at)); if (row) row.cents += g.cents; }
  return out;
}
function niceStep(max) {
  const raw = max / 4; const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * mag >= raw) return f * mag;
  return 10 * mag;
}

// ---------- Routes ----------
const NAV = [
  { title: "Giving", tabs: [["overview", "Overview"], ["donations", "Donations"], ["campaigns", "Campaigns"], ["receipts", "s18A receipts"], ["payouts", "Payouts"]] },
  { title: "People", tabs: [["donors", "Donors"]] },
];
const TITLES = { overview: "Overview", donations: "Donations", campaigns: "Campaigns", receipts: "s18A receipts", payouts: "Payouts", donors: "Donors", donor: "Donor" };
function route() {
  const h = (location.hash || "").replace(/^#/, "");
  if (/^donor-d\d+$/.test(h)) return { name: "donor", id: h.slice(6) };
  return { name: TITLES[h] ? h : "overview" };
}
function go(name) { if (location.hash === `#${name}`) render(); else location.hash = name; window.scrollTo(0, 0); }

// ---------- Shell ----------
function shell() {
  const r = route();
  const tab = r.name === "donor" ? "donors" : r.name;
  const link = ([id, label]) => `<a href="#${id}"${id === tab ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  document.getElementById("nav-row").innerHTML = NAV.flatMap((g) => g.tabs).map(link).join("");
  document.getElementById("nav-side").innerHTML = NAV.map((g) => `<div><p>${esc(g.title)}</p>${g.tabs.map(link).join("")}</div>`).join("");
  document.title = `${TITLES[r.name]}: Sample Charity · Givezy demo`;
}
function status() {
  const el = document.getElementById("status");
  if (!navigator.onLine) { el.dataset.state = "offline"; el.innerHTML = `<span class="dot"></span>Offline: the demo still works`; return; }
  if (saving) { el.dataset.state = "saving"; el.innerHTML = `<span class="dot"></span>${esc(saving)}`; return; }
  el.dataset.state = "saved";
  el.innerHTML = `<span class="dot"></span>${state.savedAt ? `Saved<span class="hide-phone">&nbsp;at</span> ${time(state.savedAt)}` : "Up to date"}`;
}

/** What just happened, take it back, what next: the dashboard's pattern after every action. */
function happenedCard() {
  if (!lastAction) return "";
  const here = route();
  const name = here.name === "donor" ? `donor-${here.id}` : here.name;
  if (lastAction.where && name !== "overview" && name !== lastAction.where) return "";
  return `<section class="happened" aria-live="polite">
    <div class="row"><span class="tick" aria-hidden="true">✓</span><p class="what grow wrap-any">${esc(lastAction.text)}</p>
      ${lastAction.before ? `<button class="btn quiet small" data-act="undo">Undo</button>` : ""}</div>
    ${lastAction.next ? `<p class="next">What next: <a href="#${lastAction.next.route}">${esc(lastAction.next.label)}</a></p>` : ""}
  </section>`;
}

// ---------- Overview ----------
function overview() {
  const t = totals();
  const months = lastTwelveMonths();
  const recent = [...state.gifts].sort((a, b) => b.at - a.at).slice(0, 6);
  return `
  <div class="page-head"><div><h1>Overview</h1><p class="lead">How giving to Sample Charity is going, and what needs you.</p></div>
    ${state.mode === "empty" ? "" : state.newGiftId ? `<button class="btn" disabled>New gift shown</button>` : `<button class="btn cta" data-act="new-gift">Show a new gift</button>`}</div>
  ${happenedCard()}
  ${state.mode === "empty" ? `<div class="notice neutral"><p class="title">No donations yet</p><p>Once Sample Charity's page is approved and shared, each gift shows up here the moment it arrives, with its s18A receipt waiting as a draft.</p></div>` : ""}
  <div class="grid-stats">
    <div class="stat strong"><p class="label">This month</p><p class="value">${rand(t.monthCents)}</p><p class="note">${plural(t.monthCount, "donation")} · last month ${rand(t.lastCents)}</p></div>
    <div class="stat"><p class="label">Tax year ${t.ty}</p><p class="value">${rand(t.yearCents)}</p><p class="note">${plural(t.yearCount, "donation")}</p></div>
    <div class="stat"><p class="label">Every month</p><p class="value">${rand(t.monthlyCents)}</p><p class="note">from ${plural(t.monthlyCount, "monthly donor")}</p></div>
    <div class="stat"><p class="label">Donors</p><p class="value">${t.donorCount}</p><p class="note">${rand(t.allCents)} given in all</p></div>
  </div>
  <p class="small muted">Amounts are the donations only. Fee: to be confirmed. Tax year ${t.ty} runs from 01/03/${t.ty - 1} to ${date(atJhb(t.ty, 3, 1) - DAY)}.</p>
  <div class="two-col">
    <section class="card"><div class="card-head"><h2>Month by month</h2><span class="small muted">Last 12 months</span></div>${chart(months)}</section>
    <section class="card"><h2>Needs you this week</h2>${needsYou()}</section>
  </div>
  <section class="card">
    <div class="card-head"><h2>Latest donations</h2><a href="#donations" class="small">See them all on Donations</a></div>
    ${recent.length ? `<ul class="list">${recent.map(giftLine).join("")}</ul>` : `<p class="muted">No donations yet. They show up here the moment they arrive.</p>`}
  </section>`;
}
function giftLine(g) {
  const d = donorOf(g);
  const fresh = g.id === state.newGiftId;
  const tag = g.status === "declined" ? `<span class="pill declined">Declined</span>` : fresh ? `<span class="pill ${g.saving ? "saving" : "saved"}">${g.saving ? "Saving…" : "Saved"}</span>` : "";
  return `<li${fresh ? ' class="fresh-li"' : ""}><span class="grow wrap-any"><strong>${esc(d.name)}</strong> <span class="muted small">· ${when(g.at)}${g.kind === "monthly" ? " · monthly donation" : ""}${g.via === "eft" ? " · recorded EFT" : ""}</span></span>
    <span>${tag} <span class="amount">${rand(g.cents)}</span></span></li>`;
}
function needsYou() {
  const nowKey = monthKey(state.now);
  const items = [];
  const firstGift = {};
  for (const g of paid()) if (!(g.donorId in firstGift) || g.at < firstGift[g.donorId]) firstGift[g.donorId] = g.at;
  const newDonors = Object.values(firstGift).filter((at) => monthKey(at) === nowKey).length;
  if (newDonors) items.push([`${plural(newDonors, "new donor")} this month`, "donors", "Say thank you"]);
  const declined = state.gifts.filter((g) => g.status === "declined" && monthKey(g.at) === nowKey).length;
  if (declined) items.push([`${plural(declined, "monthly donation")} declined this month and being tried again`, "donations", "See who"]);
  for (const d of state.donors) for (const f of d.followUps) if (f.due <= dayKey(state.now)) items.push([`Follow up with ${d.name}: ${f.what}`, `donor-${d.id}`, "Open"]);
  const drafts = state.gifts.filter((g) => g.receipt && g.receipt.status === "draft").length;
  if (drafts) items.push([`${plural(drafts, "s18A receipt")} waiting as ${drafts === 1 ? "a draft" : "drafts"}`, "receipts", "Issue them"]);
  const c = state.campaign;
  if (c && c.endsAt > state.now) { const days = Math.ceil((c.endsAt - state.now) / DAY); if (days <= 21) items.push([`"${c.title}" ends on ${date(c.endsAt)}, in ${plural(days, "day")}`, "campaigns", "Share it again"]); }
  if (!items.length) return `<p class="muted">Nothing needs you right now. New donors, declined monthly donations and campaigns about to end show up here.</p>`;
  return `<ul class="list">${items.map(([text, r, label]) => `<li><span class="grow wrap-any">${esc(text)}</span><a href="#${r}">${esc(label)}</a></li>`).join("")}</ul>`;
}
function chart(months) {
  const narrow = window.innerWidth < 600;
  const W = narrow ? 360 : 640, H = narrow ? 220 : 230, L = narrow ? 58 : 64, B = 30, T = 12;
  const max = Math.max(...months.map((m) => m.cents), 0);
  if (max === 0) return `<p class="muted">No donations in the last 12 months yet. Each month's total shows here.</p>`;
  const step = niceStep(max); const top = Math.ceil(max / step) * step;
  const y = (c) => T + (H - T - B) * (1 - c / top);
  const bw = (W - L) / 12;
  let grid = "";
  for (let v = 0; v <= top + 1; v += step) grid += `<line class="grid" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${rand(v)}</text>`;
  const bars = months.map((m, i) => {
    const x = L + i * bw + bw * 0.18; const h = Math.max(0, y(0) - y(m.cents));
    const now = i === 11;
    return `<g><title>${MONTHS[m.m - 1]} ${m.y}: ${rand(m.cents)}${now ? " so far" : ""}</title>
      <rect class="bar${now ? " now" : ""}" x="${x}" y="${y(m.cents)}" width="${bw * 0.64}" height="${h}" rx="6"/>
      <text x="${x + bw * 0.32}" y="${H - 10}" text-anchor="middle">${narrow ? MONTHS[m.m - 1][0] : MONTHS[m.m - 1].slice(0, 3)}</text></g>`;
  }).join("");
  const best = months.reduce((a, b) => (b.cents > a.cents ? b : a));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Donations per month for the last 12 months">${grid}${bars}</svg>
    <div class="chart-key"><span>This month so far: <strong>${rand(months[11].cents)}</strong></span><span>Best month: <strong>${MONTHS[best.m - 1]} ${best.y}, ${rand(best.cents)}</strong></span></div>`;
}

function placeholder(name) {
  return `<div class="page-head"><h1>${esc(TITLES[name])}</h1></div><div class="notice neutral"><p>This screen comes in the next chunk of the demo.</p></div>`;
}

// ---------- Render ----------
const VIEWS = { overview, donations, donors, donor, receipts, payouts, campaigns };
function render() {
  shell();
  const r = route();
  const view = VIEWS[r.name];
  if (r.name === "payouts" && state.newGiftId && !saving) {
    const dep = deposits().find((d) => d.gifts.some((g) => g.id === state.newGiftId));
    if (dep && !state.walk.payout) { state.walk.payout = true; ui.openDeposit = dep.id; persist(); }
  }
  document.getElementById("main").innerHTML = view ? view(r) : placeholder(r.name);
  document.getElementById("demo-controls").innerHTML = `<button class="btn quiet small hide-phone" data-act="reset">Reset demo</button>`;
  walkPanel();
  status();
}

// ---------- Actions ----------
const ACTIONS = {
  undo() {
    if (!lastAction || !lastAction.before) return;
    const text = lastAction.undoText || "Taken back.";
    state = JSON.parse(lastAction.before);
    state.savedAt = Date.now();
    lastAction = { text, where: lastAction.where };
    persist(); render();
  },
};
/**
 * Every change goes the same way: "Saving…" in the status line, then the change, "Saved", and the
 * "what happened, undo, what next" card. Nothing leaves the page; the short wait is there so the presenter
 * can show the status line doing its job.
 */
function act({ label = "Saving…", apply, text, undoText, next, walk }) {
  if (saving) return;
  const before = snapshot();
  saving = label; status();
  document.querySelectorAll("main button").forEach((b) => { b.disabled = true; });
  setTimeout(() => {
    apply();
    if (walk) state.walk[walk] = true;
    state.savedAt = Date.now();
    saving = null;
    const r = route();
    lastAction = { text, undoText, next, before, where: r.name === "donor" ? `donor-${r.id}` : r.name };
    persist(); render();
  }, 700);
}
function issueReceipt(g) {
  const ty = taxYearOf(g.at);
  state.counters[ty] = (state.counters[ty] || 0) + 1;
  g.receipt = { status: "issued", number: `SC-${ty}-${String(state.counters[ty]).padStart(4, "0")}`, issuedAt: Date.now() };
}
Object.assign(ACTIONS, SCREEN_ACTIONS, {
  issue(el) {
    const g = state.gifts.find((x) => x.id === el.dataset.id);
    if (!g || !g.receipt || g.receipt.status !== "draft") return;
    const name = donorOf(g).name; const isNew = g.id === state.newGiftId;
    act({
      label: "Issuing the s18A receipt…",
      apply: () => { const live = state.gifts.find((x) => x.id === g.id); issueReceipt(live); ui.receiptTab = "issued"; },
      text: `s18A receipt issued to ${name} for ${rand(g.cents)}.`,
      undoText: `The s18A receipt for ${name} is back to a draft. Nothing was sent.`,
      next: isNew ? { label: `Add a follow-up note for ${name}`, route: `donor-${g.donorId}` } : { label: "Back to Overview", route: "overview" },
      walk: isNew ? "receipt" : null,
    });
  },
  "issue-all"() {
    const drafts = state.gifts.filter((g) => g.receipt && g.receipt.status === "draft");
    if (!drafts.length) return;
    const hasNew = drafts.some((g) => g.id === state.newGiftId);
    act({
      label: `Issuing ${plural(drafts.length, "s18A receipt")}…`,
      apply: () => { state.gifts.filter((g) => g.receipt && g.receipt.status === "draft").sort((a, b) => a.at - b.at).forEach(issueReceipt); ui.receiptTab = "issued"; },
      text: `${plural(drafts.length, "s18A receipt")} issued, ${rand(drafts.reduce((t, g) => t + g.cents, 0))} in all.`,
      undoText: `The ${plural(drafts.length, "receipt")} are back to drafts. Nothing was sent.`,
      next: hasNew ? { label: "Add a follow-up note for the new donor", route: `donor-${state.gifts.find((g) => g.id === state.newGiftId).donorId}` } : { label: "Back to Overview", route: "overview" },
      walk: hasNew ? "receipt" : null,
    });
  },
  "save-note"(el) {
    const d = state.donors.find((x) => x.id === el.dataset.id);
    const text = ui.noteDraft.trim();
    if (!text) { ui.noteError = "Write a note first. Nothing was saved."; render(); const t = document.getElementById("n-text"); if (t) t.focus(); return; }
    if (ui.noteDue && ui.noteDue < dayKey(state.now)) { ui.noteError = "The follow-up date is in the past. Pick today or later; your note is kept."; render(); return; }
    const due = ui.noteDue;
    const isNewDonor = state.newGiftId && state.gifts.find((g) => g.id === state.newGiftId).donorId === d.id;
    act({
      apply: () => {
        const live = state.donors.find((x) => x.id === d.id);
        live.notes.push({ id: `n${Date.now()}`, text, at: Date.now() });
        if (due) live.followUps.push({ id: `f${Date.now()}`, what: text, due });
        ui.noteDraft = ""; ui.noteDue = ""; ui.noteError = "";
      },
      text: due ? `Note saved for ${d.name}, with a reminder on ${keyToDate(due)}.` : `Note saved for ${d.name}.`,
      undoText: `The note for ${d.name} is taken off.`,
      next: isNewDonor ? { label: "See where the money lands: Payouts", route: "payouts" } : { label: "Back to Donors", route: "donors" },
      walk: isNewDonor ? "note" : null,
    });
  },
  "resend-link"(el) {
    const g = state.gifts.find((x) => x.id === el.dataset.id);
    const first = donorOf(g).name.split(" ")[0];
    act({
      label: "Sending…",
      apply: () => { state.declinedLinkSent = true; },
      text: `${first} was sent the update-card link again. (Sample: no email leaves this demo.)`,
      undoText: "Taken back: the second link is marked as not sent.",
      next: { label: `See ${first}'s donor page`, route: `donor-${g.donorId}` },
    });
  },
});
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el);
});
window.addEventListener("hashchange", render);
const sizeOf = () => (window.innerWidth < 600 ? 0 : window.innerWidth < 1024 ? 1 : 2);
let lastSize = sizeOf();
window.addEventListener("resize", () => { const n = sizeOf(); if (n !== lastSize) { lastSize = n; render(); } });
window.addEventListener("online", status);
window.addEventListener("offline", status);

// ---------- The scripted walkthrough ----------
const NEW_GIFT = { donorId: "d01", cents: 150000 };
const STEPS = [
  { key: "gift", label: "Show a new gift", route: "overview" },
  { key: "receipt", label: "Issue its s18A receipt", route: "receipts" },
  { key: "note", label: "Add a follow-up note to Naledi", route: "donor-d01" },
  { key: "payout", label: "See it matched in Payouts", route: "payouts" },
];
// Open on a laptop; folded away on a phone so it doesn't cover the screen (it remembers your choice).
let walkOpen = (() => { try { const v = localStorage.getItem(`${STORE}-walk`); if (v) return v === "open"; } catch (e) { /* fine */ } return window.innerWidth >= 600; })();
function walkPanel() {
  // On a laptop it sits under the dashboard's menu, so it never covers the page; on a phone it floats at the bottom.
  const wide = window.innerWidth >= 1024;
  document.getElementById(wide ? "walk-slot" : "walk-side").innerHTML = "";
  const slot = document.getElementById(wide ? "walk-side" : "walk-slot");
  if (state.mode === "empty") {
    slot.innerHTML = `<aside class="walk${wide ? " inline" : ""}" data-open="${walkOpen}" aria-label="Walkthrough"><div class="walk-head"><button data-act="walk-toggle" aria-expanded="${walkOpen}">Walkthrough: a new charity</button></div>
      <div class="walk-body"><p class="small">This is how the dashboard looks before the first gift.</p><p style="margin-top:8px"><button class="btn small" data-act="mode-full">Back to the full sample</button></p></div></aside>`;
    return;
  }
  const done = STEPS.filter((s) => state.walk[s.key]).length;
  const current = STEPS.find((s) => !state.walk[s.key]);
  slot.innerHTML = `<aside class="walk${wide ? " inline" : ""}" data-open="${walkOpen}" aria-label="Walkthrough">
    <div class="walk-head"><button data-act="walk-toggle" aria-expanded="${walkOpen}"><span>Walkthrough</span><span class="pill">${done} of ${STEPS.length}</span></button>
      <button data-act="walk-toggle" class="small muted" aria-hidden="true" tabindex="-1">${walkOpen ? "Hide" : "Show"}</button></div>
    <div class="walk-body" style="display:${walkOpen ? "grid" : "none"};gap:10px">
      <ol>${STEPS.map((s, i) => `<li class="${state.walk[s.key] ? "done" : s === current ? "current" : ""}"><span class="num">${state.walk[s.key] ? "✓" : i + 1}</span><a class="step" href="#${s.route}">${esc(s.label)}</a></li>`).join("")}
        <li class="${done === STEPS.length ? "current" : ""}"><span class="num">5</span><button class="link-btn step" data-act="reset">Reset demo</button></li></ol>
      <p class="small muted">Also worth showing: <a href="#donations">a declined monthly donation</a> · <button class="link-btn" data-act="mode-empty">a brand-new charity</button></p>
    </div></aside>`;
}
function resetDialog() {
  return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rs-title">
    <h2 id="rs-title">Put the demo back to the start?</h2>
    <p>The new gift, the receipts you issued and the notes you added are cleared, so you can run the walkthrough again. This can't be undone.</p>
    <div class="actions"><button class="btn quiet" data-act="close-dialog">Keep going</button><button class="btn danger" data-act="reset-yes">Yes, reset the demo</button></div>
  </div>`;
}
function seedLatest() {
  if (state.seeded || state.mode === "empty") return;
  state.seeded = true;
  const before = snapshot();
  const y = jhb(state.now - DAY);
  state.gifts.push({ id: "g-eft1", donorId: "d08", cents: 200000, at: atJhb(y.y, y.m, y.d, 15, 20), kind: "once", via: "eft", status: "paid", campaignId: null, receipt: { status: "draft" } });
  lastAction = { text: "You recorded an EFT gift of R2 000 from Lindiwe Example yesterday.", undoText: "The EFT gift from Lindiwe Example is taken off.", next: { label: "Issue her s18A receipt", route: "receipts" }, before, where: "donations" };
  persist();
}
function startOver(mode) {
  state = fresh();
  if (mode === "empty") { state.mode = "empty"; state.donors = []; state.gifts = []; state.campaign = null; }
  Object.assign(ui, { period: "all", campaign: "all", kind: "all", q: "", shown: 25, receiptTab: "draft", donorQ: "", donorShown: 30, openDeposit: null, depositsShown: 6, noteError: "", noteDraft: "", noteDue: "" });
  lastAction = null; saving = null;
  seedLatest();
  persist();
}
Object.assign(ACTIONS, {
  "new-gift"() {
    if (saving || state.newGiftId || state.mode === "empty") return;
    const g = { id: "g-new", ...NEW_GIFT, at: Date.now(), kind: "once", via: "card", status: "paid", campaignId: state.campaign ? state.campaign.id : null, receipt: { status: "draft" }, saving: true };
    state.gifts.push(g); state.newGiftId = g.id;
    saving = "Saving the new gift…";
    render();
    setTimeout(() => {
      const live = state.gifts.find((x) => x.id === "g-new");
      if (!live) return;
      live.saving = false; state.walk.gift = true; state.savedAt = Date.now(); saving = null;
      const name = donorOf(live).name;
      lastAction = { text: `A new gift arrived: ${rand(live.cents)} from ${name}${live.campaignId ? ` to the ${state.campaign.title}` : ""}, just now.`, next: { label: `Issue ${name.split(" ")[0]}'s s18A receipt`, route: "receipts" }, where: "overview" };
      persist(); render();
    }, 1100);
  },
  reset() { openDialog(resetDialog()); },
  "reset-yes"() { closeDialog(); startOver("full"); go("overview"); lastAction = { text: "The demo is back to the start. Nothing you did is kept.", where: "overview" }; render(); },
  "mode-empty"() { startOver("empty"); go("overview"); },
  "mode-full"() { startOver("full"); go("overview"); },
  "walk-toggle"() { walkOpen = !walkOpen; try { localStorage.setItem(`${STORE}-walk`, walkOpen ? "open" : "closed"); } catch (e) { /* fine */ } walkPanel(); },
});

state = load();
seedLatest();
render();
