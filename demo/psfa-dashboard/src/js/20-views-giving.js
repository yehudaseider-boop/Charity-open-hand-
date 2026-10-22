
/* ============================================================
   Overview, donations (record, import, export), monthly
   ============================================================ */
const charityName = () => S.profile.name;
const A = (href, text, cls) => '<a href="' + esc(href) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</a>';
const head = (title, actions, sub) => '<div class="page-head"><div><h1 tabindex="-1">' + esc(title) + '</h1>' + (sub ? '<p class="muted sub">' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="head-actions">' + actions + '</div>' : '') + '</div>';
const card = (title, body, cls) => '<section class="card' + (cls ? ' ' + cls : '') + '">' + (title ? '<h2>' + title + '</h2>' : '') + body + '</section>';
const dName = (id) => donorName(donorById(id));
const dLink = (id) => A('#/donors/' + id, esc(dName(id)), 'dl');

const TRY_ITEMS = [
  ['gift', 'Record a gift', '#/donations?record=1', 'An EFT or cash gift that came in outside the website. Watch the charts and totals change.'],
  ['chart', 'Touch a chart', '#/', 'Hover or tap a bar to see the month. Switch the range, or hide monthly or once-off.'],
  ['thank', 'Thank your new donors', '#/thank', 'Send a thank-you to the people who gave for the first time.'],
  ['email', 'Email your lapsed donors', '#/email?audience=lapsed', 'Write to people who have not given in 6 months.'],
  ['note', 'Add a note or a follow-up to a donor', '#/donors', 'Open any donor. Notes, tags and reminders stay.'],
  ['campaign', 'Start a campaign', '#/campaigns?new=1', 'Set a goal and a closing date.'],
  ['give', 'Give from your public page', '#/public', 'Make a gift as a donor would, then see it arrive here.'],
];

VIEWS.overview = () => {
  const today = todaySA(), thisKey = monthKey(today), lastKey = addMonths(thisKey, -1);
  const facts = factsAll(today);
  const paid = paidGifts();
  const sum = (arr) => arr.reduce((t, g) => t + g.amount, 0);
  const inMonth = (k) => paid.filter((g) => monthKey(g.date) === k);
  const ty = taxYearOf(today), tr = taxYearRange(ty);
  const yearGifts = paid.filter((g) => g.date >= tr.from && g.date <= tr.to);
  const running = S.monthly.filter((m) => m.status === 'active');
  const withGifts = S.donors.filter((d) => facts[d.id].count);
  const groups = { new: 0, repeat: 0, once: 0, lapsed: 0 };
  withGifts.forEach((d) => groups[facts[d.id].group]++);
  const repeatCount = withGifts.filter((d) => facts[d.id].count > 1).length;
  const giftsTotal = withGifts.reduce((t, d) => t + facts[d.id].count, 0);
  const per = giftsPerDonor(giftsTotal, withGifts.length);
  const avg = yearGifts.length ? Math.round(sum(yearGifts) / yearGifts.length) : 0;

  // Needs you
  const todo = [];
  const toThank = withGifts.filter((d) => facts[d.id].group === 'new' && !d.thankedAt && d.email).length;
  if (toThank) todo.push([plural(toThank, 'new donor') + ' to thank', '#/thank', 'Say thank you']);
  const retrying = S.monthly.filter((m) => monthlyState(m) === 'retrying').length;
  if (retrying) todo.push([plural(retrying, 'monthly donation') + ' declined this month and being tried again', '#/monthly?show=running', 'See who']);
  const ended = S.monthly.filter((m) => (m.status === 'cancelled' || m.status === 'failed') && m.endedAt && diffDays(m.endedAt, today) <= 30);
  if (ended.length) todo.push([plural(ended.length, 'monthly donation') + ' stopped or cancelled in the last 30 days (' + rand(ended.reduce((t, m) => t + m.amount, 0)) + ' a month)', '#/monthly?show=ended', 'See who']);
  const paused = S.monthly.filter((m) => m.status === 'paused' && m.pausedAt && diffDays(m.pausedAt, today) <= 30);
  if (paused.length) todo.push([plural(paused.length, 'monthly donor') + ' paused in the last 30 days', '#/monthly?show=paused', 'See who']);
  if (groups.lapsed) todo.push([plural(groups.lapsed, 'donor') + ' ' + (groups.lapsed === 1 ? "hasn't" : "haven't") + ' given in the last ' + lapsedText(), '#/donors?group=lapsed', 'See who']);
  const due = [];
  S.donors.forEach((d) => d.reminders.forEach((r) => { if (!r.done && r.due <= today) due.push({ d, r }); }));
  due.slice(0, 5).forEach(({ d, r }) => todo.push(['Follow up with ' + donorName(d) + ': ' + r.text + (r.due < today ? ' (was due ' + fmtDate(r.due) + ')' : ''), '#/donors/' + d.id, 'Open']));
  if (due.length > 5) todo.push([plural(due.length - 5, 'more follow-up') + ' due', '#/donors', 'See donors']);
  S.campaigns.filter((c) => campaignRunning(c, today) && c.endsAt && diffDays(today, c.endsAt) <= 7).forEach((c) => {
    const st = campaignStats(c);
    todo.push(['"' + c.title + '" ends on ' + fmtDate(c.endsAt) + (st.percent != null ? ', at ' + st.percent + '% of its goal' : ''), '#/campaigns', 'See it']);
  });
  const refunded = S.gifts.filter((g) => g.status === 'refunded').length;
  if (refunded) todo.push([plural(refunded, 'donation') + ' refunded', '#/donations?status=refunded', 'See them']);

  // Things to try
  const done = TRY_ITEMS.filter((t) => S.tried[t[0]]).length;
  const tryPanel = S.tried.hideTry ? '' : card('Things to try: ' + done + ' of ' + TRY_ITEMS.length + ' done',
    '<ul class="try">' + TRY_ITEMS.map((t) => '<li class="' + (S.tried[t[0]] ? 'done' : '') + '"><span class="tick" aria-hidden="true">' + (S.tried[t[0]] ? '✓' : '') + '</span><div><a href="' + t[2] + '">' + esc(t[1]) + '</a><span class="muted">' + esc(t[3]) + '</span></div></li>').join('') + '</ul>' +
    '<p class="hint">This is a demo with made-up donors. Everything you do stays in this browser only. <button class="linkbtn" data-act="hide-try">Hide this</button></p>', 'try-card');

  const top = withGifts.slice().sort((a, b) => facts[b.id].total - facts[a.id].total).slice(0, 5);
  const campaigns = S.campaigns.filter((c) => c.status === 'active').slice(0, 3);
  const tyShown = 'Tax year ' + ty;

  return {
    title: 'Overview',
    html: head('Overview', '<button class="btn cta" data-act="record-open">Record a gift</button><button class="btn secondary" data-act="import-open">Import gifts</button>') +
      tryPanel +
      '<div class="stats">' +
      stat('This month', rand(sum(inMonth(thisKey))), plural(inMonth(thisKey).length, 'donation') + ' · last month ' + rand(sum(inMonth(lastKey))), true) +
      stat(tyShown, rand(sum(yearGifts)), plural(yearGifts.length, 'donation')) +
      stat('Every month', rand(running.reduce((t, m) => t + m.amount, 0)), 'from ' + plural(running.length, 'monthly donor')) +
      stat('Donors', String(withGifts.length), rand(sum(paid)) + ' given in all') + '</div>' +
      '<p class="hint">Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included. The payment provider’s card fee comes off each donation before it reaches your bank. ' + tyShown + ' (' + fmtDate(tr.from) + ' to ' + fmtDate(tr.to) + ').</p>' +
      card('Needs you this week', todo.length ? '<ul class="todo">' + todo.map((t) => '<li><span>' + esc(t[0]) + '</span><a class="btn small secondary" href="' + t[1] + '">' + esc(t[2]) + '</a></li>').join('') + '</ul>' : '<p class="muted">Nothing needs you right now. New donors, declined monthly donations and campaigns about to end show up here.</p>') +
      '<div class="two">' +
      '<div class="col">' +
      card('Your donors', withGifts.length === 0 ? '<p class="muted">These fill in once donations start coming in.</p>' :
        '<ul class="tiles">' + GROUPS.map((g) => '<li><a class="tile" href="#/donors?group=' + g.key + '"><span class="num">' + groups[g.key] + '</span><strong>' + g.label + '</strong><span class="muted">' + g.hint + '</span></a></li>').join('') + '</ul>' +
        '<ul class="facts"><li><strong>' + Math.floor((repeatCount * 100) / withGifts.length) + '%</strong> of your donors have given more than once <span class="muted">(' + repeatCount + ' of ' + withGifts.length + ')</span>.</li>' +
        '<li>On average, a donor has given <strong>' + per + '</strong> times <span class="muted">(' + plural(giftsTotal, 'donation') + ' from ' + plural(withGifts.length, 'donor') + ', all time)</span>.</li>' +
        '<li>' + (yearGifts.length ? 'The average donation this tax year is <strong>' + rand(avg) + '</strong> <span class="muted">(' + plural(yearGifts.length, 'donation') + ')</span>.' : 'No donations yet this tax year.') + '</li></ul>') +
      card('Your biggest supporters', top.length ? '<ol class="rank">' + top.map((d) => '<li>' + dLink(d.id) + '<span>' + rand(facts[d.id].total) + ' <span class="muted">(' + plural(facts[d.id].count, 'donation') + ')</span></span></li>').join('') + '</ol><p class="hint">All-time totals. A personal thank-you goes a long way. ' + A('#/donors', 'All donors') + '</p>' : '<p class="muted">Your biggest supporters show here once gifts come in.</p>') +
      card('Campaigns', campaigns.length ? campaigns.map(campaignRow).join('') + '<p>' + A('#/campaigns', 'Manage campaigns', 'dl') + '</p>' : '<p class="muted">No campaign running. ' + A('#/campaigns?new=1', 'Start a campaign') + '</p>') +
      '</div><div class="col">' +
      card('Donations by month', '<div id="chart-don"></div>') +
      card('Monthly giving over time', '<div id="chart-mon"></div>') +
      card('Where gifts come from', '<div id="chart-src"></div>') +
      card('s18A receipts', '<p>' + rand(sum(yearGifts.filter((g) => g.wants18a))) + ' of this tax year’s paid donations asked for an s18A receipt. Receipts are issued after the tax year ends on ' + fmtDate(tr.to) + '. ' + A('#/receipts', 'See receipts', 'dl') + '</p>') +
      '</div></div>',
    mount() { refreshChart('don'); refreshChart('mon'); refreshChart('src'); },
  };
};
function stat(label, value, note, strong) {
  return '<div class="stat' + (strong ? ' strong' : '') + '"><p class="stat-l">' + esc(label) + '</p><p class="stat-v">' + esc(value) + '</p><p class="stat-n">' + esc(note) + '</p></div>';
}
function giftsPerDonor(gifts, donors) {
  if (donors <= 0) return null;
  const tenths = Math.floor((gifts * 20 + donors) / (donors * 2));
  return Math.floor(tenths / 10) + '.' + (tenths % 10);
}
function campaignRow(c) {
  const st = campaignStats(c);
  return '<div class="camp"><div class="camp-top"><strong>' + esc(c.title) + '</strong><span>' + rand(st.raised) + (c.targetCents ? ' of ' + rand(c.targetCents) : '') + '</span></div>' +
    (c.targetCents ? '<div class="bar-track" role="img" aria-label="' + st.percent + '% of the goal"><div class="bar-fill" style="width:' + st.percent + '%"></div></div>' : '') +
    '<p class="muted small-t">' + (st.percent != null ? st.percent + '% of the goal' + (c.endsAt ? ', ends ' + fmtDate(c.endsAt) : '') : plural(st.donors, 'donor')) + '</p></div>';
}
ACTIONS['hide-try'] = () => { S.tried.hideTry = true; saveState(); render(true); };

/* ---------------- donations ---------------- */
const PER = 15;
function giftRows(q) {
  const today = todaySA();
  const needle = (q.q || '').toLowerCase();
  const ty = q.ty ? +q.ty : null, tr = ty ? taxYearRange(ty) : null;
  let rows = S.gifts.filter((g) => {
    if (q.status ? g.status !== q.status : false) return false;
    if (q.method && g.method !== q.method) return false;
    if (q.campaign && g.campaignId !== q.campaign) return false;
    if (q.month && monthKey(g.date) !== q.month) return false;
    if (tr && (g.date < tr.from || g.date > tr.to)) return false;
    if (needle) { const d = donorById(g.donorId); const hay = (donorName(d) + ' ' + (d ? d.email : '') + ' ' + g.ref).toLowerCase(); if (!hay.includes(needle)) return false; }
    return true;
  });
  const dir = q.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => (q.sort === 'amount' ? (a.amount - b.amount) * dir : (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1) * dir));
  return rows;
}
const STATUS_LABELS = { paid: 'Paid', refunded: 'Refunded', charged_back: 'Charged back' };
const STATUS_TONE = { paid: 'ok', refunded: 'warn', charged_back: 'bad' };

