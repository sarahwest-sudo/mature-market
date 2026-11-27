'use strict';
// Mature Market game engine. All state is plain data so it can be cloned for undo.

const TOTAL_ROUNDS = 6;
const PHASES = ['event', 'check', 'deal', 'decide', 'resolve', 'debrief'];
const PHASE_SECONDS = { lobby: 480, event: 60, check: 60, deal: 180, decide: 120, resolve: 60, debrief: 120, over: 0 };

const PROFILES = [
  { id: 'hardware', label: 'Hardware and home improvement', model: 'Bunnings', strength: 'Strong team culture (satisfaction starts higher)', weakness: 'Large wage bill', mods: { sat: 7, wageRate: 0.054 } },
  { id: 'supermarket', label: 'Supermarket', model: 'Coles', strength: 'Huge workforce and supply network', weakness: 'Low staff satisfaction in stores', mods: { pull: 1.04, sat: 5.3, discount: true } },
  { id: 'fastfood', label: 'Fast food', model: "McDonald's", strength: 'Very high labour productivity', weakness: 'High casual staff turnover', mods: { skill: 1.05, baseTurnover: 21, discount: true } },
  { id: 'softdrinks', label: 'Soft drinks', model: 'Coca-Cola', strength: 'Global brand, easy to license', weakness: 'Mature, flat home market', mods: { licensor: 1.5, home: 0.97, premium: true } },
  { id: 'electronics', label: 'Electronics retail', model: 'JB Hi-Fi', strength: 'Expert staff, strong service', weakness: 'Training costs high', mods: { skill: 1.03, trainCost: 1.5, premium: true } },
  { id: 'pizza', label: 'Pizza delivery', model: "Domino's", strength: 'Fast, efficient processes', weakness: 'Franchisee and wage pressure', mods: { costFactor: 0.95, wageCreep: 0.012, discount: true } },
  { id: 'airline', label: 'Airline', model: 'Qantas', strength: 'Strong brand, skilled workforce', weakness: 'Industrial relations risk', mods: { rep: 0.03, irRisk: 0.2, premium: true } },
  { id: 'pharmacy', label: 'Discount pharmacy', model: 'Chemist Warehouse', strength: 'Low-cost model', weakness: 'Pharmacist shortages', mods: { costFactor: 0.94, hireCost: 1.5, baseTurnover: 18, discount: true } },
  { id: 'coffee', label: 'Coffee chain', model: 'Starbucks', strength: 'Strong customer experience', weakness: 'Struggled in Australia before', mods: { rep: 0.04, home: 0.95, premium: true } },
  { id: 'furniture', label: 'Furniture and appliances', model: 'Harvey Norman', strength: 'Franchise model already in place', weakness: 'Ageing store formats', mods: { franchisor: 1.5, repDrift: -0.012 } },
  { id: 'burgers', label: 'Burgers', model: "Hungry Jack's", strength: 'Loyal customers', weakness: 'Fierce fast-food rivalry', mods: { rep: 0.03, loyal: true, costFactor: 1.03, discount: true } },
  { id: 'department', label: 'Department store', model: 'Myer', strength: 'Well-known brand', weakness: 'Long-term decline risk', mods: { rep: 0.03, repDrift: -0.015, premium: true } },
];
const profileOf = (p) => PROFILES.find((x) => x.id === p.profileId);

const STYLES = {
  transformational: { label: 'Transformational', good: 'Joint ventures, alliances, new markets and training work better; satisfaction rises', bad: 'Costs a little more each round; weaker on cost-cutting' },
  transactional: { label: 'Transactional', good: 'Bonus schemes and hiring pay off fast; productivity up', bad: 'Retrenchments push turnover up more; innovation events hit harder' },
  bureaucratic: { label: 'Bureaucratic', good: 'Lower cost per employee; legal and compliance events do no harm', bad: 'New markets take one extra round to pay off; satisfaction drifts down' },
  situational: { label: 'Situational', good: 'Can switch style once per game to fit the moment', bad: "The switch uses up that round's main action" },
};

const ACTIONS = [
  { id: 'hire', group: 'Human resource actions', label: 'Hire staff (+100)', cost: 6, effect: 'More capacity, customer pull up', risk: 'Wage bill up; productivity dips for a round' },
  { id: 'retrench', group: 'Human resource actions', label: 'Retrench staff (−100)', cost: 2, effect: 'Wage bill down, efficiency up', risk: 'Satisfaction and customer pull drop; turnover up' },
  { id: 'training', group: 'Human resource actions', label: 'Training and upskilling', cost: 3, effect: 'Productivity up next round', risk: 'Slow payoff' },
  { id: 'wellbeing', group: 'Human resource actions', label: 'Wellbeing and flexible work', cost: 2, effect: 'Absenteeism and turnover down', risk: 'Small cost ($0.5m) every round after' },
  { id: 'bonus', group: 'Human resource actions', label: 'Performance bonus scheme', cost: 3, effect: 'Productivity up now', risk: 'Costs $1m a round; satisfaction falls if bonuses are cut (they are cut if cash runs out)' },
  { id: 'restructure', group: 'Human resource actions', label: 'Restructure (flatter structure)', cost: 2, effect: 'Cost per employee down', risk: 'Satisfaction dips for a round' },
  { id: 'automate', group: 'Human resource actions', label: 'Automate', cost: 8, effect: 'Productivity jumps', risk: 'Must retrench 50 staff; satisfaction drops' },
  { id: 'poach', group: 'Human resource actions', label: 'Poach talent from a rival', cost: 3, effect: 'Take 30 staff and their skills', risk: "Fails if the rival's satisfaction is 7 or more", param: 'target' },
  { id: 'export', group: 'Expansion and modes of entry', label: 'Exporting', cost: 4, effect: 'Small new revenue from next round', risk: 'Low cost, low control', restricted: true },
  { id: 'subsidiary', group: 'Expansion and modes of entry', label: 'Set up a wholly owned subsidiary (direct investment)', cost: 15, effect: 'Large new revenue after 2 rounds', risk: 'Full control, highest risk (results vary most)', restricted: true },
  { id: 'acquire', group: 'Expansion and modes of entry', label: 'Acquire a small rival (computer-run business)', cost: 12, effect: 'Instant staff (+150) and revenue', risk: 'Culture clash: satisfaction dips', restricted: true },
  { id: 'takeover', group: 'Expansion and modes of entry', label: "Take over a classmate's business in decline", cost: null, effect: 'Gain a subsidiary: half its profit comes to you each round', risk: 'Price is its market value; only from round 3; target must have 2 red badges in a row', param: 'takeover', restricted: true },
  { id: 'loan', group: 'Financing', label: 'Bank loan', cost: 0, effect: 'Cash now', risk: 'Interest every round; high debt raises takeover risk', param: 'amount', restricted: true },
  { id: 'share', group: 'Financing', label: 'Share issue ($10m)', cost: 0, effect: 'Cash now, no interest', risk: 'Lowers final competitiveness score slightly (owners diluted)', restricted: true },
  { id: 'hold', group: 'Financing', label: 'Retained profits (hold steady)', cost: 0, effect: 'Use your own cash; no new spending', risk: 'Nothing new to grow the business' },
  { id: 'switch', group: 'Leadership', label: 'Switch leadership style (situational leaders, once)', cost: 0, effect: 'Change style to fit the moment', risk: "Uses up this round's main action", param: 'style' },
  { id: 'buyback', group: 'Subsidiary', label: 'Management buyout (buy your business back)', cost: null, effect: 'Become independent again', risk: 'Costs the takeover price plus 10%' },
];
const actionOf = (id) => ACTIONS.find((a) => a.id === id);

