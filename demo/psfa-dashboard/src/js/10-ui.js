
/* ============================================================
   UI pieces: events, toasts, dialogs, forms, charts
   ============================================================ */
const ACTIONS = {};
const FORMS = {};
const VIEWS = {};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = FORMS[f.dataset.form];
  if (fn) fn(f, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && ACTIONS[el.dataset.change]) ACTIONS[el.dataset.change](el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && ACTIONS[el.dataset.input]) ACTIONS[el.dataset.input](el, e);
});

/* ---------- toast: what just happened, take it back, what next ---------- */
let toastTimer = null;
function toast(message, opts) {
  opts = opts || {};
  const root = $('#toast-root');
  clearTimeout(toastTimer);
  const next = (opts.next || []).map((a) => '<a class="toast-link" href="' + esc(a.href) + '">' + esc(a.label) + '</a>').join('');
  root.innerHTML = '<div class="toast ' + (opts.tone || '') + '" role="status">' +
    '<span class="toast-msg">' + esc(message) + '</span>' +
    (opts.undo === false ? '' : '<button type="button" class="toast-btn" data-act="undo">Undo</button>') + next +
    '<button type="button" class="toast-x" data-act="toast-close" aria-label="Dismiss">×</button></div>';
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, opts.ms || 9000);
}
ACTIONS['toast-close'] = () => { $('#toast-root').innerHTML = ''; };
ACTIONS.undo = () => {
  if (undoLast()) { toast('Undone. Nothing was lost.', { undo: false, ms: 4000 }); render(true); }
  else toast('There is nothing to undo.', { undo: false, ms: 3000 });
};

/* ---------- dialogs ---------- */
let openers = [];
function openModal(o) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  const id = 'm' + Math.random().toString(36).slice(2, 7);
  wrap.innerHTML = '<div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">' +
    '<div class="modal-head"><h2 id="' + id + '-t">' + esc(o.title) + '</h2><button type="button" class="modal-x" data-act="modal-close" aria-label="Close">×</button></div>' +
    '<div class="modal-body">' + o.html + '</div></div>';
  openers.push(document.activeElement);
  root.appendChild(wrap);
  document.body.classList.add('noscroll');
  const box = $('.modal', wrap);
  const focusable = () => $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', box).filter((x) => x.offsetParent !== null);
  const api = {
    el: wrap, box,
    close() {
      wrap.remove();
      if (!$('#modal-root').children.length) document.body.classList.remove('noscroll');
      const back = openers.pop(); if (back && back.focus) try { back.focus(); } catch (e) { /* gone */ }
      if (o.onClose) o.onClose();
    },
  };
  wrap._api = api;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) api.close(); });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
    if (e.key === 'Tab') {
      const f = focusable(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  const f = focusable();
  const target = $('[autofocus]', box) || f.find((x) => !x.classList.contains('modal-x')) || f[0];
  if (target) target.focus();
  return api;
}
ACTIONS['modal-close'] = (el) => {
  const w = el.closest('.modal-back'); if (w && w._api) w._api.close();
  const h = el.tagName === 'A' ? el.getAttribute('href') : null;
  if (h && h.charAt(0) === '#') location.hash = h;
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented) { const m = topModal(); if (m) { e.preventDefault(); m.close(); } }
});
const topModal = () => { const all = $$('.modal-back'); return all.length ? all[all.length - 1]._api : null; };
const closeModal = () => { const m = topModal(); if (m) m.close(); };

/** A question that needs a yes before something that can't be taken back. */
function confirmBox(o) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title: o.title, size: 'small',
      html: '<p>' + o.body + '</p><div class="actions"><button type="button" class="btn secondary" data-act="confirm-no">' + esc(o.cancel || 'Cancel') + '</button><button type="button" class="btn ' + (o.danger ? 'danger' : '') + '" data-act="confirm-yes">' + esc(o.confirm) + '</button></div>',
      onClose: () => { if (!answered) resolve(false); },
    });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'confirm-yes') { answered = true; m.close(); resolve(true); }
      if (b.dataset.act === 'confirm-no') { m.close(); }
    });
  });
}

