import { DEFAULT_CARDS, CARD_ORDER, METHOD_IDS, CATEGORIES, UPI } from './rules.js';
import { LEDGER_SIGN } from './split.js';

const KEY = 'cardmax:v1';
const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));
// Card settings that describe *your* card rather than the bank's rules; these
// survive "Restore default rules".
const PERSONAL_FIELDS = ['statementDay', 'anniversaryMonth', 'issueDate', 'last4', 'openingDate', 'openingYearSpend', 'openingCycleBonusSpend'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const blank = () => ({ version: 1, txns: [], friends: [], ledger: [], credits: {}, cards: {}, meta: {} });

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && Array.isArray(d.txns)) {
      return {
        ...blank(), ...d,
        friends: Array.isArray(d.friends) ? d.friends : [],
        ledger: Array.isArray(d.ledger) ? d.ledger : [],
        credits: d.credits && typeof d.credits === 'object' ? d.credits : {},
        cards: d.cards || {},
        meta: d.meta || {},
      };
    }
  } catch (e) {
    console.warn('CardMax: could not read saved data', e);
  }
  return blank();
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function cardsFrom(data) {
  const out = {};
  for (const id of CARD_ORDER) {
    const def = DEFAULT_CARDS[id];
    const ov = data.cards[id] || {};
    out[id] = { ...def, ...ov, map: { ...def.map, ...(ov.map || {}) } };
  }
  out.upi = UPI;
  return out;
}

export function setCardField(data, id, field, value) {
  (data.cards[id] ||= {})[field] = value;
}

export function setCardBucket(data, id, category, channelIndex, bucket) {
  const ov = (data.cards[id] ||= {});
  const current = cardsFrom(data)[id].map[category] || ['base', 'base'];
  const next = [...current];
  next[channelIndex] = bucket;
  ov.map = { ...(ov.map || {}), [category]: next };
}

// units null clears the entry.
export function setCredit(data, cardId, cycleKey, units, date) {
  const k = `${cardId}|${cycleKey}`;
  if (units === null) delete data.credits[k];
  else data.credits[k] = { units, date, note: '' };
}

export function resetRules(data, id) {
  const ov = data.cards[id] || {};
  data.cards[id] = Object.fromEntries(PERSONAL_FIELDS.filter((k) => k in ov).map((k) => [k, ov[k]]));
}

export function newId() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanSplit(split, friendIds) {
  const friends = (split?.friends || [])
    .filter((s) => friendIds.has(s?.id) && Number(s.share) > 0)
    .map((s) => ({ id: s.id, share: Number(s.share) }));
  if (!friends.length) return undefined;
  return { mode: split.mode === 'custom' ? 'custom' : 'equal', includeMe: split.includeMe !== false, friends };
}

function cleanTxn(t, friendIds) {
  const amount = Number(t?.amount);
  if (!t || typeof t.id !== 'string' || !DATE_RE.test(t.date) || !(amount > 0) || !METHOD_IDS.includes(t.card)) {
    return null;
  }
  const out = {
    id: t.id,
    date: t.date,
    amount,
    card: t.card,
    category: CAT_IDS.has(t.category) ? t.category : 'other',
    channel: t.channel === 'online' ? 'online' : 'offline',
    intl: !!t.intl,
    merchant: String(t.merchant || '').slice(0, 80),
    note: String(t.note || '').slice(0, 200),
    createdAt: Number(t.createdAt) || 0,
  };
  const split = cleanSplit(t.split, friendIds);
  if (split) out.split = split;
  return out;
}

export function toBackup(data) {
  return JSON.stringify({ app: 'cardmax', exportedAt: new Date().toISOString(), ...data }, null, 1);
}

export function parseBackup(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'cardmax' || !Array.isArray(d.txns)) throw new Error('This is not a CardMax backup file.');
  const friends = (Array.isArray(d.friends) ? d.friends : [])
    .filter((x) => x && typeof x.id === 'string' && String(x.name || '').trim())
    .map((x) => ({ id: x.id, name: String(x.name).trim().slice(0, 40), createdAt: Number(x.createdAt) || 0 }));
  const friendIds = new Set(friends.map((x) => x.id));
  const ledger = (Array.isArray(d.ledger) ? d.ledger : [])
    .filter((e) => e && typeof e.id === 'string' && friendIds.has(e.friendId) && e.kind in LEDGER_SIGN && Number(e.amount) > 0 && DATE_RE.test(e.date))
    .map((e) => ({ id: e.id, friendId: e.friendId, kind: e.kind, amount: Number(e.amount), date: e.date, note: String(e.note || '').slice(0, 200), createdAt: Number(e.createdAt) || 0 }));
  const txns = d.txns.map((t) => cleanTxn(t, friendIds)).filter(Boolean);
  const credits = {};
  for (const [k, v] of Object.entries(d.credits && typeof d.credits === 'object' ? d.credits : {})) {
    const [card, cycle] = k.split('|');
    if (CARD_ORDER.includes(card) && /^\d{4}-\d{2}$/.test(cycle) && Number(v?.units) >= 0 && DATE_RE.test(v?.date)) {
      credits[k] = { units: Number(v.units), date: v.date, note: String(v.note || '').slice(0, 200) };
    }
  }
  return { version: 1, txns, friends, ledger, credits, cards: d.cards && typeof d.cards === 'object' ? d.cards : {}, meta: d.meta || {} };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(data, cards, results) {
  const names = Object.fromEntries(data.friends.map((x) => [x.id, x.name]));
  const head = ['date', 'merchant', 'category', 'channel', 'international', 'card', 'amount', 'reward_units', 'reward_inr', 'forex_cost_inr', 'best_card', 'missed_inr', 'split_with', 'friends_owe_inr', 'note'];
  const rows = [...data.txns]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((t) => {
      const r = results.get(t.id);
      const shares = t.split?.friends || [];
      return [
        t.date, t.merchant, t.category, t.channel, t.intl ? 'yes' : 'no', cards[t.card].name, t.amount,
        r.used.units, r.used.value.toFixed(2), r.used.fx.toFixed(2), cards[r.best].name, r.missed.toFixed(2),
        shares.map((s) => names[s.id] || '?').join('; '), shares.reduce((s, x) => s + x.share, 0).toFixed(2), t.note,
      ];
    });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
