
/* ============================================================
   Campaigns, public profile, updates, receipts, annual report,
   team, application, the public page and the donor's account
   ============================================================ */
const MIN_GIFT = 3000; // R30, as on the real platform

/* ---------------- campaigns ---------------- */
function campaignState(c, today) {
  if (c.status === 'stopped') return ['Stopped', 'bad'];
  if (c.startsAt > today) return ['Starts ' + fmtDate(c.startsAt), 'lilac'];
  if (c.endsAt && c.endsAt < today) return ['Ended', ''];
  return ['Running', 'ok'];
}
VIEWS.campaigns = (ctx) => {
  const today = todaySA();
  return {
    title: 'Campaigns',
    html: head('Campaigns', '<button class="btn cta" data-act="campaign-new">Start a campaign</button>', 'Raise money for something specific, with a goal and a closing date. Donors give to a campaign from your public page.') +
      (S.campaigns.length ? S.campaigns.map((c) => {
        const st = campaignStats(c), cs = campaignState(c, today);
        return '<section class="card camp-card"><div class="camp-head"><h2>' + esc(c.title) + '</h2>' + badge(cs[0], cs[1]) + '</div>' + (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
          '<div class="camp-top"><strong>' + rand(st.raised) + '</strong><span class="muted">' + (c.targetCents ? 'of ' + rand(c.targetCents) + ' (' + st.percent + '%)' : 'no goal set') + '</span></div>' +
          (c.targetCents ? '<div class="bar-track" role="img" aria-label="' + st.percent + '% of the goal"><div class="bar-fill" style="width:' + st.percent + '%"></div></div>' : '') +
          '<p class="muted">' + plural(st.donors, 'donor') + ', ' + plural(st.count, 'donation') + '. ' + fmtDate(c.startsAt) + (c.endsAt ? ' to ' + fmtDate(c.endsAt) : ', no closing date') + '.</p>' +
          '<div class="actions left"><a class="btn small secondary" href="#/donations?campaign=' + c.id + '">See the donations</a><button class="btn small secondary" data-act="campaign-edit" data-id="' + c.id + '">Edit</button>' +
          (c.status === 'active' ? '<button class="btn small secondary" data-act="campaign-stop" data-id="' + c.id + '">Stop it</button>' : '<button class="btn small secondary" data-act="campaign-restart" data-id="' + c.id + '">Start it again</button>') +
          '<button class="btn small secondary" data-act="copy-link" data-id="' + c.id + '">Copy the link</button></div></section>';
      }).join('') : empty('No campaigns yet', 'Start one when you are raising money for something specific.', '<p><button class="btn cta" data-act="campaign-new">Start a campaign</button></p>')),
    mount() { if (ctx.query.new) { ctx.replace('#/campaigns'); campaignForm(); } },
  };
};
ACTIONS['campaign-new'] = () => campaignForm();
ACTIONS['campaign-edit'] = (el) => campaignForm(S.campaigns.find((c) => c.id === el.dataset.id));
function campaignForm(c) {
  const today = todaySA();
  openModal({
    title: c ? 'Edit the campaign' : 'Start a campaign',
    html: '<form data-form="campaign" data-id="' + (c ? c.id : '') + '" novalidate>' + field('Name', 'title', { value: c ? c.title : '', attrs: { maxlength: 80, placeholder: 'A term of school breakfasts' } }) +
      field('What it is for', 'description', { type: 'textarea', rows: 3, optional: true, value: c ? c.description : '', attrs: { maxlength: 300 } }) +
      '<div class="two-f">' + field('Goal (R)', 'target', { optional: true, value: c && c.targetCents ? plain(c.targetCents).replace(/\.00$/, '') : '', attrs: { inputmode: 'decimal', placeholder: '20000' } }) + field('Starts', 'start', { value: fmtDate(c ? c.startsAt : today), attrs: { placeholder: 'dd/mm/yyyy' } }) + '</div>' +
      field('Closes', 'end', { optional: true, value: c && c.endsAt ? fmtDate(c.endsAt) : '', attrs: { placeholder: 'dd/mm/yyyy' }, hint: 'Leave empty to keep it open until you stop it.' }) +
      '<div class="actions"><button type="button" class="btn secondary" data-act="modal-close">Cancel</button><button class="btn cta">' + (c ? 'Save changes' : 'Start the campaign') + '</button></div></form>',
  });
}
FORMS.campaign = (f) => {
  const errors = {}; const today = todaySA();
  const title = formVal(f, 'title'), description = formVal(f, 'description');
  if (!title) errors.title = 'Give the campaign a name.';
  const tRaw = formVal(f, 'target'); let target = null;
  if (tRaw) { target = parseRand(tRaw); if (target == null || target <= 0) errors.target = 'Enter the goal in rand, for example 20000, or leave it empty.'; else if (target > 1000000000) errors.target = 'That goal is very large. Check the amount.'; }
  const start = parseDateInput(formVal(f, 'start')); if (!start) errors.start = 'Use dd/mm/yyyy.';
  const eRaw = formVal(f, 'end'); let end = null;
  if (eRaw) { end = parseDateInput(eRaw); if (!end) errors.end = 'Use dd/mm/yyyy, or leave it empty.'; else if (start && end < start) errors.end = 'The closing date must be after the start date.'; }
  if (!showErrors(f, errors)) return;
  const id = f.dataset.id;
  change((s) => {
    if (id) { const c = s.campaigns.find((x) => x.id === id); Object.assign(c, { title, description, targetCents: target, startsAt: start, endsAt: end }); }
    else s.campaigns.push({ id: newId('c'), title, description, targetCents: target, startsAt: start, endsAt: end, status: 'active' });
  });
  if (!id) tried('campaign');
  closeModal();
  toast(id ? 'Saved the changes to “' + title + '”.' : 'Started “' + title + '”. It shows on your public page.', { next: [{ href: '#/public', label: 'See your public page' }] }); render(true);
};
ACTIONS['campaign-stop'] = (el) => { const c = campaignById(el.dataset.id); change((s) => { s.campaigns.find((x) => x.id === c.id).status = 'stopped'; }); toast('Stopped “' + c.title + '”. Donors can no longer give to it.'); render(true); };
ACTIONS['campaign-restart'] = (el) => { const c = campaignById(el.dataset.id); change((s) => { s.campaigns.find((x) => x.id === c.id).status = 'active'; }); toast('“' + c.title + '” is running again.'); render(true); };
ACTIONS['copy-link'] = (el) => {
  const c = campaignById(el.dataset.id);
  const link = 'https://givezy.co.za/c/psfa?campaign=' + (c ? c.id : '') + '&src=link';
  const done = () => toast('Copied the link. (In the real product it opens your campaign.)', { undo: false, ms: 4000 });
  try { navigator.clipboard.writeText(link).then(done, () => toast('Copy this link: ' + link, { undo: false, ms: 9000 })); } catch (e) { toast('Copy this link: ' + link, { undo: false, ms: 9000 }); }
};

/* ---------------- public profile ---------------- */
const PROFILE_DEFAULT = (s) => ({ name: 'PSFA', description: 'Peninsula School Feeding Association feeds children at early childhood centres, primary schools, high schools and TVET colleges in and around Cape Town.', city: 'Cape Town', suburb: '', contactEmail: 'donations@example.org' });
function profilePreview(p) {
  return '<div class="pp"><div class="pp-ini">' + esc((p.name || 'P').trim().slice(0, 2).toUpperCase()) + '</div><div><strong>' + esc(p.name || 'Your charity') + '</strong><br><span class="muted">' + esc([p.suburb, p.city].filter(Boolean).join(', ') || 'Where you are') + '</span><p>' + esc(p.description || 'What you do, in a sentence or two.') + '</p>' + badge('Verified', 'lilac') + ' ' + badge('s18A receipts', 'ok') + '</div></div>';
}
VIEWS.profile = () => ({
  title: 'Public profile',
  html: head('Public profile', '<a class="btn secondary" href="#/public">See your public page</a>', 'What donors see about you on Givezy. Your legal name and bank details are set when you apply and can only be changed by Givezy.') +
    '<div class="two"><div class="col">' + card('Edit', '<form data-form="profile" novalidate>' + field('Name shown to donors', 'name', { value: S.profile.name, attrs: { maxlength: 60 } }) + field('What you do', 'description', { type: 'textarea', rows: 5, value: S.profile.description, attrs: { maxlength: 400 }, hint: 'A sentence or two, in plain words. Do not put numbers here that you cannot prove.' }) +
      '<div class="two-f">' + field('Suburb', 'suburb', { optional: true, value: S.profile.suburb, attrs: { maxlength: 60 } }) + field('City', 'city', { value: S.profile.city, attrs: { maxlength: 60 } }) + '</div>' + field('Contact email for donors', 'contactEmail', { optional: true, type: 'email', value: S.profile.contactEmail, attrs: { maxlength: 120 } }) +
      '<div class="actions"><button type="button" class="btn secondary" data-act="profile-reset">Start again from the original</button><button class="btn cta">Save changes</button></div></form>') + '</div>' +
    '<div class="col">' + card('How it looks to donors', '<div id="pp">' + profilePreview(S.profile) + '</div>') + '</div></div>',
  mount() {
    const f = document.querySelector('form[data-form="profile"]'); if (!f) return;
    f.addEventListener('input', () => { $('#pp').innerHTML = profilePreview({ name: formVal(f, 'name'), description: formVal(f, 'description'), suburb: formVal(f, 'suburb'), city: formVal(f, 'city') }); });
  },
});
FORMS.profile = (f) => {
  const errors = {}; const email = formVal(f, 'contactEmail');
  if (!formVal(f, 'name')) errors.name = 'Your name cannot be empty.';
  if (!formVal(f, 'city')) errors.city = 'Say which city you are in.';
  if (email && !validEmail(email)) errors.contactEmail = 'That email address does not look right.';
  if (!showErrors(f, errors)) return;
  change((s) => { s.profile = { name: formVal(f, 'name'), description: formVal(f, 'description'), city: formVal(f, 'city'), suburb: formVal(f, 'suburb'), contactEmail: email }; });
  toast('Saved. Your public page is updated.', { next: [{ href: '#/public', label: 'See it' }] }); render(true);
};
ACTIONS['profile-reset'] = () => { change((s) => { s.profile = PROFILE_DEFAULT(s); }); toast('Back to the original details.'); render(true); };

/* ---------------- photos and updates ---------------- */
let PENDING_PHOTO = '';
VIEWS.updates = () => ({
  title: 'Photos and updates',
  html: head('Photos and updates', '', 'Short news for your donors, with a photo if you have one. It shows on your public page.') +
    card('Post an update', '<form data-form="update" novalidate>' + field('What is new', 'text', { type: 'textarea', rows: 4, attrs: { maxlength: 500, placeholder: 'Tell your donors what their gifts are doing.' } }) +
      '<div class="field"><label for="f-photo">Photo <span class="muted">(optional)</span></label><input id="f-photo" type="file" accept="image/*" data-change="photo-pick"><p class="hint">JPG or PNG. We shrink it for you. Never post a photo of a child without their parent’s written permission.</p><p class="err" id="f-photo-e" role="alert"></p><div id="photo-prev"></div></div>' +
      '<div class="actions"><button class="btn cta">Post the update</button></div></form>') +
    (S.updates.length ? '<div class="rows">' + S.updates.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((u) => '<section class="card upd">' + (u.image ? '<img src="' + u.image + '" alt="Photo posted with this update">' : '') + '<p>' + esc(u.text).replace(/\n/g, '<br>') + '</p><p class="muted">' + fmtDate(u.at.slice(0, 10)) + ' <button class="linkbtn" data-act="update-del" data-id="' + u.id + '">Remove</button></p></section>').join('') + '</div>' : empty('No updates yet', 'Post your first one above.')),
  mount() { PENDING_PHOTO = ''; },
});
ACTIONS['photo-pick'] = (el) => {
  const err = $('#f-photo-e'); err.textContent = ''; PENDING_PHOTO = ''; $('#photo-prev').innerHTML = '';
  const file = el.files && el.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) { err.textContent = 'That is not a picture. Choose a JPG or PNG.'; el.value = ''; return; }
  if (file.size > 12000000) { err.textContent = 'That picture is very large (over 12 MB). Choose a smaller one.'; el.value = ''; return; }
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 800, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      PENDING_PHOTO = c.toDataURL('image/jpeg', 0.8);
      $('#photo-prev').innerHTML = '<img class="thumb" src="' + PENDING_PHOTO + '" alt="Your chosen photo">';
    };
    img.onerror = () => { err.textContent = 'We could not open that picture. Try another one.'; el.value = ''; };
    img.src = String(r.result);
  };
  r.onerror = () => { err.textContent = 'We could not read that file. Try again.'; };
  r.readAsDataURL(file);
};
FORMS.update = (f) => {
  const text = formVal(f, 'text');
  if (!showErrors(f, text ? {} : { text: 'Write a few words for your donors.' })) return;
  const image = PENDING_PHOTO;
  change((s) => { s.updates.push({ id: newId('u'), text, at: todaySA() + 'T' + new Date().toTimeString().slice(0, 8), image }); });
  toast('Posted. Donors see it on your public page.', { next: [{ href: '#/public', label: 'See it' }] }); render(true);
};
ACTIONS['update-del'] = (el) => { change((s) => { s.updates = s.updates.filter((u) => u.id !== el.dataset.id); }); toast('Update removed.'); render(true); };

