// Reward engine: pure functions, no DOM. Covered by tests/engine.test.mjs.

const GST = 0.18; // charged on forex markup

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
const statementDate = (y, m0, day) => new Date(y, m0, Math.min(day, daysInMonth(y, m0)));

// The statement cycle a date falls in. A cycle ends on the statement day
// (clamped to short months) and starts the day after the previous one, so
// statementDay 31 gives calendar months. `key` is the statement month.
export function cycleOf(dateStr, statementDay) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let sy = y;
  let sm = m - 1;
  if (d > Math.min(statementDay, daysInMonth(y, m - 1))) {
    sm += 1;
    if (sm > 11) { sm = 0; sy += 1; }
  }
  const end = statementDate(sy, sm, statementDay);
  const start = statementDate(sm === 0 ? sy - 1 : sy, sm === 0 ? 11 : sm - 1, statementDay);
  start.setDate(start.getDate() + 1);
  return { key: `${sy}-${pad(sm + 1)}`, start: toISO(start), end: toISO(end) };
}

// Fee-waiver year: starts on the 1st of the anniversary month.
export function cardYearOf(dateStr, anniversaryMonth) {
  const [y, m] = dateStr.split('-').map(Number);
  const sy = m >= anniversaryMonth ? y : y - 1;
  return {
    start: toISO(new Date(sy, anniversaryMonth - 1, 1)),
    end: toISO(new Date(sy + 1, anniversaryMonth - 1, 0)),
  };
}

export function bucketFor(card, txn) {
  if (card.noRewards) return 'none';
  const pair = card.map[txn.category] || ['base', 'base'];
  const bucket = pair[txn.channel === 'online' ? 1 : 0];
  if (!txn.intl || bucket === 'none') return bucket;
  if (card.intlRule === 'accel') return 'accel';
  if (card.intlRule === 'noBase' && bucket === 'base') return 'none';
  return bucket;
}

// Rate (units per ₹100) that counts toward the bonus cap.
export const cappedRate = (card) => (card.capMode === 'bonus' ? Math.max(0, card.accelRate - card.baseRate) : card.accelRate);

// Reward for one transaction on one card, given how many accelerated units
// that card has already earned in the transaction's cycle.
export function evaluate(card, txn, accelUsed = 0) {
  const amount = Math.max(0, Number(txn.amount) || 0);
  const bucket = bucketFor(card, txn);
  const eligible = card.per100 ? Math.floor(amount / 100) * 100 : amount;
  const cap = card.accelCap > 0 ? card.accelCap : Infinity;
  const room = Math.max(0, cap - accelUsed);
  let units = 0;
  let accelDelta = 0;
  let overCap = 0; // spend that missed the accelerated rate because of the cap

  if (bucket === 'accel' && card.capMode === 'bonus') {
    const bonusRate = cappedRate(card);
    const bonusFull = (eligible * bonusRate) / 100;
    accelDelta = Math.min(bonusFull, room);
    overCap = bonusFull > room && bonusRate > 0 ? ((bonusFull - room) * 100) / bonusRate : 0;
    units = (eligible * card.baseRate) / 100 + accelDelta;
  } else if (bucket === 'accel') {
    const full = (eligible * card.accelRate) / 100;
    if (full <= room) {
      units = full;
      accelDelta = full;
    } else {
      overCap = card.accelRate > 0 ? eligible - (room * 100) / card.accelRate : eligible;
      units = room + (overCap * card.afterCapRate) / 100;
      accelDelta = room;
    }
  } else if (bucket === 'base') {
    units = (eligible * card.baseRate) / 100;
  }

  units = card.kind === 'points' ? Math.floor(units + 1e-9) : Math.round(units * 100) / 100;
  const value = units * card.pointValue;
  const fx = txn.intl ? (amount * card.forexMarkup * (1 + GST)) / 100 : 0;
  const net = value - fx;
  return {
    cardId: card.id, bucket, amount, eligible, units, value, fx, net,
    intlExcluded: !!txn.intl && bucket === 'none' && bucketFor(card, { ...txn, intl: false }) !== 'none',
    rate: amount ? (net / amount) * 100 : 0,
    accelDelta, room, cap, overCap,
  };
}

// Bonus-category spend made before you started recording ("as of" the
// opening date) already used part of that cycle's cap.
function seedOpeningCycle(card, cycles) {
  const amount = Number(card.openingCycleBonusSpend) || 0;
  if (!(amount > 0) || !card.openingDate || card.noRewards) return;
  const cyc = cycleOf(card.openingDate, card.statementDay);
  const r = evaluate({ ...card, per100: false, intlRule: 'same', map: { __opening: ['accel', 'accel'] } },
    { amount, category: '__opening', channel: 'offline' }, 0);
  cycles[cyc.key] = { ...emptyCycle(cyc), accelUsed: r.accelDelta, spend: amount, units: r.units, value: r.value, opening: amount };
}

// Spend before you started recording that counts toward a card-year target.
const openingYearSpend = (card, start, end) => (card.openingYearSpend > 0 && card.openingDate >= start && card.openingDate <= end
  ? Number(card.openingYearSpend) : 0);

const emptyCycle = (cyc) => ({ ...cyc, accelUsed: 0, spend: 0, units: 0, value: 0, fx: 0, count: 0 });
const byTime = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0);