VIEWS.donations = (ctx) => {
  const q = ctx.query; const page = Math.max(1, +q.page || 1);
  const rows = giftRows(q);
  const shown = rows.slice((page - 1) * PER, page * PER);
  const base = (o) => '#/donations' + qs(Object.assign({}, q, { page: '' }, o || {}));
  const paidSum = rows.filter((g) => g.status === 'paid').reduce((t, g) => t + g.amount, 0);
  const chips = [['', 'All'], ['paid', 'Paid'], ['refunded', 'Refunded'], ['charged_back', 'Charged back']].map((s) => '<a class="chip" href="' + base({ status: s[0] }) + '" aria-current="' + ((q.status || '') === s[0]) + '">' + s[1] + '</a>').join('');
  const active = [];
  if (q.month) active.push(['Month: ' + monthLong(q.month), base({ month: '' })]);
  if (q.ty) active.push(['Tax year ' + q.ty, base({ ty: '' })]);
  if (q.method) active.push(['Method: ' + (METHODS[q.method] || q.method), base({ method: '' })]);
  if (q.campaign) active.push(['Campaign: ' + (campaignById(q.campaign) || { title: 'Unknown' }).title, base({ campaign: '' })]);
  const body = rows.length === 0
    ? (Object.keys(q).filter((k) => !['record', 'import', 'page'].includes(k)).length ? empty('No donations match', 'Try a different search, or clear a filter.', '<p><a class="btn secondary" href="#/donations">Clear all filters</a></p>') : empty('No donations yet', 'They appear here once the first one comes in, or when you record one yourself.', '<p><button class="btn cta" data-act="record-open">Record a gift</button></p>'))
    : '<div class="rows">' + shown.map((g) => {
      const d = donorById(g.donorId), c = campaignById(g.campaignId);
      return '<div class="row"><div class="row-main"><button class="rowbtn" data-act="gift-detail" data-id="' + g.id + '"><strong>' + esc(donorName(d)) + '</strong><span class="muted">' + fmtDate(g.date) + ' · ' + esc(METHODS[g.method] || 'Other') + (c ? ' · ' + esc(c.title) : '') + '</span></button>' +
        '<div class="badges">' + badge(STATUS_LABELS[g.status], STATUS_TONE[g.status]) + (g.wants18a ? badge('s18A requested', 'lilac') : '') + (g.monthlyId ? badge('Monthly', '') : '') + (g.recorded ? badge('Recorded by you', '') : '') + '</div></div><div class="row-amt">' + rand(g.amount) + '</div></div>';
    }).join('') + '</div>' + pager(rows.length, page, PER, (p) => base({ page: p }));
  return {
    title: 'Donations',
    html: head('Donations', '<button class="btn cta" data-act="record-open">Record a gift</button><button class="btn secondary" data-act="import-open">Import gifts</button>', 'Every donation to ' + esc(charityName()) + ', whether it came through Givezy or you recorded it.') +
      '<div class="toolbar"><nav class="chips" aria-label="Status">' + chips + '</nav>' +
      '<form class="search" data-form="donation-search" role="search"><label class="sr" for="dq">Search donations</label><input id="dq" name="q" value="' + esc(q.q || '') + '" placeholder="Search name, email or reference"><button class="btn small">Search</button></form></div>' +
      '<div class="toolbar"><form class="filters" data-form="donation-filter"><label class="sr" for="fm">Method</label><select id="fm" name="method" data-change="filter-submit"><option value="">Any method</option>' + Object.keys(METHODS).map((m) => '<option value="' + m + '"' + (q.method === m ? ' selected' : '') + '>' + METHODS[m] + '</option>').join('') + '</select>' +
      '<label class="sr" for="fc">Campaign</label><select id="fc" name="campaign" data-change="filter-submit"><option value="">Any campaign</option>' + S.campaigns.map((c) => '<option value="' + c.id + '"' + (q.campaign === c.id ? ' selected' : '') + '>' + esc(c.title) + '</option>').join('') + '</select>' +
      '<label class="sr" for="fs">Order</label><select id="fs" name="sort" data-change="filter-submit"><option value="">Newest first</option><option value="amount"' + (q.sort === 'amount' ? ' selected' : '') + '>Largest first</option></select></form>' +
      '<button class="btn small secondary" data-act="export-gifts">Download this list (CSV)</button></div>' +
      (active.length ? '<p class="active">' + active.map((a) => '<a class="pill" href="' + a[1] + '">' + esc(a[0]) + ' ×</a>').join('') + '</p>' : '') +
      '<p class="hint">' + plural(rows.length, 'donation') + ', ' + rand(paidSum) + ' paid.</p>' + body,
    mount() {
      if (q.record) { ctx.replace(base({ record: '' })); openRecord(); }
      if (q.import) { ctx.replace(base({ import: '' })); openImport(); }
    },
  };
};
FORMS['donation-search'] = (f) => { const q = currentQuery(); location.hash = '#/donations' + qs(Object.assign({}, q, { q: formVal(f, 'q'), page: '' })); };
ACTIONS['filter-submit'] = (el) => {
  const f = el.closest('form'); const q = currentQuery();
  const o = {};
  Array.from(f.elements).forEach((x) => { if (x.name) o[x.name] = x.value; });
  location.hash = '#/donations' + qs(Object.assign({}, q, o, { page: '' }));
};

