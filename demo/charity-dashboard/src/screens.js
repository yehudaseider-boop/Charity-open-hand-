/* The demo's other screens: Donations, Donors and one donor, s18A receipts, Payouts and Campaigns.
   Only function declarations and plain values here: the helpers they use (rand, date, esc, state...) live in
   app.js, which is loaded after this file and calls these at render time. */
"use strict";

/** What each screen is filtered or opened to. Not saved: a fresh page starts with everything showing. */
const ui = { period: "all", campaign: "all", kind: "all", q: "", shown: 25, receiptTab: "draft", donorQ: "", donorShown: 30, openDeposit: null, depositsShown: 6, noteError: "", noteDraft: "", noteDue: "" };

const campaignName = (id) => (id && state.campaign && state.campaign.id === id ? state.campaign.title : "");
const kindLabel = (g) => (g.kind === "monthly" ? "Monthly donation" : "Once-off");
const viaLabel = (g) => (g.via === "eft" ? "Recorded EFT" : "Card");
function receiptCell(g) {
  if (!g.receipt) return `<span class="muted small">No s18A details</span>`;
  if (g.receipt.status === "issued") return `<span class="s18a">${esc(g.receipt.number)}</span>`;
  return `<span class="pill draft">Draft</span>`;
}

// ---------- Donations ----------
/** Date choices, each showing its own dd/mm/yyyy dates. */
function periods() {
  const t = jhb(state.now); const ty = taxYearOf(state.now);
  const mStart = atJhb(t.y, t.m, 1, 0, 0);
  const prev = addMonths(t.y, t.m, -1); const pStart = atJhb(prev.y, prev.m, 1, 0, 0);
  const tyStart = atJhb(ty - 1, 3, 1, 0, 0);
  return [
    { id: "all", label: "All dates", from: 0, to: Infinity },
    { id: "month", label: `This month (from ${date(mStart)})`, from: mStart, to: Infinity },
    { id: "last", label: `Last month (${date(pStart)} to ${date(mStart - DAY)})`, from: pStart, to: mStart - 1 },
    { id: "30", label: `Last 30 days (from ${date(state.now - 30 * DAY)})`, from: state.now - 30 * DAY, to: Infinity },
    { id: "ty", label: `Tax year ${ty} (from ${date(tyStart)})`, from: tyStart, to: Infinity },
  ];
}
function inPeriod(ms) { const p = periods().find((x) => x.id === ui.period) || periods()[0]; return ms >= p.from && ms <= p.to; }
function filteredGifts() {
  const q = ui.q.trim().toLowerCase();
  return [...state.gifts]
    .filter((g) => inPeriod(g.at))
    .filter((g) => ui.campaign === "all" || (ui.campaign === "none" ? !g.campaignId : g.campaignId === ui.campaign))
    .filter((g) => ui.kind === "all" || g.kind === ui.kind)
    .filter((g) => { if (!q) return true; const d = donorOf(g); return d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q); })
    .sort((a, b) => b.at - a.at);
}
function donations() {
  const declined = state.gifts.filter((g) => g.status === "declined");
  return `
  <div class="page-head"><div><h1>Donations</h1><p class="lead">Every gift to Sample Charity: through Givezy, and EFT or cash gifts you recorded.</p></div>
    <button class="btn cta" data-act="csv">Download CSV</button></div>
  ${happenedCard()}
  ${declined.map(declinedNotice).join("")}
  <section class="card">
    <form class="filters" data-form="filters" onsubmit="return false">
      <div class="field"><label for="f-period">Dates</label><select id="f-period" data-filter="period">
        ${periods().map((p) => `<option value="${p.id}"${ui.period === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="f-campaign">Campaign</label><select id="f-campaign" data-filter="campaign">
        <option value="all"${ui.campaign === "all" ? " selected" : ""}>Every campaign</option>
        ${state.campaign ? `<option value="${state.campaign.id}"${ui.campaign === state.campaign.id ? " selected" : ""}>${esc(state.campaign.title)}</option>` : ""}
        <option value="none"${ui.campaign === "none" ? " selected" : ""}>No campaign</option></select></div>
      <div class="field"><label for="f-kind">How they gave</label><select id="f-kind" data-filter="kind">
        <option value="all"${ui.kind === "all" ? " selected" : ""}>Once-off and monthly</option>
        <option value="once"${ui.kind === "once" ? " selected" : ""}>Once-off</option>
        <option value="monthly"${ui.kind === "monthly" ? " selected" : ""}>Monthly donation</option></select></div>
      <div class="field" style="flex:1 1 12rem"><label for="f-q">Search</label><input id="f-q" type="search" data-filter="q" placeholder="Donor name or email" value="${esc(ui.q)}"></div>
    </form>
    <div id="results" style="margin-top:16px">${donationResults()}</div>
  </section>`;
}
function donationResults() {
  const list = filteredGifts();
  const filtered = ui.period !== "all" || ui.campaign !== "all" || ui.kind !== "all" || ui.q.trim();
  if (!state.gifts.length) return `<p class="muted">No donations yet. Each gift shows up here the moment it arrives, and you can download them all as a CSV.</p>`;
  if (!list.length) {
    return `<div class="notice neutral"><p class="title">No donations match these filters</p><p>Nothing is hidden or lost: the filters are just narrower than the gifts.</p><p><button class="link-btn" data-act="clear-filters">Clear the filters</button></p></div>`;
  }
  const paidOnes = list.filter((g) => g.status === "paid");
  // A phone gets a list (no sideways scrolling to find the amount); a laptop gets the full table.
  const phoneRows = () => `<ul class="list">${list.slice(0, ui.shown).map((g) => { const d = donorOf(g); const fresh = g.id === state.newGiftId;
    return `<li class="${fresh ? "fresh-row" : ""}"><span class="grow wrap-any"><a href="#donor-${d.id}"><strong>${esc(d.name)}</strong></a>${fresh ? ` <span class="pill ${g.saving ? "saving" : "saved"}">${g.saving ? "Saving…" : "Saved"}</span>` : ""}
      <br><span class="muted small">${date(g.at)} ${time(g.at)} · ${g.kind === "monthly" ? "Monthly donation" : "Once-off"}${campaignName(g.campaignId) ? ` · ${esc(campaignName(g.campaignId))}` : ""} · ${viaLabel(g)}</span>
      <br>${g.status === "paid" ? receiptCell(g) : `<span class="pill declined">Declined, nothing charged</span>`}</span><span class="amount">${rand(g.cents)}</span></li>`; }).join("")}</ul>`;
  const rows = list.slice(0, ui.shown).map((g) => {
    const d = donorOf(g); const fresh = g.id === state.newGiftId;
    return `<tr${fresh ? ' class="fresh"' : ""}>
      <td>${date(g.at)}<br><span class="muted small">${time(g.at)}</span></td>
      <td class="wrap-any" style="min-width:9rem"><a href="#donor-${d.id}">${esc(d.name)}</a>${fresh ? ` <span class="pill ${g.saving ? "saving" : "saved"}">${g.saving ? "Saving…" : "Saved"}</span>` : ""}</td>
      <td class="r"><span class="amount">${rand(g.cents)}</span>${g.status === "declined" ? `<br><span class="pill declined">Declined, nothing charged</span>` : ""}</td>
      <td>${g.kind === "monthly" ? `<span class="pill monthly">Monthly donation</span>` : "Once-off"}</td>
      <td style="min-width:8.5rem">${esc(campaignName(g.campaignId)) || `<span class="muted">None</span>`}</td>
      <td>${g.status === "paid" ? receiptCell(g) : `<span class="muted small">None</span>`}</td>
      <td>${viaLabel(g)}</td></tr>`;
  }).join("");
  return `<p class="small muted">${plural(paidOnes.length, "donation")}${filtered ? " match" : ""} · ${rand(paidOnes.reduce((t, g) => t + g.cents, 0))}${filtered ? ` · <button class="link-btn" data-act="clear-filters">Clear the filters</button>` : ""}</p>
    ${window.innerWidth < 600 ? `<div style="margin-top:10px">${phoneRows()}</div>` : `<div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>Date</th><th>Donor</th><th class="r">Amount</th><th>How they gave</th><th>Campaign</th><th>s18A receipt</th><th>Came in as</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`}
    ${list.length > ui.shown ? `<p style="margin-top:14px"><button class="btn quiet small" data-act="more-gifts">Show 25 more</button> <span class="small muted">Showing ${ui.shown} of ${list.length}</span></p>` : ""}`;
}
function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function buildCsv(list) {
  const head = ["Date", "Time", "Donor", "Email", "Amount (rand)", "How they gave", "Campaign", "s18A receipt", "Came in as", "Status"];
  const rows = list.map((g) => { const d = donorOf(g); return [date(g.at), time(g.at), d.name, d.email, (g.cents / 100).toFixed(2), kindLabel(g), campaignName(g.campaignId), g.receipt ? (g.receipt.status === "issued" ? g.receipt.number : "Draft") : "", viaLabel(g), g.status === "paid" ? "Paid" : "Declined, nothing charged"]; });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** A declined monthly donation, said plainly: what happened, what didn't, one next step. */
function declinedNotice(g) {
  const d = donorOf(g);
  const retry = g.at + 3 * DAY;
  return `<section class="notice danger" aria-live="polite">
    <p class="title wrap-any">${esc(d.name)}'s monthly donation of ${rand(g.cents)} was declined on ${date(g.at)}</p>
    <p>Nothing was charged. The card was turned down by the donor's bank, so no money moved. The monthly donation is still on: it will be tried again on ${date(retry)}, and ${esc(d.name.split(" ")[0])} was emailed a link to update the card.</p>
    ${state.declinedLinkSent
      ? `<p><strong>Link sent again.</strong> <span class="small">(Sample: no email leaves this demo.)</span></p>`
      : `<p><button class="btn small" data-act="resend-link" data-id="${g.id}">Send ${esc(d.name.split(" ")[0])} the update-card link again</button></p>`}
  </section>`;
}

// ---------- Donors ----------
function donorStats(d) {
  const gs = state.gifts.filter((g) => g.donorId === d.id && g.status === "paid").sort((a, b) => a.at - b.at);
  if (!gs.length) return { count: 0, total: 0, first: null, latest: null, largest: null, gifts: gs };
  return { count: gs.length, total: gs.reduce((t, g) => t + g.cents, 0), first: gs[0], latest: gs[gs.length - 1], largest: gs.reduce((a, b) => (b.cents > a.cents ? b : a)), gifts: gs };
}
function donors() {
  return `
  <div class="page-head"><div><h1>Donors</h1><p class="lead">Everyone who has given to Sample Charity. Open a donor for their gifts, notes and follow-ups.</p></div></div>
  ${happenedCard()}
  <section class="card">
    <div class="filters"><div class="field" style="flex:1 1 16rem"><label for="d-q">Search</label><input id="d-q" type="search" data-filter="donorQ" placeholder="Donor name or email" value="${esc(ui.donorQ)}"></div></div>
    <div id="results" style="margin-top:16px">${donorResults()}</div>
  </section>`;
}
function donorResults() {
  const q = ui.donorQ.trim().toLowerCase();
  const rows = state.donors.map((d) => ({ d, s: donorStats(d) }))
    .filter(({ d, s }) => s.count > 0 || d.monthly)
    .filter(({ d }) => !q || d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q))
    .sort((a, b) => (b.s.latest ? b.s.latest.at : 0) - (a.s.latest ? a.s.latest.at : 0));
  if (!rows.length) return q
    ? `<div class="notice neutral"><p class="title">No donor matches "${esc(ui.donorQ.trim())}"</p><p>Check the spelling, or search by email instead. <button class="link-btn" data-act="clear-donor-search">Clear the search</button></p></div>`
    : `<p class="muted">No donors yet. Everyone who gives shows up here, with their gifts and your notes.</p>`;
  return `<ul class="list">${rows.slice(0, ui.donorShown).map(({ d, s }) => `<li>
      <span class="grow wrap-any"><a href="#donor-${d.id}"><strong>${esc(d.name)}</strong></a>
        ${d.monthly ? ` <span class="pill monthly">Monthly donation</span>` : ""}${d.s18a ? ` <span class="s18a">s18A details</span>` : ""}
        <br><span class="muted small">${plural(s.count, "gift")}${s.latest ? ` · latest ${date(s.latest.at)}` : ""}</span></span>
      <span class="amount">${rand(s.total)}</span></li>`).join("")}</ul>
    ${rows.length > ui.donorShown ? `<p style="margin-top:12px"><button class="btn quiet small" data-act="more-donors">Show more</button></p>` : ""}`;
}
function donor(r) {
  const d = state.donors.find((x) => x.id === r.id);
  if (!d) return `<div class="page-head"><h1>Donor not found</h1></div><div class="notice neutral"><p>This donor isn't in the demo any more, perhaps after Reset demo. <a href="#donors">See all donors</a></p></div>`;
  const s = donorStats(d);
  const gift = (g) => (g ? `<p class="value">${rand(g.cents)}</p><p class="note">${date(g.at)}</p>` : `<p class="value">None</p>`);
  const today = dayKey(state.now);
  return `
  <p class="small"><a href="#donors">← All donors</a></p>
  <div class="page-head"><div style="min-width:0"><h1 class="wrap-any">${esc(d.name)}</h1><p class="lead wrap-any">${esc(d.email)}</p>
    <p style="margin-top:8px">${d.monthly ? `<span class="pill monthly">Monthly donation, ${rand(d.monthly.cents)} on the ${ordinal(d.monthly.day)}</span> ` : ""}${d.s18a ? `<span class="s18a">Gave s18A details</span>` : `<span class="muted small">No s18A details</span>`}</p></div></div>
  ${happenedCard()}
  <div class="grid-stats">
    <div class="stat"><p class="label">First gift</p>${gift(s.first)}</div>
    <div class="stat"><p class="label">Latest gift</p>${gift(s.latest)}</div>
    <div class="stat"><p class="label">Largest gift</p>${gift(s.largest)}</div>
    <div class="stat strong"><p class="label">Given in all</p><p class="value">${rand(s.total)}</p><p class="note">${plural(s.count, "gift")}</p></div>
  </div>
  <div class="two-col">
    <section class="card"><h2>Notes and follow-ups</h2>
      <form data-form="note" style="display:grid;gap:12px" onsubmit="return false" novalidate>
        <div class="field"><label for="n-text">Add a note</label><textarea id="n-text" data-draft="noteDraft" placeholder="For example: called to say thank you">${esc(ui.noteDraft)}</textarea>
          ${ui.noteError ? `<p class="error" role="alert">${esc(ui.noteError)}</p>` : ""}</div>
        <div class="field" style="max-width:20rem"><label for="n-due">Remind me to follow up</label><select id="n-due" data-draft="noteDue">
          ${[["", "No reminder"], [1, "Tomorrow"], [7, "In a week"], [30, "In a month"]].map(([n, l]) => { const v = n === "" ? "" : dayKey(state.now + n * DAY); return `<option value="${v}"${ui.noteDue === v ? " selected" : ""}>${l}${v ? ` (${keyToDate(v)})` : ""}</option>`; }).join("")}</select></div>
        <div><button class="btn cta" data-act="save-note" data-id="${d.id}">Save note</button></div>
      </form>
      ${d.followUps.length ? `<h3 style="font-size:1rem;margin-top:20px">Follow-ups</h3><ul class="list" style="margin-top:8px">${d.followUps.map((f) => `<li><span class="grow wrap-any">${esc(f.what)}</span><span class="${f.due <= today ? "pill draft" : "pill"}">${f.due <= today ? "Due today" : `Due ${keyToDate(f.due)}`}</span></li>`).join("")}</ul>` : ""}
      <h3 style="font-size:1rem;margin-top:20px">Notes</h3>
      ${d.notes.length ? `<ul class="list" style="margin-top:8px">${[...d.notes].sort((a, b) => b.at - a.at).map((n) => `<li><span class="grow wrap-any">${esc(n.text)}</span><span class="muted small">${when(n.at)}</span></li>`).join("")}</ul>` : `<p class="muted small" style="margin-top:6px">No notes yet. Only your team sees them, never the donor.</p>`}
    </section>
    <section class="card"><h2>Gifts</h2>
      ${s.gifts.length ? `<ul class="list">${[...s.gifts].reverse().slice(0, 12).map((g) => `<li class="${g.id === state.newGiftId ? "fresh-row" : ""}"><span class="grow">${date(g.at)}<span class="muted small"> · ${kindLabel(g)}${campaignName(g.campaignId) ? ` · ${esc(campaignName(g.campaignId))}` : ""}</span><br>${receiptCell(g)}</span><span class="amount">${rand(g.cents)}</span></li>`).join("")}</ul>
        ${s.gifts.length > 12 ? `<p class="small muted" style="margin-top:10px">${plural(s.gifts.length - 12, "older gift")} on <a href="#donations">Donations</a></p>` : ""}` : `<p class="muted">No gifts yet.</p>`}
    </section>
  </div>`;
}
function ordinal(n) { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function keyToDate(k) { const [y, m, d] = k.split("-"); return `${d}/${m}/${y}`; }

// ---------- s18A receipts ----------
function receipts() {
  const drafts = state.gifts.filter((g) => g.receipt && g.receipt.status === "draft").sort((a, b) => b.at - a.at);
  const issued = state.gifts.filter((g) => g.receipt && g.receipt.status === "issued").sort((a, b) => b.receipt.issuedAt - a.receipt.issuedAt || b.at - a.at);
  const tab = ui.receiptTab;
  const tabBtn = (id, label) => `<button class="btn small ${tab === id ? "" : "quiet"}" data-act="receipt-tab" data-tab="${id}" aria-pressed="${tab === id}">${label}</button>`;
  return `
  <div class="page-head"><div><h1>s18A receipts</h1><p class="lead">A receipt for each gift from a donor who gave their s18A details. Drafts wait for you to check and issue them.</p></div>
    ${drafts.length ? `<button class="btn cta" data-act="issue-all">Issue all ${drafts.length} drafts</button>` : ""}</div>
  ${happenedCard()}
  <div style="display:flex;gap:8px;flex-wrap:wrap">${tabBtn("draft", `Drafts (${drafts.length})`)}${tabBtn("issued", `Issued (${issued.length})`)}</div>
  <section class="card">
    ${tab === "draft"
      ? (drafts.length ? `<ul class="list">
          ${drafts.map((g) => `<li class="${g.id === state.newGiftId ? "fresh-row" : ""}"><span class="grow wrap-any"><a href="#donor-${g.donorId}"><strong>${esc(donorOf(g).name)}</strong></a><br><span class="muted small">${date(g.at)} · ${kindLabel(g)}</span></span>
            <span class="row-end"><span class="amount">${rand(g.cents)}</span><span class="row-btns"><button class="btn quiet small" data-act="preview" data-id="${g.id}">Preview</button><button class="btn small" data-act="issue" data-id="${g.id}">Issue</button></span></span></li>`).join("")}</ul>`
        : `<p class="muted">No drafts. Every gift with s18A details has its receipt. New ones wait here until you issue them.</p>`)
      : (issued.length ? `<ul class="list">
          ${issued.slice(0, 40).map((g) => `<li class="${g.id === state.newGiftId ? "fresh-row" : ""}"><span class="grow wrap-any"><span class="s18a">${esc(g.receipt.number)}</span> <a href="#donor-${g.donorId}"><strong>${esc(donorOf(g).name)}</strong></a><br><span class="muted small">Gift ${date(g.at)} · issued ${date(g.receipt.issuedAt)}</span></span>
            <span class="row-end"><span class="amount">${rand(g.cents)}</span><span class="row-btns"><button class="btn quiet small" data-act="preview" data-id="${g.id}">Preview</button></span></span></li>`).join("")}</ul>
          ${issued.length > 40 ? `<p class="small muted" style="margin-top:10px">Showing the latest 40 of ${issued.length}.</p>` : ""}`
        : `<p class="muted">No receipts issued yet.</p>`)}
  </section>
  <p class="small muted">Sample receipt numbers. In Givezy each tax year's receipts are numbered in order, and the wording is set with your advisers before any receipt is issued.</p>`;
}
function receiptPreview(g) {
  const d = donorOf(g);
  const ty = taxYearOf(g.at);
  const issued = g.receipt.status === "issued";
  return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rp-title" style="width:min(40rem,100%)">
    <div style="position:relative;border:2px solid var(--light-purple);border-radius:18px;padding:22px;overflow:hidden">
      <div aria-hidden="true" style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none"><span style="transform:rotate(-22deg);font-family:var(--display);font-weight:800;font-size:clamp(2.6rem,10vw,4.5rem);color:rgba(179,38,30,0.16);letter-spacing:0.08em">SAMPLE</span></div>
      <p class="sample-tag" style="margin-bottom:14px">SAMPLE: not a tax receipt</p>
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;border-bottom:1px solid var(--light-purple);padding-bottom:12px">
        <div style="min-width:0"><h2 id="rp-title" style="color:var(--blue);font-size:1.4rem">s18A receipt</h2><p><strong>Sample Charity</strong></p><p class="small muted">NPO number: 000-000 NPO (sample)<br>PBO number: 000000000 (sample)</p></div>
        <div style="text-align:right"><p class="small muted">Receipt number</p><p><strong>${issued ? esc(g.receipt.number) : "Given when issued"}</strong></p><p class="small muted" style="margin-top:6px">Date issued</p><p>${issued ? date(g.receipt.issuedAt) : "Not issued yet"}</p><p class="small muted" style="margin-top:6px">Tax year</p><p>${ty} (01/03/${ty - 1} to ${date(atJhb(ty, 3, 1) - DAY)})</p></div>
      </div>
      <p class="small" style="color:var(--blue);font-weight:700;margin-top:14px">Donor</p><p class="wrap-any"><strong>${esc(d.name)}</strong></p><p class="small muted">ID number: •••• 0000 (sample)</p>
      <p class="small" style="color:var(--blue);font-weight:700;margin-top:14px">Donations received</p>
      <table style="margin-top:4px"><thead><tr><th>Date</th><th class="r">Amount</th></tr></thead><tbody><tr><td>${date(g.at)}</td><td class="r">${rand(g.cents)}</td></tr><tr><td><strong>Total</strong></td><td class="r"><strong>${rand(g.cents)}</strong></td></tr></tbody></table>
      <p class="small muted" style="margin-top:14px">The receipt wording goes here. It is set with the charity's advisers; this sample does not show it.</p>
    </div>
    <div class="actions"><button class="btn" data-act="close-dialog">Close</button></div>
  </div>`;
}

// ---------- Payouts ----------
/** Card gifts paid into the charity's bank in weekly deposits (a sample schedule), each matched to its gifts. */
function deposits() {
  const weekStart = (ms) => { const p = jhb(ms); const mon = atJhb(p.y, p.m, p.d, 0, 0) - ((p.dow + 6) % 7) * DAY; return mon; };
  const groups = new Map();
  for (const g of state.gifts) {
    if (g.status !== "paid" || g.via !== "card") continue;
    const k = weekStart(g.at);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([start, gifts]) => {
    const payDay = start + 9 * DAY + 10 * 3600000; // the Wednesday after the week ends (sample schedule)
    return { id: `dep-${dayKey(start)}`, start, end: start + 6 * DAY, payDay, gifts: gifts.sort((a, b) => b.at - a.at), cents: gifts.reduce((t, g) => t + g.cents, 0), paidIn: payDay <= state.now };
  });
}
function payouts() {
  const list = deposits();
  const recorded = state.gifts.filter((g) => g.status === "paid" && g.via === "eft").length;
  const open = ui.openDeposit;
  const row = (dep) => {
    const hasNew = dep.gifts.some((g) => g.id === state.newGiftId);
    const isOpen = open === dep.id;
    return `<section class="card${hasNew ? "" : ""}" style="${hasNew ? "border-color:var(--orange)" : ""}">
      <div class="card-head">
        <div style="min-width:0"><h2>${dep.paidIn ? `Paid in on ${date(dep.payDay)}` : `On its way, expected ${date(dep.payDay)}`}</h2>
          <p class="small muted">Gifts from ${date(dep.start)} to ${date(dep.end)}</p></div>
        <span class="chip ${dep.paidIn ? "success" : "warning"}">${dep.paidIn ? `Matched: ${dep.gifts.length} of ${dep.gifts.length} gifts` : "On its way"}</span>
      </div>
      <dl class="facts">
        <div><dt>Gifts</dt><dd><span class="amount">${rand(dep.cents)}</span> <span class="muted small">(${plural(dep.gifts.length, "gift")})</span></dd></div>
        <div><dt>Fee</dt><dd>To be confirmed</dd></div>
        <div><dt>Paid into your bank</dt><dd>Gifts less the fee</dd></div>
        <div><dt>Reference</dt><dd>${esc(dep.id.toUpperCase())} <span class="muted small">(sample)</span></dd></div>
      </dl>
      <p style="margin-top:12px"><button class="link-btn" data-act="toggle-deposit" data-id="${dep.id}" aria-expanded="${isOpen}">${isOpen ? "Hide the gifts" : `See the ${plural(dep.gifts.length, "gift")} in this deposit`}</button></p>
      ${isOpen ? `<ul class="list" style="margin-top:10px">${dep.gifts.map((g) => `<li class="${g.id === state.newGiftId ? "fresh-row" : ""}"><span class="grow wrap-any">${esc(donorOf(g).name)} <span class="muted small">· ${date(g.at)} · ${kindLabel(g)}</span></span><span>${dep.paidIn || g.id === state.newGiftId ? `<span class="s18a" style="color:var(--success)">Matched</span> ` : ""}<span class="amount">${rand(g.cents)}</span></span></li>`).join("")}</ul>` : ""}
    </section>`;
  };
  return `
  <div class="page-head"><div><h1>Payouts</h1><p class="lead">Each deposit into Sample Charity's bank account, matched to the gifts in it, so your bookkeeper can tick them off.</p></div>
    <button class="btn cta" data-act="csv-deposits">Download for your bookkeeper</button></div>
  ${happenedCard()}
  ${(() => { const dep = list.find((d) => d.gifts.some((g) => g.id === state.newGiftId)); if (!dep) return ""; const g = dep.gifts.find((x) => x.id === state.newGiftId);
      return `<section class="happened"><div class="row"><span class="tick" aria-hidden="true">✓</span><p class="what grow wrap-any">Matched: ${esc(donorOf(g).name)}'s ${rand(g.cents)} is in the ${dep.paidIn ? `deposit paid in on ${date(dep.payDay)}` : `next deposit, on its way and expected ${date(dep.payDay)}`}${dep.gifts.length > 1 ? `, with ${plural(dep.gifts.length - 1, "other gift")}` : ""}. Your bookkeeper sees it ticked off against the bank.</p></div><p class="next">What next: <button class="link-btn" data-act="reset">Reset demo</button> to run it again</p></section>`; })()}
  ${list.length ? list.slice(0, ui.depositsShown).map(row).join("") : `<div class="notice neutral"><p class="title">No deposits yet</p><p>When the first card gifts come in, each deposit shows here with the gifts it pays out.</p></div>`}
  ${list.length > ui.depositsShown ? `<p><button class="btn quiet small" data-act="more-deposits">Show older deposits</button></p>` : ""}
  <p class="small muted">Sample weekly schedule. ${recorded ? `${plural(recorded, "recorded EFT or cash gift")} went straight to your bank, so ${recorded === 1 ? "it is" : "they are"} not in these deposits.` : ""}</p>`;
}

// ---------- Campaigns ----------
function ring(pct) {
  const r = 52, c = 2 * Math.PI * r, shown = Math.min(100, pct);
  return `<svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="${pct}% of the goal">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--light-purple)" stroke-width="16"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--orange)" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(c * shown) / 100} ${c}" transform="rotate(-90 70 70)"/>
    <text x="70" y="78" text-anchor="middle" style="font-family:var(--display);font-weight:800;font-size:26px;fill:var(--ink)">${pct}%</text></svg>`;
}
function campaigns() {
  const c = state.campaign;
  if (!c) return `<div class="page-head"><h1>Campaigns</h1></div>${happenedCard()}<div class="notice neutral"><p class="title">No campaigns yet</p><p>A campaign gives donors one clear goal, like a winter drive, with its own link and a ring that fills as gifts come in.</p></div>`;
  const gs = state.gifts.filter((g) => g.campaignId === c.id && g.status === "paid").sort((a, b) => b.at - a.at);
  const raised = gs.reduce((t, g) => t + g.cents, 0);
  const pct = Math.floor((raised * 100) / c.goalCents);
  const days = Math.max(0, Math.ceil((c.endsAt - state.now) / DAY));
  const people = new Set(gs.map((g) => g.donorId)).size;
  return `
  <div class="page-head"><div><h1>Campaigns</h1><p class="lead">Give donors one clear goal. Each campaign has its own link, and its gifts are kept apart in Donations and the CSV.</p></div></div>
  ${happenedCard()}
  <section class="card" style="display:grid;gap:18px">
    <div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">
      ${ring(pct)}
      <div style="min-width:0;flex:1 1 16rem;display:grid;gap:6px">
        <p><span class="chip success">Running</span></p>
        <h2 style="font-size:1.5rem">${esc(c.title)}</h2>
        <p><span class="amount" style="font-size:1.6rem">${rand(raised)}</span> <span class="muted">of ${rand(c.goalCents)}</span></p>
        <p class="muted small">${plural(gs.length, "gift")} from ${plural(people, "donor")} · runs ${date(c.startsAt)} to ${date(c.endsAt)} · ${days === 0 ? "ends today" : `${plural(days, "day")} left`}</p>
      </div>
      <button class="btn cta" data-act="share-campaign">Share it again</button>
    </div>
    <div><h3 style="font-size:1rem">Latest gifts to this campaign</h3>
      <ul class="list" style="margin-top:8px">${gs.slice(0, 6).map((g) => `<li class="${g.id === state.newGiftId ? "fresh-row" : ""}"><span class="grow wrap-any">${esc(donorOf(g).name)} <span class="muted small">· ${when(g.at)}</span></span><span class="amount">${rand(g.cents)}</span></li>`).join("")}</ul>
      <p class="small" style="margin-top:10px"><a href="#donations" data-act="campaign-donations">See every gift to this campaign</a></p></div>
  </section>`;
}
function shareDialog() {
  const link = "https://givezy.co.za/c/sample-charity/winter-blanket-drive";
  return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sh-title">
    <h2 id="sh-title">Share "${esc(state.campaign.title)}"</h2>
    <p>Send donors straight to the campaign. Gifts through this link count towards the ring.</p>
    <div class="field"><label for="sh-link">Campaign link (sample)</label><input id="sh-link" readonly value="${link}"></div>
    <p class="small muted">Sample link: it doesn't open a real page, and nothing is sent from this demo.</p>
    <p id="sh-copied" class="small" role="status"></p>
    <div class="actions"><button class="btn quiet" data-act="close-dialog">Close</button><button class="btn" data-act="copy" data-target="sh-link" data-msg="sh-copied">Copy the link</button></div>
  </div>`;
}
function csvDialog(csv, rows, name) {
  return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="csv-title">
    <h2 id="csv-title">Your CSV: ${plural(rows, "row")}</h2>
    <p>${esc(name)} should be in your downloads. If it isn't, copy it from here and paste it into Excel or Google Sheets.</p>
    <div class="field"><label for="csv-text">The file (sample rows)</label><textarea id="csv-text" readonly style="min-height:180px;font-size:0.8rem;white-space:pre;overflow:auto">${esc(csv)}</textarea></div>
    <p id="csv-copied" class="small" role="status"></p>
    <div class="actions"><button class="btn quiet" data-act="close-dialog">Close</button><button class="btn" data-act="copy" data-target="csv-text" data-msg="csv-copied">Copy it all</button></div>
  </div>`;
}

const SCREEN_ACTIONS = {
  "clear-filters"() { Object.assign(ui, { period: "all", campaign: "all", kind: "all", q: "", shown: 25 }); render(); },
  "more-gifts"() { ui.shown += 25; document.getElementById("results").innerHTML = donationResults(); },
  "clear-donor-search"() { ui.donorQ = ""; render(); },
  "more-donors"() { ui.donorShown += 30; document.getElementById("results").innerHTML = donorResults(); },
  "more-deposits"() { ui.depositsShown += 6; render(); },
  "receipt-tab"(el) { ui.receiptTab = el.dataset.tab; render(); },
  "toggle-deposit"(el) { ui.openDeposit = ui.openDeposit === el.dataset.id ? null : el.dataset.id; render(); },
  "campaign-donations"() { Object.assign(ui, { period: "all", campaign: state.campaign.id, kind: "all", q: "", shown: 25 }); go("donations"); },
  preview(el) { const g = state.gifts.find((x) => x.id === el.dataset.id); if (g) openDialog(receiptPreview(g)); },
  "share-campaign"() { openDialog(shareDialog()); },
  csv() {
    const list = filteredGifts();
    const csv = buildCsv(list);
    const name = `sample-charity-donations-${dayKey(state.now)}.csv`;
    download(csv, name);
    openDialog(csvDialog(csv, list.length, name));
  },
  "csv-deposits"() {
    const rows = [["Deposit", "Status", "Expected or paid in", "Gifts from", "Gifts to", "Gift date", "Donor", "Amount (rand)", "Fee"]];
    for (const dep of deposits()) for (const g of dep.gifts) rows.push([dep.id.toUpperCase(), dep.paidIn ? "Paid in" : "On its way", date(dep.payDay), date(dep.start), date(dep.end), date(g.at), donorOf(g).name, (g.cents / 100).toFixed(2), "To be confirmed"]);
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const name = `sample-charity-deposits-${dayKey(state.now)}.csv`;
    download(csv, name);
    openDialog(csvDialog(csv, rows.length - 1, name));
  },
  "close-dialog"() { closeDialog(); },
  copy(el) {
    const box = document.getElementById(el.dataset.target); const msg = document.getElementById(el.dataset.msg);
    const done = (t) => { if (msg) msg.textContent = t; };
    const fallback = () => { box.focus(); box.select(); done("Selected: press Ctrl+C (or Cmd+C) to copy."); };
    try { navigator.clipboard.writeText(box.value).then(() => done("Copied."), fallback); } catch (e) { fallback(); }
  },
};
function download(text, name) {
  try {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { /* the dialog offers the text to copy instead */ }
}
let dialogReturn = null;
function openDialog(html) {
  dialogReturn = document.activeElement;
  const slot = document.getElementById("overlay-slot");
  slot.innerHTML = `<div class="overlay" data-overlay>${html}</div>`;
  const first = slot.querySelector(".dialog button, .dialog input, .dialog textarea");
  if (first) first.focus();
}
function closeDialog() {
  document.getElementById("overlay-slot").innerHTML = "";
  if (dialogReturn && document.contains(dialogReturn)) dialogReturn.focus();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.querySelector("[data-overlay]")) closeDialog(); });
document.addEventListener("click", (e) => { if (e.target.matches && e.target.matches("[data-overlay]")) closeDialog(); });

// Filters re-draw only the results, so typing in the search box keeps its place.
document.addEventListener("input", (e) => {
  const f = e.target.dataset && e.target.dataset.filter;
  if (f) {
    ui[f] = e.target.value;
    if (f === "donorQ") { ui.donorShown = 30; document.getElementById("results").innerHTML = donorResults(); }
    else { ui.shown = 25; document.getElementById("results").innerHTML = donationResults(); }
    return;
  }
  const dr = e.target.dataset && e.target.dataset.draft;
  if (dr) { ui[dr] = e.target.value; if (dr === "noteDraft" && ui.noteError) { ui.noteError = ""; const err = document.querySelector(".field .error"); if (err) err.remove(); } }
});