const STEEPLE = 'STEEPLE (Social, Technological, Economic, Environmental, Political, Legal, Ethical)';
const EVENTS = [
  { id: 'min_wage', title: 'Minimum wage rise (Fair Work annual wage review)', type: 'Economic', text: 'Wage costs rise 4% for every business.', hits: 'Large workforces', q: 'How does a higher wage bill change your staffing plans?' },
  { id: 'rates_rise', title: 'Interest rates rise', type: 'Economic', text: 'Loan interest rises 2 points and the market shrinks 1%.', hits: 'Businesses with high debt', q: 'Can you still afford to grow your workforce?' },
  { id: 'rates_cut', title: 'Interest rates cut', type: 'Economic', mild: true, text: 'Loan interest falls 1 point and shoppers spend a little more.', hits: 'Everyone (a gentle start)', q: 'What would you do with cheaper borrowing: hire, train or expand?' },
  { id: 'disconnect', title: 'Right to disconnect law', type: 'Legal', text: 'After-hours work is cut. Productivity dips unless you have restructured (bureaucratic leaders are safe).', hits: 'Low-satisfaction businesses', q: 'How does this law change how you organise your staff?' },
  { id: 'safety', title: 'Workplace safety crackdown', type: 'Legal', text: 'A $3m fine for any business that has not trained its staff this game (bureaucratic leaders are safe).', hits: 'Businesses that never trained', q: 'What does this tell you about training as a human resource strategy?' },
  { id: 'visa', title: 'Skilled visa caps tightened', type: 'Political', text: 'Hiring costs 50% more this round and next.', hits: 'Anyone expanding', q: 'How will you find the staff you need?' },
  { id: 'subsidy', title: 'Government training subsidy', type: 'Political', mild: true, text: 'Training costs half price this round.', hits: 'Everyone (an opportunity)', q: 'Is this the round to invest in your people?' },
  { id: 'genz', title: 'Gen Z want flexibility', type: 'Social', text: 'Turnover rises 4 points unless you have wellbeing and flexible work in place.', hits: 'Transactional leaders', q: 'How will you keep your younger staff?' },
  { id: 'col', title: 'Cost-of-living squeeze', type: 'Social', text: 'Shoppers switch to cheaper brands: premium brands lose customer pull, discount brands gain.', hits: 'Premium brands', q: 'How does this change the staff and service your customers want?' },
  { id: 'ai', title: 'AI and automation arrive', type: 'Technological', text: 'Automating costs half this round. Businesses that have not automated or trained lately lose some productivity.', hits: 'Businesses that ignore it', q: 'Will you automate, train, or wait? What happens to your staff?' },
  { id: 'cyber', title: 'Cyber attack', type: 'Technological', text: 'One business (most likely one that never trained) loses this round of profit.', hits: 'Low-trained staff', q: 'How could training protect a business from this?' },
  { id: 'cyclone', title: 'Cyclone hits Queensland', type: 'Environmental', text: 'Sites close and absenteeism rises 3 points for this round for everyone.', hits: 'Everyone, a little', q: 'How do you support staff through a disaster?' },
  { id: 'scandal', title: 'Wage underpayment scandal', type: 'Ethical', text: 'One business (the highest-profit one is most likely) has its satisfaction and reputation crash.', hits: 'The highest-profit business', q: 'Why does paying staff correctly matter for competitiveness?' },
  { id: 'rival', title: 'Low-cost overseas rival arrives', type: 'Maturity challenge', text: 'The rival takes 5% of the market and everyone\'s reputation resets.', hits: 'Stagnating businesses', q: 'How can your people help you stand out from a cheaper rival?' },
  { id: 'saturation', title: 'Market saturation', type: 'Maturity challenge', text: 'The home market stops growing for 2 rounds.', hits: 'Anyone without new markets', q: 'Where will your growth come from now?' },
  { id: 'tastes', title: 'Tastes change', type: 'Maturity challenge', text: 'Customer pull falls unless you trained or automated in the last 2 rounds.', hits: 'Bureaucratic leaders', q: 'How do your staff need to change to keep up?' },
  { id: 'talentwar', title: 'Talent war', type: 'Market interaction', text: 'The highest-satisfaction business poaches 30 staff from the lowest.', hits: 'The lowest satisfaction', q: 'What makes staff stay with a business?' },
  { id: 'awards', title: 'Industry awards night', type: 'Market interaction', text: 'Best employer (lowest staff turnover) gets a reputation boost.', hits: 'Rewards the most efficient', q: 'Which of your human resource numbers would win you this award?' },
];
const eventOf = (id) => EVENTS.find((e) => e.id === id);
const factorLabel = (t) => (['Maturity challenge', 'Market interaction'].includes(t) ? t : `${STEEPLE.split(' (')[0]} factor: ${t}`);

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const list = (g) => g.order.map((id) => g.players[id]);
const swing = (w = 0.2) => 1 - w + Math.random() * 2 * w;
const uid = () => Math.random().toString(36).slice(2, 10);

function debt(g, p) {
  let d = p.loans.reduce((s, l) => s + l.principal, 0);
  for (const c of g.contracts) if (c.kind === 'loan' && c.from === p.id && c.remaining > 0) d += c.remaining;
  return d;
}
function marketValue(g, p) { return Math.max(5, Math.round(p.revenue * 0.25 + p.cash - debt(g, p))); }