ACTIONS['export-gifts'] = () => {
  const rows = giftRows(currentQuery());
  const header = ['Date', 'Reference', 'Donor', 'Email', 'Amount (R)', 'Status', 'Method', 'Campaign', 's18A receipt requested'];
  download('psfa-donations.csv', toCsv(header, rows.map((g) => { const d = donorById(g.donorId), c = campaignById(g.campaignId); return [fmtDate(g.date), g.ref, donorName(d), d ? d.email : '', plain(g.amount), STATUS_LABELS[g.status], METHODS[g.method] || 'Other', c ? c.title : '', g.wants18a ? 'Yes' : 'No']; })));
  toast('Downloaded ' + plural(rows.length, 'donation') + ' as a spreadsheet file.', { undo: false, ms: 4000 });
};

ACTIONS['gift-detail'] = (el) => {
  const g = S.gifts.find((x) => x.id === el.dataset.id); if (!g) return;
  const d = donorById(g.donorId), c = campaignById(g.campaignId);
  const ty = taxYearOf(g.date), end = taxYearRange(ty).to;
  const receipt = g.status !== 'paid' ? 'No receipt for a ' + STATUS_LABELS[g.status].toLowerCase() + ' donation.' : g.wants18a ? 'An s18A receipt was asked for. It is issued after the tax year ends on ' + fmtDate(end) + '.' : 'No s18A receipt asked for.';
  openModal({
    title: rand(g.amount) + ' from ' + donorName(d),
    html: '<dl class="dl"><dt>Status</dt><dd>' + badge(STATUS_LABELS[g.status], STATUS_TONE[g.status]) + '</dd><dt>Date</dt><dd>' + fmtDate(g.date) + '</dd><dt>Reference</dt><dd>' + esc(g.ref) + '</dd><dt>How</dt><dd>' + esc(METHODS[g.method] || 'Other') + (g.monthlyId ? ', monthly donation' : '') + '</dd>' +
      '<dt>Donor</dt><dd>' + (d ? A('#/donors/' + d.id, esc(donorName(d)), 'dl') + (d.email ? '<br><span class="muted">' + esc(d.email) + '</span>' : '') : '') + '</dd>' +
      '<dt>Campaign</dt><dd>' + (c ? esc(c.title) : 'None') + '</dd><dt>Receipt</dt><dd>' + esc(receipt) + '</dd></dl>' +
      '<div class="actions">' + (g.status === 'paid' ? '<button class="btn secondary" data-act="gift-refund" data-id="' + g.id + '">Mark as refunded</button>' : '') + (g.recorded ? '<button class="btn danger" data-act="gift-remove" data-id="' + g.id + '">Remove this record</button>' : '') + '<button class="btn" data-act="modal-close">Close</button></div>' +
      (g.recorded ? '<p class="hint">You recorded this gift, so you can remove it. Gifts paid through Givezy can only be refunded.</p>' : ''),
  });
};
ACTIONS['gift-refund'] = (el) => {
  const g = S.gifts.find((x) => x.id === el.dataset.id); if (!g) return;
  change((s) => { s.gifts.find((x) => x.id === g.id).status = 'refunded'; });
  closeModal(); toast('Marked ' + rand(g.amount) + ' from ' + dName(g.donorId) + ' as refunded.'); render(true);
};
ACTIONS['gift-remove'] = (el) => {
  const g = S.gifts.find((x) => x.id === el.dataset.id); if (!g) return;
  change((s) => { s.gifts = s.gifts.filter((x) => x.id !== g.id); });
  closeModal(); toast('Removed the record of ' + rand(g.amount) + ' from ' + dName(g.donorId) + '.'); render(true);
};

