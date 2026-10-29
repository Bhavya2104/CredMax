// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSms } from '../js/sms.js';

const methods = [
  { id: 'hsbc', last4: '1234', smsKeywords: ['hsbc'] },
  { id: 'bob', last4: '', smsKeywords: ['bobcard', 'bank of baroda'] },
];
const ctx = { methods, known: [], today: '2026-10-29' };

test('HSBC card alert', () => {
  const r = parseSms('Thank you for using your HSBC Credit Card ending 1234 for INR 1,250.00 at SWIGGY on 28-Oct-26 at 08:15 PM. Available limit INR 1,23,456.00.', ctx);
  assert.deepEqual({ amount: r.amount, card: r.card, merchant: r.merchant, date: r.date, category: r.category, channel: r.channel },
    { amount: 1250, card: 'hsbc', merchant: 'Swiggy', date: '2026-10-28', category: 'food_delivery', channel: 'online' });
});

test('BOBCARD alert without saved digits, balance ignored', () => {
  const r = parseSms('Rs.2000.00 spent on your BOBCARD ending 5678 at HPCL PETROL PUMP on 21/10/2026. Avl Lmt Rs.1,50,000.00', ctx);
  assert.equal(r.amount, 2000);
  assert.equal(r.card, 'bob');
  assert.equal(r.category, 'fuel');
  assert.equal(r.date, '2026-10-21');
  assert.equal(r.merchant, 'HPCL Petrol Pump');
});

test('UPI debit from a bank account', () => {
  const r = parseSms('Rs.450.00 debited from A/c XX9012 on 28-10-26 to VPA zomato.order@ybl (UPI Ref No 123456789012). Not you? Call 1800', ctx);
  assert.equal(r.amount, 450);
  assert.equal(r.card, 'upi');
  assert.equal(r.category, 'food_delivery');
  assert.equal(r.date, '2026-10-28');
});

test('unknown merchant and future dates are left blank', () => {
  const r = parseSms('INR 999 spent on HSBC card xx1234 at RANDOM STORE on 15-12-26', ctx);
  assert.equal(r.amount, 999);
  assert.equal(r.card, 'hsbc');
  assert.equal(r.merchant, 'Random Store');
  assert.equal(r.category, null);
  assert.equal(r.date, null);
});
