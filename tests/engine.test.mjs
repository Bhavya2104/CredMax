// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CARDS, UPI } from '../js/rules.js';
import { replay, advise, evaluate, cycleOf, cardYearOf, parseAmount, feeProgress, milestoneProgress, rewardCredits } from '../js/engine.js';

const { hsbc, bob } = DEFAULT_CARDS;
let n = 0;
const txn = (card, amount, category, extra = {}) => ({
  id: `t${++n}`, date: '2026-10-05', amount, card, category, channel: 'offline', intl: false, createdAt: n, ...extra,
});

test('HSBC Live+ matches the bank’s own monthly example (₹1,545)', () => {
  const txns = [
    txn('hsbc', 11500, 'dining'),
    txn('hsbc', 5000, 'food_delivery', { channel: 'online' }),
    txn('hsbc', 9000, 'grocery'),
    txn('hsbc', 15000, 'shopping'),
    txn('hsbc', 1000, 'utilities'),
    txn('hsbc', 15000, 'travel'),
    txn('hsbc', 5000, 'entertainment'),
    txn('hsbc', 3000, 'health'),
    txn('hsbc', 500, 'fuel'),
  ];
  const { results } = replay(txns, DEFAULT_CARDS);
  const total = txns.reduce((s, t) => s + results.get(t.id).used.value, 0);
  assert.equal(Math.round(total * 100) / 100, 1545);
});

test('BOB Eterna caps only the bonus points (leaflet: ₹45,500 → 6,365 pts)', () => {
  const r = evaluate(bob, txn('bob', 45500, 'travel', { channel: 'online' }), 0);
  assert.equal(r.units, 6365);
  assert.equal(r.accelDelta, 5000);
  const after = evaluate(bob, txn('bob', 1000, 'dining'), 5000);
  assert.equal(after.units, 30);
});

test('BOB earns per full ₹100', () => {
  assert.equal(evaluate(bob, txn('bob', 199, 'dining'), 0).units, 15);
  assert.equal(evaluate(bob, txn('bob', 99, 'dining'), 0).units, 0);
});

test('HSBC cap splits a transaction that crosses it', () => {
  const r = evaluate(hsbc, txn('hsbc', 3000, 'grocery'), 1000);
  assert.equal(r.value, 200);
  assert.equal(r.overCap, 1000);
});

test('international: BOB earns 5X in any category, HSBC loses the 1.5%', () => {
  const abroad = { channel: 'offline', intl: true };
  assert.equal(evaluate(bob, txn('bob', 1000, 'other', abroad), 0).units, 150);
  const h = evaluate(hsbc, txn('hsbc', 1000, 'other', abroad), 0);
  assert.equal(h.value, 0);
  assert.ok(h.intlExcluded);
  assert.ok(h.fx > 23 && h.fx < 24);
  assert.equal(evaluate(bob, txn('bob', 1000, 'fuel', abroad), 0).units, 0);
});

test('Amazon/Flipkart: HSBC 1.5%, BOB 5X', () => {
  const t = { channel: 'online' };
  assert.equal(evaluate(hsbc, txn('hsbc', 2000, 'marketplace', t), 0).value, 30);
  assert.equal(evaluate(bob, txn('bob', 2000, 'marketplace', t), 0).units, 300);
});

test('replay tracks best card and missed rewards', () => {
  const t = txn('bob', 1000, 'grocery');
  const r = replay([t], DEFAULT_CARDS).results.get(t.id);
  assert.equal(r.best, 'hsbc');
  assert.equal(r.missed, 100 - 7.5);
});