function newGame(code, pin) {
  return {
    code, pin, created: Date.now(), phase: 'lobby', round: 0, paused: false,
    timer: { endsAt: Date.now() + PHASE_SECONDS.lobby * 1000, remaining: null, total: PHASE_SECONDS.lobby },
    market: { size: 0, growth: 0.015, baseRate: 0.06, saturatedUntil: 0 },
    mods: { visaUntil: 0, trainHalf: 0, automateHalf: 0 },
    players: {}, order: [], deals: [], contracts: [], approvals: [], feed: [],
    deck: EVENTS.map((e) => e.id), drawn: [], event: null, nextPick: 'random',
    debrief: null, swotPending: [], lastRound: null,
  };
}

function addPlayer(g, { first, name, profileId }) {
  if (g.phase !== 'lobby') throw new Error('The game has already started.');
  first = String(first || '').trim().slice(0, 20);
  name = String(name || '').trim().slice(0, 30) || `${first} Co.`;
  if (!first) throw new Error('Type your first name.');
  const prof = PROFILES.find((x) => x.id === profileId);
  if (!prof) throw new Error('Pick an industry profile.');
  if (list(g).some((p) => p.profileId === profileId)) throw new Error('That industry profile is taken. Pick another.');
  if (list(g).some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error('That business name is taken.');
  const m = prof.mods;
  const p = {
    id: uid(), first, name, profileId, style: null, styleBecause: '', styleSwitched: false,
    staff: 1000, sat: m.sat || 6, skill: m.skill || 1, rep: m.rep || 0, wageRate: m.wageRate || 0.05,
    costFactor: m.costFactor || 1, baseTurnover: m.baseTurnover || 15,
    cash: 20, loans: [{ principal: 10, emergency: false }],
    turnover: m.baseTurnover || 15, absent: 4, share: 0, revenue: 100, homeRev: 100, profit: 8, productivity: 100, cpe: 91,
    markets: [], alliances: [], delayed: [], temp: {},
    flags: { trainedEver: false, lastTrained: -9, wellbeing: false, bonus: false, restructured: false, automated: false, sharesIssued: 0 },
    history: [], status: 'stagnation', redStreak: 0, reason: '', parentId: null, buyPrice: 0,
    insight: false, swotsUsed: 0, swot: null, decision: null, log: [], dealRound: 0, emergency: false, events: [], boards: {},
  };
  g.players[p.id] = p; g.order.push(p.id);
  return p;
}

function setStyle(g, p, style, because) {
  if (!STYLES[style]) throw new Error('Pick a leadership style.');
  if (!String(because || '').trim()) throw new Error('Write one "because" sentence for your style.');
  if (g.phase !== 'lobby' && p.style) throw new Error('Your style is set. Situational leaders can switch once as an action.');
  p.style = style; p.styleBecause = String(because).trim().slice(0, 300);
}

function snapshotRow(g, p) {
  return {
    round: g.round, share: r1(p.share * 100), revenue: r1(p.revenue), profit: r1(p.profit), cash: r1(p.cash), debt: r1(debt(g, p)),
    staff: Math.round(p.staff), turnover: r1(p.turnover), absent: r1(p.absent), productivity: r1(p.productivity), sat: r1(p.sat), cpe: r1(p.cpe), status: p.status,
  };
}

function startGame(g) {
  const ps = list(g);
  if (ps.length < 2) throw new Error('At least 2 businesses need to join.');
  for (const p of ps) if (!p.style) { p.style = 'situational'; p.styleBecause = '(no style chosen; set to situational)'; }
  g.market.size = 100 * ps.length;
  for (const p of ps) { p.share = 1 / ps.length; p.history = [snapshotRow(g, p)]; }
}

// ---------- events ----------
function drawEvent(g) {
  let id = g.nextPick !== 'random' && g.deck.includes(g.nextPick) ? g.nextPick : null;
  if (!id) {
    const pool = g.round === 1 ? g.deck.filter((x) => eventOf(x).mild) : g.deck;
    id = pool[Math.floor(Math.random() * pool.length)];
  }
  g.nextPick = 'random';
  g.deck = g.deck.filter((x) => x !== id);
  g.drawn.push(id);
  g.event = id;
  applyEvent(g, eventOf(id));
}

function note(p, g, ev, text) { p.events.push({ round: g.round, id: ev.id, title: ev.title, type: ev.type, note: text || '' }); }

function pickWeighted(items, wfn) {
  const ws = items.map(wfn); const tot = ws.reduce((a, b) => a + b, 0);
  let x = Math.random() * tot;
  for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; }
  return items[items.length - 1];
}

