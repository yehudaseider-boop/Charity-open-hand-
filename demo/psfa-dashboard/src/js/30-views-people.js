
/* ============================================================
   Donors, a donor's page, thank-yous, emails, sent messages
   ============================================================ */
const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));
const SORTS = { last: 'Most recent gift', total: 'Largest total', name: 'Name A to Z', first: 'Newest donors' };

function donorRows(q, facts) {
  const needle = (q.q || '').toLowerCase();
  let rows = S.donors.filter((d) => facts[d.id].count);
  if (q.group) rows = rows.filter((d) => facts[d.id].group === q.group);
  if (q.tag) rows = rows.filter((d) => d.tags.includes(q.tag));
  if (needle) rows = rows.filter((d) => (donorName(d) + ' ' + d.email).toLowerCase().includes(needle));
  const f = (d) => facts[d.id];
  const sort = SORTS[q.sort] ? q.sort : 'last';
  rows.sort((a, b) => sort === 'total' ? f(b).total - f(a).total : sort === 'name' ? donorName(a).localeCompare(donorName(b)) : sort === 'first' ? (f(b).first < f(a).first ? -1 : 1) : (f(b).last < f(a).last ? -1 : f(b).last > f(a).last ? 1 : 0));
  return rows;
}
const allTags = () => Array.from(new Set(S.donors.flatMap((d) => d.tags))).sort();