// Replays every transaction in date order so caps are consumed exactly as the
// bank would. For each transaction it also prices the other card at that
// moment, which gives "best card" and "missed rewards".
export function replay(txns, cards) {
  const ids = Object.keys(cards);
  const cycles = Object.fromEntries(ids.map((id) => [id, {}]));
  const results = new Map();
  for (const id of ids) seedOpeningCycle(cards[id], cycles[id]);

  for (const t of [...txns].sort(byTime)) {
    if (!cards[t.card]) continue;
    const evals = {};
    for (const id of ids) {
      const cyc = cycleOf(t.date, cards[id].statementDay);
      const st = (cycles[id][cyc.key] ||= emptyCycle(cyc));
      evals[id] = { ...evaluate(cards[id], t, st.accelUsed), cycleKey: cyc.key };
    }
    const used = evals[t.card];
    const st = cycles[t.card][used.cycleKey];
    st.accelUsed += used.accelDelta;
    st.spend += used.amount;
    st.units += used.units;
    st.value += used.value;
    st.fx += used.fx;
    st.count += 1;

    let best = t.card;
    for (const id of ids) if (!cards[id].noRewards && evals[id].net > evals[best].net + 1e-9) best = id;
    // UPI is often the only way to pay (kirana, rent), so it never counts as a miss.
    const missed = cards[t.card].noRewards ? 0 : Math.max(0, evals[best].net - used.net);
    results.set(t.id, { used, evals, best, missed });
  }
  return { results, cycles };
}

// Prices a prospective transaction on every rewards card against the current
// cycle state, best first.
export function advise(cards, cycles, txn) {
  return Object.values(cards)
    .filter((card) => !card.noRewards)
    .map((card) => {
      const cyc = cycleOf(txn.date, card.statementDay);
      const st = cycles[card.id]?.[cyc.key];
      return evaluate(card, txn, st ? st.accelUsed : 0);
    })
    .sort((a, b) => b.net - a.net);
}

export function feeProgress(txns, card, today) {
  const cy = cardYearOf(today, card.anniversaryMonth);
  let spend = openingYearSpend(card, cy.start, cy.end);
  for (const t of txns) if (t.card === card.id && t.date >= cy.start && t.date <= cy.end) spend += t.amount;
  const total = daysBetween(cy.start, cy.end) + 1;
  const elapsed = Math.min(total, daysBetween(cy.start, today) + 1);
  const target = card.feeWaiverSpend || 0;
  const expected = (target * elapsed) / total;
  return {
    ...cy, spend, target, expected,
    remaining: Math.max(0, target - spend),
    done: target > 0 && spend >= target,
    behind: Math.max(0, expected - spend),
    daysLeft: total - elapsed,
  };
}

// Spend-based milestones: 'cardYear' runs with the fee-waiver year, 'issue'
// runs for `days` from the card's issue date (skipped when no date is set).
export function milestoneProgress(txns, card, today) {
  const out = [];
  for (const m of card.milestones || []) {
    let start;
    let end;
    if (m.window === 'cardYear') {
      ({ start, end } = cardYearOf(today, card.anniversaryMonth));
    } else if (m.window === 'issue' && card.issueDate) {
      start = card.issueDate;
      const d = parseISO(card.issueDate);
      d.setDate(d.getDate() + m.days - 1);
      end = toISO(d);
      if (today > end || today < start) continue;
    } else {
      continue;
    }
    let spend = openingYearSpend(card, start, end);
    for (const t of txns) if (t.card === card.id && t.date >= start && t.date <= end) spend += t.amount;
    out.push({ ...m, start, end, target: m.spend, spend, done: spend >= m.spend, remaining: Math.max(0, m.spend - spend) });
  }
  return out;
}

// Closed statement cycles, newest first, and whether the rewards they earned
// have shown up. `credits` is keyed "card|cycle" → { units, date }. A credit
// within 1% (min 1 unit) of the expected amount counts as received in full.
export function rewardCredits(card, cycles, credits, today, limit = 6) {
  return Object.values(cycles)
    .filter((c) => c.end < today && c.units > 0)
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, limit)
    .map((c) => {
      const got = credits[`${card.id}|${c.key}`] || null;
      const due = addDays(c.end, card.creditDays || 0);
      const short = got ? Math.max(0, c.units - got.units) : 0;
      let status = today > due ? 'overdue' : 'pending';
      if (got) status = short > Math.max(1, c.units * 0.01) ? 'short' : 'received';
      return { key: c.key, start: c.start, end: c.end, expected: c.units, due, got, short, status };
    });
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function shiftMonth(dateStr, delta) {
  const d = parseISO(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

// Last `n` month keys ending with the month of `today`, oldest first.
export function lastMonths(n, today) {
  return Array.from({ length: n }, (_, i) => monthKey(toISO(shiftMonth(today, i - n + 1))));
}

export function periodRange(period, today) {
  const monthStart = (delta) => toISO(shiftMonth(today, delta));
  const monthEnd = (delta) => {
    const d = shiftMonth(today, delta + 1);
    d.setDate(0);
    return toISO(d);
  };
  switch (period) {
    case 'month': return { start: monthStart(0), end: monthEnd(0) };
    case 'last': return { start: monthStart(-1), end: monthEnd(-1) };
    case '3m': return { start: monthStart(-2), end: monthEnd(0) };
    case '12m': return { start: monthStart(-11), end: monthEnd(0) };
    default: return { start: '0000-01-01', end: '9999-12-31' };
  }
}

// "450 + 120" → 570, "1,299.50" → 1299.5. Anything else → NaN.
export function parseAmount(input) {
  const s = String(input ?? '').replace(/[,₹\s]/g, '');
  if (!s || !/^[\d.+]+$/.test(s)) return NaN;
  const parts = s.split('+').filter(Boolean);
  if (!parts.length || parts.some((p) => !/^\d*\.?\d*$/.test(p) || p === '.')) return NaN;
  return Math.round(parts.reduce((sum, p) => sum + Number(p), 0) * 100) / 100;
}
