'use strict';
// Mature Market client: one page, two screens (teacher and player), live via Server-Sent Events.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { meta: null, game: null, role: null, code: null, pid: null, pin: null, ui: {}, offset: 0, es: null, dragging: false };

const PHASE_NAMES = { lobby: 'Joining', event: 'Event', check: 'Check your business', deal: 'Deal window', decide: 'Decide', resolve: 'Resolve', debrief: 'Debrief', over: 'Final results' };
const PLAYER_TIPS = {
  lobby: 'Pick your leadership style and write one sentence on why it suits your business. Then wait for your teacher to start round 1.',
  event: 'Read the event card. Which factor is it? Think about how it changes your staffing. Its effect has already been applied.',
  check: 'Read your dashboard. What changed since last round, and why? From round 2 you can commission a SWOT (your first one is free).',
  deal: 'Send, accept, counter or reject deals. Negotiate out loud with the classmate. You can accept only ONE deal this round.',
  decide: 'Choose ONE main action and write your board report: name the action and give a business reason linked to your data. It only locks in once your "because" is written.',
  resolve: 'Watch the projector. Every action is applied at the same time. Check your new status badge.',
  debrief: 'Why did your badge change? Read the reason under your status. Listen to the board reports being rated.',
  over: 'Game over. Read your results, then press Print reflection and complete it by hand.',
};
const RUN_SHEET = {
  lobby: ['Put this screen on the projector. Students go to the same link on their laptops and type the game code.', 'Each student types their first name, names their business and picks an industry profile (each profile once; more than 12 students: play in pairs).', 'Students choose a leadership style and write one "because". Watch the list fill up below.', 'Optional: choose the round 1 event card below (round 1 always draws a mild card).', 'Press Start round 1 when everyone has joined (about 8 minutes).'],
  event: ['Read the card aloud. Ask: which STEEPLE factor is this?', 'Ask the card\'s human resource question and let two students answer.', 'Press Next when ready (about 1 minute).'],
  check: ['Students read their dashboards and compare with last round.', 'From round 2, remind them they can commission a SWOT: the first is free, then $1m each. A sound SWOT earns an insight token.', 'Press Next to open the deal window (about 1 minute).'],
  deal: ['Deal window open: students send, accept, counter or reject offers and negotiate out loud.', 'Each business can accept only one deal this round. Watch the deal feed.', 'Press Next to close deals (about 3 minutes). Unanswered offers expire.'],
  decide: ['Students pick ONE main action and write a one-sentence "because" board report.', 'Check the count of locked-in decisions below. A subsidiary may be waiting for its parent\'s yes.', 'Press Resolve when the timer ends (about 2 minutes). Anyone not locked in takes no action.'],
  resolve: ['The game has applied every action. Watch the share bars move and the new badges.', 'Point out any red flags (emergency loans) and takeover targets.', 'Press Next for the debrief (about 1 minute).'],
  debrief: ['Read the biggest riser and biggest faller and their reasons.', 'Read the two board reports aloud. The class rates each 0, 1 or 2; tap the rating.', 'Choose the next event card if you want, then start the next round (about 2 minutes).'],
  over: ['Show the final leaderboard and category winners.', 'Students press Print reflection on their own screen, or press Print all reflections here.', 'Press Copy all results to paste scores and board reports into your markbook before closing the game.'],
};
const STATS = [
  ['share', 'Market share', (v) => v + '%', 1], ['revenue', 'Revenue', (v) => '$' + v + 'm', 1], ['profit', 'Profit', (v) => '$' + v + 'm', 1],
  ['cash', 'Cash', (v) => '$' + v + 'm', 1], ['debt', 'Debt', (v) => '$' + v + 'm', -1], ['staff', 'Staff (headcount)', (v) => Number(v).toLocaleString(), 0],
  ['turnover', 'Staff turnover', (v) => v + '%', -1], ['absent', 'Absenteeism', (v) => v + '%', -1], ['productivity', 'Labour productivity', (v) => '$' + v + 'k per employee', 1],
  ['sat', 'Staff satisfaction', (v) => v + '/10', 1], ['cpe', 'Cost per employee', (v) => '$' + v + 'k', -1],
];
const TERM_FIELDS = {
  jv: [['costShare', 'My share of the $10m cost (%)', [30, 40, 50, 60, 70], 50], ['profitShare', 'My share of the new revenue (%)', [30, 40, 50, 60, 70], 50], ['rounds', 'How many rounds', [2, 3, 4], 3]],
  alliance: [['kind', 'What we share', [['training', 'Training'], ['suppliers', 'Suppliers'], ['tech', 'Technology']], 'training']],
  licensing: [['licensor', 'Whose brand or product is licensed?', [['me', 'Mine (I earn the fee)'], ['them', 'Theirs (I pay the fee)']], 'me'], ['fee', 'Fee per round ($m)', [1, 2, 3, 4], 2], ['rounds', 'How many rounds', [2, 3, 4], 3]],
  franchising: [['franchisor', 'Who is the franchisor?', [['me', 'Me (I earn fees)'], ['them', 'Them (I run their model)']], 'me'], ['fee', 'Up-front fee ($m)', [0, 2, 4, 6], 4], ['revShare', 'Share of franchise revenue each round (%)', [5, 10, 15, 20], 10]],
  loan: [['lender', 'Who lends?', [['me', 'Me'], ['them', 'Them']], 'me'], ['amount', 'Amount ($m)', [2, 5, 10], 5], ['rate', 'Interest per round (%)', [5, 8, 12], 8], ['rounds', 'Repay over (rounds)', [2, 3], 2]],
  staff: [['seller', 'Who transfers staff?', [['me', 'Me (I sell staff)'], ['them', 'Them (I buy staff)']], 'me'], ['n', 'Number of staff', [25, 50, 100], 50], ['price', 'Price ($m)', [1, 2, 3, 5], 2]],
};
const DEAL_HELP = {
  jv: 'Both enter a new market together; shared cost and risk.', alliance: 'Both gain a smaller boost; low cost, low control.',
  licensing: 'The licensee gains a product or brand; the licensor earns the fee.', franchising: 'The franchisee gains a proven model; the franchisor earns ongoing income.',
  loan: 'Cash moves now and is repaid with interest automatically.', staff: 'Lets a business cutting staff sell them to one that is hiring.',
};
const FOOT = 'Figures are made up for the game only. Businesses are modelled on real brands so you can picture them.';

// ---------- storage (optional) ----------
function load() { try { Object.assign(S, JSON.parse(localStorage.getItem('mm_v1') || '{}')); } catch (e) { /* ignore */ } }
function save() { try { localStorage.setItem('mm_v1', JSON.stringify({ role: S.role, code: S.code, pid: S.pid, pin: S.pin })); } catch (e) { /* ignore */ } }

// ---------- api ----------
async function api(cmd, body = {}) {
  const r = await fetch('/api/' + cmd, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ code: S.code, pid: S.pid, pin: S.pin }, body)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  if (S.code && Date.now() - lastMsg > 5000 && cmd !== 'check') setTimeout(refresh, 100);
  return j;
}
async function run(cmd, body) { try { const j = await api(cmd, body); if (j.note) toast(j.note); return j; } catch (e) { toast(e.message, true); return null; } }
let toastT;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3500); }