test('statement cycles', () => {
  assert.deepEqual(cycleOf('2026-10-15', 31), { key: '2026-10', start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(cycleOf('2026-10-25', 20), { key: '2026-11', start: '2026-10-21', end: '2026-11-20' });
  assert.deepEqual(cycleOf('2026-02-28', 31), { key: '2026-02', start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(cycleOf('2026-01-31', 30), { key: '2026-02', start: '2026-01-31', end: '2026-02-28' });
  assert.deepEqual(cycleOf('2026-12-25', 20), { key: '2027-01', start: '2026-12-21', end: '2027-01-20' });
});

test('card year and fee waiver', () => {
  assert.deepEqual(cardYearOf('2026-03-10', 4), { start: '2025-04-01', end: '2026-03-31' });
  const card = { ...hsbc, anniversaryMonth: 1 };
  const p = feeProgress([txn('hsbc', 50000, 'shopping')], card, '2026-10-05');
  assert.equal(p.remaining, 150000);
  assert.equal(p.done, false);
});

test('milestones', () => {
  const card = { ...bob, anniversaryMonth: 1, issueDate: '2026-09-20' };
  const ms = milestoneProgress([txn('bob', 60000, 'travel')], card, '2026-10-05');
  assert.equal(ms.length, 2);
  assert.equal(ms.find((m) => m.id === 'welcome').done, true);
  assert.equal(milestoneProgress([], { ...bob, issueDate: '' }, '2026-10-05').length, 1);
});

test('amount parsing', () => {
  assert.equal(parseAmount('1,299.50'), 1299.5);
  assert.equal(parseAmount('450+120'), 570);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('')));
});

test('spend before CardMax counts toward caps, fee waiver and milestones', () => {
  const hsbcOpen = { ...hsbc, openingDate: '2026-10-10', openingCycleBonusSpend: 8000, openingYearSpend: 150000 };
  const { cycles, results } = replay([txn('hsbc', 5000, 'grocery', { date: '2026-10-20' })], { hsbc: hsbcOpen, bob });
  assert.equal(cycles.hsbc['2026-10'].accelUsed, 1200);
  assert.equal([...results.values()][0].used.value, 400);
  assert.equal(feeProgress([], hsbcOpen, '2026-10-29').spend, 150000);
  const bobOpen = { ...bob, openingDate: '2026-10-10', openingYearSpend: 480000 };
  assert.equal(milestoneProgress([txn('bob', 20000, 'travel', { date: '2026-10-20' })], bobOpen, '2026-10-29').find((m) => m.id === 'annual').done, true);
});

test('spend before CardMax on a new card counts toward its welcome bonus', () => {
  const bobNew = { ...bob, issueDate: '2026-10-01', openingDate: '2026-10-10', openingYearSpend: 30000 };
  const welcome = milestoneProgress([txn('bob', 20000, 'travel', { date: '2026-10-20' })], bobNew, '2026-10-29').find((m) => m.id === 'welcome');
  assert.equal(welcome.spend, 50000);
  assert.equal(welcome.done, true);
});

test('UPI earns nothing, is never advised and never counts as a miss', () => {
  const cards = { ...DEFAULT_CARDS, upi: UPI };
  const t = txn('upi', 1000, 'grocery');
  const r = replay([t], cards).results.get(t.id);
  assert.equal(r.used.value, 0);
  assert.equal(r.best, 'hsbc');
  assert.equal(r.missed, 0);
  assert.deepEqual(advise(cards, {}, { amount: 500, category: 'fuel', channel: 'offline', date: '2026-10-05' }).map((x) => x.cardId).sort(), ['bob', 'hsbc']);
});

test('reward credits: pending, overdue, received and short', () => {
  const cycles = replay([
    txn('hsbc', 2000, 'dining', { date: '2026-07-10' }),
    txn('hsbc', 3000, 'dining', { date: '2026-08-10' }),
    txn('hsbc', 4000, 'dining', { date: '2026-09-10' }),
    txn('hsbc', 1000, 'dining', { date: '2026-10-10' }),
  ], DEFAULT_CARDS).cycles.hsbc;
  const credits = { 'hsbc|2026-07': { units: 200, date: '2026-08-20' }, 'hsbc|2026-08': { units: 250, date: '2026-09-20' } };
  const list = rewardCredits(hsbc, cycles, credits, '2026-10-29');
  assert.deepEqual(list.map((c) => [c.key, c.status, c.expected]), [
    ['2026-09', 'pending', 400], ['2026-08', 'short', 300], ['2026-07', 'received', 200],
  ]);
  assert.equal(list[1].short, 50);
  assert.equal(list[0].due, '2026-11-14');
  assert.equal(rewardCredits(hsbc, cycles, {}, '2026-11-20')[1].status, 'overdue');
});