/* ---------------- s18A receipts and the annual report ---------------- */
VIEWS.receipts = () => {
  const today = todaySA(), ty = taxYearOf(today), tr = taxYearRange(ty), facts = factsAll(today);
  const rows = [];
  [ty, ty - 1, ty - 2].forEach((y) => {
    const r = taxYearRange(y);
    const gs = paidGifts().filter((g) => g.wants18a && g.date >= r.from && g.date <= r.to);
    const donors = new Set(gs.map((g) => g.donorId));
    rows.push({ y, r, donors: donors.size, total: gs.reduce((t, g) => t + g.amount, 0), current: y === ty });
  });
  const thisYear = paidGifts().filter((g) => g.wants18a && g.date >= tr.from && g.date <= tr.to);
  const byDonor = {};
  thisYear.forEach((g) => { byDonor[g.donorId] = (byDonor[g.donorId] || 0) + g.amount; });
  const list = Object.keys(byDonor).sort((a, b) => byDonor[b] - byDonor[a]);
  return {
    title: 's18A receipts',
    html: head('s18A receipts', '<button class="btn secondary" data-act="receipt-preview">Preview a receipt</button><button class="btn secondary" data-act="export-receipts">Download this year’s list (CSV)</button>', 'Givezy issues one s18A receipt a year, per donor, after the tax year ends. You do not have to do anything: it is sent to each donor who asked, in your charity’s name.') +
      '<div class="rows">' + rows.map((r) => '<div class="row"><div class="row-main"><strong>Tax year ' + r.y + '</strong><span class="muted">' + fmtDate(r.r.from) + ' to ' + fmtDate(r.r.to) + '</span><div class="badges">' + (r.current ? badge('Running: receipts after ' + fmtDate(r.r.to), 'lilac') : badge('Closed', '')) + '</div></div><div class="row-amt">' + rand(r.total) + '<span class="muted small-t">' + plural(r.donors, 'donor') + ' asked</span></div></div>').join('') + '</div>' +
      card('Who has asked for a receipt this tax year', list.length ? '<ul class="plain">' + list.slice(0, 25).map((id) => '<li>' + dLink(id) + '<strong>' + rand(byDonor[id]) + '</strong></li>').join('') + '</ul>' + (list.length > 25 ? '<p class="muted">and ' + (list.length - 25) + ' more.</p>' : '') : '<p class="muted">No one has asked yet. Donors tick a box when they give, and you can tick it when you record a gift.</p>'),
  };
};
ACTIONS['export-receipts'] = () => {
  const today = todaySA(), tr = taxYearRange(taxYearOf(today));
  const by = {}; paidGifts().filter((g) => g.wants18a && g.date >= tr.from && g.date <= tr.to).forEach((g) => { by[g.donorId] = (by[g.donorId] || 0) + g.amount; });
  download('psfa-s18a-list-' + taxYearOf(today) + '.csv', toCsv(['Donor', 'Email', 'Total (R)'], Object.keys(by).map((id) => { const d = donorById(id); return [donorName(d), d.email, plain(by[id])]; })));
  toast('Downloaded the list of donors who asked for an s18A receipt.', { undo: false, ms: 4000 });
};
ACTIONS['receipt-preview'] = () => {
  const today = todaySA(), ty = taxYearOf(today), tr = taxYearRange(ty), facts = factsAll(today);
  const by = {}; paidGifts().filter((g) => g.wants18a && g.date >= tr.from && g.date <= tr.to).forEach((g) => { by[g.donorId] = (by[g.donorId] || 0) + g.amount; });
  const id = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
  const d = id ? donorById(id) : null;
  openModal({ title: 'Receipt preview', html: '<div class="receipt"><p class="muted">A layout preview. Real receipts are issued after ' + fmtDate(tr.to) + ' and carry your charity’s registration and s18A details.</p><h3>Section 18A receipt</h3><dl class="dl"><dt>Issued by</dt><dd>' + esc(charityName()) + '</dd><dt>Received from</dt><dd>' + esc(d ? donorName(d) : 'A donor') + '</dd><dt>Tax year</dt><dd>' + ty + ' (' + fmtDate(tr.from) + ' to ' + fmtDate(tr.to) + ')</dd><dt>Total donated</dt><dd>' + rand(d ? by[id] : 0) + '</dd></dl></div><div class="actions"><button class="btn" data-act="modal-close">Close</button></div>' });
};