// Live updates come through the stream. Some school networks block or hold back streams, so if
// nothing has arrived for a few seconds the page falls back to asking for the state every 2 seconds.
let lastMsg = 0, pollT = null, polling = false;
// A live update must not rebuild the page while a dropdown is open or the mouse is held down
// (that closes the dropdown / swallows the click). Hold it back and redraw once the user is done.
let pendingRender = false, pointerDown = false, selectOpenUntil = 0;
const busy = () => pointerDown || Date.now() < selectOpenUntil;
const isSel = (e) => e.target && e.target.tagName === 'SELECT';
document.addEventListener('focusin', (e) => { if (isSel(e)) selectOpenUntil = Date.now() + 15000; });
document.addEventListener('mousedown', (e) => { if (isSel(e)) selectOpenUntil = Date.now() + 15000; }, true);
document.addEventListener('change', (e) => { if (isSel(e)) { selectOpenUntil = 0; setTimeout(flushRender, 0); } }, true);
function applyState(g) { S.game = g; S.offset = S.game.serverNow - Date.now(); if (busy()) pendingRender = true; else render(); }
function flushRender() { if (pendingRender && !busy()) { pendingRender = false; render(); } }
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { pointerDown = false; setTimeout(flushRender, 300); }, true);
document.addEventListener('focusout', (e) => { if (isSel(e)) selectOpenUntil = 0; setTimeout(flushRender, 300); });
setInterval(flushRender, 1000);
async function refresh() {
  if (!S.code || polling) return; polling = true;
  try {
    const r = await fetch('/api/state?code=' + encodeURIComponent(S.code), { cache: 'no-store' });
    if (r.ok) { const g = await r.json(); if (g && g.code === S.code) applyState(g); }
  } catch (e) { /* network hiccup: try again next tick */ } finally { polling = false; }
}
function connect() {
  if (S.es) S.es.close();
  clearInterval(pollT); lastMsg = 0;
  const code = S.code;
  refresh();
  try {
    S.es = new EventSource('/api/stream?code=' + encodeURIComponent(code));
    S.es.onmessage = (e) => { lastMsg = Date.now(); applyState(JSON.parse(e.data)); };
    S.es.onerror = () => { /* the poll below keeps the page up to date */ };
  } catch (e) { S.es = null; }
  pollT = setInterval(() => { if (S.code !== code) return clearInterval(pollT); if (Date.now() - lastMsg > 5000) refresh(); }, 2000);
}
function disconnect() { if (S.es) S.es.close(); S.es = null; clearInterval(pollT); }

// ---------- ui helpers ----------
const v = (k, d = '') => (S.ui[k] !== undefined ? S.ui[k] : d);
const inp = (k, attrs = '') => `<input id="f_${k}" data-k="${k}" value="${esc(v(k))}" ${attrs}>`;
const ta = (k, attrs = '') => `<textarea id="f_${k}" data-k="${k}" ${attrs}>${esc(v(k))}</textarea>`;
function sel(k, opts, def) {
  const cur = String(v(k, def));
  return `<select id="f_${k}" data-k="${k}">${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === cur ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
}
const badge = (s) => `<span class="badge ${s}">${{ growth: 'Growth or renewal', stagnation: 'Stagnation', decline: 'Decline' }[s] || s}</span>`;
const me = () => S.game && S.game.players[S.pid];
const P = (id) => S.game.players[id];
const players = () => S.game.order.map((id) => S.game.players[id]);
const prof = (p) => S.meta.profiles.find((x) => x.id === p.profileId);
const styleLabel = (s) => (S.meta.styles[s] ? S.meta.styles[s].label : 'Not chosen');
const ev = (id) => S.meta.events.find((e) => e.id === id);
const factor = (t) => (['Maturity challenge', 'Market interaction'].includes(t) ? t : 'STEEPLE factor: ' + t);
function timeLeft() { const g = S.game; if (!g || !g.timer) return 0; return g.paused || !g.timer.started ? g.timer.remaining || 0 : g.timer.endsAt - (Date.now() + S.offset); }
function fmtT(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function tick() { const ms = timeLeft(); document.querySelectorAll('.timer').forEach((el) => { el.textContent = S.game && S.game.phase === 'over' ? 'Done' : S.game && S.game.paused ? 'Paused ' + fmtT(ms) : S.game && S.game.timer && !S.game.timer.started ? fmtT(ms) + ' (not started)' : (ms <= 0 ? "Time's up" : fmtT(ms)); el.classList.toggle('late', ms <= 0 && S.game && S.game.phase !== 'over'); }); }
setInterval(tick, 500);

function spark(vals, good) {
  if (vals.length < 2) return '';
  const w = 110, h = 26, mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((x, i) => `${(i / (vals.length - 1)) * (w - 4) + 2},${h - 3 - ((x - mn) / rg) * (h - 6)}`).join(' ');
  const last = vals[vals.length - 1], first = vals[0];
  const col = good === 0 || last === first ? '#5d6677' : (last > first) === (good > 0) ? '#1f8a4c' : '#c0352b';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${col}" stroke-width="2" points="${pts}"/></svg>`;
}
function phaseStrip(g) {
  const ph = ['event', 'check', 'deal', 'decide', 'resolve', 'debrief'];
  return `<div class="phases">${ph.map((x, i) => `<span class="${g.phase === x ? 'on' : ''}">${i + 1}. ${PHASE_NAMES[x]}</span>`).join('')}</div>`;
}
function eventCard(id, big) {
  const e = ev(id); if (!e) return '';
  return `<div class="event"><div class="type">${esc(factor(e.type))}</div><h2${big ? ' style="font-size:1.7rem"' : ''}>${esc(e.title)}</h2><div>${esc(e.text)}</div><div class="small muted">Hits hardest: ${esc(e.hits)}</div><p style="margin:.5em 0 0"><b>Human resource question:</b> ${esc(e.q)}</p></div>`;
}
function lastRow(p) { return p.history.length ? p.history[p.history.length - 1] : { share: 0, revenue: p.revenue, profit: p.profit, cash: p.cash, debt: p.debt, staff: p.staff, turnover: p.turnover, absent: p.absent, productivity: p.productivity, sat: p.sat, cpe: p.cpe }; }

// ---------- render ----------
let lastHTML = '';
function render() {
  if (S.dragging || !S.meta) return;
  const a = document.activeElement; const fid = a && a.id; let selr = null;
  try { selr = a && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { selr = null; }
  let html;
  if (S.role === 'teacher' && S.game && S.pin) html = teacherView();
  else if (S.role === 'player' && S.game) html = me() ? playerView() : joinView();
  else if (S.role === 'teacher') html = teacherLogin();
  else html = landing();
  pendingRender = false;
  if (html === lastHTML) return; // nothing changed: leave the page (and any open dropdown) alone
  lastHTML = html;
  $('#app').innerHTML = html;
  tick();
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (selr && el.setSelectionRange) { try { el.setSelectionRange(selr[0], selr[1]); } catch (e) { /* ignore */ } } } }
}

function landing() {
  return `<div class="wrap" style="max-width:560px"><h1 style="margin-top:20px">Mature Market</h1>
  <p class="muted">A business game about the maturity stage: run your own business for 6 rounds, trade with classmates and grow, stagnate or decline.</p>
  <div class="card"><h2>Join a game</h2><label for="f_joincode">Game code (on the projector)</label>
  <div class="row">${inp('joincode', 'placeholder="ABCD" maxlength="4" autocapitalize="characters" style="text-transform:uppercase;width:140px;font-size:1.3rem"')}<button class="primary" data-act="goJoin">Continue</button></div></div></div>`;
}

function joinView() {
  const g = S.game; const taken = new Set(players().map((p) => p.profileId));
  if (g.phase !== 'lobby') return `<div class="wrap"><div class="card"><h2>This game has started</h2><p>Joining closes once round 1 starts. Ask your teacher for help.</p><button data-act="leave">Back</button></div></div>`;
  const first = v('first'); const pick = v('profile');
  return `<div class="wrap" style="max-width:900px"><h1 style="margin-top:12px">Join game ${esc(g.code)}</h1>
  ${howTo(true)}
  <div class="card"><div class="grid2"><div><label for="f_first">Your first name</label>${inp('first', 'maxlength="20" autocomplete="off"')}</div>
  <div><label for="f_bizname">Business name (named after you)</label>${inp('bizname', `maxlength="30" placeholder="${esc(first ? first + ' Co.' : 'e.g. Cruze Co.')}"`)}</div></div>
  <label>Pick an industry profile (each one can be taken once)</label>
  <div class="profs">${S.meta.profiles.map((pr) => `<button class="prof ${pick === pr.id ? 'sel' : ''}" data-act="pickProfile" data-id="${pr.id}" ${taken.has(pr.id) ? 'disabled' : ''}>
   <b>${esc(pr.label)}</b><div class="small muted">Modelled on: ${esc(pr.model)}${taken.has(pr.id) ? ' (taken)' : ''}</div>
   <div class="small"><span class="up">+ ${esc(pr.strength)}</span><br><span class="down">− ${esc(pr.weakness)}</span></div></button>`).join('')}</div>
  <p class="small muted">Every business starts on the same numbers; only the built-in strength and weakness differ.</p>
  <button class="primary big" data-act="join">Join the game</button><p class="foot">${FOOT}</p></div></div>`;
}

