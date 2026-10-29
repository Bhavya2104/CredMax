// Reads a bank transaction SMS (HSBC, BOBCARD, UPI debit alerts) into a
// spend draft. Pure functions, no DOM. Covered by tests/sms.test.mjs.
//
// Bank formats vary and change, so every field is best-effort: whatever the
// parser can't find is left for you to fill in on the Add screen.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

// [pattern, category, channel, display name]; first match wins, so the more
// specific names come first (Instamart before Swiggy).
const KEYWORDS = [
  [/instamart/, 'grocery', 'online', 'Swiggy Instamart'],
  [/swiggy/, 'food_delivery', 'online', 'Swiggy'],
  [/zomato/, 'food_delivery', 'online', 'Zomato'],
  [/eatsure/, 'food_delivery', 'online', 'EatSure'],
  [/blinkit|grofers/, 'grocery', 'online', 'Blinkit'],
  [/zepto/, 'grocery', 'online', 'Zepto'],
  [/bigbasket|bbnow/, 'grocery', 'online', 'BigBasket'],
  [/jiomart/, 'grocery', 'online', 'JioMart'],
  [/dmart|avenue super/, 'grocery', 'offline', 'DMart'],
  [/supermarket|kirana|reliance fresh|smart bazaar|more retail|spencer|nature.?s basket|ratnadeep/, 'grocery', 'offline'],
  [/amazon/, 'marketplace', 'online', 'Amazon'],
  [/flipkart/, 'marketplace', 'online', 'Flipkart'],
  [/myntra/, 'marketplace', 'online', 'Myntra'],
  [/nykaa/, 'shopping', 'online', 'Nykaa'],
  [/ajio/, 'shopping', 'online', 'Ajio'],
  [/tata ?cliq/, 'shopping', 'online', 'Tata CLiQ'],
  [/croma|reliance digital|vijay sales|decathlon|lifestyle|westside|pantaloons|zara|h ?& ?m|uniqlo|max fashion|shoppers stop/, 'shopping', 'offline'],
  [/tanishq|caratlane|kalyan|malabar|jewel/, 'jewellery', 'offline'],
  [/irctc/, 'travel', 'online', 'IRCTC'],
  [/makemytrip|mmt/, 'travel', 'online', 'MakeMyTrip'],
  [/goibibo|cleartrip|yatra|easemytrip|ixigo|agoda|booking\.com|airbnb|oyo/, 'travel', 'online'],
  [/indigo|interglobe/, 'travel', 'online', 'IndiGo'],
  [/air ?india|vistara|akasa|spicejet/, 'travel', 'online'],
  [/hotel|resort/, 'travel', 'offline'],
  [/uber/, 'cabs', 'online', 'Uber'],
  [/\bola\b|ola ?cabs|ani technologies/, 'cabs', 'online', 'Ola'],
  [/rapido|blusmart|meru/, 'cabs', 'online'],
  [/fastag|toll|metro|dmrc|bmrcl/, 'transit', 'online'],
  [/bookmyshow|bms/, 'entertainment', 'online', 'BookMyShow'],
  [/district/, 'entertainment', 'online', 'District'],
  [/netflix|spotify|hotstar|jiocinema|youtube|sonyliv|zee5/, 'entertainment', 'online'],
  [/pvr|inox|cinepolis/, 'entertainment', 'offline'],
  [/hospital/, 'hospital', 'offline'],
  [/pharm|apollo|medplus|1mg|netmeds|chemist|wellness forever/, 'health', 'offline'],
  [/petrol|fuel|hpcl|iocl|bpcl|indian oil|bharat petroleum|hindustan petroleum|nayara|shell/, 'fuel', 'offline'],
  [/airtel|jio|vodafone|\bvi\b|bsnl|recharge|electricity|bescom|msedcl|tata power|adani elec|torrent power|mahanagar gas|broadband|act fibernet|tata play|dth|water bill|bill ?pay|billdesk/, 'utilities', 'online'],
  [/insurance|\blic\b|policybazaar|acko|hdfc ergo|icici lombard|star health/, 'insurance', 'online'],
  [/school|college|university|academy|coursera|udemy|byju/, 'education', 'online'],
  [/income tax|\bgst\b|challan|municipal|passport|govt|government/, 'government', 'online'],
  [/nobroker|rent/, 'rent', 'online'],
  [/wallet|add money|paytm/, 'wallet', 'online'],
  [/starbucks|mcdonald|kfc|burger king|domino|pizza|subway|cafe|café|restaurant|bistro|brew|pub|\bbar\b|kitchen|dhaba|biryani|chaayos|barbeque|haldiram/, 'dining', 'offline'],
];