VIEWS.report = (ctx) => {
  const today = todaySA(), cur = taxYearOf(today);
  const y = [cur, cur - 1, cur - 2].includes(+ctx.query.year) ? +ctx.query.year : cur;
  const r = taxYearRange(y);
  const gs = paidGifts().filter((g) => g.date >= r.from && g.date <= r.to);
  const total = gs.reduce((t, g) => t + g.amount, 0);
  const donors = new Set(gs.map((g) => g.donorId));
  const monthly = gs.filter((g) => g.monthlyId).reduce((t, g) => t + g.amount, 0);
  const keys = []; for (let i = 0; i < 12; i++) keys.push(addMonths(r.from.slice(0, 7), i));
  const per = keys.map((k) => { const m = gs.filter((g) => monthKey(g.date) === k); return { k, total: m.reduce((t, g) => t + g.amount, 0), count: m.length }; });
  const max = Math.max(1, ...per.map((p) => p.total));
  const by = {}; gs.forEach((g) => { by[g.donorId] = (by[g.donorId] || 0) + g.amount; });
  const top = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 5);
  return {
    title: 'Annual report',
    html: head('Annual report', '<button class="btn secondary" data-act="export-report" data-year="' + y + '">Download the figures (CSV)</button>', 'The year’s giving on one page, for your board or your annual report.') +
      '<nav class="chips" aria-label="Tax year">' + [cur, cur - 1, cur - 2].map((x) => '<a class="chip" href="#/report?year=' + x + '" aria-current="' + (x === y) + '">Tax year ' + x + (x === cur ? ' so far' : '') + '</a>').join('') + '</nav>' +
      '<p class="hint">' + fmtDate(r.from) + ' to ' + fmtDate(r.to) + '. Paid donations only. Any contribution to Givezy is not included.</p>' +
      '<div class="stats">' + stat('Donated', rand(total), plural(gs.length, 'donation')) + stat('Donors', String(donors.size), '') + stat('Average donation', rand(gs.length ? Math.round(total / gs.length) : 0), '') + stat('Monthly giving', rand(monthly), total ? Math.round((monthly * 100) / total) + '% of the total' : '') + '</div>' +
      card('Month by month', '<div class="rows">' + per.map((p) => '<div class="mrow"><span>' + monthLabel(p.k) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round((p.total / max) * 100) + '%"></div></div><span class="mamt">' + rand(p.total) + '</span><span class="muted mcnt">' + plural(p.count, 'gift') + '</span></div>').join('') + '</div>') +
      card('Biggest supporters', top.length ? '<ol class="rank">' + top.map((id) => '<li>' + dLink(id) + '<strong>' + rand(by[id]) + '</strong></li>').join('') + '</ol>' : '<p class="muted">No donations in this tax year yet.</p>') +
      card('Campaigns', S.campaigns.length ? S.campaigns.map((c) => { const raised = gs.filter((g) => g.campaignId === c.id).reduce((t, g) => t + g.amount, 0); return '<div class="row"><div class="row-main"><strong>' + esc(c.title) + '</strong></div><div class="row-amt">' + rand(raised) + '</div></div>'; }).join('') : '<p class="muted">No campaigns.</p>'),
  };
};
ACTIONS['export-report'] = (el) => {
  const y = +el.dataset.year, r = taxYearRange(y);
  const gs = paidGifts().filter((g) => g.date >= r.from && g.date <= r.to);
  const rows = []; for (let i = 0; i < 12; i++) { const k = addMonths(r.from.slice(0, 7), i); const m = gs.filter((g) => monthKey(g.date) === k); rows.push([monthLabel(k), m.length, plain(m.reduce((t, g) => t + g.amount, 0))]); }
  download('psfa-annual-report-' + y + '.csv', toCsv(['Month', 'Donations', 'Total (R)'], rows));
  toast('Downloaded the figures for tax year ' + y + '.', { undo: false, ms: 4000 });
};

