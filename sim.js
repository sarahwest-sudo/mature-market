// Simulated class: 10 players, 6 rounds, random but sensible choices. Run: node sim.js [games]
const G = require('./game');
const games = Number(process.argv[2] || 200);
const tally = { growth: 0, stagnation: 0, decline: 0 }; let takeovers = 0, emerg = 0; const totals = [];
const styles = Object.keys(G.STYLES);
const pickA = ['hire','retrench','training','wellbeing','bonus','restructure','automate','poach','export','subsidiary','acquire','loan','share','hold','takeover'];
for (let n = 0; n < games; n++) {
  const g = G.newGame('TEST', '1');
  G.PROFILES.slice(0, 10).forEach((pr, i) => { const p = G.addPlayer(g, { first: 'P' + i, profileId: pr.id }); G.setStyle(g, p, styles[i % 4], 'because'); });
  G.startGame(g);
  for (let r = 1; r <= 6; r++) {
    g.round = r; g.phase = 'event'; G.drawEvent(g);
    const ps = G.list(g);
    g.phase = 'deal';
    if (Math.random() < 0.6) { const a = ps[Math.floor(Math.random()*10)], b = ps[Math.floor(Math.random()*10)]; if (a !== b) { try { const d = G.sendDeal(g, a, b.id, ['jv','alliance','licensing','franchising','loan','staff'][Math.floor(Math.random()*6)], {}); G.acceptDeal(g, b, d); } catch (e) {} } }
    for (const p of ps) {
      let a = pickA[Math.floor(Math.random() * pickA.length)]; const params = {};
      if (a === 'poach') params.target = ps.find(x => x !== p).id;
      if (a === 'loan') params.amount = 10;
      if (a === 'takeover') { const t = ps.find(x => x !== p && x.redStreak >= 2 && !x.parentId); if (!t || r < 3) a = 'hold'; else params.target = t.id; }
      p.decision = { action: a, params, because: 'We chose this because turnover was 15% and profit fell to 6' };
    }
    G.resolve(g);
  }
  for (const p of G.list(g)) { tally[p.status]++; if (p.parentId) takeovers++; if (p.loans.some(l => l.emergency)) emerg++; totals.push(G.scores(g, p).total); }
}
const N = games * 10;
console.log('Final status:', Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, (v / N * 100).toFixed(0) + '%'])));
console.log('Taken over:', (takeovers / N * 100).toFixed(1) + '%', ' emergency loans:', (emerg / N * 100).toFixed(1) + '%');
totals.sort((a,b)=>a-b); console.log('Score min/median/max', totals[0], totals[Math.floor(N/2)], totals[N-1]);
