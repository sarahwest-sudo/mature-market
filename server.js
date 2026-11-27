'use strict';
// Mature Market server: static files + JSON API + live updates (Server-Sent Events).
// No dependencies. Run: node server.js   (Render: Start Command "node server.js")
const http = require('http');
const fs = require('fs');
const path = require('path');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const TEACHER_PIN = process.env.TEACHER_PIN || '';

const games = new Map();      // code -> game
const streams = new Map();    // code -> Set(res)
const snaps = new Map();      // code -> { [round]: json }
const swotKeys = new Map();   // code:pid -> { tileId: key }
const claudeOn = () => !!API_KEY;

// ---------- live updates ----------
const pending = new Set();
function broadcast(g) {
  if (pending.has(g.code)) return;
  pending.add(g.code);
  setImmediate(() => {
    pending.delete(g.code);
    const set = streams.get(g.code); if (!set) return;
    const data = `data: ${JSON.stringify(G.publicState(g, { claude: claudeOn() }))}\n\n`;
    for (const res of set) res.write(data);
  });
}
setInterval(() => { for (const set of streams.values()) for (const res of set) res.write(': ping\n\n'); }, 20000);
// Games last one lesson: clear anything older than 12 hours.
setInterval(() => { const cut = Date.now() - 12 * 3600e3; for (const [c, g] of games) if (g.created < cut) { games.delete(c); snaps.delete(c); } }, 3600e3);

// ---------- Claude ----------
async function askClaude(prompt, maxTokens = 800) {
  if (!API_KEY) throw new Error('no key');
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error('Claude HTTP ' + r.status);
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON');
    return JSON.parse(m[0]);
  } finally { clearTimeout(to); }
}

async function scoreBoardReports(g, round) {
  if (!claudeOn()) return;
  const items = G.list(g).map((p) => {
    const lg = p.log.find((l) => l.round === round);
    const h = p.history[p.history.length - 2] || {};
    return { id: p.id, action: lg ? lg.action : 'none', because: lg ? lg.because : '', data: `turnover ${h.turnover}%, satisfaction ${h.sat}/10, productivity $${h.productivity}k, absenteeism ${h.absent}%, profit $${h.profit}m, market share ${h.share}%, cash $${h.cash}m` };
  }).filter((x) => x.because);
  if (!items.length) return;
  const prompt = `You are marking Year 11 Business "board report" sentences from a classroom business game about human resource management in the maturity stage.
Score each sentence 0, 1 or 2:
2 = names the action AND gives a business reason linked to the business's data (a number, indicator or trend).
1 = names the action or gives a reason, but the reason is vague or not linked to data.
0 = missing, off-topic or no reason.
Be fair and consistent. Each item shows the action chosen, the sentence and the business's data before the decision.
Items: ${JSON.stringify(items)}
Reply with JSON only: {"scores":[{"id":"...","score":0}]}`;
  try {
    const out = await askClaude(prompt, 1500);
    for (const s of out.scores || []) {
      const p = g.players[s.id]; if (!p || !p.boards[round] || p.boards[round].by === 'teacher') continue;
      p.boards[round] = { score: Math.max(0, Math.min(2, Math.round(Number(s.score) || 0))), by: 'claude' };
    }
    broadcast(g);
  } catch (e) { console.log('Board scoring fell back to automatic scores:', e.message); }
}

async function checkSwot(g, p, sub, correct, total) {
  const key = swotKeys.get(`${g.code}:${p.id}`) || {};
  const tiles = p.swot.tiles.map((t) => ({ text: t.text, studentPut: sub.sort[t.id] || 'unsorted', consultantKey: key[t.id] }));
  const prompt = `You check a Year 11 Business student's SWOT analysis of their own human resource data in a classroom game.
Their data by round (round 0 is the start): ${JSON.stringify(p.history)}
Their tile sort (${correct}/${total} match the consultant key; a different placement can still be reasonable if justified by the data): ${JSON.stringify(tiles)}
Relationship they identified: "${sub.relationship}"
Trend they identified: "${sub.trend}"
A sound answer: the sort is mostly reasonable, the relationship links two indicators (e.g. satisfaction and turnover) and the trend describes a change over time using the data.
Reply with JSON only: {"sound":true,"feedback":"one or two short sentences of feedback written to the student"}`;
  try {
    const out = await askClaude(prompt, 400);
    p.swot.result = { status: out.sound ? 'passed' : 'not yet', feedback: String(out.feedback || '').slice(0, 400), by: 'claude' };
    if (out.sound) p.insight = true;
  } catch (e) {
    p.swot.result = { status: 'pending', feedback: 'Your teacher will check this on the teacher screen.', by: 'teacher' };
    g.swotPending.push(p.id);
  }
  broadcast(g);
}