/* ---------- record a gift ---------- */
function openRecord(preDonor) {
  const today = todaySA();
  const donors = S.donors.slice().sort((a, b) => donorName(a).localeCompare(donorName(b)));
  openModal({
    title: 'Record a gift',
    html: '<p class="muted">For a gift that came in outside the website: an EFT into your bank account, or cash. It counts in your totals, charts and s18A receipts.</p>' +
      '<form data-form="record" novalidate>' +
      field('Who gave', 'donor', { type: 'select', value: preDonor || 'new', options: [['new', 'A new donor'], ...donors.map((d) => [d.id, donorName(d)])], attrs: { 'data-change': 'rec-donor' } }) +
      '<div class="newdonor' + (preDonor ? ' off' : '') + '">' +
      field('Kind of donor', 'dtype', { type: 'select', value: 'individual', options: [['individual', 'A person'], ['organisation', 'An organisation']], attrs: { 'data-change': 'rec-type' } }) +
      '<div class="two-f person">' + field('First name', 'first', { attrs: { maxlength: 60, autocomplete: 'off' } }) + field('Last name', 'last', { attrs: { maxlength: 60, autocomplete: 'off' } }) + '</div>' +
      '<div class="org off">' + field('Organisation name', 'org', { attrs: { maxlength: 100 } }) + '</div>' +
      field('Email', 'email', { optional: true, type: 'email', attrs: { maxlength: 120, autocomplete: 'off' }, hint: 'Needed to thank them or email them later.' }) + '</div>' +
      '<div class="two-f">' + field('Amount (R)', 'amount', { attrs: { inputmode: 'decimal', placeholder: '500', autocomplete: 'off' } }) + field('Date', 'date', { value: fmtDate(today), attrs: { placeholder: 'dd/mm/yyyy', autocomplete: 'off' }, hint: 'dd/mm/yyyy' }) + '</div>' +
      '<div class="two-f">' + field('How it came in', 'method', { type: 'select', value: 'eft', options: [['eft', 'EFT into your bank account'], ['cash', 'Cash']] }) +
      field('Campaign', 'campaign', { type: 'select', value: '', optional: true, options: [['', 'None'], ...S.campaigns.filter((c) => c.status === 'active').map((c) => [c.id, c.title])] }) + '</div>' +
      '<label class="check"><input type="checkbox" name="s18a"> The donor asked for an s18A receipt</label>' +
      '<div class="actions"><button type="button" class="btn secondary" data-act="modal-close">Cancel</button><button class="btn cta">Record gift</button></div></form>',
  });
}
ACTIONS['record-open'] = () => openRecord();
ACTIONS['import-open'] = () => openImport();
ACTIONS['rec-donor'] = (el) => { const f = el.closest('form'); $('.newdonor', f).classList.toggle('off', el.value !== 'new'); };
ACTIONS['rec-type'] = (el) => { const f = el.closest('form'); $('.person', f).classList.toggle('off', el.value !== 'individual'); $('.org', f).classList.toggle('off', el.value === 'individual'); };

