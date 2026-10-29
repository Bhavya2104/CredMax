// Card benefit rules for HSBC Live+ and BOBCARD Eterna (India).
//
// Compiled from the issuers' published feature lists and MITC as last known
// (Oct 2026). Banks revise caps and exclusions often, so every value here is
// only a default: each one can be overridden on-device from the Cards tab.

export const RULES_VERSION = 'Oct 2026';

export const CARD_ORDER = ['hsbc', 'bob'];
// Payment methods you can record a spend against: the two cards plus UPI / bank
// account, which earns nothing but keeps monthly spend complete.
export const METHOD_IDS = [...CARD_ORDER, 'upi'];

export const UPI = {
  id: 'upi', name: 'UPI / bank', short: 'UPI', kind: 'none', noRewards: true,
  pointValue: 1, per100: false, accelRate: 0, accelCap: 0, capMode: 'total', afterCapRate: 0, baseRate: 0,
  intlRule: 'same', forexMarkup: 0, statementDay: 31, anniversaryMonth: 1, feeWaiverSpend: 0, milestones: [], map: {},
};

export const CATEGORIES = [
  { id: 'dining', short: 'Dining', label: 'Dining out', icon: '🍽️', hint: 'Restaurants, cafés, bars, QSRs (MCC 5811–5814)' },
  { id: 'food_delivery', short: 'Delivery', label: 'Food delivery', icon: '🛵', hint: 'Swiggy, Zomato, EatSure', channel: 'online' },
  { id: 'grocery', short: 'Groceries', label: 'Groceries', icon: '🛒', hint: 'Supermarkets, Blinkit, Zepto, Instamart, BigBasket (MCC 5411, 5499…)' },
  { id: 'shopping', short: 'Shopping', label: 'Shopping', icon: '🛍️', hint: 'Apparel, electronics, department stores and brand sites like Nykaa or Ajio (not Amazon/Flipkart)' },
  { id: 'marketplace', short: 'Amazon, Flipkart', label: 'Amazon & Flipkart', icon: '📦', hint: 'Amazon, Flipkart and Myntra (Myntra earns 1.5% on HSBC from 1 Nov 2026)', channel: 'online' },
  { id: 'utilities', short: 'Bills', label: 'Bills & recharges', icon: '💡', hint: 'Electricity, gas, water, mobile, broadband, DTH (MCC 4900, 4814)' },
  { id: 'travel', short: 'Travel', label: 'Travel', icon: '✈️', hint: 'Flights, hotels, trains, holiday packages' },
  { id: 'cabs', short: 'Cabs', label: 'Cabs', icon: '🚕', hint: 'Uber, Ola, Rapido, taxis (MCC 4121)' },
  { id: 'entertainment', short: 'Movies & OTT', label: 'Entertainment', icon: '🎬', hint: 'Movies, events, OTT subscriptions' },
  { id: 'health', short: 'Pharmacy', label: 'Pharmacy', icon: '💊', hint: 'Medicines, pharmacies, diagnostics' },
  { id: 'fuel', short: 'Fuel', label: 'Fuel', icon: '⛽', hint: 'Petrol, diesel, CNG (MCC 5541, 5542, 5983)' },
  { id: 'transit', short: 'Metro & tolls', label: 'Metro, bus & tolls', icon: '🚇', hint: 'Metro cards, bus passes, FASTag tolls (MCC 4111, 4784)' },
  { id: 'hospital', short: 'Hospital', label: 'Hospitals', icon: '🏥', hint: 'Hospital bills (MCC 8062)' },
  { id: 'jewellery', short: 'Jewellery', label: 'Jewellery', icon: '💍', hint: 'Jewellers, gold, antiques (MCC 5944, 5094, 5932, 5937)' },
  { id: 'insurance', short: 'Insurance', label: 'Insurance', icon: '🛡️', hint: 'Life, health, motor premiums (MCC 6300, 5960)' },
  { id: 'education', short: 'Education', label: 'Education', icon: '🎓', hint: 'School / college fees, courses' },
  { id: 'government', short: 'Govt & tax', label: 'Govt & tax', icon: '🏛️', hint: 'Taxes, challans, government services' },
  { id: 'rent', short: 'Rent', label: 'Rent', icon: '🏠', hint: 'Rent via CRED, NoBroker etc. (MCC 6513)' },
  { id: 'wallet', short: 'Wallet', label: 'Wallet load', icon: '👛', hint: 'Paytm, Amazon Pay, PhonePe wallet top-ups (MCC 6540)' },
  { id: 'other', short: 'Other', label: 'Other', icon: '💳', hint: 'Anything that fits nowhere else' },
];