// ---------- helpers ----------
function makeCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (games.has(c));
  return c;
}
function getGame(code) { const g = games.get(String(code || '').toUpperCase()); if (!g) throw new Error('No game with that code. Check the code on the projector.'); return g; }
function teacher(b) { const g = getGame(b.code); if (String(b.pin) !== g.pin) throw new Error('Wrong teacher PIN.'); return g; }
function player(b) { const g = getGame(b.code); const p = g.players[b.pid]; if (!p) throw new Error('Player not found. Join again.'); return { g, p }; }
function setTimer(g, phase) { const s = G.PHASE_SECONDS[phase] || 0; g.timer = { endsAt: Date.now() + s * 1000, remaining: null, total: s }; }
function notPaused(g) { if (g.paused) throw new Error('The game is paused.'); }

// ---------- commands ----------
const cmds = {
  // teacher
  create(b) {
    const pin = String(b.pin || '').trim();
    if (TEACHER_PIN && pin !== TEACHER_PIN) throw new Error('Wrong teacher PIN.');
    if (pin.length < 4) throw new Error('Choose a PIN of at least 4 characters.');
    const g = G.newGame(makeCode(), pin); games.set(g.code, g); snaps.set(g.code, {});
    return { code: g.code };
  },
  tlogin(b) { teacher(b); return {}; },
  check(b) { const g = getGame(b.code); return { code: g.code }; },
  t_next(b) {
    const g = teacher(b);
    if (g.phase === 'over') throw new Error('The game is over.');
    if (g.phase === 'lobby' || (g.phase === 'debrief' && g.round < G.TOTAL_ROUNDS)) {
      if (g.phase === 'lobby') G.startGame(g);
      snaps.get(g.code)[g.round + 1] = JSON.stringify(g);
      g.round += 1; g.phase = 'event'; g.debrief = null;
      g.deals.forEach((d) => { if (d.status === 'open') d.status = 'expired'; });
      G.drawEvent(g);
    } else if (g.phase === 'debrief') {
      g.phase = 'over';
    } else {
      const i = G.PHASES.indexOf(g.phase); const nextPhase = G.PHASES[i + 1];
      if (g.phase === 'deal') g.deals.forEach((d) => { if (d.status === 'open') d.status = 'expired'; });
      g.phase = nextPhase;
      if (nextPhase === 'resolve') { G.resolve(g); g.lastRound = g.round; scoreBoardReports(g, g.round); }
    }
    setTimer(g, g.phase);
    return {};
  },
  t_pause(b) {
    const g = teacher(b);
    if (!g.paused) { g.paused = true; g.timer.remaining = Math.max(0, g.timer.endsAt - Date.now()); }
    else { g.paused = false; g.timer.endsAt = Date.now() + (g.timer.remaining || 0); g.timer.remaining = null; }
    return {};
  },
  t_time(b) { const g = teacher(b); const s = Number(b.seconds) || 30; if (g.paused) g.timer.remaining = Math.max(0, (g.timer.remaining || 0) + s * 1000); else g.timer.endsAt = Math.max(Date.now(), g.timer.endsAt) + s * 1000; return {}; },
  t_undo(b) {
    const g = teacher(b);
    const s = snaps.get(g.code); const snap = s && s[g.round];
    if (!snap) throw new Error('Nothing to undo yet.');
    const restored = JSON.parse(snap); delete s[g.round];
    restored.phase = restored.round === 0 ? 'lobby' : 'debrief';
    restored.feed.unshift({ round: restored.round, text: `Teacher undid round ${g.round}` });
    games.set(g.code, restored); setTimer(restored, restored.phase);
    broadcast(restored);
    return {};
  },
  t_end(b) { const g = teacher(b); g.phase = 'over'; g.paused = false; setTimer(g, 'over'); return {}; },
  t_pick(b) { const g = teacher(b); g.nextPick = b.eventId === 'random' || g.deck.includes(b.eventId) ? b.eventId : 'random'; return {}; },
  t_swot(b) {
    const g = teacher(b); const p = g.players[b.pid]; if (!p || !p.swot) throw new Error('No SWOT to check.');
    g.swotPending = g.swotPending.filter((x) => x !== p.id);
    p.swot.result = { status: b.approve ? 'passed' : 'not yet', feedback: b.approve ? 'Approved by your teacher.' : 'Not yet: your teacher wants a clearer relationship or trend.', by: 'teacher' };
    if (b.approve) p.insight = true;
    return {};
  },
  t_score(b) { const g = teacher(b); const p = g.players[b.pid]; if (!p) throw new Error('No player.'); p.boards[b.round] = { score: Math.max(0, Math.min(2, Number(b.score) || 0)), by: 'teacher' }; return {}; },
  t_remove(b) { const g = teacher(b); if (g.phase !== 'lobby') throw new Error('Players can only be removed before the game starts.'); delete g.players[b.pid]; g.order = g.order.filter((x) => x !== b.pid); return {}; },

  // player
  join(b) { const g = getGame(b.code); const p = G.addPlayer(g, b); return { pid: p.id, code: g.code }; },
  style(b) { const { g, p } = player(b); G.setStyle(g, p, b.style, b.because); return {}; },
  decide(b) {
    const { g, p } = player(b); notPaused(g);
    if (g.phase !== 'decide') throw new Error('Decisions are made in the Decide phase.');
    const because = String(b.because || '').trim();
    if (because.split(/\s+/).length < 4) throw new Error('Write your "because" board report (one full sentence) to lock in.');
    const params = b.params || {};
    G.validateDecision(g, p, b.action, params);
    g.approvals = g.approvals.filter((a) => !(a.kind === 'action' && a.subId === p.id));
    const a = G.actionOf(b.action);
    const needs = !!(p.parentId && a.restricted);
    p.decision = { action: b.action, params, because: because.slice(0, 400), needsApproval: needs, approved: false };
    if (needs) g.approvals.push({ id: G.uid(), kind: 'action', subId: p.id, parentId: p.parentId, text: `${p.name} wants to: ${a.label}` });
    return {};
  },
  undecide(b) { const { g, p } = player(b); if (g.phase !== 'decide') throw new Error('Too late to change.'); p.decision = null; g.approvals = g.approvals.filter((a) => !(a.kind === 'action' && a.subId === p.id)); return {}; },
  deal_send(b) {
    const { g, p } = player(b); notPaused(g);
    if (p.parentId) {
      const d = { type: b.type, to: b.to, terms: b.terms, counterOf: b.counterOf };
      if (g.phase !== 'deal') throw new Error('Deals can only be sent in the deal window.');
      g.approvals.push({ id: G.uid(), kind: 'deal_send', subId: p.id, parentId: p.parentId, payload: d, text: `${p.name} wants to send a ${G.DEAL_TYPES[b.type] || 'deal'} offer to ${(g.players[b.to] || {}).name}` });
      return { note: 'Sent to your parent business for approval.' };
    }
    G.sendDeal(g, p, b.to, b.type, b.terms, b.counterOf); return {};
  },
  deal_respond(b) {
    const { g, p } = player(b); notPaused(g);
    const d = g.deals.find((x) => x.id === b.dealId);
    if (!d || d.to !== p.id || d.status !== 'open') throw new Error('That deal is no longer open.');
    if (b.response === 'reject') { d.status = 'rejected'; return {}; }
    if (p.parentId) {
      g.approvals.push({ id: G.uid(), kind: 'deal_accept', subId: p.id, parentId: p.parentId, payload: { dealId: d.id }, text: `${p.name} wants to accept: ${d.text}` });
      return { note: 'Sent to your parent business for approval.' };
    }
    G.acceptDeal(g, p, d); return {};
  },
  approve(b) {
    const { g, p } = player(b);
    const a = g.approvals.find((x) => x.id === b.approvalId && x.parentId === p.id);
    if (!a) throw new Error('That request has gone.');
    g.approvals = g.approvals.filter((x) => x !== a);
    const sub = g.players[a.subId]; if (!sub) return {};
    if (!b.yes) { sub.events.push({ round: g.round, title: 'Parent said no', type: 'Subsidiary', note: a.text }); return {}; }
    if (a.kind === 'action' && sub.decision) sub.decision.approved = true;
    if (a.kind === 'deal_send') G.sendDeal(g, sub, a.payload.to, a.payload.type, a.payload.terms, a.payload.counterOf);
    if (a.kind === 'deal_accept') G.acceptDeal(g, sub, g.deals.find((x) => x.id === a.payload.dealId));
    return {};
  },
  swot_request(b) {
    const { g, p } = player(b); notPaused(g);
    if (!['check', 'deal'].includes(g.phase)) throw new Error('Commission a SWOT in the Check or Deal phase.');
    if (p.swot && p.swot.round === g.round && !p.swot.result) throw new Error('Finish your current SWOT first.');
    const cost = p.swotsUsed === 0 ? 0 : 1;
    p.cash -= cost; p.swotsUsed += 1;
    const tiles = G.makeSwot(g, p);
    swotKeys.set(`${g.code}:${p.id}`, Object.fromEntries(tiles.map((t) => [t.id, t.key])));
    p.swot = { round: g.round, tiles: tiles.map(({ id, text }) => ({ id, text })), result: null };
    return {};
  },
  swot_submit(b) {
    const { g, p } = player(b);
    if (!p.swot || p.swot.result) throw new Error('No open SWOT.');
    const sort = b.sort || {}; const rel = String(b.relationship || '').trim(); const tr = String(b.trend || '').trim();
    if (p.swot.tiles.some((t) => !['S', 'W', 'O', 'T'].includes(sort[t.id]))) throw new Error('Sort every tile into Strengths, Weaknesses, Opportunities or Threats.');
    if (rel.split(/\s+/).length < 4 || tr.split(/\s+/).length < 4) throw new Error('Write one relationship and one trend (a sentence each).');
    const key = swotKeys.get(`${g.code}:${p.id}`) || {};
    const correct = p.swot.tiles.filter((t) => key[t.id] === sort[t.id]).length;
    p.swot.sort = sort; p.swot.relationship = rel.slice(0, 400); p.swot.trend = tr.slice(0, 400);
    p.swot.correct = correct; p.swot.total = p.swot.tiles.length;
    p.swot.key = key;
    if (claudeOn()) { p.swot.result = null; p.swot.checking = true; checkSwot(g, p, p.swot, correct, p.swot.total).finally(() => { p.swot.checking = false; broadcast(g); }); }
    else { p.swot.result = { status: 'pending', feedback: 'Your teacher will check this on the teacher screen.', by: 'teacher' }; g.swotPending.push(p.id); }
    return {};
  },
};

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/stream') {
    let g; try { g = getGame(url.searchParams.get('code')); } catch (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    if (!streams.has(g.code)) streams.set(g.code, new Set());
    streams.get(g.code).add(res);
    res.write(`data: ${JSON.stringify(G.publicState(g, { claude: claudeOn() }))}\n\n`);
    req.on('close', () => streams.get(g.code).delete(res));
    return;
  }
  if (url.pathname === '/api/meta') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ profiles: G.PROFILES.map(({ mods, ...p }) => p), styles: G.STYLES, actions: G.ACTIONS, events: G.EVENTS, dealTypes: G.DEAL_TYPES, steeple: G.STEEPLE, totalRounds: G.TOTAL_ROUNDS, phaseSeconds: G.PHASE_SECONDS }));
  }
  if (url.pathname.startsWith('/api/') && req.method === 'POST') {
    const name = url.pathname.slice(5);
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let out, status = 200;
      try {
        const b = JSON.parse(body || '{}');
        if (!cmds[name]) throw new Error('Unknown command');
        out = cmds[name](b) || {};
        const g = b.code && games.get(String(b.code).toUpperCase()); if (g) broadcast(g);
      } catch (e) { status = 400; out = { error: e.message }; }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  let file = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { fs.readFile(path.join(PUB, 'index.html'), (e2, d2) => { res.writeHead(e2 ? 404 : 200, { 'Content-Type': TYPES['.html'] }); res.end(d2 || 'Not found'); }); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`Mature Market running on port ${PORT}. Claude checking: ${claudeOn() ? 'on (' + MODEL + ')' : 'off (teacher fallback)'}`));