function applyEvent(g, ev) {
  const ps = list(g); const r = g.round;
  const recent = (p) => r - p.flags.lastTrained <= 2 || p.flags.automated;
  const hit = new Map();
  switch (ev.id) {
    case 'min_wage': ps.forEach((p) => { p.wageRate *= 1.04; hit.set(p, `Wage bill up about $${r1(p.staff * p.wageRate * 0.04 / 1.04)}m a round`); }); break;
    case 'rates_rise': g.market.baseRate += 0.02; g.market.size *= 0.99; ps.forEach((p) => { if (debt(g, p) > 15) hit.set(p, 'High debt: interest bill up'); }); break;
    case 'rates_cut': g.market.baseRate = Math.max(0.02, g.market.baseRate - 0.01); g.market.size *= 1.01; break;
    case 'disconnect': ps.forEach((p) => { if (p.style === 'bureaucratic' || p.flags.restructured) { hit.set(p, 'No harm: already structured for it'); return; } const f = p.sat < 6 ? 0.95 : 0.97; p.skill *= f; hit.set(p, `Productivity down ${Math.round((1 - f) * 100)}%`); }); break;
    case 'safety': ps.forEach((p) => { if (p.style === 'bureaucratic' || p.flags.trainedEver) { hit.set(p, 'No fine: compliant'); return; } p.cash -= 3; hit.set(p, 'Fined $3m: no training this game'); }); break;
    case 'visa': g.mods.visaUntil = r + 1; break;
    case 'subsidy': g.mods.trainHalf = r; break;
    case 'genz': ps.forEach((p) => { if (p.flags.wellbeing) { hit.set(p, 'Flexible work in place: no effect'); return; } const add = p.style === 'transactional' ? 6 : 4; p.temp.turnover = (p.temp.turnover || 0) + add; hit.set(p, `Turnover pressure +${add} points`); }); break;
    case 'col': ps.forEach((p) => { const m = profileOf(p).mods; if (m.premium) { p.rep -= 0.04; hit.set(p, 'Premium brand: customers drift away'); } else if (m.discount) { p.rep += 0.03; hit.set(p, 'Discount brand: customers arrive'); } }); break;
    case 'ai': g.mods.automateHalf = r; ps.forEach((p) => { if (recent(p)) return; const f = p.style === 'transactional' ? 0.955 : 0.97; p.skill *= f; hit.set(p, 'Fell behind on technology: productivity down'); }); break;
    case 'cyber': { const v = pickWeighted(ps, (p) => (p.flags.trainedEver ? 1 : 3)); v.temp.cyber = true; hit.set(v, 'Hit by the attack: no profit this round'); g.feed.unshift({ round: r, text: `Cyber attack hits ${v.name}` }); break; }
    case 'cyclone': ps.forEach((p) => { p.temp.absent = (p.temp.absent || 0) + 3; p.sat -= 0.1; hit.set(p, 'Absenteeism up 3 points this round'); }); break;
    case 'scandal': { const sorted = [...ps].sort((a, b) => b.profit - a.profit); const v = pickWeighted(sorted, (p) => sorted.length - sorted.indexOf(p)); v.sat -= 1.5; v.rep -= 0.06; hit.set(v, 'Caught underpaying staff: satisfaction and reputation crash'); g.feed.unshift({ round: r, text: `Wage underpayment scandal hits ${v.name}` }); break; }
    case 'rival': g.market.size *= 0.95; ps.forEach((p) => { if (!profileOf(p).mods.loyal) p.rep = Math.min(p.rep, 0); if (p.status === 'stagnation') { p.rep -= 0.02; hit.set(p, 'Stagnating: hit hardest'); } }); break;
    case 'saturation': g.market.saturatedUntil = r + 1; break;
    case 'tastes': ps.forEach((p) => { if (recent(p)) { hit.set(p, 'Recently trained or automated: kept up'); return; } const f = p.style === 'bureaucratic' || p.style === 'transactional' ? 1.5 : 1; p.rep -= 0.04 * f; hit.set(p, 'Customer pull down'); }); break;
    case 'talentwar': { const s = [...ps].sort((a, b) => b.sat - a.sat); const hi = s[0], lo = s[s.length - 1]; if (hi !== lo && hi.sat > lo.sat) { const n = Math.min(30, lo.staff - 200); hi.staff += n; lo.staff -= n; hit.set(hi, `Poached ${n} staff`); hit.set(lo, `Lost ${n} staff to ${hi.name}`); g.feed.unshift({ round: r, text: `${hi.name} poached ${n} staff from ${lo.name}` }); } break; }
    case 'awards': { const w = [...ps].sort((a, b) => a.turnover - b.turnover)[0]; w.rep += 0.05; hit.set(w, 'Won best employer: reputation up'); g.feed.unshift({ round: r, text: `${w.name} wins best employer` }); break; }
  }
  ps.forEach((p) => note(p, g, ev, hit.get(p) || ''));
}

// ---------- decisions ----------
function costOf(g, p, id, params = {}) {
  const m = profileOf(p).mods;
  switch (id) {
    case 'hire': return 6 * (g.round <= g.mods.visaUntil ? 1.5 : 1) * (m.hireCost || 1);
    case 'training': return 3 * (m.trainCost || 1) * (g.mods.trainHalf === g.round ? 0.5 : 1);
    case 'automate': return 8 * (g.mods.automateHalf === g.round ? 0.5 : 1);
    case 'takeover': { const t = g.players[params.target]; return t ? marketValue(g, t) : null; }
    case 'buyback': return Math.round(p.buyPrice * 1.1 * 10) / 10;
    default: { const a = actionOf(id); return a ? a.cost || 0 : 0; }
  }
}

function canTakeOver(g, buyer, t) {
  return t && t.id !== buyer.id && g.round >= 3 && t.redStreak >= 2 && !t.parentId && buyer.parentId !== t.id;
}

function validateDecision(g, p, action, params) {
  const a = actionOf(action);
  if (!a) throw new Error('Pick an action.');
  if (action === 'switch' && (p.style !== 'situational' || p.styleSwitched)) throw new Error('Only a situational leader can switch, and only once.');
  if (action === 'switch' && !STYLES[params.style]) throw new Error('Pick the style to switch to.');
  if (action === 'buyback' && !p.parentId) throw new Error('Only a subsidiary can buy itself back.');
  if (action === 'poach' && (!g.players[params.target] || params.target === p.id)) throw new Error('Pick a rival to poach from.');
  if (action === 'takeover' && !canTakeOver(g, p, g.players[params.target])) throw new Error('That business cannot be taken over (it needs 2 red badges in a row, from round 3).');
  if (action === 'loan') { const amt = Number(params.amount); if (!(amt >= 5 && amt <= 20)) throw new Error('Loans are $5m to $20m.'); }
}

function styleMult(p, kind) {
  const s = p.style;
  if (s === 'transformational' && ['training', 'jv', 'alliance', 'export', 'subsidiary', 'acquire'].includes(kind)) return 1.25;
  if (s === 'transformational' && ['retrench', 'restructure'].includes(kind)) return 0.75;
  if (s === 'transactional' && ['bonus', 'hire'].includes(kind)) return 1.3;
  return 1;
}
const delay = (p) => (p.style === 'bureaucratic' ? 1 : 0);

