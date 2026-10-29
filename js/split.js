// Splitwise-style balances with friends. Pure functions, no DOM.
//
// A card spend can carry `split: { mode, includeMe, friends: [{ id, share }] }`;
// each share is money that friend owes you. Ledger entries cover everything
// else: 'lent' (you paid for them, off-card) and 'paid' (you paid them back)
// raise what they owe you; 'borrowed' (they paid for you) and 'received'
// (they paid you back) lower it. A positive balance means the friend owes you.

export const LEDGER_SIGN = { lent: 1, paid: 1, borrowed: -1, received: -1 };

const round2 = (v) => Math.round(v * 100) / 100;

// Equal shares for `n` friends, rounded down to the paisa; you absorb the
// remainder so friends are never asked for more than the bill.
export function equalShares(amount, n, includeMe = true) {
  if (!(amount > 0) || n < 1) return [];
  const each = Math.floor((amount / (includeMe ? n + 1 : n)) * 100) / 100;
  return Array(n).fill(each);
}

export function splitTotal(split) {
  return round2((split?.friends || []).reduce((s, x) => s + x.share, 0));
}

export function balances(txns, ledger) {
  const bal = {};
  const activity = {};
  const add = (id, amount, item) => {
    bal[id] = round2((bal[id] || 0) + amount);
    (activity[id] ||= []).push({ ...item, amount });
  };
  for (const t of txns) {
    for (const s of t.split?.friends || []) add(s.id, s.share, { type: 'split', date: t.date, createdAt: t.createdAt, txn: t });
  }
  for (const e of ledger) {
    add(e.friendId, LEDGER_SIGN[e.kind] * e.amount, { type: 'ledger', date: e.date, createdAt: e.createdAt, entry: e });
  }
  for (const list of Object.values(activity)) {
    list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  }
  return { bal, activity };
}

export const isSettled = (v) => Math.abs(v || 0) < 0.005;