/* ---------------- team and application ---------------- */
VIEWS.team = () => ({
  title: 'Team',
  html: head('Team', '', 'The people who can sign in to this dashboard. Owners can invite and remove people.') +
    card('Invite someone', '<form data-form="invite" class="inline-form" novalidate>' + field('Their email', 'email', { type: 'email', attrs: { maxlength: 120, placeholder: 'name@example.org' }, cls: 'grow' }) + field('Role', 'role', { type: 'select', value: 'Admin', options: [['Admin', 'Admin: everything except the team'], ['Owner', 'Owner: everything']], cls: 'narrow' }) + '<button class="btn small cta">Send invitation</button></form>') +
    '<div class="rows">' + S.team.map((t) => '<div class="row"><div class="row-main"><strong>' + esc(t.name || t.email) + '</strong><span class="muted">' + esc(t.email) + '</span><div class="badges">' + badge(t.role, 'lilac') + (t.status === 'invited' ? badge('Invited, not signed in yet', 'warn') : badge('Active', 'ok')) + '</div></div><div>' + (t.status === 'invited' ? '<button class="btn small secondary" data-act="team-resend" data-id="' + t.id + '">Send again</button> ' : '') + (t.id === 't1' ? '<span class="muted small-t">You</span>' : '<button class="btn small secondary" data-act="team-remove" data-id="' + t.id + '">Remove</button>') + '</div></div>').join('') + '</div>',
});
FORMS.invite = (f) => {
  const email = formVal(f, 'email'), errors = {};
  if (!email) errors.email = 'Enter their email address.';
  else if (!validEmail(email)) errors.email = 'That email address does not look right.';
  else if (S.team.some((t) => t.email.toLowerCase() === email.toLowerCase())) errors.email = 'That person is already on your team.';
  else if (S.team.length >= 10) errors.email = 'A team can have up to 10 people in the demo.';
  if (!showErrors(f, errors)) return;
  change((s) => { s.team.push({ id: newId('t'), name: '', email, role: formVal(f, 'role'), status: 'invited' }); });
  toast('Invitation sent to ' + email + '. (Demo: nothing was really emailed.)'); render(true);
};
ACTIONS['team-resend'] = (el) => { const t = S.team.find((x) => x.id === el.dataset.id); toast('Invitation sent again to ' + t.email + '. (Demo: nothing was really emailed.)', { undo: false, ms: 5000 }); };
ACTIONS['team-remove'] = (el) => { const t = S.team.find((x) => x.id === el.dataset.id); change((s) => { s.team = s.team.filter((x) => x.id !== t.id); }); toast('Removed ' + (t.name || t.email) + '. They can no longer sign in.'); render(true); };