/* ---------- forms ---------- */
function field(label, name, o) {
  o = o || {};
  const id = 'f-' + name;
  const attrs = Object.entries(o.attrs || {}).map(([k, v]) => (v === true ? k : k + '="' + esc(v) + '"')).join(' ');
  let control;
  if (o.type === 'select') control = '<select id="' + id + '" name="' + name + '" ' + attrs + '>' + o.options.map((x) => '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(o.value) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select>';
  else if (o.type === 'textarea') control = '<textarea id="' + id + '" name="' + name + '" rows="' + (o.rows || 4) + '" ' + attrs + '>' + esc(o.value || '') + '</textarea>';
  else control = '<input id="' + id + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(o.value || '') + '" ' + attrs + '>';
  return '<div class="field' + (o.cls ? ' ' + o.cls : '') + '"><label for="' + id + '">' + esc(label) + (o.optional ? ' <span class="muted">(optional)</span>' : '') + '</label>' + control +
    (o.hint ? '<p class="hint" id="' + id + '-h">' + o.hint + '</p>' : '') + '<p class="err" id="' + id + '-e" role="alert"></p></div>';
}
function showErrors(form, errors) {
  $$('.err', form).forEach((e) => { e.textContent = ''; });
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  let firstEl = null;
  for (const [name, msg] of Object.entries(errors)) {
    const input = form.elements[name]; const out = $('#f-' + name + '-e', form);
    if (out) out.textContent = msg;
    if (input) { input.setAttribute('aria-invalid', 'true'); if (!firstEl) firstEl = input; }
  }
  if (firstEl) firstEl.focus();
  return Object.keys(errors).length === 0;
}
const formVal = (form, name) => (form.elements[name] ? String(form.elements[name].value).trim() : '');

/* ---------- small building blocks ---------- */
const badge = (text, tone) => '<span class="badge ' + (tone || '') + '">' + esc(text) + '</span>';
function empty(title, body, action) {
  return '<div class="empty"><p class="empty-title">' + esc(title) + '</p><p class="muted">' + body + '</p>' + (action || '') + '</div>';
}
function pager(total, page, per, base) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return '';
  const link = (p, label, dis) => dis ? '<span class="pg dis">' + label + '</span>' : '<a class="pg" href="' + base(p) + '">' + label + '</a>';
  return '<nav class="pager" aria-label="Pages">' + link(page - 1, '← Previous', page <= 1) + '<span class="muted">Page ' + page + ' of ' + pages + '</span>' + link(page + 1, 'Next →', page >= pages) + '</nav>';
}
const qs = (o) => { const p = Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)); return p.length ? '?' + p.join('&') : ''; };

/* ============================================================
   Interactive charts (plain SVG): hover, focus, click, legend, range
   ============================================================ */
const CH = {
  don: { range: 12, sel: null, hide: {} },
  mon: { range: 12, sel: null, mode: 'donors' },
  src: { sel: null },
};
const COLORS = { monthly: '#1749B5', once: '#C9B4FA', today: '#FF914D', grid: '#E5D9FF', text: '#34466A' };

function niceScale(max, kind) {
  if (max <= 0) return kind === 'cents' ? { top: 100000, step: 25000 } : { top: 4, step: 1 };
  const base = kind === 'cents' ? [1, 2, 2.5, 5] : [1, 2, 5];
  const unit = kind === 'cents' ? 100 : 1;
  for (let p = 0; p < 9; p++) {
    for (const b of base) {
      const step = b * Math.pow(10, p) * unit;
      if (step !== Math.floor(step)) continue;
      const top = Math.ceil(max / step) * step;
      if (top / step <= 5) return { top, step };
    }
  }
  return { top: max, step: max };
}
const axisRand = (c) => (c >= 100000000 ? 'R' + c / 100000000 + 'm' : rand(c));
let W = 640, ML = 56;
const H = 260, MR = 8, MT = 12, MB = 30;