VIEWS.donors = (ctx) => {
  const q = ctx.query, today = todaySA(), facts = factsAll(today);
  const page = Math.max(1, +q.page || 1);
  const group = GROUP_BY_KEY[q.group] ? q.group : '';
  const qq = Object.assign({}, q, { group });
  const rows = donorRows(qq, facts);
  const shown = rows.slice((page - 1) * 15, page * 15);
  const counts = { '': 0 }; GROUPS.forEach((g) => (counts[g.key] = 0));
  S.donors.forEach((d) => { const f = facts[d.id]; if (f.count) { counts['']++; counts[f.group]++; } });
  const base = (o) => '#/donors' + qs(Object.assign({}, qq, { page: '' }, o || {}));
  const tags = allTags();
  const hasFilter = group || q.tag || q.q;
  return {
    title: 'Donors',
    html: head('Donors', '<a class="btn secondary" href="#/email">Email donors</a><button class="btn secondary" data-act="export-donors">Download donors (CSV)</button><button class="btn secondary" data-act="export-salesforce">For Salesforce</button>', 'People who have given to ' + esc(charityName()) + '. Where a donor asked for one, Givezy issues the s18A receipt in your name.') +
      '<nav class="chips" aria-label="Donor groups">' + [{ key: '', label: 'All' }].concat(GROUPS).map((g) => '<a class="chip" href="' + base({ group: g.key }) + '" aria-current="' + (group === g.key) + '">' + g.label + ' <span class="count">' + counts[g.key] + '</span></a>').join('') + '</nav>' +
      (group ? '<p class="hint">' + GROUP_BY_KEY[group].hint + '.</p>' : '') +
      (tags.length ? '<nav class="chips small" aria-label="Tags"><span class="muted">Tags:</span>' + tags.map((t) => '<a class="chip" href="' + base({ tag: q.tag === t ? '' : t }) + '" aria-current="' + (q.tag === t) + '">' + esc(t) + '</a>').join('') + '</nav>' : '') +
      (S.segments.length ? '<nav class="chips small" aria-label="Saved lists"><span class="muted">Saved lists:</span>' + S.segments.map((s) => '<span class="chip saved"><a href="#/donors' + qs(s.filters) + '">' + esc(s.name) + '</a><button class="x" data-act="seg-del" data-id="' + s.id + '" aria-label="Remove the list ' + esc(s.name) + '">×</button></span>').join('') + '</nav>' : '') +
      '<div class="toolbar"><form class="search" data-form="donor-search" role="search"><label class="sr" for="dq2">Search donors</label><input id="dq2" name="q" value="' + esc(q.q || '') + '" placeholder="Search name or email"><button class="btn small">Search</button></form>' +
      '<form class="filters" data-form="donor-sort"><label class="sr" for="ds">Order</label><select id="ds" name="sort" data-change="donor-sort">' + Object.keys(SORTS).map((k) => '<option value="' + k + '"' + ((q.sort || 'last') === k ? ' selected' : '') + '>' + SORTS[k] + '</option>').join('') + '</select></form>' +
      (hasFilter ? '<button class="btn small secondary" data-act="seg-save">Save this list</button>' : '') + '</div>' +
      '<p class="hint">' + plural(rows.length, 'donor') + (hasFilter ? ' match' : '') + '.</p>' +
      (rows.length ? '<div class="rows">' + shown.map((d) => {
        const f = facts[d.id];
        return '<div class="row"><div class="row-main"><strong>' + dLink(d.id) + '</strong><span class="muted">' + esc(d.email || 'No email address') + (d.phone ? ' · ' + esc(d.phone) : '') + '</span>' +
          '<div class="badges">' + badge(GROUP_BY_KEY[f.group].label, f.group === 'lapsed' ? 'warn' : f.group === 'new' ? 'ok' : 'lilac') + (f.monthly === 'active' ? badge('Gives monthly', 'ok') : f.monthly === 'paused' ? badge('Monthly paused', '') : '') + (d.wants18a ? badge('s18A requested', 'lilac') : '') + d.tags.map((t) => badge(t, '')).join('') + (d.noNews ? badge('No news or appeals', '') : '') + '</div></div>' +
          '<div class="row-amt">' + rand(f.total) + '<span class="muted small-t">' + plural(f.count, 'donation') + '<br>last ' + fmtDate(f.last) + '</span></div></div>';
      }).join('') + '</div>' + pager(rows.length, page, 15, (p) => base({ page: p }))
        : empty(hasFilter ? 'No donors match' : 'No donors yet', hasFilter ? 'Try a different search or group.' : 'Donors appear here once they give.', hasFilter ? '<p><a class="btn secondary" href="#/donors">Clear filters</a></p>' : '')),
  };
};
FORMS['donor-search'] = (f) => { location.hash = '#/donors' + qs(Object.assign({}, currentQuery(), { q: formVal(f, 'q'), page: '' })); };
ACTIONS['donor-sort'] = (el) => { location.hash = '#/donors' + qs(Object.assign({}, currentQuery(), { sort: el.value, page: '' })); };
ACTIONS['export-donors'] = () => {
  const facts = factsAll(todaySA()); const rows = donorRows(currentQuery(), facts);
  download('psfa-donors.csv', toCsv(['Donor', 'Donor type', 'Email', 'Phone', 'Donations', 'Total (R)', 'First donation', 'Last donation', 's18A receipt requested', 'Group'],
    rows.map((d) => { const f = facts[d.id]; return [donorName(d), d.type === 'organisation' ? 'Organisation' : 'Individual', d.email, d.phone, f.count, plain(f.total), fmtDate(f.first), fmtDate(f.last), d.wants18a ? 'Yes' : 'No', GROUP_BY_KEY[f.group].label]; })));
  toast('Downloaded ' + plural(rows.length, 'donor') + ' as a spreadsheet file.', { undo: false, ms: 4000 });
};
ACTIONS['export-salesforce'] = () => {
  const facts = factsAll(todaySA()); const rows = salesforceRows(facts);
  download('psfa-donors-for-salesforce.csv', toCsv(['First Name', 'Last Name', 'Email', 'Phone', 'Account Name', 'Lead Source', 'Description'], rows));
  toast('Downloaded ' + plural(rows.length, 'donor') + ' laid out for the Salesforce import wizard (standard Contact fields).', { undo: false, ms: 6000 });
};
ACTIONS['seg-save'] = () => {
  const q = currentQuery();
  const m = openModal({ title: 'Save this list', size: 'small', html: '<form data-form="seg-save" novalidate><p class="muted">Keep this group of donors so you can come back to it, or email it, in one tap.</p>' + field('Name', 'name', { attrs: { maxlength: 40, placeholder: 'For example: Lapsed major donors', autofocus: true } }) + '<div class="actions"><button type="button" class="btn secondary" data-act="modal-close">Cancel</button><button class="btn">Save list</button></div></form>' });
  m.box.querySelector('form')._q = { group: q.group || '', tag: q.tag || '', q: q.q || '' };
};
FORMS['seg-save'] = (f) => {
  const name = formVal(f, 'name');
  if (!showErrors(f, name ? (S.segments.some((s) => s.name.toLowerCase() === name.toLowerCase()) ? { name: 'You already have a list with that name.' } : S.segments.length >= 10 ? { name: 'You can keep up to 10 lists. Remove one first.' } : {}) : { name: 'Give the list a name.' })) return;
  const filters = f._q;
  change((s) => { s.segments.push({ id: newId('s'), name, filters }); });
  closeModal(); toast('Saved the list “' + name + '”.'); render(true);
};
ACTIONS['seg-del'] = (el) => { const s = S.segments.find((x) => x.id === el.dataset.id); if (!s) return; change((st) => { st.segments = st.segments.filter((x) => x.id !== s.id); }); toast('Removed the list “' + s.name + '”.'); render(true); };