// Shown first on the Add screen; the rest sit behind "More".
export const PRIMARY_CATEGORIES = 11;

const CAT_INDEX = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catById = (id) => CAT_INDEX[id] || CAT_INDEX.other;

// One-tap merchants for the Add screen; set category + channel together.
export const MERCHANTS = [
  { name: 'Swiggy', category: 'food_delivery', channel: 'online' },
  { name: 'Zomato', category: 'food_delivery', channel: 'online' },
  { name: 'Blinkit', category: 'grocery', channel: 'online' },
  { name: 'Zepto', category: 'grocery', channel: 'online' },
  { name: 'Swiggy Instamart', category: 'grocery', channel: 'online' },
  { name: 'BigBasket', category: 'grocery', channel: 'online' },
  { name: 'DMart', category: 'grocery', channel: 'offline' },
  { name: 'Restaurant', category: 'dining', channel: 'offline' },
  { name: 'Café', category: 'dining', channel: 'offline' },
  { name: 'Amazon', category: 'marketplace', channel: 'online' },
  { name: 'Flipkart', category: 'marketplace', channel: 'online' },
  { name: 'Myntra', category: 'marketplace', channel: 'online' },
  { name: 'Nykaa', category: 'shopping', channel: 'online' },
  { name: 'Ajio', category: 'shopping', channel: 'online' },
  { name: 'Croma', category: 'shopping', channel: 'offline' },
  { name: 'Mobile recharge', category: 'utilities', channel: 'online' },
  { name: 'Electricity bill', category: 'utilities', channel: 'online' },
  { name: 'Uber', category: 'cabs', channel: 'online' },
  { name: 'Ola', category: 'cabs', channel: 'online' },
  { name: 'MakeMyTrip', category: 'travel', channel: 'online' },
  { name: 'IndiGo', category: 'travel', channel: 'online' },
  { name: 'IRCTC', category: 'travel', channel: 'online' },
  { name: 'BookMyShow', category: 'entertainment', channel: 'online' },
  { name: 'District', category: 'entertainment', channel: 'online' },
  { name: 'Pharmacy', category: 'health', channel: 'offline' },
  { name: 'Petrol pump', category: 'fuel', channel: 'offline' },
  { name: 'FASTag', category: 'transit', channel: 'online' },
];