function applyDecision(g, p) {
  const r = g.round; const d = p.decision;
  const logIt = (label, result) => p.log.push({ round: r, action: label, because: d ? d.because : '', event: g.event ? eventOf(g.event).title : '', result });
  if (!d) { logIt('No action', 'No decision locked in.'); return; }
  const a = actionOf(d.action);
  if (d.needsApproval && !d.approved) { logIt(a.label, 'Not approved by the parent business, so no action happened.'); p.lastAction = null; return; }
  let m = swing() * styleMult(p, d.action);
  if (p.insight) { m *= 1.1; p.insight = false; }
  const cost = costOf(g, p, d.action, d.params);
  let res = '';
  const pay = () => { p.cash -= cost; };
  switch (d.action) {
    case 'hire': pay(); p.staff += 100; p.sat += 0.1; p.skill *= 0.98; p.delayed.push({ round: r + 1, kind: 'skill', v: 1.02 }); res = '+100 staff; productivity dips this round'; break;
    case 'retrench': { pay(); const n = Math.min(100, p.staff - 200); p.staff -= n; p.sat -= 0.6 / m; p.rep -= 0.01; const t = (p.style === 'transactional' ? 9 : 6) / Math.max(0.6, m); p.temp.turnover = (p.temp.turnover || 0) + t; res = `−${n} staff; satisfaction and morale fall`; break; }
    case 'training': pay(); p.flags.trainedEver = true; p.flags.lastTrained = r; p.sat += 0.2; p.delayed.push({ round: r + 1, kind: 'skill', v: 1 + 0.06 * m }); res = `Productivity +${Math.round(6 * m)}% next round`; break;
    case 'wellbeing': pay(); p.sat += p.flags.wellbeing ? 0.2 * m : 0.4 * m; p.flags.wellbeing = true; res = 'Absenteeism and turnover will fall'; break;
    case 'bonus': pay(); p.skill *= 1 + 0.04 * m; p.sat += 0.2; p.flags.bonus = true; res = `Productivity +${Math.round(4 * m)}% now`; break;
    case 'restructure': pay(); p.costFactor *= 1 - 0.04 * m; p.sat -= 0.5; p.delayed.push({ round: r + 1, kind: 'sat', v: 0.3 }); p.flags.restructured = true; res = `Running costs −${Math.round(4 * m)}%`; break;
    case 'automate': { pay(); const n = Math.min(50, p.staff - 200); p.staff -= n; p.skill *= 1 + 0.12 * m; p.sat -= 0.6; p.flags.automated = true; p.temp.turnover = (p.temp.turnover || 0) + 3; res = `Productivity +${Math.round(12 * m)}%; −${n} staff`; break; }
    case 'poach': { pay(); const t = g.players[d.params.target]; if (!t || t.sat >= 7) { res = `Failed: ${t ? t.name : 'the rival'}'s staff are too satisfied to leave`; break; } const n = Math.min(30, t.staff - 200); t.staff -= n; p.staff += n; p.skill *= 1.015; t.skill *= 0.99; t.sat -= 0.2; res = `Took ${n} staff from ${t.name}`; g.feed.unshift({ round: r, text: `${p.name} poached ${n} staff from ${t.name}` }); t.events.push({ round: r, title: `${p.name} poached your staff`, type: 'Market interaction', note: `−${n} staff` }); break; }
    case 'export': pay(); p.markets.push({ label: 'Exporting', rev: 3 * m, start: r + 1 + delay(p), end: 99 }); res = `About $${r1(3 * m)}m new revenue a round from round ${r + 1 + delay(p)}`; break;
    case 'subsidiary': { pay(); const mm = swing(0.4) * styleMult(p, 'subsidiary'); p.markets.push({ label: 'Overseas subsidiary', rev: 11 * mm, start: r + 2 + delay(p), end: 99 }); res = `About $${r1(11 * mm)}m new revenue a round from round ${r + 2 + delay(p)}`; break; }
    case 'acquire': pay(); p.staff += 150; p.sat -= 0.8; p.markets.push({ label: 'Acquired small rival', rev: 10 * m, start: r, end: 99 }); res = `+150 staff and about $${r1(10 * m)}m revenue a round; culture clash`; break;
    case 'takeover': {
      const t = g.players[d.params.target];
      if (!canTakeOver(g, p, t)) { res = 'Failed: the business was no longer available'; break; }
      const price = marketValue(g, t); p.cash -= price; t.parentId = p.id; t.buyPrice = price;
      res = `Took over ${t.name} for $${price}m`; g.feed.unshift({ round: r, text: `${p.name} took over ${t.name} for $${price}m` });
      t.events.push({ round: r, title: `Taken over by ${p.name}`, type: 'Takeover', note: 'You now run a subsidiary' });
      break;
    }
    case 'loan': { const amt = Number(d.params.amount); p.cash += amt; p.loans.push({ principal: amt, emergency: false }); res = `Borrowed $${amt}m`; break; }
    case 'share': p.cash += 10; p.flags.sharesIssued++; res = 'Raised $10m from new owners'; break;
    case 'hold': res = 'Held steady'; break;
    case 'switch': p.style = d.params.style; p.styleSwitched = true; res = `Switched to ${STYLES[p.style].label}`; break;
    case 'buyback': { const par = g.players[p.parentId]; p.cash -= cost; if (par) par.cash += cost; res = `Bought back from ${par ? par.name : 'the parent'} for $${cost}m`; g.feed.unshift({ round: r, text: `${p.name} bought itself back from ${par ? par.name : 'its parent'}` }); p.parentId = null; break; }
  }
  p.lastAction = a.label;
  logIt(a.label, res);
}