VIEWS.application = () => {
  const steps = [['About your charity', 'Name, what you do, where you are'], ['Your documents', 'Registration and s18A approval, checked by Givezy'], ['Bank details', 'Where gifts are paid. Only Givezy can change these, after checking with you'], ['Review by Givezy', 'Approved']];
  return {
    title: 'Application',
    html: head('Application', '', 'Your application to list ' + esc(charityName()) + ' on Givezy.') + '<p>' + badge('Approved', 'ok') + '</p>' +
      card('', '<ol class="steps">' + steps.map((s) => '<li><span class="tick on" aria-hidden="true">✓</span><div><strong>' + esc(s[0]) + '</strong><span class="muted">' + esc(s[1]) + '</span></div></li>').join('') + '</ol>') +
      '<p class="hint">This is a demo, so the documents and bank details are not shown. To change your bank details in the real product, contact Givezy.</p>',
  };
};

/* ---------------- the public page, as a donor sees it ---------------- */
const GIVE = { amount: 0, monthly: false, campaign: '', details: null };
VIEWS.public = () => {
  const today = todaySA(), p = S.profile;
  const camps = S.campaigns.filter((c) => campaignRunning(c, today));
  const ups = S.updates.slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    title: p.name,
    html: '<div class="public"><section class="hero-pub"><div class="pp-ini big">' + esc(p.name.trim().slice(0, 2).toUpperCase()) + '</div><div><h1 tabindex="-1">' + esc(p.name) + '</h1><p class="muted">' + esc([p.suburb, p.city].filter(Boolean).join(', ')) + '</p><p>' + esc(p.description) + '</p><p>' + badge('Verified', 'lilac') + ' ' + badge('s18A receipts', 'ok') + '</p><p><button class="btn cta big" data-act="give-open">Give to ' + esc(p.name) + '</button></p><p class="hint">Once-off or every month. You pay on the payment provider’s secure page, so we never see your card.</p></div></section>' +
      (camps.length ? '<h2>Raising now</h2>' + camps.map((c) => campaignRow(c) + '<p><button class="btn small secondary" data-act="give-open" data-campaign="' + c.id + '">Give to this campaign</button></p>').join('') : '') +
      '<h2>News from ' + esc(p.name) + '</h2>' + (ups.length ? ups.map((u) => '<section class="card upd">' + (u.image ? '<img src="' + u.image + '" alt="Photo from ' + esc(p.name) + '">' : '') + '<p>' + esc(u.text).replace(/\n/g, '<br>') + '</p><p class="muted">' + fmtDate(u.at.slice(0, 10)) + '</p></section>').join('') : '<p class="muted">No news yet.</p>') +
      '<p class="hint">This is the donor’s view. Gifts made here arrive in your dashboard. ' + A('#/', 'Back to your dashboard', 'dl') + '</p></div>',
  };
};
ACTIONS['give-open'] = (el) => { GIVE.amount = 0; GIVE.monthly = false; GIVE.campaign = el.dataset.campaign || ''; GIVE.details = null; giveStep1(openModal({ title: 'Give to ' + S.profile.name, html: '<div id="give-body"></div>' })); };
function giveStep1(m, errors) {
  const body = $('#give-body');
  const presets = [10000, 18000, 36000, 50000, 100000];
  const camps = S.campaigns.filter((c) => campaignRunning(c, todaySA()));
  body.innerHTML = '<form data-form="give-1" novalidate><fieldset class="field"><legend>How often</legend><div class="seg"><button type="button" class="seg-b" data-act="give-freq" data-val="once" aria-pressed="' + !GIVE.monthly + '">Once-off</button><button type="button" class="seg-b" data-act="give-freq" data-val="monthly" aria-pressed="' + GIVE.monthly + '">Every month</button></div></fieldset>' +
    '<fieldset class="field"><legend>Amount</legend><div class="presets">' + presets.map((c) => '<button type="button" class="preset" data-act="give-preset" data-val="' + c + '" aria-pressed="' + (GIVE.amount === c) + '">' + rand(c) + '</button>').join('') + '</div></fieldset>' +
    field('Or another amount (R)', 'amount', { value: GIVE.amount && !presets.includes(GIVE.amount) ? plain(GIVE.amount).replace(/\.00$/, '') : '', attrs: { inputmode: 'decimal', placeholder: 'The minimum is ' + rand(MIN_GIFT) }, hint: 'Givezy charges no fee on donations. The payment provider’s card fee comes off the gift before it reaches ' + esc(S.profile.name) + '.' }) +
    (camps.length ? field('Give to', 'campaign', { type: 'select', value: GIVE.campaign, options: [['', S.profile.name + ' in general'], ...camps.map((c) => [c.id, c.title])] }) : '') +
    '<div class="actions"><button type="button" class="btn secondary" data-act="modal-close">Cancel</button><button class="btn cta">Continue</button></div></form>';
}
ACTIONS['give-freq'] = (el) => { GIVE.monthly = el.dataset.val === 'monthly'; $$('[data-act=give-freq]', el.closest('form')).forEach((b) => b.setAttribute('aria-pressed', String(b === el))); };
ACTIONS['give-preset'] = (el) => { GIVE.amount = +el.dataset.val; $$('.preset', el.closest('form')).forEach((b) => b.setAttribute('aria-pressed', String(b === el))); const a = el.closest('form').elements.amount; a.value = ''; };
FORMS['give-1'] = (f) => {
  const raw = formVal(f, 'amount'); let cents = raw ? parseRand(raw) : GIVE.amount; const errors = {};
  if (!cents) errors.amount = raw && parseRand(raw) == null ? 'Use numbers only, for example 250 or 1 250.50.' : 'Choose an amount, or type your own.';
  else if (cents < MIN_GIFT) errors.amount = 'The smallest gift is ' + rand(MIN_GIFT) + '.';
  else if (cents > MAX_GIFT_CENTS) errors.amount = 'That is more than we can take in one gift. Check the amount, or contact ' + S.profile.name + '.';
  if (!showErrors(f, errors)) return;
  GIVE.amount = cents; GIVE.campaign = f.elements.campaign ? f.elements.campaign.value : '';
  giveStep2();
};
function giveStep2(errs) {
  const d = GIVE.details || {};
  $('#give-body').innerHTML = '<p class="muted">You are giving <strong>' + rand(GIVE.amount) + (GIVE.monthly ? ' every month' : '') + '</strong>' + (GIVE.campaign ? ' to “' + esc((campaignById(GIVE.campaign) || {}).title) + '”' : '') + '.</p><form data-form="give-2" novalidate><div class="two-f">' + field('First name', 'first', { value: d.first || '', attrs: { autocomplete: 'given-name', maxlength: 60 } }) + field('Last name', 'last', { value: d.last || '', attrs: { autocomplete: 'family-name', maxlength: 60 } }) + '</div>' + field('Email', 'email', { type: 'email', value: d.email || '', attrs: { autocomplete: 'email', maxlength: 120 }, hint: 'We send your confirmation here.' }) +
    '<label class="check"><input type="checkbox" name="s18a"' + (d.s18a ? ' checked' : '') + '> I would like an s18A receipt for my tax return</label><label class="check"><input type="checkbox" name="age"' + (d.age ? ' checked' : '') + '> I am 18 or older, and I agree to the Terms and Privacy Policy</label><p class="err" id="f-age-e" role="alert"></p>' +
    '<div class="actions"><button type="button" class="btn secondary" data-act="give-back">Back</button><button class="btn cta">Continue to payment</button></div></form>';
}
ACTIONS['give-back'] = () => giveStep1();
FORMS['give-2'] = (f) => {
  const errors = {}; const email = formVal(f, 'email');
  if (!formVal(f, 'first')) errors.first = 'Enter your first name.';
  if (!formVal(f, 'last')) errors.last = 'Enter your last name.';
  if (!email) errors.email = 'Enter your email address.'; else if (!validEmail(email)) errors.email = 'That email address does not look right.';
  if (!f.elements.age.checked) errors.age = 'Please confirm this to carry on.';
  GIVE.details = { first: formVal(f, 'first'), last: formVal(f, 'last'), email, s18a: f.elements.s18a.checked, age: f.elements.age.checked };
  if (!showErrors(f, errors)) return;
  givePay();
};
function givePay(declined) {
  const d = GIVE.details;
  $('#give-body').innerHTML = '<div class="provider"><p class="muted">This stands in for the payment provider’s secure page. Givezy never sees or stores your card.</p><p class="big">' + rand(GIVE.amount) + (GIVE.monthly ? ' every month' : '') + '</p><p>' + esc(d.first + ' ' + d.last) + ' · ' + esc(d.email) + '</p>' +
    (declined ? '<div class="notice bad" role="alert"><strong>Your card was declined.</strong> Nothing was charged. Your details are kept, so you can try again or use another card.</div>' : '') +
    '<div class="actions col-a"><button class="btn cta" data-act="give-pay">Pay ' + rand(GIVE.amount) + ' (demo)</button><button class="btn secondary" data-act="give-decline">Try a declined card</button><button class="linkbtn" data-act="give-back2">Change my details</button></div></div>';
}
ACTIONS['give-back2'] = () => giveStep2();
ACTIONS['give-decline'] = () => givePay(true);
ACTIONS['give-pay'] = () => {
  const d = GIVE.details, today = todaySA();
  let donor = null;
  change((s) => {
    donor = s.donors.find((x) => x.email.toLowerCase() === d.email.toLowerCase());
    if (!donor) { donor = { id: newId('d'), type: 'individual', first: d.first, last: d.last, org: '', email: d.email, phone: '', tags: [], notes: [], reminders: [], wants18a: d.s18a, anonymous: false, noNews: false, thankedAt: null }; s.donors.push(donor); }
    else if (d.s18a) donor.wants18a = true;
    let mid = null;
    if (GIVE.monthly) {
      mid = newId('m');
      s.monthly.push({ id: mid, donorId: donor.id, amount: GIVE.amount, startedAt: today, status: 'active', pausedAt: null, endedAt: null, chargeDay: Math.min(+today.slice(8, 10), 28), retrying: false });
    }
    s.gifts.push({ id: newId('g'), ref: 'GZ-' + (100000 + Math.floor(Math.random() * 899999)).toString(36).toUpperCase().slice(0, 6), donorId: donor.id, date: today, amount: GIVE.amount, method: 'card', status: 'paid', monthlyId: mid, campaignId: GIVE.campaign || null, wants18a: d.s18a, recorded: false });
  });
  tried('give');
  $('#give-body').innerHTML = '<div class="thanks"><p class="big">Thank you, ' + esc(d.first) + '.</p><p>Your gift of <strong>' + rand(GIVE.amount) + '</strong>' + (GIVE.monthly ? ' (and every month after)' : '') + ' to ' + esc(S.profile.name) + ' is paid. A confirmation is on its way to ' + esc(d.email) + '. (Demo: nothing was really emailed.)</p>' + (d.s18a ? '<p class="muted">It will be on your annual s18A receipt after the tax year closes.</p>' : '') +
    '<div class="actions col-a"><a class="btn cta" href="#/donations" data-act="modal-close">See it arrive in the dashboard</a><button class="btn secondary" data-act="modal-close">Close</button></div></div>';
  if (!GIVE.monthly) { /* nothing more */ }
  refreshAfterGive();
};
function refreshAfterGive() { /* the dashboard reads the state fresh on every visit */ }