function howTo(open) {
  return `<details class="card" ${open ? 'open' : ''}><summary>How to play</summary>
  <ul>
  <li>You run your own maturity-stage business for <b>6 rounds</b>. Every business shares one market, so one business's gain is another's loss. New markets are the way to grow beyond your slice.</li>
  <li>Each round: <b>1 Event</b> (a card hits the market) → <b>2 Check your business</b> (read your dashboard, commission a SWOT) → <b>3 Deal window</b> (trade with classmates) → <b>4 Decide</b> (ONE main action + a one-sentence "because" board report) → <b>5 Resolve</b> → <b>6 Debrief</b>.</li>
  <li>Every action shows its cost, likely effect and risk. Results vary by about 20% either way, so you can't work them out exactly.</li>
  <li>Your status badge after each round: <span class="badge growth">Growth or renewal</span> revenue up 4% or more on average over the last 2 rounds, <span class="badge stagnation">Stagnation</span> between −2% and +4%, <span class="badge decline">Decline</span> −2% or worse.</li>
  <li>Two red badges in a row (from round 3) and a classmate can take you over. You keep playing as the CEO of their subsidiary.</li>
  <li>Final score out of 100: <b>competitiveness 40</b> (market share, revenue growth, profit), <b>efficiency 40</b> (labour productivity, staff turnover, absenteeism, cost per employee) and <b>board reports 20</b>.</li>
  <li>After the game you print a reflection filled with your own data and complete it by hand.</li></ul></details>`;
}

// ---------- player ----------
function playerView() {
  const g = S.game, p = me(), pr = prof(p);
  const parent = p.parentId && P(p.parentId);
  const subs = players().filter((x) => x.parentId === p.id);
  const myApprovals = g.approvals.filter((a) => a.parentId === p.id);
  let h = `<div class="bar"><div><b style="font-size:1.1rem">${esc(p.name)}</b> <span class="muted small">Modelled on: ${esc(pr.model)} · ${esc(styleLabel(p.style))} leader</span></div>
   <div class="row"><span>Round ${g.round}/${g.totalRounds} · ${PHASE_NAMES[g.phase]}</span><span class="timer"></span>${g.round ? badge(p.status) : ''}</div></div><div class="wrap">`;
  if (g.paused) h += `<div class="overlay"><div class="card"><h2>Paused</h2><p>Your teacher has paused the game.</p></div></div>`;
  if (myApprovals.length) h += `<div class="card pop"><h3>Your subsidiary needs your yes</h3>${myApprovals.map((a) => `<div class="deal">${esc(a.text)}<div class="row" style="margin-top:6px"><button class="primary" data-act="approve" data-id="${a.id}" data-yes="1">Yes</button><button data-act="approve" data-id="${a.id}" data-yes="0">No</button></div></div>`).join('')}</div>`;
  if (g.phase !== 'lobby') h += phaseStrip(g);
  h += `<div class="tip">${esc(PLAYER_TIPS[g.phase])}</div>`;
  if (p.emergency) h += `<div class="card" style="border-color:var(--red)"><b class="down">Red flag:</b> you ran out of cash and the bank gave you an emergency loan at a high interest rate.</div>`;
  if (p.takeoverTarget) h += `<div class="card" style="border-color:var(--red)"><b class="down">Takeover target:</b> two red badges in a row. A classmate can buy you for $${p.value}m. Escape the red badge to be safe.</div>`;
  if (parent) h += `<div class="card pop"><b>You are the CEO of a subsidiary of ${esc(parent.name)}.</b> You still decide human resource actions, SWOTs and your board report. Expansion, loans, share issues and deals need ${esc(parent.name)}'s yes. Half your profit goes to them each round. You can buy yourself back for $${Math.round(p.buyPrice * 11) / 10}m (management buyout).</div>`;
  if (subs.length) h += `<div class="card pop"><b>Your subsidiaries:</b> ${subs.map((s) => esc(s.name)).join(', ')}. Half their profit comes to you each round.</div>`;
  if (g.phase === 'over') h += resultsCard(p);
  if (g.event && g.phase !== 'lobby' && g.phase !== 'over') h += eventCard(g.event);
  h += `<div class="main"><div>${dashboard(p)}</div><div>${phasePanel(p)}</div></div>`;
  h += logCard(p);
  h += howTo(false);
  h += `<p class="foot">${FOOT}</p></div>`;
  return h;
}

function dashboard(p) {
  const row = lastRow(p); const prev = p.history.length > 1 ? p.history[p.history.length - 2] : null;
  const pr = prof(p);
  const tiles = STATS.map(([k, label, f, good]) => {
    const val = row[k]; let d = '';
    if (prev) { const ch = Math.round((val - prev[k]) * 10) / 10; const cls = ch === 0 || good === 0 ? 'flat' : (ch > 0) === (good > 0) ? 'up' : 'down'; d = `<div class="d ${cls}">${ch > 0 ? '▲' : ch < 0 ? '▼' : '•'} ${Math.abs(ch)} since last round</div>`; }
    return `<div class="stat"><div class="k">${label}</div><div class="v">${f(val)}</div>${d}${spark(p.history.map((x) => x[k]), good)}</div>`;
  }).join('');
  const mk = p.markets.length ? `<div class="small" style="margin-top:8px"><b>New markets:</b> ${p.markets.map((m) => `${esc(m.label)} (about $${Math.round(m.rev * 10) / 10}m a round${m.start > S.game.round ? ', starts round ' + m.start : ''}${m.end < 99 ? ', to round ' + m.end : ''})`).join('; ')}</div>` : '';
  const al = p.alliances.filter((a) => a.end >= S.game.round);
  return `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Your dashboard</h2>${S.game.round ? badge(p.status) : ''}</div>
  ${p.reason ? `<p class="small" style="margin:.3em 0"><b>Why:</b> ${esc(p.reason)}</p>` : ''}
  <div class="stats" style="margin-top:8px">${tiles}</div>
  <div class="small" style="margin-top:10px"><b>${esc(pr.label)}</b> · modelled on ${esc(pr.model)}<br><span class="up">Strength: ${esc(pr.strength)}</span><br><span class="down">Weakness: ${esc(pr.weakness)}</span></div>
  <div class="small" style="margin-top:6px"><b>Leadership style:</b> ${esc(styleLabel(p.style))}${p.style ? ` — plays well with: ${esc(S.meta.styles[p.style].good)}; plays badly with: ${esc(S.meta.styles[p.style].bad)}` : ''}</div>
  ${mk}${al.length ? `<div class="small"><b>Alliances:</b> ${al.map((a) => `${esc(P(a.partner) ? P(a.partner).name : '')} (${a.kind}, to round ${a.end})`).join('; ')}</div>` : ''}
  ${p.insight ? '<div class="small" style="margin-top:6px"><span class="badge growth">Insight token</span> your next action gets a 10% better result.</div>' : ''}
  <div class="small muted" style="margin-top:6px">Market value: $${p.value}m</div></div>`;
}

function phasePanel(p) {
  const g = S.game;
  if (g.phase === 'lobby') return styleCard(p);
  let h = '';
  if (g.phase === 'decide') h += actionCard(p);
  if (g.phase === 'deal') h += dealBoard(p);
  if (['check', 'deal'].includes(g.phase) || (p.swot && (!p.swot.result || p.swot.round === g.round))) h += swotCard(p);
  if (['event', 'check'].includes(g.phase)) h += `<div class="card"><h3>Coming up</h3><p class="small">Deal window, then Decide: ONE main action and a one-sentence "because" board report.</p></div>`;
  if (['resolve', 'debrief'].includes(g.phase)) {
    const lg = p.log.filter((l) => l.round === g.round).pop();
    h += `<div class="card"><h3>Round ${g.round} result</h3>${lg ? `<p><b>${esc(lg.action)}</b>: ${esc(lg.result)}</p><p class="small muted">Your board report: "${esc(lg.because || '—')}"</p>` : ''}<p>${badge(p.status)} ${esc(p.reason)}</p></div>`;
    if (g.phase === 'debrief' && g.debrief) h += debriefCard(g.debrief);
  }
  return h;
}