/* ---------------- one donor ---------------- */
VIEWS.donor = (ctx) => {
  const d = donorById(ctx.params[0]);
  if (!d) return { title: 'Donor not found', html: head('Donor not found') + empty('We could not find that donor', 'They may have been removed. ' + A('#/donors', 'Back to donors', 'dl')) };
  const today = todaySA(), f = factsAll(today)[d.id];
  const gifts = S.gifts.filter((g) => g.donorId === d.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const m = S.monthly.filter((x) => x.donorId === d.id);
  const open = d.reminders.filter((r) => !r.done).sort((a, b) => (a.due < b.due ? -1 : 1));
  const doneR = d.reminders.filter((r) => r.done).slice(-5);
  const byCamp = {};
  gifts.filter((g) => g.status === 'paid' && g.campaignId).forEach((g) => { byCamp[g.campaignId] = (byCamp[g.campaignId] || 0) + g.amount; });
  const name = donorName(d);
  return {
    title: name,
    html: '<a class="back" href="#/donors" data-act="back-list">← Donors</a>' +
      head(name, (d.email ? '<button class="btn secondary" data-act="thank-one" data-id="' + d.id + '">Say thank you</button><a class="btn secondary" href="#/email?donor=' + d.id + '">Email this donor</a>' : '') + '<button class="btn secondary" data-act="record-for" data-id="' + d.id + '">Record a gift</button>',
        (f.group ? badge(GROUP_BY_KEY[f.group].label, f.group === 'lapsed' ? 'warn' : 'lilac') + ' ' : '') + esc(d.email || 'No email address') + (d.phone ? ' · ' + esc(d.phone) : '')) +
      '<div class="stats">' + stat('Given in all', rand(f.total), plural(f.count, 'donation')) + stat('First donation', f.first ? fmtDate(f.first) : 'None', '') + stat('Latest donation', f.last ? fmtDate(f.last) : 'None', f.last ? diffDays(f.last, today) + ' days ago' : '') + stat('Largest donation', rand(f.largest), f.monthly === 'active' ? 'Gives monthly' : f.monthly === 'paused' ? 'Monthly paused' : 'Not monthly') + '</div>' +
      '<div class="two"><div class="col">' +
      card('Follow-ups', '<form data-form="reminder-add" data-id="' + d.id + '" class="inline-form" novalidate>' + field('What to do', 'text', { attrs: { maxlength: 200, placeholder: 'Phone about the school visit' }, cls: 'grow' }) + field('Due', 'due', { value: fmtDate(addDays(today, 7)), attrs: { placeholder: 'dd/mm/yyyy' }, cls: 'narrow' }) + '<button class="btn small">Add</button></form>' +
        (open.length ? '<ul class="plain">' + open.map((r) => '<li class="' + (r.due < today ? 'late' : '') + '"><div><strong>' + esc(r.text) + '</strong><br><span class="muted">' + (r.due < today ? 'Was due ' : r.due === today ? 'Due today, ' : 'Due ') + fmtDate(r.due) + '</span></div><span><button class="btn small secondary" data-act="reminder-done" data-id="' + d.id + '" data-rid="' + r.id + '">Done</button> <button class="linkbtn" data-act="reminder-del" data-id="' + d.id + '" data-rid="' + r.id + '">Remove</button></span></li>').join('') + '</ul>' : '<p class="muted">No follow-ups. Add one and it shows up in Needs you this week when it is due.</p>') +
        (doneR.length ? '<details><summary>Done (' + doneR.length + ')</summary><ul class="plain">' + doneR.map((r) => '<li><span class="muted">' + esc(r.text) + '</span></li>').join('') + '</ul></details>' : '')) +
      card('Notes', '<form data-form="note-add" data-id="' + d.id + '" novalidate>' + field('Add a note', 'text', { type: 'textarea', rows: 3, attrs: { maxlength: 1000, placeholder: 'Only you and your team see notes.' } }) + '<button class="btn small">Save note</button></form>' +
        (d.notes.length ? '<ul class="plain notes">' + d.notes.slice().reverse().map((n) => '<li><div>' + esc(n.text).replace(/\n/g, '<br>') + '<br><span class="muted">' + fmtDate(n.at.slice(0, 10)) + '</span></div><button class="linkbtn" data-act="note-del" data-id="' + d.id + '" data-nid="' + n.id + '">Remove</button></li>').join('') + '</ul>' : '<p class="muted">No notes yet.</p>')) +
      '</div><div class="col">' +
      card('Tags', '<div class="tagrow">' + (d.tags.length ? d.tags.map((t) => '<span class="chip saved">' + esc(t) + '<button class="x" data-act="tag-del" data-id="' + d.id + '" data-tag="' + esc(t) + '" aria-label="Remove the tag ' + esc(t) + '">×</button></span>').join('') : '<span class="muted">No tags yet.</span>') + '</div>' +
        '<form data-form="tag-add" data-id="' + d.id + '" class="inline-form" novalidate>' + field('Add a tag', 'tag', { attrs: { maxlength: 30, placeholder: 'Volunteer', list: 'taglist' }, cls: 'grow' }) + '<datalist id="taglist">' + allTags().map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist><button class="btn small">Add</button></form>') +
      card('Preferences', '<label class="check"><input type="checkbox" data-change="donor-nonews" data-id="' + d.id + '"' + (d.noNews ? ' checked' : '') + '> Has asked not to get news and appeals</label><p class="hint">They are left out of every email appeal. Thank-yous still go.</p>' + (d.thankedAt ? '<p class="muted">Last thanked on ' + fmtDate(d.thankedAt) + '.</p>' : '<p class="muted">Not thanked yet.</p>')) +
      (m.length ? card('Monthly donation', m.map((x) => '<p>' + rand(x.amount) + ' a month. ' + badge(MONTHLY_LABELS[monthlyState(x)], monthlyState(x) === 'running' ? 'ok' : 'warn') + '</p>').join('')) : '') +
      (Object.keys(byCamp).length ? card('Gifts by campaign', '<ul class="plain">' + Object.keys(byCamp).map((k) => '<li><span>' + esc((campaignById(k) || { title: 'Campaign' }).title) + '</span><strong>' + rand(byCamp[k]) + '</strong></li>').join('') + '</ul>') : '') +
      '</div></div>' +
      card('Donations', gifts.length ? '<div class="rows">' + gifts.map((g) => '<div class="row"><div class="row-main"><button class="rowbtn" data-act="gift-detail" data-id="' + g.id + '"><strong>' + fmtDate(g.date) + '</strong><span class="muted">' + esc(METHODS[g.method] || 'Other') + (g.campaignId ? ' · ' + esc((campaignById(g.campaignId) || { title: '' }).title) : '') + '</span></button><div class="badges">' + badge(STATUS_LABELS[g.status], STATUS_TONE[g.status]) + (g.monthlyId ? badge('Monthly', '') : '') + '</div></div><div class="row-amt">' + rand(g.amount) + '</div></div>').join('') + '</div>' : '<p class="muted">No donations.</p>'),
  };
};
ACTIONS['back-list'] = () => { location.hash = sessionStorageGet('lastList') || '#/donors'; };
function sessionStorageGet(k) { try { return sessionStorage.getItem('givezy-' + k); } catch (e) { return null; } }
ACTIONS['record-for'] = (el) => openRecord(el.dataset.id);
ACTIONS['donor-nonews'] = (el) => { change((s) => { s.donors.find((d) => d.id === el.dataset.id).noNews = el.checked; }); toast(el.checked ? 'They will be left out of email appeals.' : 'They will get email appeals again.'); render(true); };
FORMS['note-add'] = (f) => {
  const text = formVal(f, 'text');
  if (!showErrors(f, text ? {} : { text: 'Write the note first.' })) return;
  change((s) => { s.donors.find((d) => d.id === f.dataset.id).notes.push({ id: newId('n'), text, at: todaySA() + 'T12:00:00' }); });
  tried('note'); toast('Note saved.'); render(true);
};
ACTIONS['note-del'] = (el) => { change((s) => { const d = s.donors.find((x) => x.id === el.dataset.id); d.notes = d.notes.filter((n) => n.id !== el.dataset.nid); }); toast('Note removed.'); render(true); };
FORMS['reminder-add'] = (f) => {
  const text = formVal(f, 'text'), due = parseDateInput(formVal(f, 'due')), errors = {};
  if (!text) errors.text = 'Say what to follow up on.';
  if (!due) errors.due = 'Use dd/mm/yyyy.';
  if (!showErrors(f, errors)) return;
  change((s) => { s.donors.find((d) => d.id === f.dataset.id).reminders.push({ id: newId('r'), text, due, done: false }); });
  tried('note'); toast('Follow-up added for ' + fmtDate(due) + '.'); render(true);
};
ACTIONS['reminder-done'] = (el) => { change((s) => { s.donors.find((d) => d.id === el.dataset.id).reminders.find((r) => r.id === el.dataset.rid).done = true; }); toast('Marked as done.'); render(true); };
ACTIONS['reminder-del'] = (el) => { change((s) => { const d = s.donors.find((x) => x.id === el.dataset.id); d.reminders = d.reminders.filter((r) => r.id !== el.dataset.rid); }); toast('Follow-up removed.'); render(true); };
FORMS['tag-add'] = (f) => {
  const tag = formVal(f, 'tag');
  const d = donorById(f.dataset.id);
  if (!showErrors(f, !tag ? { tag: 'Type a tag first.' } : d.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? { tag: 'They already have that tag.' } : d.tags.length >= 8 ? { tag: 'A donor can have up to 8 tags.' } : {})) return;
  change((s) => { s.donors.find((x) => x.id === f.dataset.id).tags.push(tag); });
  tried('note'); toast('Tag added.'); render(true);
};
ACTIONS['tag-del'] = (el) => { change((s) => { const d = s.donors.find((x) => x.id === el.dataset.id); d.tags = d.tags.filter((t) => t !== el.dataset.tag); }); toast('Tag removed.'); render(true); };

/* ---------------- messages ---------------- */
const DEFAULT_THANKS = () => 'Dear {first_name},\n\nThank you for your gift to {charity}. It makes a real difference, and we are grateful.\n\nWith thanks,\nThe ' + charityName() + ' team';
const mergeText = (text, d) => String(text).replace(/\{first_name\}/g, donorFirst(d)).replace(/\{charity\}/g, charityName());
function audienceFor(key, facts, donorId) {
  let pool = S.donors.filter((d) => facts[d.id].count);
  let label = 'Everyone who has given';
  if (key === 'donor' && donorId) { pool = pool.filter((d) => d.id === donorId); label = donorName(donorById(donorId)); }
  else if (GROUP_BY_KEY[key]) { pool = pool.filter((d) => facts[d.id].group === key); label = GROUP_BY_KEY[key].label + ' donors'; }
  else if (key === 'monthly') { pool = pool.filter((d) => facts[d.id].monthly === 'active'); label = 'Monthly donors'; }
  else if (key.startsWith('tag:')) { const t = key.slice(4); pool = pool.filter((d) => d.tags.includes(t)); label = 'Tagged “' + t + '”'; }
  else if (key.startsWith('list:')) {
    const s = S.segments.find((x) => x.id === key.slice(5));
    if (s) { pool = donorRows(s.filters, facts); label = 'Saved list “' + s.name + '”'; }
  }
  const noEmail = pool.filter((d) => !d.email).length;
  const optedOut = pool.filter((d) => d.email && d.noNews).length;
  return { list: pool.filter((d) => d.email && !d.noNews), noEmail, optedOut, label };
}

VIEWS.thank = (ctx) => {
  const today = todaySA(), facts = factsAll(today);
  const mode = ['recent', 'all'].includes(ctx.query.who) ? ctx.query.who : 'new';
  let pool = S.donors.filter((d) => facts[d.id].count);
  if (mode === 'new') pool = pool.filter((d) => facts[d.id].group === 'new' && !d.thankedAt);
  else if (mode === 'recent') pool = pool.filter((d) => diffDays(facts[d.id].last, today) <= 30);
  pool.sort((a, b) => (facts[b.id].last < facts[a.id].last ? -1 : 1));
  const withEmail = pool.filter((d) => d.email);
  return {
    title: 'Thank donors',
    html: head('Thank donors', '', 'A personal thank-you after a first gift is the best moment to build a relationship. In this demo nothing is really emailed.') +
      '<nav class="chips" aria-label="Who">' + [['new', 'New and not yet thanked'], ['recent', 'Gave in the last 30 days'], ['all', 'Everyone']].map((x) => '<a class="chip" href="#/thank?who=' + x[0] + '" aria-current="' + (mode === x[0]) + '">' + x[1] + '</a>').join('') + '</nav>' +
      (pool.length === 0 ? empty('No one to thank right now', mode === 'new' ? 'When someone gives for the first time they appear here. ' + A('#/thank?who=recent', 'See everyone who gave in the last 30 days', 'dl') : 'Nobody matches.') :
        '<form data-form="thank-send" novalidate><div class="two"><div class="col">' + card('Who gets it', '<label class="check"><input type="checkbox" data-change="thank-all" checked> Select everyone with an email address (' + withEmail.length + ')</label><ul class="plain pick">' + pool.map((d) => '<li><label class="check"><input type="checkbox" name="to" value="' + d.id + '"' + (d.email ? ' checked' : ' disabled') + '> <span><strong>' + esc(donorName(d)) + '</strong><br><span class="muted">' + (d.email ? esc(d.email) + ' · gave ' + rand(facts[d.id].total) + ', last ' + fmtDate(facts[d.id].last) : 'No email address, so they cannot be emailed') + (d.thankedAt ? ' · thanked ' + fmtDate(d.thankedAt) : '') + '</span></span></label></li>').join('') + '</ul><p class="err" id="f-to-e" role="alert"></p>') + '</div>' +
        '<div class="col">' + card('Your message', field('Subject', 'subject', { value: 'Thank you from ' + charityName(), attrs: { maxlength: 120 } }) + field('Message', 'body', { type: 'textarea', rows: 9, value: DEFAULT_THANKS(), attrs: { maxlength: 3000 }, hint: 'Use {first_name} for their first name and {charity} for your charity’s name.' }) +
          '<div class="preview"><p class="muted">Preview for <strong id="pv-name">' + esc(donorName(withEmail[0] || pool[0])) + '</strong></p><div id="pv-body" class="pv"></div></div>' +
          '<div class="actions"><button class="btn cta" id="thank-btn">Send thank-yous</button></div><p class="hint">We never email anyone who has asked not to get thank-yous. Nothing is sent in this demo.</p>') + '</div></div></form>'),
    mount() { updateThankPreview(); },
  };
};
function updateThankPreview() {
  const f = document.querySelector('form[data-form="thank-send"]'); if (!f) return;
  const first = $$('input[name=to]:checked', f)[0] || $$('input[name=to]', f)[0];
  const d = first ? donorById(first.value) : null;
  if (!d) return;
  $('#pv-name').textContent = donorName(d);
  $('#pv-body').textContent = formVal(f, 'subject') + '\n\n' + mergeText(formVal(f, 'body'), d);
  const n = $$('input[name=to]:checked', f).length;
  $('#thank-btn').textContent = n ? 'Send ' + plural(n, 'thank-you') : 'Send thank-yous';
}
ACTIONS['thank-all'] = (el) => { $$('input[name=to]:not(:disabled)', el.closest('form')).forEach((c) => { c.checked = el.checked; }); updateThankPreview(); };
document.addEventListener('input', (e) => { if (e.target.closest('form[data-form="thank-send"]')) updateThankPreview(); });
document.addEventListener('change', (e) => { if (e.target.closest('form[data-form="thank-send"]')) updateThankPreview(); });
FORMS['thank-send'] = (f) => {
  const ids = $$('input[name=to]:checked', f).map((c) => c.value);
  const errors = {};
  if (!formVal(f, 'subject')) errors.subject = 'Give the message a subject.';
  if (!formVal(f, 'body')) errors.body = 'Write your message.';
  const shownOk = showErrors(f, errors);
  $('#f-to-e', f).textContent = ids.length ? '' : 'Choose at least one donor to thank.';
  if (!shownOk || !ids.length) return;
  const subject = formVal(f, 'subject'), body = formVal(f, 'body');
  change((s) => {
    ids.forEach((id) => { s.donors.find((d) => d.id === id).thankedAt = todaySA(); });
    s.sent.unshift({ id: newId('s'), kind: 'thank', subject, body, to: ids, at: todaySA() + 'T' + new Date().toTimeString().slice(0, 8) });
  });
  tried('thank');
  toast('Sent ' + plural(ids.length, 'thank-you') + '. (Demo: nothing was really emailed.)', { next: [{ href: '#/sent', label: 'See sent messages' }] });
  location.hash = '#/thank?who=new'; render(true);
};
ACTIONS['thank-one'] = (el) => {
  const d = donorById(el.dataset.id); if (!d || !d.email) return;
  const m = openModal({ title: 'Say thank you to ' + donorName(d), html: '<form data-form="thank-one" data-id="' + d.id + '" novalidate>' + field('Subject', 'subject', { value: 'Thank you from ' + charityName(), attrs: { maxlength: 120 } }) + field('Message', 'body', { type: 'textarea', rows: 7, value: mergeText(DEFAULT_THANKS(), d), attrs: { maxlength: 3000 } }) + '<p class="hint">Goes to ' + esc(d.email) + '. Nothing is really sent in this demo.</p><div class="actions"><button type="button" class="btn secondary" data-act="modal-close">Cancel</button><button class="btn cta">Send thank-you</button></div></form>' });
  return m;
};
FORMS['thank-one'] = (f) => {
  const errors = {};
  if (!formVal(f, 'subject')) errors.subject = 'Give the message a subject.';
  if (!formVal(f, 'body')) errors.body = 'Write your message.';
  if (!showErrors(f, errors)) return;
  const id = f.dataset.id, subject = formVal(f, 'subject'), body = formVal(f, 'body');
  change((s) => { s.donors.find((d) => d.id === id).thankedAt = todaySA(); s.sent.unshift({ id: newId('s'), kind: 'thank', subject, body, to: [id], at: todaySA() + 'T' + new Date().toTimeString().slice(0, 8) }); });
  tried('thank'); closeModal(); toast('Sent a thank-you to ' + dName(id) + '. (Demo: nothing was really emailed.)', { next: [{ href: '#/sent', label: 'See sent messages' }] }); render(true);
};

VIEWS.email = (ctx) => {
  const today = todaySA(), facts = factsAll(today), q = ctx.query;
  const key = q.donor ? 'donor' : (q.audience || 'all');
  const aud = audienceFor(key === 'all' ? 'all' : key, facts, q.donor);
  const options = [['all', 'Everyone who has given'], ...GROUPS.map((g) => [g.key, g.label + ' donors']), ['monthly', 'Monthly donors'], ...allTags().map((t) => ['tag:' + t, 'Tagged “' + t + '”']), ...S.segments.map((s) => ['list:' + s.id, 'Saved list “' + s.name + '”'])];
  if (q.donor) options.unshift(['donor', donorName(donorById(q.donor) || { type: 'individual', first: 'One', last: 'donor' })]);
  const lapsed = key === 'lapsed';
  const defBody = lapsed ? 'Dear {first_name},\n\nWe have not heard from you in a while, and we miss you. A gift to {charity} helps children eat at school.\n\nIf now is not the right time, we understand, and we are grateful for what you have done.\n\nWith thanks,\nThe ' + charityName() + ' team' : 'Dear {first_name},\n\nA short update from {charity}.\n\n\n\nWith thanks,\nThe ' + charityName() + ' team';
  const defSub = lapsed ? 'We miss you at ' + charityName() : '';
  return {
    title: 'Email donors',
    html: head('Email donors', '<a class="btn secondary" href="#/sent">Sent messages</a>', 'News and appeals to the people who have given. Donors who asked not to get them are always left out. In this demo nothing is really emailed.') +
      '<form data-form="email-send" novalidate><div class="two"><div class="col">' +
      card('Who gets it', field('Send to', 'audience', { type: 'select', value: key === 'donor' ? 'donor' : key, options, attrs: { 'data-change': 'email-audience' } }) +
        '<div class="aud" id="aud"><p><strong id="aud-n">' + plural(aud.list.length, 'donor') + '</strong> will get this.</p>' + (aud.noEmail ? '<p class="muted">' + plural(aud.noEmail, 'donor') + ' left out: no email address.</p>' : '') + (aud.optedOut ? '<p class="muted">' + plural(aud.optedOut, 'donor') + ' left out: asked not to get news and appeals.</p>' : '') +
        (aud.list.length ? '<details><summary>See who</summary><ul class="plain">' + aud.list.slice(0, 30).map((d) => '<li><span>' + esc(donorName(d)) + '</span><span class="muted">' + esc(d.email) + '</span></li>').join('') + (aud.list.length > 30 ? '<li class="muted">and ' + (aud.list.length - 30) + ' more</li>' : '') + '</ul></details>' : '<p class="err on">No one to send to with this choice. Pick a different group.</p>') + '</div>') + '</div>' +
      '<div class="col">' + card('Your message', field('Subject', 'subject', { value: defSub, attrs: { maxlength: 120, placeholder: 'A short, plain subject' } }) + field('Message', 'body', { type: 'textarea', rows: 10, value: defBody, attrs: { maxlength: 3000 }, hint: 'Use {first_name} for their first name and {charity} for your charity’s name. Every email carries an unsubscribe link.' }) +
        '<div class="preview"><p class="muted">Preview for <strong>' + esc(aud.list[0] ? donorName(aud.list[0]) : 'a donor') + '</strong></p><div id="em-pv" class="pv"></div></div>' +
        '<div class="actions"><button class="btn cta">Send to ' + plural(aud.list.length, 'donor') + '</button></div>') + '</div></div></form>',
    mount() { const f = document.querySelector('form[data-form="email-send"]'); f._aud = aud; updateEmailPreview(); },
  };
};
function updateEmailPreview() {
  const f = document.querySelector('form[data-form="email-send"]'); if (!f || !f._aud) return;
  const d = f._aud.list[0]; const out = $('#em-pv'); if (!out) return;
  out.textContent = d ? formVal(f, 'subject') + '\n\n' + mergeText(formVal(f, 'body'), d) : '';
}
document.addEventListener('input', (e) => { if (e.target.closest('form[data-form="email-send"]')) updateEmailPreview(); });
ACTIONS['email-audience'] = (el) => {
  const v = el.value;
  const q = currentQuery(); delete q.donor;
  location.hash = '#/email' + qs({ audience: v === 'all' ? '' : v });
};
FORMS['email-send'] = async (f) => {
  const aud = f._aud; const errors = {};
  const subject = formVal(f, 'subject'), body = formVal(f, 'body');
  if (!subject) errors.subject = 'Give the email a subject.';
  if (!body) errors.body = 'Write your message.';
  if (!aud.list.length) errors.audience = 'There is no one to send to. Pick a different group.';
  if (!showErrors(f, errors)) return;
  const recent = S.sent.find((s) => s.kind === 'appeal' && s.subject === subject && s.at.slice(0, 10) === todaySA());
  const ok = await confirmBox({ title: 'Send to ' + plural(aud.list.length, 'donor') + '?', body: (recent ? 'You already sent a message with this subject today. ' : '') + 'Once it is sent it cannot be taken back. (In this demo nothing is really emailed.)<br><br><strong>' + esc(subject) + '</strong>', confirm: 'Send it', cancel: 'Not yet' });
  if (!ok) return;
  change((s) => { s.sent.unshift({ id: newId('s'), kind: 'appeal', subject, body, to: aud.list.map((d) => d.id), at: todaySA() + 'T' + new Date().toTimeString().slice(0, 8), segment: aud.label }); });
  tried('email');
  toast('Sent to ' + plural(aud.list.length, 'donor') + '. (Demo: nothing was really emailed.)', { undo: false, next: [{ href: '#/sent', label: 'See sent messages' }], ms: 10000 });
  location.hash = '#/sent'; render(true);
};

VIEWS.sent = () => {
  const rows = S.sent;
  return {
    title: 'Sent messages',
    html: head('Sent messages', '<a class="btn secondary" href="#/email">Email donors</a>', 'Every thank-you and appeal sent from here, newest first.') +
      (rows.length ? '<div class="rows">' + rows.map((m) => '<details class="msg"><summary><span><strong>' + esc(m.subject) + '</strong><br><span class="muted">' + fmtDate(m.at.slice(0, 10)) + ' · ' + plural(m.to.length, 'donor') + (m.segment ? ' · ' + esc(m.segment) : '') + '</span></span>' + badge(m.kind === 'thank' ? 'Thank-you' : 'Appeal', m.kind === 'thank' ? 'ok' : 'lilac') + '</summary><div class="msg-body"><pre>' + esc(m.body) + '</pre><p class="muted">Sent to: ' + m.to.slice(0, 25).map((id) => esc(dName(id))).join(', ') + (m.to.length > 25 ? ' and ' + (m.to.length - 25) + ' more' : '') + '.</p></div></details>').join('') + '</div>' : empty('Nothing sent yet', 'Thank-yous and appeals you send appear here.', '<p><a class="btn cta" href="#/thank">Thank your donors</a></p>')),
  };
};