// Reward maths is unified: a card earns `rate` units per ₹100 of eligible
// spend. For a cashback card a unit is ₹1 (so rate == percent); for a points
// card a unit is one point worth `pointValue` rupees.
//
// Bonus cap (per statement cycle, in units, 0 = none):
//   capMode 'total' – everything earned at accelRate counts toward the cap;
//                     after it, the category earns afterCapRate.
//   capMode 'bonus' – only the extra (accelRate − baseRate) counts; the base
//                     rate keeps earning past the cap.
// intlRule: 'accel' – international spends earn the bonus rate in any
//                     eligible category; 'noBase' – international spends lose
//                     the base rate; 'same' – no special treatment.
// map[category] = [in-store bucket, online bucket]. Buckets: 'accel', 'base'
// or 'none'. Categories not listed earn 'base'.
export const DEFAULT_CARDS = {
  hsbc: {
    id: 'hsbc',
    name: 'HSBC Live+',
    short: 'HSBC',
    kind: 'cashback',
    pointValue: 1,
    per100: false,
    accelRate: 10,
    accelCap: 1200,
    capMode: 'total',
    afterCapRate: 0,
    baseRate: 1.5,
    intlRule: 'noBase',
    creditDays: 45,
    smsKeywords: ['hsbc'],
    last4: '',
    accelLabel: 'dining, delivery, groceries, shopping & bills',
    forexMarkup: 1.99,
    joiningFee: 999,
    annualFee: 999,
    feeWaiverSpend: 200000,
    statementDay: 31,
    anniversaryMonth: 1,
    issueDate: '',
    milestones: [],
    map: {
      dining: ['accel', 'accel'],
      food_delivery: ['accel', 'accel'],
      grocery: ['accel', 'accel'],
      shopping: ['accel', 'accel'],
      utilities: ['accel', 'accel'],
      marketplace: ['base', 'base'],
      travel: ['base', 'base'],
      cabs: ['base', 'base'],
      entertainment: ['base', 'base'],
      health: ['base', 'base'],
      other: ['base', 'base'],
      fuel: ['none', 'none'],
      transit: ['none', 'none'],
      hospital: ['none', 'none'],
      jewellery: ['none', 'none'],
      insurance: ['none', 'none'],
      education: ['none', 'none'],
      government: ['none', 'none'],
      rent: ['none', 'none'],
      wallet: ['none', 'none'],
    },
    officialUrl: 'https://www.hsbc.co.in/credit-cards/products/live-plus/',
    benefits: [
      ['10% cashback', 'On dining, food delivery, groceries, shopping and utility/telecom bills, capped at ₹1,200 cashback a month (≈ ₹12,000 of spend). Spends beyond the cap in these categories earn nothing.'],
      ['1.5% cashback', 'Unlimited, on most other domestic spends, including Amazon and Flipkart (from 26 Jul 2026). Myntra earns 10% until 31 Oct 2026, then 1.5%.'],
      ['Not abroad', 'From 26 Jul 2026, international spends no longer earn the 1.5%.'],
      ['No cashback on', 'Fuel, wallets, rent, insurance, education, government, jewellery, hospitals, tolls, metro/bus, gambling, B2B, wholesale clubs, money transfers, cash and Instant EMI.'],
      ['Credit', 'Auto-credited within 45 days of the statement date. Cashback on refunded spends is recovered.'],
      ['Lounges', '2 domestic visits a year (max 1 every 6 months) plus 1 international visit a year, booked through Thriwe. Also a free 1 GB global eSIM each year.'],
      ['Fuel', 'No surcharge waiver. ₹250 cashback on contactless fuel purchases when you spend ₹10,000 in a quarter.'],
      ['Dining & lifestyle', 'Live+ Reserve dining with Times Prime, BOGO movies on District/BookMyShow, ITC Hotels and Avis offers, plus Visa Infinite perks.'],
      ['Fees', '₹999 joining fee (not waived) and a ₹999 annual fee, reversed when you spend more than ₹2,00,000 in the anniversary year.'],
      ['Forex', '1.99% + GST markup.'],
      ['Insurance', 'Lost-card cover up to ₹1,00,000.'],
    ],
    verify: [
      'HSBC says “₹1,200 a month”. The app resets the cap each statement cycle. Set the statement date to “Last day of month” if HSBC counts calendar months for you.',
      'Whether 10%-category spends abroad still earn 10%. The app gives them 10% and gives other spends abroad nothing.',
      'Category is decided by the merchant’s MCC. If a statement shows 1.5% where you expected 10%, change that category in Category rules.',
    ],
  },
  bob: {
    id: 'bob',
    name: 'BOB Eterna',
    short: 'BOB',
    kind: 'points',
    pointValue: 0.25,
    per100: true,
    accelRate: 15,
    accelCap: 5000,
    capMode: 'bonus',
    afterCapRate: 3,
    baseRate: 3,
    intlRule: 'accel',
    creditDays: 7,
    smsKeywords: ['bobcard', 'bob card', 'bob financial', 'bank of baroda', 'bob credit card'],
    last4: '',
    accelLabel: 'travel, dining, online & international spends',
    forexMarkup: 2,
    joiningFee: 0,
    annualFee: 2499,
    feeWaiverSpend: 250000,
    statementDay: 31,
    anniversaryMonth: 1,
    issueDate: '',
    milestones: [
      { id: 'annual', label: 'Annual milestone', spend: 500000, units: 20000, window: 'cardYear' },
      { id: 'welcome', label: 'Welcome bonus', spend: 50000, units: 10000, window: 'issue', days: 60 },
    ],
    map: {
      dining: ['accel', 'accel'],
      food_delivery: ['base', 'accel'],
      travel: ['accel', 'accel'],
      marketplace: ['accel', 'accel'],
      grocery: ['base', 'accel'],
      shopping: ['base', 'accel'],
      cabs: ['base', 'accel'],
      transit: ['base', 'accel'],
      entertainment: ['base', 'accel'],
      health: ['base', 'accel'],
      hospital: ['base', 'accel'],
      jewellery: ['base', 'accel'],
      other: ['base', 'accel'],
      utilities: ['base', 'base'],
      insurance: ['base', 'base'],
      education: ['base', 'base'],
      government: ['base', 'base'],
      fuel: ['none', 'none'],
      rent: ['none', 'none'],
      wallet: ['none', 'none'],
    },
    officialUrl: 'https://www.bobcard.co.in/credit-card-types/eterna',
    benefits: [
      ['15 RP / ₹100 (5X)', 'On travel, dining, online (eCommerce) and international spends, ≈ 3.75% value. The extra points are capped at 5,000 per statement cycle (≈ ₹41,667 of bonus spend), after which these spends earn the base 3 RP.'],
      ['3 RP / ₹100', 'On all other spends, ≈ 0.75% value. No points on fuel or on select MCCs.'],
      ['Point value', '1 reward point = ₹0.25 when redeemed for cashback.'],
      ['Annual milestone', '20,000 bonus points (₹5,000) on ₹5,00,000 spend in the anniversary year.'],
      ['Welcome bonus', '10,000 bonus points on ₹50,000 spend within 60 days of issue, plus a 12-month FITPASS PRO membership on ₹10,000 spend within 30 days.'],
      ['Lounges', 'Unlimited complimentary domestic airport lounge access, subject to a minimum quarterly spend.'],
      ['Fuel', '1% surcharge waiver on ₹400–₹5,000 transactions, max ₹250 per statement cycle. No points on fuel.'],
      ['Movies', 'Buy one get one on District, up to ₹250 off the second ticket, once a month.'],
      ['Fees', '₹0 joining fee from 1 Sep 2026. ₹2,499 annual fee from year two, waived on ₹2,50,000 spend in the preceding anniversary year.'],
      ['Forex', 'Low 2% + GST markup, and international spends earn 5X, so this is the card to use abroad.'],
      ['Other', 'Smart EMI on purchases above ₹2,500, up to 3 free add-on cards, zero lost-card liability.'],
    ],
    verify: [
      'Whether points are earned per full ₹100 (the app assumes ₹199 earns like ₹100). Turn off “Points only per full ₹100” if your statement says otherwise.',
      'Rent and wallet loads are assumed to earn nothing. The leaflet only says “select MCCs” are excluded.',
      'Online bills, insurance, education and tax are assumed to earn 3 RP, not 15. The docs don’t say whether they count as eCommerce.',
      'Food delivery in-store and cabs: only online/app payments are treated as 5X.',
    ],
  },
};