function styleCard(p) {
  if (p.style && !S.ui.restyling) return `<div class="card"><h3>You're in</h3><p>Leadership style: <b>${esc(styleLabel(p.style))}</b><br><span class="small muted">"${esc(p.styleBecause)}"</span></p><button data-act="restyle">Change style</button>
  <h3 style="margin-top:14px">Businesses joined (${players().length})</h3><div class="small">${players().map((x) => `${esc(x.name)} <span class="muted">(${esc(prof(x).model)})</span>`).join(' · ')}</div></div>`;
  const st = v('style');
  return `<div class="card"><h2>Choose your leadership style</h2><p class="small">Your style changes how actions turn out. This is the link between leadership and expansion.</p>
  ${Object.entries(S.meta.styles).map(([k, s]) => `<button class="act ${st === k ? 'sel' : ''}" data-act="pickStyle" data-id="${k}"><b>${s.label}</b><span class="meta"><span class="up">Plays well with:</span> ${esc(s.good)}<br><span class="down">Plays badly with:</span> ${esc(s.bad)}</span></button>`).join('')}
  <label for="f_stylebecause">I chose this style because…</label>${ta('stylebecause', 'maxlength="300"')}
  <button class="primary" data-act="setStyle">Save my style</button></div>`;
}

function actionCard(p) {
  const g = S.game;
  if (p.decision) {
    const a = S.meta.actions.find((x) => x.id === p.decision.action);
    return `<div class="card" style="border-color:var(--green)"><h2>Decision locked in</h2><p><b>${esc(a.label)}</b></p><p class="small">"${esc(p.decision.because)}"</p>
    ${p.decision.needsApproval ? `<p class="small">${p.decision.approved ? '<span class="up">Approved by your parent business.</span>' : '<span class="down">Waiting for your parent business to say yes.</span>'}</p>` : ''}
    <button data-act="undecide">Change my decision</button></div>`;
  }
  const chosen = v('action');
  const others = players().filter((x) => x.id !== p.id);
  const targets = others.filter((t) => g.round >= 3 && t.takeoverTarget && t.id !== p.parentId);
  const groups = {};
  for (const a of S.meta.actions) {
    if (a.id === 'switch' && (p.style !== 'situational' || p.styleSwitched)) continue;
    if (a.id === 'buyback' && !p.parentId) continue;
    (groups[a.group] = groups[a.group] || []).push(a);
  }
  let h = `<div class="card"><h2>Decide: ONE main action</h2><p class="small muted">Cash: $${lastRow(p).cash}m. If you spend more than you have, the bank gives an emergency loan at a high rate. Results vary by about 20%.</p>`;
  for (const [gname, acts] of Object.entries(groups)) {
    h += `<h3 style="margin-top:12px">${esc(gname)}</h3>`;
    for (const a of acts) {
      let cost = p.costs[a.id]; let off = false; let note = '';
      if (a.id === 'takeover') { off = !targets.length; cost = null; note = g.round < 3 ? 'Available from round 3.' : targets.length ? '' : 'No business is a takeover target right now.'; }
      if (a.id === 'loan') cost = null;
      const costTxt = a.id === 'takeover' ? 'Market value' : a.id === 'loan' ? '$0 (you choose $5m–$20m)' : `$${Math.round(cost * 10) / 10}m`;
      h += `<button class="act ${chosen === a.id ? 'sel' : ''} ${off ? 'off' : ''}" data-act="pickAction" data-id="${a.id}" ${off ? 'disabled' : ''}><b>${esc(a.label)}</b><span class="meta">Cost: ${costTxt} · Effect: ${esc(a.effect)} · Risk: ${esc(a.risk)}${p.parentId && a.restricted ? ' · <b>Needs your parent\'s yes</b>' : ''}${note ? ' · ' + esc(note) : ''}</span></button>`;
      if (chosen === a.id) {
        if (a.id === 'poach') h += `<label for="f_ptarget">Poach from</label>${sel('ptarget', others.map((t) => [t.id, `${t.name} (satisfaction ${lastRow(t).sat}/10)`]), others[0] && others[0].id)}`;
        if (a.id === 'takeover') h += `<label for="f_ttarget">Take over</label>${sel('ttarget', targets.map((t) => [t.id, `${t.name}: $${t.value}m`]), targets[0] && targets[0].id)}`;
        if (a.id === 'loan') h += `<label for="f_amount">Loan amount</label>${sel('amount', [[5, '$5m'], [10, '$10m'], [15, '$15m'], [20, '$20m']], 10)}`;
        if (a.id === 'switch') h += `<label for="f_newstyle">Switch to</label>${sel('newstyle', Object.entries(S.meta.styles).filter(([k]) => k !== 'situational').map(([k, s]) => [k, s.label]), 'transformational')}`;
      }
    }
  }
  h += `<label for="f_because">Board report: one sentence with a "because"</label>
  <p class="small muted" style="margin:0 0 4px">*** Name the action and give a business reason linked to your data. ${g.event ? 'Event question: ' + esc(ev(g.event).q) : ''}</p>
  ${ta('because', 'maxlength="400" placeholder="We will … because our staff turnover rose from 15% to 19% …"')}
  <button class="primary big" data-act="decide" style="margin-top:8px">Lock in my decision</button></div>`;
  return h;
}

function dealBoard(p) {
  const g = S.game; const others = players().filter((x) => x.id !== p.id);
  const type = v('dtype', 'jv'); const fields = TERM_FIELDS[type];
  const counter = S.ui.counterOf && g.deals.find((d) => d.id === S.ui.counterOf);
  let h = `<div class="card"><h2>Deal board</h2><p class="small muted">${p.dealRound === g.round ? '<b>You have accepted your one deal this round.</b>' : 'You can accept ONE deal this round.'} Deals help both sides, but only one business wins.</p>`;
  const incoming = g.deals.filter((d) => d.to === p.id && d.status === 'open');
  h += `<h3>Offers to you</h3>${incoming.length ? incoming.map((d) => `<div class="deal"><b>${esc(S.meta.dealTypes[d.type])}</b> from ${esc(P(d.from).name)}${d.counterOf ? ' (counter-offer)' : ''}<div class="small">${esc(d.text)}</div>
    <div class="row" style="margin-top:6px"><button class="primary" data-act="accept" data-id="${d.id}" ${p.dealRound === g.round ? 'disabled' : ''}>Accept</button><button data-act="counter" data-id="${d.id}">Counter</button><button class="danger" data-act="reject" data-id="${d.id}">Reject</button></div></div>`).join('') : '<p class="small muted">No open offers yet.</p>'}`;
  h += `<h3 style="margin-top:12px">${counter ? 'Counter-offer to ' + esc(P(counter.from).name) + ' <button class="small" data-act="cancelCounter">Cancel</button>' : 'Make an offer'}</h3>
  <div class="grid2"><div><label for="f_dtype">Deal</label>${sel('dtype', Object.entries(S.meta.dealTypes), 'jv')}</div><div><label for="f_dto">To</label>${sel('dto', others.map((o) => [o.id, o.name]), others[0] && others[0].id)}</div></div>
  <p class="small muted" style="margin:4px 0">${esc(DEAL_HELP[type])}</p>
  <div class="grid2">${fields.map(([k, label, opts, def]) => `<div><label for="f_t_${k}">${esc(label)}</label>${sel('t_' + k, opts, def)}</div>`).join('')}</div>
  <button class="primary" data-act="sendDeal" style="margin-top:8px">Send offer</button>`;
  const mine = g.deals.filter((d) => d.round === g.round && (d.from === p.id || d.to === p.id) && !(d.to === p.id && d.status === 'open'));
  if (mine.length) h += `<h3 style="margin-top:12px">This round</h3>${mine.map((d) => `<div class="deal small"><b>${esc(S.meta.dealTypes[d.type])}</b> ${d.from === p.id ? 'to ' + esc(P(d.to).name) : 'from ' + esc(P(d.from).name)} · <b>${d.status}</b><br>${esc(d.text)}</div>`).join('')}`;
  return h + '</div>';
}