// ---------- resolve ----------
function resolve(g) {
  const ps = list(g); const r = g.round;
  for (const p of ps) { p.prevShare = p.share; p.prevRev = p.revenue; p.emergency = false; p.extraCost = 0; p.otherIncome = 0; p.otherCost = 0; }
  for (const p of ps) applyDecision(g, p);
  for (const p of ps) {
    p.delayed = p.delayed.filter((d) => { if (d.round > r) return true; if (d.kind === 'skill') p.skill *= d.v; if (d.kind === 'sat') p.sat += d.v; if (d.kind === 'cost') p.costFactor *= d.v; return false; });
    const m = profileOf(p).mods;
    if (p.style === 'transformational') { p.sat += 0.15; p.extraCost += 0.5; }
    if (p.style === 'transactional') p.skill *= 1.01;
    if (p.style === 'bureaucratic') { p.costFactor *= 0.995; p.sat -= 0.12; }
    if (m.wageCreep) p.wageRate *= 1 + m.wageCreep;
    if (m.repDrift) p.rep += m.repDrift;
    if (m.irRisk && Math.random() < m.irRisk) { p.temp.absent = (p.temp.absent || 0) + 3; p.sat -= 0.4; p.events.push({ round: r, title: 'Industrial action by staff', type: 'Profile weakness', note: 'Absenteeism up, satisfaction down' }); }
    if (p.flags.wellbeing) p.extraCost += 0.5;
    if (p.flags.bonus) p.extraCost += 1;
    p.sat = clamp(p.sat, 1, 10);
    const tTarget = p.baseTurnover + (6 - p.sat) * 2.5 - (p.flags.wellbeing ? 3 : 0) + (p.temp.turnover || 0);
    p.turnover = clamp(p.turnover + (tTarget - p.turnover) * 0.6, 3, 60);
    const aTarget = 4 + (6 - p.sat) * 0.5 - (p.flags.wellbeing ? 1 : 0) + (p.temp.absent || 0);
    p.absent = clamp(p.absent + (aTarget - p.absent) * 0.7, 1, 20);
    p.skill *= 1 - Math.max(0, p.turnover - 12) / 600;
  }
  // market
  const growth = r <= g.market.saturatedUntil ? 0 : g.market.growth;
  g.market.size *= 1 + growth;
  const pull = (p) => {
    const al = p.alliances.filter((a) => a.end >= r).length * 0.02;
    return Math.pow(p.sat / 6, 0.6) * p.skill * Math.pow(p.staff / 1000, 0.35) * (1 + p.rep + al) * (profileOf(p).mods.pull || 1) * (1 - (p.absent - 4) / 40);
  };
  const w = new Map(ps.map((p) => [p, Math.pow(Math.max(0.05, pull(p)), 1.8)]));
  const tot = [...w.values()].reduce((a, b) => a + b, 0);
  for (const p of ps) {
    p.share = w.get(p) / tot;
    p.homeRev = g.market.size * p.share * (profileOf(p).mods.home || 1);
    p.newRev = p.markets.filter((mk) => mk.start <= r && mk.end >= r).reduce((s, mk) => s + mk.rev, 0);
    p.revenue = p.homeRev + p.newRev;
  }
  // contracts
  for (const c of g.contracts) {
    if (c.start > r || c.end < r) continue;
    const from = g.players[c.from], to = g.players[c.to]; if (!from || !to) continue;
    if (c.kind === 'fee') { from.otherCost += c.amount; to.otherIncome += c.amount; }
    if (c.kind === 'loan' && c.remaining > 0) {
      const interest = c.remaining * c.rate; const principal = Math.min(c.remaining, c.per);
      from.otherCost += interest; to.otherIncome += interest; from.cash -= principal; to.cash += principal; c.remaining -= principal;
    }
  }
  // profit
  for (const p of ps) {
    const wages = p.staff * p.wageRate;
    const other = 0.41 * p.revenue * p.costFactor;
    const interest = p.loans.reduce((s, l) => s + l.principal * (l.emergency ? g.market.baseRate + 0.09 : g.market.baseRate), 0);
    p.profit = p.revenue - wages - other - interest - p.extraCost - p.otherCost + p.otherIncome;
    if (p.temp.cyber) p.profit = Math.min(p.profit, 0) - 1;
    p.cpe = (wages + other) / p.staff * 1000;
    p.productivity = p.revenue * 1000 / p.staff;
    p.cash += p.profit;
  }
  for (const p of ps) {
    const par = p.parentId && g.players[p.parentId];
    if (par && p.profit > 0) { const half = p.profit / 2; p.cash -= half; par.cash += half; par.profit += half; }
  }
  for (const p of ps) {
    if (p.cash < 0) {
      const amt = Math.ceil(-p.cash + 3); p.cash += amt; p.loans.push({ principal: amt, emergency: true }); p.emergency = true;
      g.feed.unshift({ round: r, text: `${p.name} ran out of cash: emergency bank loan of $${amt}m` });
      if (p.flags.bonus) { p.flags.bonus = false; p.sat -= 0.8; p.events.push({ round: r, title: 'Bonus scheme cut', type: 'Cash crisis', note: 'Satisfaction falls' }); }
    }
  }
  // status
  for (const p of ps) {
    const h = p.history; const prev = h[h.length - 1];
    const c1 = (p.revenue - prev.revenue) / prev.revenue;
    const c0 = h.length >= 2 ? (prev.revenue - h[h.length - 2].revenue) / h[h.length - 2].revenue : c1;
    const avg = (c0 + c1) / 2;
    p.revChange = avg;
    p.status = avg >= 0.04 ? 'growth' : avg <= -0.02 ? 'decline' : 'stagnation';
    p.redStreak = p.status === 'decline' ? p.redStreak + 1 : 0;
    p.reason = reasonFor(p, prev);
    p.temp = {};
    h.push(snapshotRow(g, p));
    const lg = p.log[p.log.length - 1]; if (lg) lg.status = p.status;
  }
  // debrief
  const moves = ps.map((p) => ({ id: p.id, name: p.name, d: (p.share - p.prevShare) * 100, reason: p.reason }));
  moves.sort((a, b) => b.d - a.d);
  const withBecause = ps.filter((p) => p.decision && p.decision.because);
  const picks = withBecause.sort(() => Math.random() - 0.5).slice(0, 2).map((p) => p.id);
  g.debrief = { round: r, riser: moves[0], faller: moves[moves.length - 1], picks };
  for (const p of ps) { p.boards[r] = autoBoardScore(p.decision); p.decision = null; }
  g.approvals = g.approvals.filter((a) => a.kind !== 'action');
}

function reasonFor(p, prev) {
  const cands = [
    { v: (p.turnover - prev.turnover) / 3, t: `Turnover ${p.turnover >= prev.turnover ? 'up' : 'down'} ${r1(Math.abs(p.turnover - prev.turnover))} points` },
    { v: (p.sat - prev.sat) / 0.5, t: `Satisfaction ${p.sat >= prev.sat ? 'up' : 'down'} to ${r1(p.sat)}/10` },
    { v: (p.share * 100 - prev.share), t: `Market share ${p.share * 100 >= prev.share ? 'up' : 'down'} ${r1(Math.abs(p.share * 100 - prev.share))} points` },
    { v: ((p.revenue - prev.revenue) / prev.revenue) * 100 / 3, t: `Revenue ${p.revenue >= prev.revenue ? 'up' : 'down'} ${r1(Math.abs((p.revenue - prev.revenue) / prev.revenue * 100))}%` },
    { v: (p.staff - prev.staff) / 50, t: `Staff ${p.staff >= prev.staff ? 'up' : 'down'} ${Math.abs(Math.round(p.staff - prev.staff))}` },
    { v: ((p.productivity - prev.productivity) / prev.productivity) * 100 / 3, t: `Labour productivity ${p.productivity >= prev.productivity ? 'up' : 'down'} ${r1(Math.abs((p.productivity - prev.productivity) / prev.productivity * 100))}%` },
  ];
  cands.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const why = p.lastAction ? ` after ${p.lastAction.replace(/\s*\(.*\)$/, '').toLowerCase()}` : '';
  return cands[0].t + why;
}