/* ---------------- the donor's own account ---------------- */
const meDonor = () => S.donors.find((d) => d.first === 'Priya') || S.donors[0];
VIEWS.account = () => {
  const me = meDonor(), today = todaySA(), ty = taxYearOf(today);
  const mine = S.monthly.filter((m) => m.donorId === me.id);
  const gs = S.gifts.filter((g) => g.donorId === me.id && g.status === 'paid').sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    title: 'Your account',
    html: '<div class="public"><section class="card"><h1 tabindex="-1">Your account</h1><p class="muted">' + esc(me.email) + '</p><p>' + badge('Donor', '') + '</p><p class="hint">This is what a donor sees. You are looking at the account of ' + esc(donorName(me)) + ', one of the made-up donors. ' + A('#/', 'Back to your dashboard', 'dl') + '</p></section>' +
      card('Your monthly donations', mine.length ? mine.map((m) => {
        const st = monthlyState(m);
        return '<div class="row"><div class="row-main"><strong>' + esc(S.profile.name) + ': ' + rand(m.amount) + ' a month</strong><span class="muted">' + (m.status === 'active' ? (m.retrying ? 'This month’s payment was declined. We will try again.' : 'Next payment on the ' + m.chargeDay + ordinal(m.chargeDay) + ' · Card ending 4333') : m.status === 'paused' ? 'Paused. Nothing is collected until you resume.' : 'Cancelled on ' + fmtDate(m.endedAt || today) + '.') + '</span><div class="badges">' + badge(MONTHLY_LABELS[st], st === 'running' ? 'ok' : st === 'retrying' ? 'warn' : 'lilac') + '</div></div><div class="btns">' +
          (m.status === 'active' ? '<button class="btn small secondary" data-act="mine-pause" data-id="' + m.id + '">Pause</button>' : '') + (m.status === 'paused' ? '<button class="btn small secondary" data-act="mine-resume" data-id="' + m.id + '">Resume</button>' : '') + (m.status === 'active' || m.status === 'paused' ? '<button class="btn small danger" data-act="mine-cancel" data-id="' + m.id + '">Cancel for good</button>' : '') + '</div></div>';
      }).join('') + '<p class="hint">Try it: pause or cancel here, then look at Monthly donations in the dashboard.</p>' : '<p class="muted">You have no monthly donations. <button class="linkbtn" data-act="give-open">Start one</button></p>') +
      card('Your giving', gs.length ? '<div class="rows">' + gs.slice(0, 8).map((g) => '<div class="row"><div class="row-main"><strong>' + fmtDate(g.date) + '</strong><span class="muted">' + esc(S.profile.name) + (g.monthlyId ? ', monthly' : '') + '</span></div><div class="row-amt">' + rand(g.amount) + '</div></div>').join('') + '</div>' + (gs.length > 8 ? '<p class="muted">and ' + (gs.length - 8) + ' more.</p>' : '') : '<p class="muted">Nothing yet. <button class="linkbtn" data-act="give-open">Give to ' + esc(S.profile.name) + '</button></p>') +
      card('Tax packs', '<p>Every donation in a tax year, what goes on s18A receipts, and the totals. Save it as a spreadsheet for your tax return.</p><p>' + [ty, ty - 1, ty - 2].map((y) => '<button class="btn small secondary" data-act="taxpack" data-year="' + y + '">Tax year ' + y + (y === ty ? ' so far' : '') + '</button>').join(' ') + '</p>') +
      card('Your information', '<p>Download everything we hold about you, or ask us to correct or delete it.</p><p><button class="btn small secondary" data-act="my-data">Download my information</button></p>') + '</div>',
  };
};
function mineChange(el, fn, msg, tail) { const m = S.monthly.find((x) => x.id === el.dataset.id); change((s) => fn(s.monthly.find((x) => x.id === m.id))); toast(msg, { next: [{ href: '#/monthly', label: 'See it in the dashboard' }] }); render(true); }
ACTIONS['mine-pause'] = (el) => mineChange(el, (m) => { m.status = 'paused'; m.pausedAt = todaySA(); m.retrying = false; }, 'Paused. Nothing is collected until you resume.');
ACTIONS['mine-resume'] = (el) => mineChange(el, (m) => { m.status = 'active'; m.pausedAt = null; }, 'Resumed. Your next payment is on its usual day.');
ACTIONS['mine-cancel'] = async (el) => {
  const ok = await confirmBox({ title: 'Cancel for good?', body: 'Your monthly donation to ' + esc(S.profile.name) + ' will stop and cannot be restarted. You can start a new one any time.', confirm: 'Cancel it for good', cancel: 'Keep it', danger: true });
  if (ok) mineChange(el, (m) => { m.status = 'cancelled'; m.endedAt = todaySA(); m.retrying = false; }, 'Cancelled. You can start a new monthly donation any time.');
};
ACTIONS.taxpack = (el) => {
  const me = meDonor(), y = +el.dataset.year, r = taxYearRange(y);
  const rows = S.gifts.filter((g) => g.donorId === me.id && g.status === 'paid' && g.date >= r.from && g.date <= r.to).sort((a, b) => (a.date < b.date ? -1 : 1));
  download('givezy-tax-pack-' + y + '.csv', toCsv(['Date', 'Charity', 'Amount (R)', 'On an s18A receipt', 'Monthly'], rows.map((g) => [fmtDate(g.date), S.profile.name, plain(g.amount), g.wants18a ? 'Yes' : 'No', g.monthlyId ? 'Yes' : 'No'])));
  toast(rows.length ? 'Downloaded your tax pack for ' + y + '.' : 'Downloaded your tax pack for ' + y + ': no donations in that year.', { undo: false, ms: 4000 });
};
ACTIONS['my-data'] = () => {
  const me = meDonor();
  download('my-givezy-information.json', JSON.stringify({ name: donorName(me), email: me.email, donations: S.gifts.filter((g) => g.donorId === me.id).map((g) => ({ date: g.date, amount: plain(g.amount), status: g.status })) }, null, 2), 'application/json');
  toast('Downloaded your information.', { undo: false, ms: 4000 });
};