function findDonor(email, name) {
  const e = (email || '').toLowerCase();
  return S.donors.find((d) => (e && d.email.toLowerCase() === e)) || S.donors.find((d) => !e && donorName(d).toLowerCase() === String(name).toLowerCase());
}
FORMS.record = async (f) => {
  const errors = {};
  const existing = formVal(f, 'donor') !== 'new' ? donorById(formVal(f, 'donor')) : null;
  const dtype = formVal(f, 'dtype');
  const first = formVal(f, 'first'), last = formVal(f, 'last'), org = formVal(f, 'org'), email = formVal(f, 'email');
  if (!existing) {
    if (dtype === 'individual') { if (!first) errors.first = 'Enter their first name.'; if (!last) errors.last = 'Enter their last name.'; }
    else if (!org) errors.org = 'Enter the organisation’s name.';
    if (email && !validEmail(email)) errors.email = 'That email address does not look right. Check it, or leave it empty.';
  }
  const cents = parseRand(formVal(f, 'amount'));
  if (formVal(f, 'amount') === '') errors.amount = 'Enter the amount in rand, for example 500 or 1 250.50.';
  else if (cents == null) errors.amount = 'Use numbers only, for example 500 or 1 250.50.';
  else if (cents <= 0) errors.amount = 'The amount must be more than R0.';
  else if (cents > MAX_GIFT_CENTS) errors.amount = 'That is more than the most you can record in one gift (R1' + NB + '000' + NB + '000). Check the amount.';
  const today = todaySA();
  const date = parseDateInput(formVal(f, 'date'));
  if (!date) errors.date = 'Enter the date as dd/mm/yyyy, for example ' + fmtDate(today) + '.';
  else if (date > today) errors.date = 'That date is in the future. Use today or an earlier date.';
  else if (date < '2000-01-01') errors.date = 'That date is too long ago. Check the year.';
  if (!showErrors(f, errors)) return;
  const donorId = existing ? existing.id : null;
  if (existing && S.gifts.some((g) => g.donorId === existing.id && g.date === date && g.amount === cents && g.status === 'paid')) {
    const ok = await confirmBox({ title: 'This looks like a repeat', body: 'You already have a gift of ' + rand(cents) + ' from ' + esc(donorName(existing)) + ' on ' + fmtDate(date) + '. Record it again anyway?', confirm: 'Record it again', cancel: 'Go back' });
    if (!ok) return;
  }
  let created = null;
  change((s) => {
    let d = existing ? s.donors.find((x) => x.id === donorId) : findDonor(email, dtype === 'individual' ? first + ' ' + last : org);
    if (d && !existing) { d = s.donors.find((x) => x.id === d.id); }
    if (!d) {
      d = { id: newId('d'), type: dtype, first: dtype === 'individual' ? first : '', last: dtype === 'individual' ? last : '', org: dtype === 'organisation' ? org : '', email, phone: '', tags: [], notes: [], reminders: [], wants18a: !!f.elements.s18a.checked, anonymous: false, noNews: false, thankedAt: null };
      s.donors.push(d); created = d;
    }
    s.gifts.push({ id: newId('g'), ref: 'GZ-' + (100000 + Math.floor(Math.random() * 899999)).toString(36).toUpperCase().slice(0, 6), donorId: d.id, date, amount: cents, method: formVal(f, 'method'), status: 'paid', monthlyId: null, campaignId: formVal(f, 'campaign') || null, wants18a: !!f.elements.s18a.checked, recorded: true });
  });
  tried('gift');
  closeModal();
  const who = existing ? donorName(existing) : dtype === 'individual' ? first + ' ' + last : org;
  toast('Recorded ' + rand(cents) + ' from ' + who + '. Your totals and charts are updated.', { next: created && created.email ? [{ href: '#/thank', label: 'Say thank you' }] : [{ href: '#/donations', label: 'See donations' }] });
  render(true);
};

