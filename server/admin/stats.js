(function () {
  const app = document.getElementById('app');
  const KEY = 'dugout-stats-key';
  const get = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const set = (v) => { try { localStorage.setItem(KEY, v); } catch {} };
  const n = (v) => (v || 0).toLocaleString('en-IN');
  const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };

  function login(note) {
    app.innerHTML = '<h1>The Dugout <span>stats</span></h1><p class="muted">' + (note || 'Enter the stats key.') + '</p>';
    const f = el('<form><input type="password" placeholder="Stats key" autocomplete="current-password" required><button>Open</button></form>');
    f.onsubmit = (e) => { e.preventDefault(); set(f.querySelector('input').value.trim()); load(); };
    app.appendChild(f);
  }

  const card = (v, l, cls) => '<div class="card ' + (cls || '') + '"><b>' + n(v) + '</b><small>' + l + '</small></div>';

  function render(s) {
    const keep = document.getElementById('ratings'); if (keep) keep.remove();
    const max = Math.max(1, ...s.days.map((d) => d.auctionsStarted));
    const bars = s.days.map((d) => '<div class="col" title="' + d.date + '"><em>' + (d.auctionsStarted || '') + '</em><div class="bar" style="height:' + Math.round((d.auctionsStarted / max) * 100) + '%"></div><span>' + d.date.slice(8) + '</span></div>').join('');
    const rows = s.days.slice().reverse().map((d) => '<tr><td>' + d.date + '</td><td>' + n(d.visit) + '</td><td>' + n(d.clickCreate) + '</td><td>' + n(d.clickJoin) + '</td><td>' + n(d.clickInstall) + '</td><td>' + n(d.roomsCreated) + '</td><td>' + n(d.auctionsStarted) + '</td><td>' + n(d.auctionsFinished) + '</td></tr>').join('');
    app.innerHTML =
      '<h1>The Dugout <span>stats</span></h1><p class="muted"><span class="pulse"></span>Live · refreshes every 5s · counting since ' + s.since + '</p>' +
      '<h2>Right now</h2><div class="grid">' +
      card(s.live.auction, 'Auctions running', 'live') + card(s.live.rooms, 'Rooms open (all)', 'live') + card(s.live.playersOnline, 'Players online', 'live') + card(s.live.lobby, 'In lobby') + card(s.live.results, 'On results') + '</div>' +
      '<h2>Today</h2><div class="grid">' + card(s.today.visit, 'Visits') + card(s.today.clickCreate + s.today.clickJoin, 'Clicks (create + join)') + card(s.today.auctionsStarted, 'Plays (auctions started)') + card(s.today.auctionsFinished, 'Auctions finished') + '</div>' +
      '<h2>All time</h2><div class="grid">' + card(s.total.visit, 'Visits') + card(s.total.clickCreate + s.total.clickJoin, 'Clicks (create + join)') + card(s.total.auctionsStarted, 'Plays (auctions started)') + card(s.total.roomsCreated, 'Rooms created') + card(s.total.clickInstall, 'Install clicks') + '</div>' +
      '<h2>Plays per day · last 14 days</h2><div class="chart">' + bars + '</div>' +
      '<h2>Daily detail</h2><div class="wrap"><table><thead><tr><th>Day</th><th>Visits</th><th>Create</th><th>Join</th><th>Install</th><th>Rooms</th><th>Plays</th><th>Done</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h2>Player ratings</h2><div id="ratings" class="wrap" style="padding:16px"><p class="muted">Loading…</p></div>' +
      '<p class="muted" style="margin-top:18px;font-size:12px">Counts reset if the server\'s disk is wiped. Set DATA_DIR to a persistent disk to keep history.</p>';
    if (keep) { const ph = document.getElementById('ratings'); ph.replaceWith(keep); }
  }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function api(path, opts) {
    return fetch(path, Object.assign({ headers: { 'x-stats-key': get(), 'content-type': 'application/json' }, cache: 'no-store' }, opts));
  }
  let note = '';
  async function loadRatings() {
    const box = document.getElementById('ratings'); if (!box) return;
    if (box.dataset.busy) return;
    try {
      const st = await (await api('/api/admin/ratings')).json();
      const when = st.updatedAt ? new Date(st.updatedAt).toLocaleString() : 'never';
      const moved = (st.last.moved || []).map((m) => '<tr><td>' + esc(m.name) + '</td><td>' + m.from + '</td><td>' + m.to + '</td></tr>').join('');
      box.innerHTML =
        '<p style="margin:0 0 4px"><b>Last updated:</b> ' + esc(when) + (st.source ? ' · ' + esc(st.source) : '') + '</p>' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px">Ranked players loaded: batting ' + st.counts.batting + ', bowling ' + st.counts.bowling + ', all-rounders ' + st.counts.allrounder + '. Top-ranked players get +1 to +4 on top of their base rating. Refreshes itself daily.</p>' +
        '<button id="rt-go">Refresh from ICC now</button> <span id="rt-note" class="muted">' + esc(note) + '</span>' +
        (moved ? '<h2 style="margin-top:18px">Last changes</h2><table><thead><tr><th>Player</th><th>Was</th><th>Now</th></tr></thead><tbody>' + moved + '</tbody></table>' : '') +
        ((st.last.unmatched || []).length ? '<p class="muted" style="font-size:12px">Not in the player pool: ' + esc(st.last.unmatched.join(', ')) + '</p>' : '') +
        '<details style="margin-top:14px"><summary class="muted">If the ICC fetch fails: paste the rankings</summary>' +
        '<p class="muted" style="font-size:12px">One block per ranking, best first. Either one name per line, or lines like "1 Suryakumar Yadav 912".</p>' +
        '<textarea id="m-bat" placeholder="Batting"></textarea><textarea id="m-bowl" placeholder="Bowling"></textarea><textarea id="m-ar" placeholder="All-rounders"></textarea>' +
        '<button id="rt-paste">Apply pasted rankings</button></details>';
      document.getElementById('rt-go').onclick = () => run({});
      document.getElementById('rt-paste').onclick = () => run({ manual: { batting: document.getElementById('m-bat').value, bowling: document.getElementById('m-bowl').value, allrounder: document.getElementById('m-ar').value } });
    } catch (e) { box.innerHTML = '<p class="muted">Could not load ratings status.</p>'; }
  }
  async function run(body) {
    const box = document.getElementById('ratings'); box.dataset.busy = '1';
    const n = document.getElementById('rt-note'); if (n) n.textContent = 'Working…';
    try {
      const r = await api('/api/admin/ratings/refresh', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json();
      note = j.ok ? 'Done: ' + j.changed + ' ratings changed, ' + j.matched + ' ranked players matched.' : (j.error || 'Failed');
    } catch (e) { note = 'Request failed'; }
    delete box.dataset.busy; loadRatings();
  }

  async function load() {
    const key = get();
    if (!key) return login();
    try {
      const r = await fetch('/api/stats', { headers: { 'x-stats-key': key }, cache: 'no-store' });
      if (r.status === 404) return (app.innerHTML = '<h1>The Dugout <span>stats</span></h1><p class="muted">Stats are switched off. Set the ANALYTICS_KEY environment variable on the server.</p>');
      if (r.status === 401) { set(''); return login('That key was not accepted.'); }
      if (!r.ok) throw new Error(r.status);
      const first = !document.getElementById('ratings');
      render(await r.json());
      if (first) loadRatings();
    } catch (e) { const m = document.getElementById('msg'); if (m) m.textContent = 'Could not load stats, retrying…'; }
  }
  load();
  setInterval(() => { if (get() && !document.hidden) load(); }, 5000);
})();