function axisAndGrid(scale, kind, fmt) {
  let out = '';
  for (let v = 0; v <= scale.top; v += scale.step) {
    const y = MT + (H - MT - MB) * (1 - v / scale.top);
    out += '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + COLORS.grid + '" stroke-width="' + (v === 0 ? 2 : 1) + '"/>' +
      '<text x="' + (ML - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="12" fill="' + COLORS.text + '">' + (fmt ? fmt(v) : v) + '</text>';
  }
  return out;
}
const skipEvery = (band) => (band < 30 ? 3 : band < 44 ? 2 : 1);
const xLabel = (key) => MONTHS[+key.slice(5, 7) - 1] + (key.slice(5, 7) === '01' ? ' ' + key.slice(2, 4) : '');

function rangeButtons(id, current, opts) {
  return '<div class="seg" role="group" aria-label="Months shown">' + opts.map((n) => '<button type="button" class="seg-b" data-act="chart-range" data-chart="' + id + '" data-val="' + n + '" aria-pressed="' + (current === n) + '">' + n + ' months</button>').join('') + '</div>';
}

function donationsChartHtml(today) {
  const st = CH.don;
  const data = monthTotals(today, st.range);
  const shown = (r) => (st.hide.monthly ? 0 : r.monthly) + (st.hide.once ? 0 : r.once);
  const scale = niceScale(Math.max.apply(null, data.map(shown).concat([0])), 'cents');
  if (st.sel == null || st.sel >= data.length) st.sel = data.length - 1;
  const n = data.length, band = (W - ML - MR) / n, bw = Math.min(44, band * 0.62), plotH = H - MT - MB;
  const yOf = (v) => MT + plotH * (1 - v / scale.top);
  let bars = '';
  data.forEach((r, i) => {
    const x = ML + band * i + (band - bw) / 2;
    const m = st.hide.monthly ? 0 : r.monthly, o = st.hide.once ? 0 : r.once;
    const ym = yOf(m), yt = yOf(m + o);
    const label = monthLong(r.key) + ': ' + rand(r.total) + ' from ' + plural(r.count, 'donation') + ', ' + rand(r.monthly) + ' monthly and ' + rand(r.once) + ' once-off';
    const cur = r.key === monthKey(today);
    bars += '<g class="bar' + (i === st.sel ? ' sel' : '') + '" data-chart="don" data-i="' + i + '" data-tip="' + esc(monthLong(r.key) + '\n' + rand(r.total) + ' from ' + plural(r.count, 'donation') + '\nMonthly ' + rand(r.monthly) + '\nOnce-off ' + rand(r.once)) + '" tabindex="0" role="button" aria-label="' + esc(label) + '" aria-pressed="' + (i === st.sel) + '">' +
      '<rect class="hit" x="' + (ML + band * i).toFixed(1) + '" y="' + MT + '" width="' + band.toFixed(1) + '" height="' + (plotH + MB) + '" fill="transparent"/>' +
      (o > 0 ? '<rect x="' + x.toFixed(1) + '" y="' + yt.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, ym - yt).toFixed(1) + '" rx="6" fill="' + COLORS.once + '"/>' : '') +
      (m > 0 ? '<rect x="' + x.toFixed(1) + '" y="' + ym.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, yOf(0) - ym).toFixed(1) + '" rx="' + (o > 0 ? 0 : 6) + '" fill="' + COLORS.monthly + '"/>' : '') +
      (m + o === 0 ? '<rect x="' + x.toFixed(1) + '" y="' + (yOf(0) - 2).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="2" fill="' + COLORS.grid + '"/>' : '') +
      (cur ? '<rect class="cur" x="' + (x - 3).toFixed(1) + '" y="' + (Math.min(yt, ym) - 3).toFixed(1) + '" width="' + (bw + 6).toFixed(1) + '" height="' + (yOf(0) - Math.min(yt, ym) + 6).toFixed(1) + '" rx="9" fill="none" stroke="' + COLORS.today + '" stroke-width="2"/>' : '') +
      ((n - 1 - i) % skipEvery(band) === 0 ? '<text x="' + (ML + band * i + band / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="12" fill="' + COLORS.text + '" font-weight="' + (i === st.sel ? 700 : 400) + '">' + xLabel(r.key) + '</text>' : '') + '</g>';
  });
  const r = data[st.sel];
  const any = data.some((x) => x.total > 0);
  const panel = any
    ? '<div class="chart-panel" aria-live="polite"><div><strong>' + monthLong(r.key) + '</strong><br><span class="big">' + rand(r.total) + '</span> from ' + plural(r.count, 'donation') + '<br><span class="muted">' + rand(r.monthly) + ' monthly, ' + rand(r.once) + ' once-off</span></div>' +
      '<a class="btn small secondary" href="#/donations' + qs({ month: r.key }) + '">See these donations</a></div>'
    : '';
  return '<div class="chart-ctl">' + rangeButtons('don', st.range, [6, 12]) +
    '<div class="legend" role="group" aria-label="Show or hide"><button type="button" class="lg" data-act="chart-legend" data-chart="don" data-val="monthly" aria-pressed="' + !st.hide.monthly + '"><i style="background:' + COLORS.monthly + '"></i>Monthly</button><button type="button" class="lg" data-act="chart-legend" data-chart="don" data-val="once" aria-pressed="' + !st.hide.once + '"><i style="background:' + COLORS.once + '"></i>Once-off</button></div></div>' +
    (any ? '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Donations by month. Press a bar to see that month." class="chart">' + axisAndGrid(scale, 'cents', axisRand) + bars + '</svg><div class="tip" hidden></div></div>' + panel
      : empty('No paid donations in this period', 'They appear here once the first one comes in, or when you record one yourself.'));
}

function monthlyChartHtml(today) {
  const st = CH.mon;
  const data = monthlyTrend(today, st.range);
  const val = (r) => (st.mode === 'donors' ? r.running : r.cents);
  const kind = st.mode === 'donors' ? 'count' : 'cents';
  const scale = niceScale(Math.max.apply(null, data.map(val).concat([0])), kind);
  if (st.sel == null || st.sel >= data.length) st.sel = data.length - 1;
  const n = data.length, band = (W - ML - MR) / n, bw = Math.min(44, band * 0.62), plotH = H - MT - MB;
  const yOf = (v) => MT + plotH * (1 - v / scale.top);
  let bars = '';
  data.forEach((r, i) => {
    const x = ML + band * i + (band - bw) / 2, y = yOf(val(r));
    const tip = monthLong(r.key) + '\n' + plural(r.running, 'monthly donor') + ' giving ' + rand(r.cents) + ' a month' + (r.started ? '\n' + r.started + ' began' : '') + (r.stopped ? '\n' + r.stopped + ' stopped' : '');
    bars += '<g class="bar' + (i === st.sel ? ' sel' : '') + '" data-chart="mon" data-i="' + i + '" data-tip="' + esc(tip) + '" tabindex="0" role="button" aria-label="' + esc(tip.replace(/\n/g, ', ')) + '" aria-pressed="' + (i === st.sel) + '">' +
      '<rect class="hit" x="' + (ML + band * i).toFixed(1) + '" y="' + MT + '" width="' + band.toFixed(1) + '" height="' + (plotH + MB) + '" fill="transparent"/>' +
      (val(r) > 0 ? '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, yOf(0) - y).toFixed(1) + '" rx="6" fill="' + COLORS.monthly + '"/>' : '<rect x="' + x.toFixed(1) + '" y="' + (yOf(0) - 2).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="2" fill="' + COLORS.grid + '"/>') +
      (r.key === monthKey(today) ? '<rect class="cur" x="' + (x - 3).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" width="' + (bw + 6).toFixed(1) + '" height="' + (yOf(0) - y + 6).toFixed(1) + '" rx="9" fill="none" stroke="' + COLORS.today + '" stroke-width="2"/>' : '') +
      (r.started ? '<circle cx="' + (ML + band * i + band / 2).toFixed(1) + '" cy="' + (y - 11).toFixed(1) + '" r="4" fill="' + COLORS.today + '"/>' : '') +
      ((n - 1 - i) % skipEvery(band) === 0 ? '<text x="' + (ML + band * i + band / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="12" fill="' + COLORS.text + '" font-weight="' + (i === st.sel ? 700 : 400) + '">' + xLabel(r.key) + '</text>' : '') + '</g>';
  });
  const r = data[st.sel];
  const prev = data[st.sel - 1];
  const delta = prev && prev.running !== r.running ? (r.running > prev.running ? 'Up ' + (r.running - prev.running) : 'Down ' + (prev.running - r.running)) + ' on the month before. ' : '';
  const any = data.some((x) => x.running > 0 || x.started > 0 || x.stopped > 0);
  return '<div class="chart-ctl">' + rangeButtons('mon', st.range, [6, 12]) +
    '<div class="seg" role="group" aria-label="Show"><button type="button" class="seg-b" data-act="chart-mode" data-chart="mon" data-val="donors" aria-pressed="' + (st.mode === 'donors') + '">Donors</button><button type="button" class="seg-b" data-act="chart-mode" data-chart="mon" data-val="cents" aria-pressed="' + (st.mode === 'cents') + '">Rand a month</button></div></div>' +
    (any ? '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Monthly giving over time. Press a bar to see that month." class="chart">' + axisAndGrid(scale, kind, kind === 'cents' ? axisRand : null) + bars + '</svg><div class="tip" hidden></div></div>' +
      '<div class="chart-panel" aria-live="polite"><div><strong>' + monthLong(r.key) + '</strong><br><span class="big">' + plural(r.running, 'donor') + '</span> giving ' + rand(r.cents) + ' a month<br><span class="muted">' + delta + (r.started ? r.started + ' began' : 'No one began') + ', ' + (r.stopped ? r.stopped + ' stopped' : 'no one stopped') + '. An orange dot marks a month someone began.</span></div><a class="btn small secondary" href="#/monthly">See every monthly donor</a></div>'
      : empty('No monthly donations yet', 'This fills in once a donor chooses to give every month.'));
}

const METHODS = { card: 'Card on the website', eft: 'EFT', cash: 'Cash', other: 'Other' };
const METHOD_COLORS = { card: '#1749B5', eft: '#FF914D', cash: '#C9B4FA', other: '#34466A' };
function sourcesChartHtml(today) {
  const ty = taxYearOf(today), r = taxYearRange(ty);
  const tot = { card: 0, eft: 0, cash: 0, other: 0 };
  let all = 0;
  for (const g of paidGifts()) if (g.date >= r.from && g.date <= r.to) { tot[METHODS[g.method] ? g.method : 'other'] += g.amount; all += g.amount; }
  if (!all) return empty('Nothing yet this tax year', 'Where gifts come from shows here once you have some.');
  const rad = 62, circ = 2 * Math.PI * rad;
  let offset = 0, segs = '', rows = '';
  const sel = CH.src.sel;
  Object.keys(tot).filter((k) => tot[k] > 0).forEach((k) => {
    const len = (tot[k] / all) * circ;
    segs += '<circle class="seg-c' + (sel === k ? ' sel' : '') + '" data-chart="src" data-key="' + k + '" tabindex="0" role="button" aria-label="' + esc(METHODS[k] + ': ' + rand(tot[k]) + ', ' + Math.round((tot[k] * 100) / all) + '%') + '" cx="80" cy="80" r="' + rad + '" fill="none" stroke="' + METHOD_COLORS[k] + '" stroke-width="' + (sel === k ? 30 : 24) + '" stroke-dasharray="' + Math.max(0, len - 2).toFixed(2) + ' ' + (circ - Math.max(0, len - 2)).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 80 80)"/>';
    offset += len;
    rows += '<li><button type="button" class="srow' + (sel === k ? ' sel' : '') + '" data-act="chart-src" data-key="' + k + '"><i style="background:' + METHOD_COLORS[k] + '"></i><span>' + METHODS[k] + '</span><strong>' + rand(tot[k]) + '</strong><span class="muted">' + Math.round((tot[k] * 100) / all) + '%</span></button></li>';
  });
  const center = sel ? '<text x="80" y="76" text-anchor="middle" font-size="12" fill="' + COLORS.text + '">' + esc(METHODS[sel]) + '</text><text x="80" y="96" text-anchor="middle" font-size="16" font-weight="700" fill="#092577">' + Math.round((tot[sel] * 100) / all) + '%</text>' : '<text x="80" y="76" text-anchor="middle" font-size="12" fill="' + COLORS.text + '">Tax year ' + ty + '</text><text x="80" y="96" text-anchor="middle" font-size="16" font-weight="700" fill="#092577">' + rand(all) + '</text>';
  return '<div class="donut"><svg viewBox="0 0 160 160" class="donut-svg" role="group" aria-label="Where gifts come from this tax year">' + segs + center + '</svg><ul class="srows">' + rows + '</ul></div>' +
    (sel ? '<p><a class="btn small secondary" href="#/donations' + qs({ method: sel, ty: ty }) + '">See these donations</a></p>' : '<p class="hint">Press a slice or a row to look closer.</p>');
}

function refreshChart(id) {
  const el = document.getElementById('chart-' + id); if (!el) return;
  const today = todaySA();
  W = Math.max(280, Math.round(el.clientWidth || 640)); ML = W < 420 ? 50 : 56;
  el.innerHTML = id === 'don' ? donationsChartHtml(today) : id === 'mon' ? monthlyChartHtml(today) : sourcesChartHtml(today);
}
ACTIONS['chart-range'] = (el) => { CH[el.dataset.chart].range = +el.dataset.val; CH[el.dataset.chart].sel = null; refreshChart(el.dataset.chart); };
ACTIONS['chart-mode'] = (el) => { CH[el.dataset.chart].mode = el.dataset.val; refreshChart(el.dataset.chart); };
ACTIONS['chart-legend'] = (el) => {
  const st = CH[el.dataset.chart], k = el.dataset.val;
  const other = k === 'monthly' ? 'once' : 'monthly';
  if (!st.hide[k] && st.hide[other]) return; // keep one series showing
  st.hide[k] = !st.hide[k]; refreshChart(el.dataset.chart);
};
ACTIONS['chart-src'] = (el) => { CH.src.sel = CH.src.sel === el.dataset.key ? null : el.dataset.key; refreshChart('src'); tried('chart'); };

function selectBar(g) {
  const id = g.dataset.chart;
  if (id === 'src') { CH.src.sel = CH.src.sel === g.dataset.key ? null : g.dataset.key; refreshChart('src'); tried('chart'); return; }
  CH[id].sel = +g.dataset.i; refreshChart(id); tried('chart');
  const again = document.querySelector('#chart-' + id + ' .bar.sel'); if (again) again.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('.bar, .seg-c'); if (g && g.dataset.chart) selectBar(g);
});
document.addEventListener('keydown', (e) => {
  const g = e.target.closest && e.target.closest('.bar, .seg-c');
  if (!g || !g.dataset.chart) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBar(g); }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const bars = $$('.bar', g.closest('svg')); const i = bars.indexOf(g);
    const next = bars[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (next) { e.preventDefault(); next.focus(); showTip(next); }
  }
});
function showTip(bar) {
  const wrap = bar.closest('.chart-wrap'); if (!wrap) return;
  const tip = $('.tip', wrap); if (!tip || !bar.dataset.tip) return;
  tip.innerHTML = esc(bar.dataset.tip).replace(/\n/g, '<br>'); tip.hidden = false;
  const wr = wrap.getBoundingClientRect(), br = $('rect:not(.hit):not(.cur)', bar) ? $('rect:not(.hit):not(.cur)', bar).getBoundingClientRect() : bar.getBoundingClientRect();
  const hit = $('.hit', bar).getBoundingClientRect();
  let x = hit.left + hit.width / 2 - wr.left;
  x = Math.max(tip.offsetWidth / 2 + 4, Math.min(wr.width - tip.offsetWidth / 2 - 4, x));
  tip.style.left = x + 'px';
  tip.style.top = Math.max(4, br.top - wr.top - tip.offsetHeight - 8) + 'px';
}
function hideTip(bar) { const w = bar.closest('.chart-wrap'); if (w) { const t = $('.tip', w); if (t) t.hidden = true; } }
document.addEventListener('mouseover', (e) => { const b = e.target.closest('.bar'); if (b && b.dataset.tip) { showTip(b); tried('chart'); } });
document.addEventListener('mouseout', (e) => { const b = e.target.closest('.bar'); if (b && !b.contains(e.relatedTarget)) hideTip(b); });
document.addEventListener('focusin', (e) => { const b = e.target.closest && e.target.closest('.bar'); if (b) showTip(b); });
document.addEventListener('focusout', (e) => { const b = e.target.closest && e.target.closest('.bar'); if (b) hideTip(b); });

let resizeTimer = null, lastW = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 20) { lastW = window.innerWidth; ['don', 'mon', 'src'].forEach(refreshChart); } }, 150);
});