const HR_WORDS = /(turnover|satisf|productiv|absent|profit|share|revenue|staff|cash|debt|wage|cost|employee|morale|training|skill|market)/i;
function autoBoardScore(d) {
  if (!d || !d.because) return { score: 0, by: 'auto' };
  const words = d.because.trim().split(/\s+/).length;
  let s = 0;
  if (words >= 6) s = 1;
  if (words >= 8 && /because|so|to /i.test(d.because) && (HR_WORDS.test(d.because) && /\d/.test(d.because))) s = 2;
  return { score: s, by: 'auto' };
}

// ---------- deals ----------
const DEAL_TYPES = {
  jv: 'Joint venture', alliance: 'Strategic alliance', licensing: 'Licensing', franchising: 'Franchising', loan: 'Loan to a classmate', staff: 'Staff transfer',
};

function normaliseTerms(type, t, from, to) {
  const n = (v, lo, hi, def) => { const x = Number(v); return Number.isFinite(x) ? clamp(x, lo, hi) : def; };
  const who = (v) => (v === 'them' || v === to ? to : from);
  switch (type) {
    case 'jv': return { costShare: n(t.costShare, 10, 90, 50), profitShare: n(t.profitShare, 10, 90, 50), rounds: n(t.rounds, 1, 4, 3) };
    case 'alliance': return { kind: ['training', 'suppliers', 'tech'].includes(t.kind) ? t.kind : 'training' };
    case 'licensing': return { licensor: who(t.licensor), fee: n(t.fee, 1, 5, 2), rounds: n(t.rounds, 1, 4, 3) };
    case 'franchising': return { franchisor: who(t.franchisor), fee: n(t.fee, 0, 10, 4), revShare: n(t.revShare, 5, 30, 10) };
    case 'loan': return { lender: who(t.lender), amount: n(t.amount, 1, 15, 5), rate: n(t.rate, 0, 20, 8), rounds: n(t.rounds, 1, 4, 2) };
    case 'staff': return { seller: who(t.seller), n: n(t.n, 10, 200, 50), price: n(t.price, 0, 10, 2) };
  }
  throw new Error('Unknown deal type.');
}

function dealText(g, d) {
  const N = (id) => (g.players[id] ? g.players[id].name : '?');
  const t = d.terms; const a = N(d.from), b = N(d.to);
  switch (d.type) {
    case 'jv': return `Joint venture into a new market for ${t.rounds} round(s). ${a} pays ${t.costShare}% of the $10m cost and takes ${t.profitShare}% of the new revenue; ${b} pays ${100 - t.costShare}% and takes ${100 - t.profitShare}%.`;
    case 'alliance': return `Strategic alliance for 3 rounds sharing ${t.kind === 'tech' ? 'technology' : t.kind}. Each pays $1m.`;
    case 'licensing': { const L = N(t.licensor), E = t.licensor === d.from ? b : a; return `${L} licenses its brand/product to ${E} for ${t.rounds} round(s). ${E} pays $${t.fee}m a round.`; }
    case 'franchising': { const F = N(t.franchisor), E = t.franchisor === d.from ? b : a; return `${F} franchises its model to ${E}. ${E} pays $${t.fee}m up front plus ${t.revShare}% of the franchise revenue each round.`; }
    case 'loan': { const L = N(t.lender), B = t.lender === d.from ? b : a; return `${L} lends ${B} $${t.amount}m at ${t.rate}% a round, repaid over ${t.rounds} round(s).`; }
    case 'staff': { const S = N(t.seller), B = t.seller === d.from ? b : a; return `${S} transfers ${t.n} staff to ${B} for $${t.price}m.`; }
  }
  return '';
}

function sendDeal(g, from, to, type, terms, counterOf) {
  if (g.phase !== 'deal') throw new Error('Deals can only be sent in the deal window.');
  if (!DEAL_TYPES[type]) throw new Error('Pick a deal type.');
  if (!g.players[to] || to === from.id) throw new Error('Pick a classmate to send it to.');
  const d = { id: uid(), round: g.round, from: from.id, to, type, terms: normaliseTerms(type, terms || {}, from.id, to), status: 'open', counterOf: counterOf || null };
  d.text = dealText(g, d);
  if (counterOf) { const o = g.deals.find((x) => x.id === counterOf); if (o && o.status === 'open') o.status = 'countered'; }
  g.deals.push(d);
  return d;
}

function acceptDeal(g, p, d) {
  if (g.phase !== 'deal') throw new Error('The deal window is closed.');
  if (!d || d.to !== p.id || d.status !== 'open') throw new Error('That deal is no longer open.');
  if (p.dealRound === g.round) throw new Error('You have already accepted a deal this round.');
  const a = g.players[d.from], b = g.players[d.to];
  const r = g.round; const t = d.terms;
  switch (d.type) {
    case 'jv': {
      a.cash -= 10 * t.costShare / 100; b.cash -= 10 * (100 - t.costShare) / 100;
      for (const [x, sh, o] of [[a, t.profitShare / 100, b], [b, (100 - t.profitShare) / 100, a]]) {
        x.markets.push({ label: `Joint venture with ${o.name}`, rev: 11 * sh * styleMult(x, 'jv') * swing(), start: r + 1 + delay(x), end: r + t.rounds + delay(x) });
      }
      break;
    }
    case 'alliance':
      for (const [x, o] of [[a, b], [b, a]]) {
        x.cash -= 1; x.alliances.push({ partner: o.id, kind: t.kind, end: r + 3 });
        const m = styleMult(x, 'alliance');
        if (t.kind === 'training') { x.delayed.push({ round: r, kind: 'skill', v: 1 + 0.02 * m }); x.sat += 0.2; x.flags.trainedEver = true; x.flags.lastTrained = r; }
        if (t.kind === 'suppliers') x.delayed.push({ round: r, kind: 'cost', v: 1 - 0.02 * m });
        if (t.kind === 'tech') x.delayed.push({ round: r, kind: 'skill', v: 1 + 0.03 * m });
      }
      break;
    case 'licensing': {
      const L = g.players[t.licensor], E = L === a ? b : a; const mod = profileOf(L).mods.licensor || 1;
      E.markets.push({ label: `Licence from ${L.name}`, rev: t.fee * 3 * mod, start: r + 1, end: r + t.rounds });
      g.contracts.push({ kind: 'fee', from: E.id, to: L.id, amount: t.fee, start: r + 1, end: r + t.rounds, label: 'Licence fee' });
      break;
    }
    case 'franchising': {
      const F = g.players[t.franchisor], E = F === a ? b : a; const mod = profileOf(F).mods.franchisor || 1;
      E.cash -= t.fee; F.cash += t.fee;
      E.markets.push({ label: `Franchise of ${F.name}`, rev: 10 * mod, start: r + 1, end: 99 });
      g.contracts.push({ kind: 'fee', from: E.id, to: F.id, amount: 10 * mod * t.revShare / 100, start: r + 1, end: 99, label: 'Franchise fee' });
      break;
    }
    case 'loan': {
      const L = g.players[t.lender], B = L === a ? b : a;
      L.cash -= t.amount; B.cash += t.amount;
      g.contracts.push({ kind: 'loan', from: B.id, to: L.id, remaining: t.amount, rate: t.rate / 100, per: t.amount / t.rounds, start: r + 1, end: r + t.rounds + 3, label: 'Classmate loan' });
      break;
    }
    case 'staff': {
      const S = g.players[t.seller], B = S === a ? b : a; const n = Math.max(0, Math.min(t.n, S.staff - 200));
      S.staff -= n; B.staff += n; B.cash -= t.price; S.cash += t.price;
      break;
    }
  }
  d.status = 'accepted'; p.dealRound = g.round;
  g.feed.unshift({ round: r, text: `${a.name} and ${b.name} formed a ${DEAL_TYPES[d.type].toLowerCase()}` });
}