function parseAmount(text) {
  const re = /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = re.exec(text))) {
    // Skip balances and limits that banks append after the spend amount.
    const before = text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    if (/(limit|lmt|bal|balance|avl|avbl|available|outstanding|due)\W*$/.test(before)) continue;
    const v = Number(m[1].replace(/,/g, ''));
    if (v > 0) return Math.round(v * 100) / 100;
  }
  return null;
}

function toISO(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseDate(text, today) {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return toISO(+m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})[-/ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ,]*(\d{2,4})\b/);
  if (m) return toISO(+m[3], MONTHS[m[2]], +m[1]);
  m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return toISO(+m[3], +m[2], +m[1]);
  m = t.match(/\b(\d{1,2}) ?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (m) return toISO(+today.slice(0, 4), MONTHS[m[2]], +m[1]);
  return null;
}

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  .replace(/\b(hpcl|iocl|bpcl|irctc|kfc|pvr|lic|dth)\b/gi, (w) => w.toUpperCase());

function parseMerchant(text) {
  const vpa = text.match(/\b([a-z0-9][\w.-]*)@[a-z]{2,}\b/i);
  const patterns = [
    /\bat\s+(.+?)(?=\s+on\s|\s+dated?\s|\s+via\s|\.\s|\. ?avl|,|\s+avl|\s+avbl|\s+ref|\s+txn|\s+for\s|$)/i,
    /\b(?:to|towards)\s+(?:vpa\s+)?(.+?)(?=\s+on\s|\s+ref|\s+upi|\s+\(|\.\s|,|$)/i,
    /\binfo:?\s*(.+?)(?=\.\s|,|\s+avl|$)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let name = m[1].replace(/^(upi|pos|pg|ecom|vpa)[\s/*-]+/i, '').replace(/[\s/*-]+\d{4,}.*$/, '').trim();
    if (name.includes('@')) name = name.split('@')[0];
    name = name.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (name && !/^(your|a\/c|ac|account|card)\b/i.test(name) && name.length <= 40) return titleCase(name);
  }
  if (vpa) return titleCase(vpa[1].split(/[._-]/)[0]);
  return null;
}

function parseLast4(text) {
  const m = text.match(/(?:x{2,}|\*{2,}|ending(?: with)?|end(?:ing)? in|no\.?|card)\s*[-:]?\s*(\d{4})\b/i);
  return m ? m[1] : null;
}

// methods: [{ id, last4, smsKeywords }] for the cards; returns the card id,
// 'upi', or null when it can't tell.
function parseMethod(text, methods, last4) {
  const t = text.toLowerCase();
  const byDigits = last4 && methods.find((c) => c.last4 && c.last4 === last4);
  if (byDigits) return { id: byDigits.id, reason: 'card digits' };
  const isCard = /credit card|\bcard\b|bobcard/.test(t);
  const byName = methods.find((c) => (c.smsKeywords || []).some((k) => t.includes(k)));
  if (byName && isCard) return { id: byName.id, reason: 'bank name' };
  if (/\bupi\b|\bvpa\b|@[a-z]{2,}\b/.test(t)) return { id: 'upi', reason: 'UPI' };
  if (byName) return { id: byName.id, reason: 'bank name' };
  return { id: null, reason: '' };
}

export function guessCategory(merchant, text, known = []) {
  const hay = `${merchant || ''} ${text || ''}`.toLowerCase();
  const m = merchant && known.find((k) => k.name.toLowerCase() === merchant.toLowerCase());
  if (m) return { category: m.category, channel: m.channel, name: m.name };
  for (const [re, category, channel, name] of KEYWORDS) if (re.test(hay)) return { category, channel, name };
  return null;
}

export function parseSms(text, { methods = [], known = [], today }) {
  const amount = parseAmount(text);
  const last4 = parseLast4(text);
  const method = parseMethod(text, methods, last4);
  let date = parseDate(text, today);
  if (!date || date > today) date = null;
  let merchant = parseMerchant(text);
  const guess = guessCategory(merchant, text, known);
  if (guess?.name) merchant = guess.name;
  let channel = guess?.channel || null;
  if (/\b(online|e-?com|internet|website)\b/i.test(text)) channel = 'online';
  if (/\bpos\b|\bcontactless\b|\btap\b/i.test(text)) channel = 'offline';
  return {
    amount, last4, date, merchant,
    card: method.id, cardReason: method.reason,
    category: guess?.category || null, channel,
  };
}
