// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { balances, equalShares, splitTotal, isSettled } from '../js/split.js';

test('equal shares never ask friends for more than the bill', () => {
  assert.deepEqual(equalShares(1000, 2, true), [333.33, 333.33]);
  assert.deepEqual(equalShares(1000, 2, false), [500, 500]);
  assert.deepEqual(equalShares(0, 2), []);
});

test('balances combine card splits and ledger entries', () => {
  const txns = [
    { id: 't1', date: '2026-10-01', createdAt: 1, split: { mode: 'equal', includeMe: true, friends: [{ id: 'a', share: 400 }, { id: 'b', share: 400 }] } },
    { id: 't2', date: '2026-10-03', createdAt: 2 },
  ];
  const ledger = [
    { id: 'l1', friendId: 'a', kind: 'received', amount: 150, date: '2026-10-05', createdAt: 3 },
    { id: 'l2', friendId: 'b', kind: 'borrowed', amount: 600, date: '2026-10-06', createdAt: 4 },
    { id: 'l3', friendId: 'c', kind: 'lent', amount: 99.5, date: '2026-10-07', createdAt: 5 },
    { id: 'l4', friendId: 'c', kind: 'received', amount: 99.5, date: '2026-10-08', createdAt: 6 },
  ];
  const { bal, activity } = balances(txns, ledger);
  assert.equal(bal.a, 250);
  assert.equal(bal.b, -200);
  assert.ok(isSettled(bal.c));
  assert.equal(activity.a[0].type, 'ledger');
  assert.equal(activity.a[1].txn.id, 't1');
  assert.equal(splitTotal(txns[0].split), 800);
});