/* ---------- import gifts from a spreadsheet ---------- */
const IMPORT = { rows: [], s18a: false };
const SAMPLE_CSV = () => {
  const t = todaySA();
  // One row repeats a gift you already have, so you can see how duplicates are caught.
  const ex = S.gifts.filter((g) => g.status === 'paid' && !g.monthlyId).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
  const d = ex ? donorById(ex.donorId) : null;
  const dup = d ? [d.first || d.org, d.last, d.email, plain(ex.amount), fmtDate(ex.date), 'EFT'].join(',') : 'Sarah,Levin,sarah.levin@example.com,180,' + fmtDate(addDays(t, -2)) + ',EFT';
  return 'First name,Last name,Email,Amount,Date,Method\nNomvula,Sibiya,nomvula.sibiya@example.com,R500,' + fmtDate(addDays(t, -3)) + ',EFT\nAndre,du Plessis,andre.duplessis@example.com,1 250.50,' + fmtDate(addDays(t, -9)) + ',EFT\nMaryam,Hendricks,maryam.hendricks@example.com,250,' + fmtDate(addDays(t, -15)) + ',Cash\n' + dup + '\nTest,Row,not-an-email,abc,31/02/2026,EFT\n';
};
function openImport() {
  openModal({
    title: 'Import gifts', size: 'wide',
    html: '<div id="import-body">' + importStepOne('') + '</div>',
  });
}
function importStepOne(text) {
  return '<p class="muted">For a list of gifts from a spreadsheet, such as a bank statement or an old donor list. Save it as CSV, then choose the file or paste it here. Nothing is saved until you press Import.</p>' +
    '<form data-form="import-check" novalidate><div class="field"><label for="f-file">Choose a CSV file</label><input id="f-file" type="file" name="file" accept=".csv,text/csv,text/plain" data-change="import-file"></div>' +
    '<div class="field"><label for="f-text">Or paste the rows</label><textarea id="f-text" name="text" rows="7" placeholder="First name,Last name,Email,Amount,Date,Method">' + esc(text) + '</textarea><p class="err" id="f-text-e" role="alert"></p></div>' +
    '<p class="hint">Columns: first name, last name (or one name column), email, amount, date as dd/mm/yyyy, method (EFT or cash). <button type="button" class="linkbtn" data-act="import-sample">Use sample rows</button> <button type="button" class="linkbtn" data-act="import-template">Download a template</button></p>' +
    '<div class="actions"><button type="button" class="btn secondary" data-act="modal-close">Cancel</button><button class="btn">Check the file</button></div></form>';
}
ACTIONS['import-sample'] = (el) => { $('#f-text', el.closest('form')).value = SAMPLE_CSV(); };
ACTIONS['import-template'] = () => download('givezy-gift-import-template.csv', toCsv(['First name', 'Last name', 'Email', 'Amount', 'Date', 'Method'], [['Nomvula', 'Sibiya', 'nomvula@example.com', '500', fmtDate(todaySA()), 'EFT']]));
ACTIONS['import-file'] = (el) => {
  const file = el.files && el.files[0]; if (!file) return;
  const out = $('#f-text', el.closest('form'));
  if (file.size > 2000000) { $('#f-text-e', el.closest('form')).textContent = 'That file is too big for the demo (the limit is 2 MB).'; return; }
  const r = new FileReader(); r.onload = () => { out.value = String(r.result || ''); }; r.onerror = () => { $('#f-text-e', el.closest('form')).textContent = 'We could not read that file. Try saving it as CSV again.'; }; r.readAsText(file);
};
function checkImport(text) {
  const table = parseCsv(text);
  if (!table.length) return { error: 'There is nothing to import. Choose a file or paste some rows.' };
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
  const head = table[0].map(norm);
  const hasHead = head.includes('amount');
  const idx = (names) => head.findIndex((h) => names.includes(h));
  const col = hasHead ? { first: idx(['firstname', 'first']), last: idx(['lastname', 'surname', 'last']), name: idx(['name', 'donor', 'fullname']), email: idx(['email', 'emailaddress']), amount: idx(['amount', 'amountr', 'rand']), date: idx(['date', 'giftdate', 'paid']), method: idx(['method', 'how', 'type']) } : { first: 0, last: 1, name: -1, email: 2, amount: 3, date: 4, method: 5 };
  if (hasHead && col.amount < 0) return { error: 'We could not find an Amount column. The first row should name the columns, for example: First name, Last name, Email, Amount, Date.' };
  if (hasHead && col.date < 0) return { error: 'We could not find a Date column. Add one with the date as dd/mm/yyyy.' };
  const today = todaySA();
  const rows = []; const seen = new Set();
  table.slice(hasHead ? 1 : 0).slice(0, 500).forEach((r, i) => {
    const get = (k) => (col[k] >= 0 && r[col[k]] != null ? String(r[col[k]]).trim() : '');
    let first = get('first'), last = get('last');
    if (col.name >= 0 && !first && !last) { const sp = splitName(get('name')); first = sp.first; last = sp.last; }
    const email = get('email'), cents = parseRand(get('amount')), date = parseDateInput(get('date'));
    const mraw = get('method').toLowerCase(); const method = /cash/.test(mraw) ? 'cash' : 'eft';
    const problems = [];
    if (!first && !last) problems.push('No name');
    if (email && !validEmail(email)) problems.push('Email does not look right');
    if (cents == null || cents <= 0) problems.push('Amount is not a number above R0');
    else if (cents > MAX_GIFT_CENTS) problems.push('Amount is over R1 000 000');
    if (!date) problems.push('Date is not a real date (use dd/mm/yyyy)');
    else if (date > today) problems.push('Date is in the future');
    let dup = false;
    if (!problems.length) {
      const d = findDonor(email, (first + ' ' + last).trim());
      const key = (d ? d.id : (email || first + last).toLowerCase()) + '|' + date + '|' + cents;
      dup = S.gifts.some((g) => d && g.donorId === d.id && g.date === date && g.amount === cents) || seen.has(key);
      seen.add(key);
    }
    rows.push({ n: i + (hasHead ? 2 : 1), first, last, email, cents, date, method, status: problems.length ? 'error' : dup ? 'dup' : 'ok', note: problems.join('. ') || (dup ? 'Already recorded, left out' : '') });
  });
  return { rows, truncated: table.length - (hasHead ? 1 : 0) > 500 };
}
FORMS['import-check'] = (f) => {
  const res = checkImport(formVal(f, 'text'));
  if (res.error) { $('#f-text-e', f).textContent = res.error; return; }
  IMPORT.rows = res.rows;
  const ok = res.rows.filter((r) => r.status === 'ok'), bad = res.rows.filter((r) => r.status === 'error'), dup = res.rows.filter((r) => r.status === 'dup');
  $('#import-body').innerHTML = '<p><strong>' + plural(ok.length, 'gift') + ' ready to import</strong>' + (dup.length ? ', ' + dup.length + ' already recorded' : '') + (bad.length ? ', ' + plural(bad.length, 'row') + ' with a problem' : '') + '.' + (res.truncated ? ' Only the first 500 rows were read.' : '') + '</p>' +
    '<div class="scroll"><table class="tbl"><thead><tr><th>Row</th><th>Donor</th><th>Amount</th><th>Date</th><th>Result</th></tr></thead><tbody>' + res.rows.map((r) => '<tr class="' + r.status + '"><td>' + r.n + '</td><td>' + esc((r.first + ' ' + r.last).trim() || '(no name)') + (r.email ? '<br><span class="muted">' + esc(r.email) + '</span>' : '') + '</td><td>' + (r.cents != null ? rand(r.cents) : '') + '</td><td>' + (r.date ? fmtDate(r.date) : '') + '</td><td>' + (r.status === 'ok' ? badge('Ready', 'ok') : r.status === 'dup' ? badge('Left out', 'warn') : badge('Problem', 'bad')) + (r.note ? '<br><span class="muted">' + esc(r.note) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<label class="check"><input type="checkbox" id="imp-s18a"> These donors asked for s18A receipts</label>' +
    (bad.length ? '<p class="hint">Rows with a problem are not imported. Fix them in your spreadsheet and import those rows again.</p>' : '') +
    '<div class="actions"><button type="button" class="btn secondary" data-act="import-back">Back</button><button type="button" class="btn cta" data-act="import-go"' + (ok.length ? '' : ' disabled') + '>Import ' + plural(ok.length, 'gift') + '</button></div>';
};
ACTIONS['import-back'] = () => { $('#import-body').innerHTML = importStepOne(''); };
ACTIONS['import-go'] = () => {
  const ok = IMPORT.rows.filter((r) => r.status === 'ok'); if (!ok.length) return;
  const s18a = !!($('#imp-s18a') || {}).checked;
  let newDonors = 0;
  change((s) => {
    ok.forEach((r) => {
      const name = (r.first + ' ' + r.last).trim();
      let d = (() => { const e = r.email.toLowerCase(); return s.donors.find((x) => e && x.email.toLowerCase() === e) || s.donors.find((x) => !e && donorName(x).toLowerCase() === name.toLowerCase()); })();
      if (!d) { d = { id: newId('d'), type: 'individual', first: r.first, last: r.last, org: '', email: r.email, phone: '', tags: [], notes: [], reminders: [], wants18a: s18a, anonymous: false, noNews: true, thankedAt: null }; s.donors.push(d); newDonors++; }
      s.gifts.push({ id: newId('g'), ref: 'GZ-' + (100000 + Math.floor(Math.random() * 899999)).toString(36).toUpperCase().slice(0, 6), donorId: d.id, date: r.date, amount: r.cents, method: r.method, status: 'paid', monthlyId: null, campaignId: null, wants18a: s18a, recorded: true });
    });
  });
  tried('gift');
  closeModal();
  toast('Imported ' + plural(ok.length, 'gift') + (newDonors ? ' and added ' + plural(newDonors, 'new donor') : '') + '. Totals and charts are updated.', { next: [{ href: '#/donations', label: 'See donations' }] });
  render(true);
};

/* ---------------- monthly donations ---------------- */
VIEWS.monthly = (ctx) => {
  const q = ctx.query; const show = ['running', 'paused', 'ended'].includes(q.show) ? q.show : ''; const page = Math.max(1, +q.page || 1);
  const needle = (q.q || '').toLowerCase();
  const matches = (st) => !show || (show === 'running' && (st === 'running' || st === 'retrying')) || (show === 'paused' && st === 'paused') || (show === 'ended' && (st === 'stopped' || st === 'cancelled'));
  const all = S.monthly;
  const rows = all.filter((m) => matches(monthlyState(m)) && (!needle || (donorName(donorById(m.donorId)) + ' ' + donorById(m.donorId).email).toLowerCase().includes(needle)));
  const running = all.filter((m) => m.status === 'active');
  const shown = rows.slice((page - 1) * 12, page * 12);
  const base = (o) => '#/monthly' + qs(Object.assign({}, q, { page: '' }, o || {}));
  const paidCount = (m) => paidGifts().filter((g) => g.monthlyId === m.id);
  return {
    title: 'Monthly donations',
    html: head('Monthly donations', '', 'Donors who give the same amount every month. Givezy collects it on the day they chose. Donors pause, restart or cancel it themselves; you can’t change it from here. In this demo, ' + A('#/account', 'the donor’s account page') + ' lets you try that side.') +
      '<div class="stats two-stats"><div class="stat"><p class="stat-l">Running</p><p class="stat-v">' + rand(running.reduce((t, m) => t + m.amount, 0)) + '</p><p class="stat-n">a month from ' + plural(running.length, 'donor') + '</p></div>' +
      '<div class="stat"><p class="stat-l">Paused or ended</p><p class="stat-v">' + all.filter((m) => m.status !== 'active').length + '</p><p class="stat-n">' + all.filter((m) => m.status === 'paused').length + ' paused, ' + all.filter((m) => m.status === 'cancelled' || m.status === 'failed').length + ' ended</p></div></div>' +
      '<p class="hint">Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included.</p>' +
      card('Monthly giving over time', '<div id="chart-mon"></div>') +
      '<div class="toolbar"><nav class="chips" aria-label="Show">' + [['', 'All'], ['running', 'Running'], ['paused', 'Paused'], ['ended', 'Stopped or cancelled']].map((f) => '<a class="chip" href="' + base({ show: f[0] }) + '" aria-current="' + (show === f[0]) + '">' + f[1] + '</a>').join('') + '</nav>' +
      '<form class="search" data-form="monthly-search" role="search"><label class="sr" for="mq">Search monthly donors</label><input id="mq" name="q" value="' + esc(q.q || '') + '" placeholder="Search name or email"><button class="btn small">Search</button></form></div>' +
      (rows.length ? '<div class="rows">' + shown.map((m) => {
        const d = donorById(m.donorId), st = monthlyState(m), pc = paidCount(m);
        return '<div class="row"><div class="row-main"><strong>' + dLink(d.id) + '</strong><span class="muted">' + esc(d.email) + '</span><div class="badges">' + badge(MONTHLY_LABELS[st], st === 'running' ? 'ok' : st === 'retrying' ? 'warn' : st === 'paused' ? 'lilac' : 'bad') + (d.wants18a ? badge('s18A requested', 'lilac') : '') + '</div>' +
          '<span class="muted">Since ' + fmtDate(m.startedAt) + ': ' + plural(pc.length, 'payment') + ', ' + rand(pc.reduce((t, g) => t + g.amount, 0)) + ' in total' + (m.status === 'active' ? '. Collected on the ' + m.chargeDay + ordinal(m.chargeDay) : '') + (m.pausedAt && m.status === 'paused' ? '. Paused on ' + fmtDate(m.pausedAt) : '') + (m.endedAt ? '. Ended on ' + fmtDate(m.endedAt) : '') + '</span></div><div class="row-amt">' + rand(m.amount) + '<span class="muted small-t"> a month</span></div></div>';
      }).join('') + '</div>' + pager(rows.length, page, 12, (p) => base({ page: p })) : empty(all.length ? 'No monthly donations match' : 'No monthly donations yet', all.length ? 'Try a different search or filter.' : 'One appears here once a donor chooses to give every month.', all.length ? '<p><a class="btn secondary" href="#/monthly">Clear filters</a></p>' : '')),
    mount() { refreshChart('mon'); },
  };
};
FORMS['monthly-search'] = (f) => { location.hash = '#/monthly' + qs(Object.assign({}, currentQuery(), { q: formVal(f, 'q'), page: '' })); };
const ordinal = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
