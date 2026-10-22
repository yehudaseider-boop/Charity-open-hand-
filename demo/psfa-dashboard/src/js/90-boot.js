
/* ============================================================
   Router and shell
   ============================================================ */
const NAV = [
  ['Giving', [['/', 'Overview'], ['/donations', 'Donations'], ['/monthly', 'Monthly donations'], ['/campaigns', 'Campaigns'], ['/receipts', 's18A receipts'], ['/report', 'Annual report']]],
  ['People', [['/donors', 'Donors'], ['/thank', 'Thank donors'], ['/email', 'Email donors'], ['/sent', 'Sent messages'], ['/team', 'Team']]],
  ['Your page', [['/profile', 'Public profile'], ['/updates', 'Photos and updates']]],
  ['Set-up', [['/application', 'Application']]],
];
const ROUTES = [
  [/^\/?$/, 'overview', 'dash'], [/^\/donations$/, 'donations', 'dash'], [/^\/monthly$/, 'monthly', 'dash'], [/^\/donors$/, 'donors', 'dash'],
  [/^\/donors\/([^/]+)$/, 'donor', 'dash'], [/^\/thank$/, 'thank', 'dash'], [/^\/email$/, 'email', 'dash'], [/^\/sent$/, 'sent', 'dash'],
  [/^\/campaigns$/, 'campaigns', 'dash'], [/^\/profile$/, 'profile', 'dash'], [/^\/updates$/, 'updates', 'dash'], [/^\/receipts$/, 'receipts', 'dash'],
  [/^\/report$/, 'report', 'dash'], [/^\/team$/, 'team', 'dash'], [/^\/application$/, 'application', 'dash'],
  [/^\/public$/, 'public', 'pub'], [/^\/account$/, 'account', 'pub'],
];
function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '') || '/';
  const i = raw.indexOf('?');
  const path = (i < 0 ? raw : raw.slice(0, i)).replace(/\/+$/, '') || '/';
  const query = {};
  new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)).forEach((v, k) => { query[k] = v; });
  return { path, query };
}
function currentQuery() { return parseHash().query; }

function chrome(section, path) {
  $('#band').hidden = section !== 'dash';
  $('#side').hidden = section !== 'dash';
  $('#shell').classList.toggle('pubshell', section !== 'dash');
  $$('#topnav a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.sec === (path === '/public' ? 'public' : path === '/account' ? 'account' : 'dash'))));
  $$('#side a').forEach((a) => {
    const href = a.dataset.path;
    const on = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const nm = $('#band-name'); if (nm) nm.textContent = S.profile.name;
  const note = $('#storage-note'); if (note) note.hidden = storageOk;
}

function render(keep) {
  const { path, query } = parseHash();
  let route = null, params = [];
  for (const r of ROUTES) { const m = r[0].exec(path); if (m) { route = r; params = m.slice(1); break; } }
  const main = $('#main');
  if (!route) {
    chrome('dash', path);
    main.innerHTML = '<div class="page">' + head('We couldn’t find that page') + empty('That page does not exist', 'The link may be out of date. ' + A('#/', 'Go to your overview', 'dl')) + '</div>';
    document.title = 'Page not found | Givezy'; return;
  }
  const ctx = { query, params, replace: (h) => history.replaceState(null, '', h) };
  chrome(route[2], path);
  let view;
  try { view = VIEWS[route[1]](ctx); }
  catch (e) {
    console.error(e);
    main.innerHTML = '<div class="page">' + head('Something went wrong') + empty('This page could not be shown', 'Nothing you did was lost. Try again, or reset the demo if it keeps happening.', '<p><button class="btn" data-act="retry">Try again</button> <button class="btn secondary" data-act="reset-demo">Reset the demo</button></p>') + '</div>';
    return;
  }
  const y = window.scrollY;
  main.innerHTML = route[2] === 'dash' ? '<div class="page">' + view.html + '</div>' : view.html;
  document.title = view.title + ' | Givezy';
  if (route[1] === 'donors') { try { sessionStorage.setItem('givezy-lastList', location.hash || '#/donors'); } catch (e) { /* fine */ } }
  if (keep) window.scrollTo(0, y); else { window.scrollTo(0, 0); const h = $('h1', main); if (h) h.focus({ preventScroll: true }); }
  if (view.mount) view.mount();
}
ACTIONS.retry = () => render(false);
ACTIONS['reset-demo'] = async () => {
  const ok = await confirmBox({ title: 'Reset the demo?', body: 'This puts back the original made-up donors and gifts, and removes anything you added or changed.', confirm: 'Reset the demo', cancel: 'Keep my changes', danger: true });
  if (!ok) return;
  resetState(); CH.don.sel = null; CH.mon.sel = null; CH.src.sel = null;
  location.hash = '#/'; render(false); toast('The demo is back to how it started.', { undo: false, ms: 4000 });
};

window.addEventListener('hashchange', () => { $$('.modal-back').forEach((m) => m._api && m._api.close()); render(false); });

let booted = false;
function boot() {
  if (booted) return; booted = true;
  initState();
  $('#side-nav').innerHTML = NAV.map((g) => '<div class="grp"><p class="grp-t">' + g[0] + '</p><ul>' + g[1].map((l) => '<li><a href="#' + l[0] + '" data-path="' + l[0] + '">' + l[1] + '</a></li>').join('') + '</ul></div>').join('');
  render(false);
}
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();
})();