// ---------- SWOT ----------
function makeSwot(g, p) {
  const h = p.history; const s = h[0]; const c = h[h.length - 1]; const pv = h.length > 2 ? h[h.length - 3] : s;
  const tiles = [];
  const add = (text, key) => tiles.push({ id: uid(), text, key });
  const span = h.length > 2 ? 'in two rounds' : 'since the start';
  add(`Staff turnover ${c.turnover <= pv.turnover ? 'fell' : 'rose'} from ${pv.turnover}% to ${c.turnover}% ${span}`, c.turnover <= pv.turnover ? 'S' : 'W');
  add(`Staff satisfaction is ${c.sat}/10 (started at ${s.sat})`, c.sat >= 6 ? 'S' : 'W');
  add(`Labour productivity is $${c.productivity}k revenue per employee (started at $${s.productivity}k)`, c.productivity >= s.productivity ? 'S' : 'W');
  add(`Absenteeism is ${c.absent}% (started at ${s.absent}%)`, c.absent <= s.absent ? 'S' : 'W');
  add(`Cost per employee is $${c.cpe}k (started at $${s.cpe}k)`, c.cpe <= s.cpe ? 'S' : 'W');
  add('The home market grows only about 2% a round, but new markets add revenue outside it', 'O');
  const rivals = list(g).filter((x) => x.id !== p.id);
  const unhappy = rivals.filter((x) => x.sat < 6);
  if (unhappy.length) add(`${unhappy.length} rival(s) have staff satisfaction below 6/10, so their skilled staff could be poached`, 'O');
  if (g.drawn.includes('subsidy') || g.drawn.includes('ai')) add('New technology and government support make upskilling cheaper', 'O');
  const best = rivals.sort((a, b) => b.share - a.share)[0];
  if (best) add(`${best.name} holds the biggest market share (${r1(best.share * 100)}%) and competes for the same shoppers`, 'T');
  if (g.drawn.includes('rival') || g.drawn.includes('saturation')) add('Overseas rivals and market saturation are squeezing the home market', 'T');
  else add('Rivals with higher staff satisfaction can poach your staff in a talent war', 'T');
  if (c.debt > 15) add(`Debt is $${c.debt}m, so rising interest rates would increase costs`, 'T');
  return tiles.slice(0, 8).sort(() => Math.random() - 0.5);
}

// ---------- scoring ----------
function scores(g, p) {
  const h = p.history; const s = h[0];
  if (!s) return { comp: 0, eff: 0, board: 0, total: 0 };
  const share = p.share * 100; const shareRatio = share / s.share;
  const growth = (p.revenue - s.revenue) / s.revenue;
  const c1 = clamp(6.67 + (shareRatio - 1) * 20, 0, 13.33);
  const c2 = clamp(6.67 + growth * 33, 0, 13.33);
  const c3 = clamp(6.67 + (p.profit - s.profit) / 8 * 6.67, 0, 13.34);
  const comp = clamp(c1 + c2 + c3 - p.flags.sharesIssued * 2, 0, 40);
  const e1 = clamp(5 + (p.productivity / s.productivity - 1) * 25, 0, 10);
  const e2 = clamp(5 + (s.turnover - p.turnover) * 0.5, 0, 10);
  const e3 = clamp(5 + (s.absent - p.absent) * 2.5, 0, 10);
  const e4 = clamp(5 + (s.cpe - p.cpe) / s.cpe * 25, 0, 10);
  const eff = e1 + e2 + e3 + e4;
  const bsum = Object.values(p.boards).reduce((a, b) => a + (b.score || 0), 0);
  const board = bsum / (TOTAL_ROUNDS * 2) * 20;
  return { comp: Math.round(comp), eff: Math.round(eff), board: Math.round(board), total: Math.round(comp + eff + board) };
}

function publicState(g, extra = {}) {
  const out = JSON.parse(JSON.stringify(g));
  delete out.pin;
  for (const id of out.order) {
    const p = g.players[id]; const q = out.players[id];
    q.debt = r1(debt(g, p)); q.value = marketValue(g, p); q.score = scores(g, p);
    q.takeoverTarget = g.round >= 2 && p.redStreak >= 2 && !p.parentId;
    q.costs = {}; for (const a of ACTIONS) q.costs[a.id] = costOf(g, p, a.id);
    if (q.swot) q.swot.tiles = q.swot.tiles.map(({ id: tid, text }) => ({ id: tid, text }));
  }
  return Object.assign(out, { serverNow: Date.now(), totalRounds: TOTAL_ROUNDS }, extra);
}

module.exports = {
  TOTAL_ROUNDS, PHASES, PHASE_SECONDS, PROFILES, STYLES, ACTIONS, EVENTS, DEAL_TYPES, STEEPLE,
  newGame, addPlayer, setStyle, startGame, drawEvent, resolve, validateDecision, costOf, sendDeal, acceptDeal,
  makeSwot, scores, publicState, list, debt, marketValue, eventOf, actionOf, factorLabel, autoBoardScore, uid,
};