function dataTable(hist) {
  return `<div class="tablewrap"><table><tr><th>Indicator</th>${hist.map((r) => `<th>R${r.round}</th>`).join('')}</tr>${STATS.map(([k, label, f]) => `<tr><td>${label}</td>${hist.map((r) => `<td>${f(r[k])}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

function swotCard(p) {
  const g = S.game; const sw = p.swot;
  const ready = p.history.length >= 2;
  const canAsk = ready && ['check', 'deal'].includes(g.phase) && !g.paused;
  const ask = ready
    ? `<button class="primary" data-act="swot" ${canAsk ? '' : 'disabled'}>Commission a ${sw ? 'new ' : ''}SWOT (${p.swotsUsed ? '$1m' : 'free'})</button>${canAsk ? '' : '<span class="small muted"> Opens in the Check and Deal phases.</span>'}`
    : '<p class="small muted">Your first SWOT opens in round 2, once you have a round of results to compare.</p>';
  const intro = '<p class="small">A SWOT (strengths, weaknesses, opportunities, threats) consultant report sorts your own human resource data. A sound answer earns an insight token: your next action gets a 10% better result.</p>';
  if (!sw) return `<div class="card"><h2>SWOT on request</h2>${intro}${ask}</div>`;
  if (sw.checking) return `<div class="card"><h2>SWOT</h2><p>Checking your SWOT… (this takes a few seconds)</p></div>`;
  if (sw.result) {
    const st = sw.result.status;
    return `<div class="card"><h2>SWOT result</h2><p>${st === 'passed' ? '<span class="badge growth">Sound: insight token earned</span>' : st === 'pending' ? '<span class="badge stagnation">Waiting for your teacher</span>' : '<span class="badge decline">Not yet</span>'}</p>
    <p class="small">${sw.correct}/${sw.total} tiles match the consultant's sort. ${esc(sw.result.feedback)}</p>
    ${sw.key ? `<details><summary class="small">See the consultant's sort</summary><ul class="small">${sw.tiles.map((t) => `<li>${esc(t.text)}: <b>${{ S: 'Strength', W: 'Weakness', O: 'Opportunity', T: 'Threat' }[sw.key[t.id]]}</b>${sw.sort[t.id] === sw.key[t.id] ? ' ✓' : ` (you: ${{ S: 'Strength', W: 'Weakness', O: 'Opportunity', T: 'Threat' }[sw.sort[t.id]]})`}</li>`).join('')}</ul></details>` : ''}
    ${st === 'not yet' && !sw.retried ? '<p class="small"><b>Fix it for free:</b> your tiles and sentences are kept so you can change them.</p><button class="primary" data-act="swotRetry">Try again (free)</button> ' : ''}${st === 'pending' ? '' : ask}</div>`;
  }
  const sortKey = 'swot_' + sw.tiles.map((t) => t.id).join('');
  const sort = S.ui[sortKey] || (S.ui[sortKey] = {});
  const tile = (t) => `<div class="tile" draggable="true" data-tile="${t.id}">${esc(t.text)}<div class="tb">${['S', 'W', 'O', 'T'].map((c) => `<button data-act="sortTile" data-id="${t.id}" data-c="${c}" title="${c}" ${sort[t.id] === c ? 'class="primary"' : ''}>${c}</button>`).join('')}</div></div>`;
  const box = (c, name) => `<div class="box ${c}" data-drop="${c}"><h4>${name}</h4>${sw.tiles.filter((t) => sort[t.id] === c).map(tile).join('')}</div>`;
  const unsorted = sw.tiles.filter((t) => !sort[t.id]);
  return `<div class="card"><h2>Consultant report</h2>${intro}<details open><summary>Your human resource data (every fact below comes from this table)</summary>${dataTable(p.history)}</details>
  <h3 style="margin-top:10px">1. Sort the fact tiles (${sw.tiles.length - unsorted.length}/${sw.tiles.length} sorted)</h3><p class="small muted">Tap S, W, O or T on each tile, or drag it into a box. Strengths and weaknesses are inside your business; opportunities and threats come from outside it.</p>
  <div class="box" data-drop="">${unsorted.length ? unsorted.map(tile).join('') : '<span class="small muted">All tiles sorted.</span>'}</div>
  <div class="swot">${box('S', 'Strengths')}${box('W', 'Weaknesses')}${box('O', 'Opportunities')}${box('T', 'Threats')}</div>
  <h3 style="margin-top:10px">2. Write one relationship and one trend</h3>
  <label for="f_rel">Relationship: how one indicator moved with another (one sentence)</label>${ta('rel', 'maxlength="400" placeholder="For example: as staff satisfaction rose, staff turnover fell."')}
  <label for="f_trend">Trend: how one indicator changed over the rounds, with numbers from your table (one sentence)</label>${ta('trend', 'maxlength="400" placeholder="For example: labour productivity rose from $100k in round 0 to $104k in round 2."')}
  <button class="primary" data-act="swotSubmit" style="margin-top:8px">Submit my SWOT</button></div>`;
}

function debriefCard(d) {
  const g = S.game;
  const line = (m, word) => (m ? `<p><b>Biggest ${word}:</b> ${esc(m.name)} (${m.d >= 0 ? '+' : ''}${Math.round(m.d * 10) / 10} share points). ${esc(m.reason)}</p>` : '');
  const picks = (d.picks || []).map((id) => { const p = P(id); const lg = p && p.log.find((l) => l.round === d.round); return p && lg ? { p, lg } : null; }).filter(Boolean);
  return `<div class="card"><h2>Debrief: round ${d.round}</h2>${line(d.riser, 'riser')}${line(d.faller, 'faller')}
  ${picks.length ? `<h3>Board reports to rate</h3>${picks.map(({ p, lg }) => `<div class="deal"><b>${esc(p.name)}</b> chose <b>${esc(lg.action)}</b>: "${esc(lg.because)}"${S.role === 'teacher' ? `<div class="rating row" style="margin-top:6px"><span class="small">Class rating:</span>${[0, 1, 2].map((s) => `<button class="${p.boards[d.round] && p.boards[d.round].score === s ? 'on' : ''}" data-act="tScore" data-id="${p.id}" data-r="${d.round}" data-s="${s}">${s}</button>`).join('')}</div>` : ''}</div>`).join('')}
  <p class="small muted">Rate 0 to 2: did it name the action and give a business reason linked to the data?</p>` : ''}</div>`;
}

function logCard(p) {
  if (!p.log.length && !p.events.length) return '';
  return `<div class="card"><h2>Decision log</h2><div class="tablewrap"><table><tr><th>Round</th><th>Event</th><th>Action</th><th>Because</th><th>Result</th><th>Status</th></tr>
  ${p.log.map((l) => `<tr><td>${l.round}</td><td>${esc(l.event)}</td><td>${esc(l.action)}</td><td>${esc(l.because)}</td><td>${esc(l.result)}</td><td>${l.status ? badge(l.status) : ''}</td></tr>`).join('')}</table></div>
  <p class="small muted">This log becomes your stimulus for the reflection at the end.</p></div>`;
}

function resultsCard(p) {
  const s = p.score; const parent = p.parentId && P(p.parentId);
  const subs = players().filter((x) => x.parentId === p.id);
  return `<div class="card" style="border:2px solid var(--accent)"><h2>Your final results</h2>
  <div class="row"><div class="score">${s.total}/100</div>${badge(p.status)}</div>
  <p>Competitiveness <b>${s.comp}/40</b> · Efficiency <b>${s.eff}/40</b> · Board reports <b>${s.board}/20</b></p>
  ${parent ? `<p>Subsidiary of ${esc(parent.name)}.</p>` : ''}${subs.length ? `<p>Parent of: ${subs.map((x) => esc(x.name)).join(', ')}.</p>` : ''}
  <p>Rank ${ranked().findIndex((x) => x.id === p.id) + 1} of ${players().length}.</p>
  <button class="primary big" data-act="printMe">Print reflection</button></div>`;
}

// ---------- teacher ----------
function teacherLogin() {
  return `<div class="wrap" style="max-width:640px"><h1 style="margin-top:20px">Mature Market: teacher screen</h1>
  <div class="card"><h2>Create a game</h2><p class="small muted">Choose a PIN to protect the teacher screen for this game.</p><label for="f_newpin">Teacher PIN</label>
  <div class="row">${inp('newpin', 'type="password" autocomplete="off"')}<button class="primary" data-act="create">Create game</button></div></div>
  <div class="card"><h2>Return to a game</h2><div class="row"><div><label for="f_tcode">Game code</label>${inp('tcode', 'maxlength="4" style="text-transform:uppercase;width:120px"')}</div><div><label for="f_tpin">PIN</label>${inp('tpin', 'type="password"')}</div></div><button data-act="tlogin" style="margin-top:8px">Open teacher screen</button></div>
  <p class="small"><a href="/">Student screen</a></p></div>`;
}

const ranked = () => [...players()].sort((a, b) => b.score.total - a.score.total);
function nextLabel(g) {
  return { lobby: 'Start round 1', event: 'Next: Check your business', check: 'Open the deal window', deal: 'Close deals: Decide', decide: 'Resolve the round', resolve: 'Show the debrief', debrief: g.round < g.totalRounds ? `Start round ${g.round + 1}` : 'Show final results', over: 'Game over' }[g.phase];
}

function teacherView() {
  const g = S.game; const ps = players();
  let h = `<div class="bar"><div class="row"><span class="muted">Game code</span><span class="code">${esc(g.code)}</span><span class="muted small">Students go to ${esc(location.host)}</span></div>
  <div class="row"><b>Round ${g.round}/${g.totalRounds} · ${PHASE_NAMES[g.phase]}</b><span class="bigtimer"><span class="timer"></span></span></div></div><div class="wrap">`;
  h += `<div class="row" style="margin-bottom:10px"><button class="primary big" data-act="tNext" ${g.phase === 'over' ? 'disabled' : ''}>${nextLabel(g)}</button>
  <button class="primary" data-act="tStart" ${g.timer && g.timer.started || g.phase === 'over' ? 'disabled' : ''}>${g.timer && g.timer.started ? 'Timer running' : 'Start timer'}</button>
  <button data-act="tPause">${g.paused ? 'Resume' : 'Pause'}</button><button data-act="tTime">+30 seconds</button>
  <button data-act="tUndo" ${g.round ? '' : 'disabled'}>Undo last round</button><button class="danger" data-act="tEnd" ${g.phase === 'over' ? 'disabled' : ''}>End game</button>
  <button data-act="tCopy">Copy all results</button><button data-act="tPrintAll" ${ps.length ? '' : 'disabled'}>Print all reflections</button>
  <button data-act="tNew">New game (new code)</button><span class="small muted">${g.claude ? 'Claude checks SWOTs and board reports.' : 'Claude is off: you approve SWOTs and board reports use automatic scores you can change.'}</span></div>`;
  if (g.phase !== 'lobby' && g.phase !== 'over') h += phaseStrip(g);
  h += `<div class="card"><h3>Run sheet: ${PHASE_NAMES[g.phase]}</h3><ol class="run">${RUN_SHEET[g.phase].map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
  if (g.swotPending.length) h += `<div class="card pop"><h3>SWOT checks waiting for you</h3>${g.swotPending.map((id) => { const p = P(id); if (!p || !p.swot) return ''; const sw = p.swot; return `<div class="deal"><b>${esc(p.name)}</b> · ${sw.correct}/${sw.total} tiles match<br><span class="small"><b>Relationship:</b> ${esc(sw.relationship)}<br><b>Trend:</b> ${esc(sw.trend)}</span><div class="row" style="margin-top:6px"><button class="primary" data-act="tSwot" data-id="${id}" data-yes="1">Approve (insight token)</button><button data-act="tSwot" data-id="${id}" data-yes="0">Not yet</button></div></div>`; }).join('')}</div>`;

  if (g.phase === 'lobby') {
    const evOpts = [['random', 'Random mild card (rates cut or training subsidy)'], ...g.deck.map((id) => [id, ev(id).title])];
    h += `<div class="grid2"><div class="card"><h2>Joined: ${ps.length} business${ps.length === 1 ? '' : 'es'}</h2>${ps.length ? `<table><tr><th>Business</th><th>Student</th><th>Modelled on</th><th>Style</th><th></th></tr>${ps.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.first)}</td><td>${esc(prof(p).model)}</td><td>${p.style ? esc(styleLabel(p.style)) : '<span class="muted">choosing…</span>'}</td><td><button class="small danger" data-act="tRemove" data-id="${p.id}">Remove</button></td></tr>`).join('')}</table>` : '<p class="muted">Waiting for students to join…</p>'}</div>
    <div class="card"><h2>Round 1 event card</h2>${sel('pick', evOpts, g.nextPick)}<button data-act="tPick" style="margin-left:6px">Set</button><p class="small muted">Round 1 should be mild so students learn the screens.</p></div></div>`;
    return h + '</div>';
  }
  if (g.phase === 'over') h += finalBoard();
  if (g.event && g.phase !== 'over') h += eventCard(g.event, true);
  if (g.phase === 'debrief' && g.debrief) h += debriefCard(g.debrief);
  if (g.phase === 'decide') { const n = ps.filter((p) => p.decision).length; h += `<div class="card"><b>${n} of ${ps.length}</b> decisions locked in. ${ps.filter((p) => !p.decision).map((p) => esc(p.name)).join(', ')}</div>`; }
  if (g.phase === 'debrief' && g.round < g.totalRounds) {
    const evOpts = [['random', 'Random card'], ...g.deck.map((id) => [id, `${ev(id).title} (${factor(ev(id).type)})`])];
    h += `<div class="card"><h3>Next event card</h3>${sel('pick', evOpts, g.nextPick)}<button data-act="tPick" style="margin-left:6px">Set</button> <span class="small muted">Current: ${g.nextPick === 'random' ? 'random' : esc(ev(g.nextPick).title)}</span></div>`;
  }
  h += `<div class="main"><div>${shareBars()}${dealFeed()}</div><div>${leaderboard()}</div></div>`;
  h += boardReports();
  h += `<p class="foot">${FOOT}</p></div>`;
  return h;
}

function shareBars() {
  const ps = [...players()].sort((a, b) => b.share - a.share);
  const mx = Math.max(...ps.map((p) => p.share), 0.01);
  return `<div class="card"><h2>Market share</h2><div class="bars">${ps.map((p) => `<div class="b"><div class="small"><b>${esc(p.name)}</b>${p.emergency ? '<span class="flag">Red flag</span>' : ''}${p.takeoverTarget ? '<span class="flag">Takeover target</span>' : ''}${p.parentId ? `<span class="flag alt">Subsidiary of ${esc(P(p.parentId).name)}</span>` : ''}<br>${badge(p.status)}</div>
  <div><div class="fill ${p.status}" style="width:${(p.share / mx) * 100}%"></div><div class="tiny muted">${esc(p.reason)}</div></div><div><b>${Math.round(p.share * 1000) / 10}%</b>${spark(p.history.map((x) => x.revenue), 1)}</div></div>`).join('')}</div>
  <p class="tiny muted">Bar colour shows status. Trend line shows revenue.</p></div>`;
}
function dealFeed() {
  const f = S.game.feed.slice(0, 30);
  return `<div class="card"><h2>Deal feed</h2><div class="feed">${f.length ? f.map((x) => `<div><span class="muted small">R${x.round}</span> ${esc(x.text)}</div>`).join('') : '<span class="muted small">Nothing yet.</span>'}</div></div>`;
}
function leaderboard() {
  return `<div class="card"><h2>Leaderboard</h2><div class="tablewrap"><table><tr><th>#</th><th>Business</th><th>Status</th><th>Comp. /40</th><th>Eff. /40</th><th>Board /20</th><th>Total</th></tr>
  ${ranked().map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}<div class="tiny muted">${esc(p.first)} · ${esc(prof(p).model)} · ${esc(styleLabel(p.style))}</div></td><td>${badge(p.status)}</td><td>${p.score.comp}</td><td>${p.score.eff}</td><td>${p.score.board}</td><td><b>${p.score.total}</b></td></tr>`).join('')}</table></div></div>`;
}
function winners() {
  const ps = players(); if (!ps.length) return '';
  const top = (f) => [...ps].sort((a, b) => f(b) - f(a))[0];
  const c = top((p) => p.score.comp), e = top((p) => p.score.eff), b = top((p) => p.score.board);
  return `<div class="grid3"><div class="card"><h3>Most competitive</h3><b>${esc(c.name)}</b> (${c.score.comp}/40)</div><div class="card"><h3>Most efficient</h3><b>${esc(e.name)}</b> (${e.score.eff}/40)</div><div class="card"><h3>Best board reports</h3><b>${esc(b.name)}</b> (${b.score.board}/20)</div></div>`;
}
function finalBoard() { const w = ranked()[0]; return `<div class="card" style="border:2px solid var(--accent)"><h1>Final results</h1>${w ? `<p style="font-size:1.3rem">Winner: <b>${esc(w.name)}</b> with ${w.score.total}/100</p>` : ''}</div>${winners()}`; }
function boardReports() {
  const g = S.game; if (!g.round) return '';
  const r = Number(v('brRound', g.lastRound || 1));
  const rounds = []; for (let i = 1; i <= (g.lastRound || 0); i++) rounds.push([i, 'Round ' + i]);
  if (!rounds.length) return '';
  return `<details class="card"><summary>Board report scores (change any score)</summary><div style="margin:8px 0">${sel('brRound', rounds, r)}</div>
  <table><tr><th>Business</th><th>Action</th><th>Because</th><th>Score</th></tr>${players().map((p) => { const lg = p.log.find((l) => l.round === r); const b = p.boards[r] || { score: 0, by: 'auto' };
    return `<tr><td>${esc(p.name)}</td><td>${esc(lg ? lg.action : '')}</td><td>${esc(lg ? lg.because : '')}</td><td class="rating" style="white-space:nowrap">${[0, 1, 2].map((s) => `<button class="${b.score === s ? 'on' : ''}" data-act="tScore" data-id="${p.id}" data-r="${r}" data-s="${s}">${s}</button>`).join('')} <span class="tiny muted">${b.by}</span></td></tr>`; }).join('')}</table></details>`;
}

function copyResults() {
  const g = S.game; const head = ['Rank', 'Business', 'Student', 'Industry profile', 'Leadership style', 'Final status', 'Competitiveness /40', 'Efficiency /40', 'Board reports /20', 'Total /100', 'Parent business'];
  for (let r = 1; r <= g.totalRounds; r++) head.push(`R${r} action`, `R${r} because`, `R${r} score`);
  const rows = ranked().map((p, i) => {
    const row = [i + 1, p.name, p.first, prof(p).label + ' (' + prof(p).model + ')', styleLabel(p.style), p.status, p.score.comp, p.score.eff, p.score.board, p.score.total, p.parentId ? P(p.parentId).name : ''];
    for (let r = 1; r <= g.totalRounds; r++) { const lg = p.log.find((l) => l.round === r); row.push(lg ? lg.action : '', lg ? lg.because : '', p.boards[r] ? p.boards[r].score : ''); }
    return row;
  });
  const tsv = [head, ...rows].map((r) => r.map((c) => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
  const done = () => toast('Results copied. Paste into your markbook.');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(tsv).then(done, () => fallbackCopy(tsv, done)); else fallbackCopy(tsv, done);
}
function fallbackCopy(t, done) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed', true); } a.remove(); }

// ---------- printable reflection ----------
const QUESTIONS = [
  ['Part A Q1', 'Explain', 'Explain two challenges of the maturity stage of the business life cycle that your business faced in the game. Use examples from your decision log.', 9],
  ['Part A Q2', 'Explain', 'Explain the relationship between your leadership style and the expansion strategy you used, and how this affected your business\'s competitiveness.', 9],
  ['Part B Q1', 'Describe', 'Describe your business\'s situation at the end of the game using key indicators from your data.', 7],
  ['Part B Q2', 'Describe', 'Describe one macro environmental factor from the event cards and how it affected your business\'s human resource practices.', 7],
  ['Part C', 'Analyse', 'Complete a SWOT analysis (strengths, weaknesses, opportunities, threats) of your human resource data. Identify one relationship and one trend in the data and analyse their implications for your business\'s competitiveness.', 8],
  ['Part C', 'Evaluate', 'Evaluate ONE human resource strategy you used, using competitiveness and efficiency criteria. Make a decision about the strategy and a recommendation for your business.', 13],
];
function reflectionHTML(p) {
  const pr = prof(p); const parent = p.parentId && P(p.parentId); const subs = players().filter((x) => x.parentId === p.id);
  const verbQ = ([part, verb, text, n]) => `<div class="q"><h3>${part} · <span class="verb ${verb}">${verb}</span></h3><div>*** ${esc(text).replace(verb, `<span class="verb ${verb}">${verb}</span>`)}</div>
    ${verb === 'Analyse' ? '<div class="swotp" style="margin-top:4px"><div>Strengths</div><div>Weaknesses</div><div>Opportunities</div><div>Threats</div></div>' : ''}<div class="lines" style="height:${n * 7.6}mm"></div></div>`;
  return `<div class="ref"><h1>Mature Market reflection: ${esc(p.name)}</h1>
  <div class="small">Student: ${esc(p.first)} · Industry profile: ${esc(pr.label)} (modelled on ${esc(pr.model)}) · Leadership style: ${esc(styleLabel(p.style))}${p.styleSwitched ? ' (switched during the game)' : ''} · Final status: <b>${{ growth: 'Growth or renewal', stagnation: 'Stagnation', decline: 'Decline' }[p.status]}</b> · Score: <b>${p.score.total}/100</b> (competitiveness ${p.score.comp}/40, efficiency ${p.score.eff}/40, board reports ${p.score.board}/20)${parent ? ` · Subsidiary of ${esc(parent.name)}` : ''}${subs.length ? ` · Parent of ${subs.map((x) => esc(x.name)).join(', ')}` : ''}</div>
  <div class="small">Strength: ${esc(pr.strength)} · Weakness: ${esc(pr.weakness)} · Why I chose my style: "${esc(p.styleBecause)}"</div>
  <h3 style="margin:8px 0 2px">Human resource key indicators, rounds 0 to ${p.history.length - 1}</h3>${dataTable(p.history)}
  <h3 style="margin:8px 0 2px">Events that hit my business</h3><table><tr><th>Round</th><th>Event</th><th>Factor</th><th>Effect on me</th></tr>${p.events.map((e) => `<tr><td>${e.round}</td><td>${esc(e.title)}</td><td>${esc(factor(e.type))}</td><td>${esc(e.note || 'Affected the whole market')}</td></tr>`).join('')}</table>
  <h3 style="margin:8px 0 2px">Decision log</h3><table><tr><th>Round</th><th>Action</th><th>Because (board report)</th><th>Result</th><th>Status</th></tr>${p.log.map((l) => `<tr><td>${l.round}</td><td>${esc(l.action)}</td><td>${esc(l.because)}</td><td>${esc(l.result)}</td><td>${l.status || ''}</td></tr>`).join('')}</table>
  <p class="tiny">${FOOT}</p>
  <h2 style="margin-top:10px;font-size:13pt">Reflection questions</h2><p class="small">Use your own data above. Verb colours: <span class="verb Describe">Describe</span> <span class="verb Explain">Explain</span> <span class="verb Analyse">Analyse</span> <span class="verb Evaluate">Evaluate</span></p>
  ${QUESTIONS.map(verbQ).join('')}</div>`;
}
function printPlayers(list) { $('#print').innerHTML = list.map(reflectionHTML).join(''); setTimeout(() => window.print(), 50); }

// ---------- events ----------
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) S.ui[k] = e.target.value; });
document.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) { S.ui[k] = e.target.value; if (['dtype', 'brRound', 'action'].includes(k)) render(); } });

const ACT = {
  async goJoin() { const code = String(v('joincode')).trim().toUpperCase(); if (!code) return toast('Type the game code.', true); try { await api('check', { code }); } catch (e) { return toast(e.message, true); } S.role = 'player'; S.code = code; S.pid = null; save(); connect(); },
  pickProfile(d) { S.ui.profile = d.id; render(); },
  async join() { const j = await run('join', { first: v('first'), name: v('bizname'), profileId: v('profile') }); if (j) { S.pid = j.pid; save(); render(); } },
  leave() { S.role = null; S.code = null; S.pid = null; S.game = null; save(); disconnect(); render(); },
  pickStyle(d) { S.ui.style = d.id; render(); },
  async setStyle() { const j = await run('style', { style: v('style'), because: v('stylebecause') }); if (j) { S.ui.restyling = false; render(); } },
  restyle() { const p = me(); S.ui.style = p.style; S.ui.stylebecause = p.styleBecause; S.ui.restyling = true; render(); },
  pickAction(d) { S.ui.action = d.id; render(); },
  async decide() {
    const a = v('action'); if (!a) return toast('Pick an action first.', true);
    const params = {}; const others = players().filter((x) => x.id !== S.pid);
    if (a === 'poach') params.target = v('ptarget', others[0] && others[0].id);
    if (a === 'takeover') { const t = others.filter((x) => x.takeoverTarget); params.target = v('ttarget', t[0] && t[0].id); }
    if (a === 'loan') params.amount = Number(v('amount', 10));
    if (a === 'switch') params.style = v('newstyle', 'transformational');
    const j = await run('decide', { action: a, params, because: v('because') }); if (j) toast('Decision locked in.');
  },
  async undecide() { const p = me(); if (p.decision) { S.ui.action = p.decision.action; S.ui.because = p.decision.because; } await run('undecide'); },
  async sendDeal() {
    const type = v('dtype', 'jv'); const terms = {}; for (const [k, , , def] of TERM_FIELDS[type]) terms[k] = v('t_' + k, def);
    const others = players().filter((x) => x.id !== S.pid);
    const j = await run('deal_send', { type, to: v('dto', others[0] && others[0].id), terms, counterOf: S.ui.counterOf || null });
    if (j) { if (!j.note) toast('Offer sent.'); S.ui.counterOf = null; render(); }
  },
  async accept(d) { const j = await run('deal_respond', { dealId: d.id, response: 'accept' }); if (j && !j.note) toast('Deal accepted.'); },
  async reject(d) { await run('deal_respond', { dealId: d.id, response: 'reject' }); },
  counter(d) {
    const deal = S.game.deals.find((x) => x.id === d.id); if (!deal) return; const t = deal.terms;
    S.ui.counterOf = deal.id; S.ui.dtype = deal.type; S.ui.dto = deal.from;
    const role = (pid) => (pid === S.pid ? 'me' : 'them');
    if (deal.type === 'jv') { S.ui.t_costShare = String(100 - t.costShare); S.ui.t_profitShare = String(100 - t.profitShare); S.ui.t_rounds = String(t.rounds); }
    if (deal.type === 'alliance') S.ui.t_kind = t.kind;
    if (deal.type === 'licensing') { S.ui.t_licensor = role(t.licensor); S.ui.t_fee = String(t.fee); S.ui.t_rounds = String(t.rounds); }
    if (deal.type === 'franchising') { S.ui.t_franchisor = role(t.franchisor); S.ui.t_fee = String(t.fee); S.ui.t_revShare = String(t.revShare); }
    if (deal.type === 'loan') { S.ui.t_lender = role(t.lender); S.ui.t_amount = String(t.amount); S.ui.t_rate = String(t.rate); S.ui.t_rounds = String(t.rounds); }
    if (deal.type === 'staff') { S.ui.t_seller = role(t.seller); S.ui.t_n = String(t.n); S.ui.t_price = String(t.price); }
    render(); toast('Change the terms, then press Send offer.');
  },
  cancelCounter() { S.ui.counterOf = null; render(); },
  async approve(d) { await run('approve', { approvalId: d.id, yes: d.yes === '1' }); },
  async swot() { const j = await run('swot_request'); if (j) { S.ui.rel = ''; S.ui.trend = ''; } },
  sortTile(d) { const sw = me().swot; const key = 'swot_' + sw.tiles.map((t) => t.id).join(''); const s = S.ui[key] || (S.ui[key] = {}); s[d.id] = s[d.id] === d.c ? undefined : d.c; render(); },
  async swotSubmit() {
    const sw = me().swot; const key = 'swot_' + sw.tiles.map((t) => t.id).join(''); const sort = S.ui[key] || {};
    const left = sw.tiles.filter((t) => !sort[t.id]).length;
    if (left) return toast(`Sort every tile first: ${left} still to place.`, true);
    const words = (x) => String(x).trim().split(/\s+/).filter(Boolean).length;
    if (words(v('rel')) < 3) return toast('Write your relationship as a short sentence.', true);
    if (words(v('trend')) < 3) return toast('Write your trend as a short sentence.', true);
    await run('swot_submit', { sort, relationship: v('rel'), trend: v('trend') });
  },
  async swotRetry() { await run('swot_retry'); },
  printMe() { printPlayers([me()]); },
  // teacher
  async create() { const pin = String(v('newpin')).trim(); try { const j = await api('create', { pin }); S.code = j.code; S.pin = pin; S.role = 'teacher'; save(); connect(); } catch (e) { toast(e.message, true); } },
  async tlogin() { const code = String(v('tcode')).trim().toUpperCase(); const pin = String(v('tpin')).trim(); try { await api('tlogin', { code, pin }); S.code = code; S.pin = pin; save(); connect(); } catch (e) { toast(e.message, true); } },
  async tNext() { if (S.game.phase === 'debrief' && S.game.round >= S.game.totalRounds && !confirm('Show the final results and end the game?')) return; await run('t_next'); },
  async tStart() { await run('t_start'); },
  async tPause() { await run('t_pause'); },
  async tTime() { await run('t_time', { seconds: 30 }); },
  async tUndo() { if (confirm(`Undo round ${S.game.round}? Every business goes back to how it was before this round's event card.`)) await run('t_undo'); },
  async tEnd() { if (confirm('End the game now and show final results?')) await run('t_end'); },
  async tPick() { await run('t_pick', { eventId: v('pick', 'random') }); toast('Next event card set.'); },
  async tSwot(d) { await run('t_swot', { pid: d.id, approve: d.yes === '1' }); },
  async tScore(d) { await run('t_score', { pid: d.id, round: Number(d.r), score: Number(d.s) }); },
  async tRemove(d) { if (confirm('Remove this business?')) await run('t_remove', { pid: d.id }); },
  tCopy() { copyResults(); },
  tPrintAll() { printPlayers(ranked()); },
  tNew() { if (confirm('Start a brand-new game with a new code? This game stays open until you close the page.')) { S.game = null; S.code = null; disconnect(); save(); render(); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (fn) { e.preventDefault(); fn(el.dataset); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'f_joincode') ACT.goJoin(); });
// drag and drop for SWOT tiles
document.addEventListener('dragstart', (e) => { const t = e.target.closest && e.target.closest('[data-tile]'); if (t) { S.dragging = true; e.dataTransfer.setData('text/plain', t.dataset.tile); } });
document.addEventListener('dragend', () => { if (S.dragging) { S.dragging = false; render(); } });
document.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('[data-drop]')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  const box = e.target.closest && e.target.closest('[data-drop]'); if (!box) return; e.preventDefault();
  const id = e.dataTransfer.getData('text/plain'); const sw = me() && me().swot; if (!sw) return;
  const key = 'swot_' + sw.tiles.map((t) => t.id).join(''); const s = S.ui[key] || (S.ui[key] = {});
  s[id] = box.dataset.drop || undefined; S.dragging = false; render();
});

// ---------- start ----------
(async function start() {
  load();
  const qs = new URLSearchParams(location.search);
  if (qs.has('teacher')) { if (S.role !== 'teacher') { S.role = 'teacher'; S.code = null; S.pin = null; } }
  else if (S.role === 'teacher') { S.role = null; S.code = null; }
  if (qs.get('code')) S.ui.joincode = qs.get('code').toUpperCase();
  try { S.meta = await (await fetch('/api/meta')).json(); } catch (e) { $('#app').innerHTML = '<p class="pad">Could not load the game. Refresh the page.</p>'; return; }
  if (S.code) { try { await api('check', { code: S.code }); connect(); } catch (e) { S.code = null; S.pid = null; if (S.role === 'player') S.role = null; save(); } }
  render();
})();
