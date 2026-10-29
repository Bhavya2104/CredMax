import { CATEGORIES, PRIMARY_CATEGORIES, MERCHANTS, CARD_ORDER, METHOD_IDS, RULES_VERSION, catById } from './rules.js';
import {
  replay, advise, cycleOf, cardYearOf, feeProgress, milestoneProgress, rewardCredits, cappedRate, periodRange, todayISO, toISO,
  daysBetween, lastMonths, monthKey, parseAmount,
} from './engine.js';
import { parseSms } from './sms.js';
import { cardArt } from './art.js';
import { balances, equalShares, splitTotal, isSettled, LEDGER_SIGN } from './split.js';
import * as store from './store.js';
import * as f from './format.js';

const APP_VERSION = '1.3.0';
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const sheetHead = $('#sheetHead');
const sheetBody = $('#sheetBody');
const sheetFoot = $('#sheetFoot');
const tipEl = $('#tip');
const toastEl = $('#toast');
const toastText = $('#toastText');
const toastAction = $('#toastAction');

const S = {
  data: store.load(),
  cards: null,
  calc: null,
  split: null,
  route: { name: null, arg: null },
  backTo: 'home',
  baseArg: null,
  baseRendered: null,
  sheetPushed: false,
  draft: null,
  prefill: null,
  hist: { q: '', card: 'all', missed: false, cat: null, month: null },
  month: monthKey(todayISO()),
  cardSel: CARD_ORDER[0],
  flipped: new Set(),
  open: new Set(),
  scroll: {},
};

function refresh() {
  S.cards = store.cardsFrom(S.data);
  S.calc = replay(S.data.txns, S.cards);
  S.split = balances(S.data.txns, S.data.ledger);
}

function persist() {
  try {
    store.save(S.data);
  } catch (e) {
    console.error(e);
    toast('Could not save: storage is full or blocked');
  }
  refresh();
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- routing

const SHEETS = ['add', 'edit', 'settle', 'iou'];
const TAB_OF = { friend: 'friends' };

function parseHash() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return VIEWS[name] ? { name, arg: arg ? decodeURIComponent(arg) : null } : { name: 'home', arg: null };
}

const baseHash = () => `#${S.backTo}${S.baseArg ? `/${encodeURIComponent(S.baseArg)}` : ''}`;

function navigate(hash) {
  const fromSheet = SHEETS.includes(S.route.name);
  if (location.hash !== `#${hash}`) history.pushState(null, '', `#${hash}`);
  if (SHEETS.includes(hash.split('/')[0]) && !fromSheet) S.sheetPushed = true;
  onRoute();
}

const friendById = (id) => S.data.friends.find((x) => x.id === id);

function onRoute() {
  const prev = S.route.name;
  const prevKey = baseHash();
  const prevBase = SHEETS.includes(prev) ? S.backTo : prev;
  S.route = parseHash();
  const { name, arg } = S.route;

  const missing = (name === 'edit' && !S.data.txns.some((t) => t.id === arg))
    || (['friend', 'settle', 'iou'].includes(name) && !friendById(arg));
  if (missing) {
    history.replaceState(null, '', name === 'edit' ? '#history' : '#friends');
    return onRoute();
  }

  if (SHEETS.includes(name)) {
    const d = S.draft;
    if (name === 'add' && (d?.kind !== 'spend' || d.id || S.prefill)) S.draft = newDraft(S.prefill || {});
    if (name === 'edit' && (d?.kind !== 'spend' || d.id !== arg)) S.draft = draftFrom(S.data.txns.find((t) => t.id === arg));
    if ((name === 'settle' || name === 'iou') && (d?.kind !== 'ledger' || d.mode !== name || d.friendId !== arg)) {
      S.draft = ledgerDraft(name, arg);
      if (!S.baseRendered) Object.assign(S, { backTo: 'friend', baseArg: arg });
    }
    S.prefill = null;
    if (!S.baseRendered) renderBase(S.backTo, true);
    renderSheet();
    openSheet();
    return;
  }

  S.draft = null;
  S.sheetPushed = false;
  if (sheet.open) hideSheet();
  if (prevBase) S.scroll[prevKey] = window.scrollY;
  const switching = prevBase !== name || (S.baseArg || null) !== (arg || null);
  S.backTo = name;
  S.baseArg = arg;
  renderBase(name, switching);
}

function closeSheet() {
  if (S.sheetPushed) {
    S.sheetPushed = false;
    history.back();
  } else {
    history.replaceState(null, '', baseHash());
    onRoute();
  }
}

function requestClose() {
  const d = S.draft;
  if (d?.dirty && !confirm(d.id ? 'Discard your changes?' : 'Discard this entry?')) return;
  closeSheet();
}

function renderBase(name, switching) {
  document.body.dataset.view = name;
  hideTip();
  view.innerHTML = VIEWS[name]();
  S.baseRendered = name;
  const tab = TAB_OF[name] || name;
  for (const b of document.querySelectorAll('.tabbar [data-tab]')) {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  if (switching) window.scrollTo(0, S.scroll[baseHash()] || 0);
  watchTitle();
}

function focusSelector(el) {
  if (!el || el === document.body || !el.dataset) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  for (const k of ['draft', 'hist', 'cf', 'cmap', 'share']) if (el.dataset[k]) return `[data-${k}="${el.dataset[k]}"]`;
  if (!el.dataset.act) return null;
  return `[data-act="${el.dataset.act}"]${['v', 'd', 'id'].map((k) => (el.dataset[k] ? `[data-${k}="${CSS.escape(el.dataset[k])}"]` : '')).join('')}`;
}

// Re-renders whatever is on screen, keeping scroll position and focus (so
// VoiceOver doesn't jump back to the top).
function rerender() {
  const sel = focusSelector(document.activeElement);
  if (SHEETS.includes(S.route.name)) {
    renderSheet();
  } else {
    const y = window.scrollY;
    renderBase(S.route.name, false);
    window.scrollTo(0, y);
  }
  if (sel) document.querySelector(sel)?.focus({ preventScroll: true });
}

// Large title → inline nav bar title once it scrolls under the bar.
let titleObserver;
function watchTitle() {
  const h1 = view.querySelector('.large-title h1');
  $('.navbar-title').textContent = h1?.textContent || '';
  titleObserver?.disconnect();
  document.body.classList.remove('scrolled');
  if (!h1 || !('IntersectionObserver' in window)) return;
  titleObserver = new IntersectionObserver(
    ([e]) => document.body.classList.toggle('scrolled', !e.isIntersecting),
    { rootMargin: `-${$('.navbar').offsetHeight}px 0px 0px 0px` },
  );
  titleObserver.observe(h1);
}

// ---------------------------------------------------------------- sheet

function openSheet() {
  document.documentElement.classList.add('sheet-open');
  if (sheet.open) return;
  sheet.showModal();
  sheet.getBoundingClientRect();
  requestAnimationFrame(() => sheet.classList.add('in'));
}

function hideSheet() {
  document.documentElement.classList.remove('sheet-open');
  sheet.classList.remove('in');
  setTimeout(() => {
    if (!sheet.classList.contains('in')) sheet.close();
  }, reduceMotion() ? 200 : 450);
}

sheet.addEventListener('cancel', (e) => {
  e.preventDefault();
  requestClose();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) requestClose();
});

// Drag the grabber or title bar down to dismiss.
let dragY = null;
sheet.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.grabber, .sheet-head') || e.target.closest('button')) return;
  dragY = e.clientY;
  sheet.setPointerCapture(e.pointerId);
  sheet.style.transition = 'none';
});
sheet.addEventListener('pointermove', (e) => {
  if (dragY !== null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - dragY)}px)`;
});
const endDrag = (e) => {
  if (dragY === null) return;
  const dy = e.clientY - dragY;
  dragY = null;
  sheet.style.transition = '';
  sheet.style.transform = '';
  if (dy > 100) requestClose();
};
sheet.addEventListener('pointerup', endDrag);
sheet.addEventListener('pointercancel', endDrag);

// Keeps the sheet (and its Save button) above the on-screen keyboard.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    const s = document.documentElement.style;
    s.setProperty('--vvh', `${vv.height}px`);
    s.setProperty('--vvt', `${vv.offsetTop}px`);
    document.body.classList.toggle('kb', window.innerHeight - vv.height > 120);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

// ---------------------------------------------------------------- helpers

const isPoints = (card) => card.kind === 'points';
const rateText = (card, rate) => (isPoints(card) ? `${rate} pts/₹100` : f.pct(rate));
const capLabel = (card) => (isPoints(card)
  ? `${card.capMode === 'bonus' ? 'Bonus points' : `${card.accelRate}X points`} cap`
  : `${f.pct(card.accelRate)} cashback cap`);
const rewardText = (card, r) => (isPoints(card) ? `+${f.num(r.units)} pts` : `+${f.reward(r.value)}`);
const unitsText = (card, units) => (isPoints(card) ? `${f.num(units)} pts` : f.reward(units));
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const byRecent = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
const dot = (id) => `<i class="dot ${id}" aria-hidden="true"></i>`;
const icon = {
  x: '<svg class="x-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  chev: (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`,
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
  paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="5" width="13" height="16" rx="2"/><path d="M9 5V4.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V5M9 11h6M9 15h4"/></svg>',
};

// Grows the amount field with its text so the ₹ sign sits right beside the number.
function sizeAmount(el = $('#amount')) {
  if (el) el.style.width = `${Math.max(1, (el.value || el.placeholder).length) + 0.4}ch`;
}
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avatar = (fr, size = '') => `<span class="avatar ${size}" aria-hidden="true">${f.esc(initials(fr.name))}</span>`;
const nameList = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

function aggregate({ start, end }) {
  const a = { spend: 0, value: 0, fx: 0, net: 0, missed: 0, optimal: 0, count: 0, byCard: {}, byCat: {} };
  for (const t of S.data.txns) {
    if (t.date < start || t.date > end) continue;
    const r = S.calc.results.get(t.id);
    if (!r) continue;
    a.count += 1;
    a.spend += t.amount;
    a.value += r.used.value;
    a.fx += r.used.fx;
    a.net += r.used.net;
    a.missed += r.missed;
    a.optimal += r.used.net + r.missed;
    const c = (a.byCard[t.card] ||= { spend: 0, value: 0, units: 0, count: 0 });
    c.spend += t.amount;
    c.value += r.used.value;
    c.units += r.used.units;
    c.count += 1;
    const k = (a.byCat[t.category] ||= { spend: 0, value: 0, missed: 0, count: 0, byCard: {} });
    k.count += 1;
    k.spend += t.amount;
    k.value += r.used.value;
    k.missed += r.missed;
    k.byCard[t.card] = (k.byCard[t.card] || 0) + t.amount;
  }
  return a;
}

function knownMerchants() {
  const seen = new Map();
  for (const t of [...S.data.txns].sort(byRecent)) {
    const name = t.merchant.trim();
    const k = name.toLowerCase();
    if (k && !seen.has(k)) seen.set(k, { name, category: t.category, channel: t.channel });
  }
  for (const m of MERCHANTS) if (!seen.has(m.name.toLowerCase())) seen.set(m.name.toLowerCase(), m);
  return [...seen.values()];
}

function meter({ label, used, total, text, full }) {
  const p = Math.min(100, total ? (used / total) * 100 : 0);
  return `<div class="meter ${full ? 'full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}" aria-valuetext="${f.esc(`${label}: ${Math.round(p)}% used. ${text}`)}">
    <div class="meter-top" aria-hidden="true"><span>${label}</span><span>${Math.round(p)}%</span></div>
    <div class="meter-track" aria-hidden="true"><div class="meter-fill" style="width:${p}%"></div></div>
    <p class="meter-text" aria-hidden="true">${text}</p>
  </div>`;
}

// What the card's rules say this spend earned, after that cycle's cap.
function rewardStatus(card, u) {
  if (card.noRewards) return { cls: 'none', icon: '–', text: 'No rewards' };
  const earned = rewardText(card, u).slice(1);
  if (u.bucket === 'none') return { cls: 'none', icon: '–', text: u.intlExcluded ? 'None abroad' : 'Not eligible' };
  if (u.bucket === 'accel' && u.overCap > 0) {
    if (u.accelDelta > 0) return { cls: 'partial', icon: '◐', text: `Capped · ${earned}`, spoken: `Partly capped, earned ${earned}` };
    return { cls: 'capped', icon: '⊘', text: `Cap hit · ${u.units > 0 ? earned : isPoints(card) ? '0 pts' : '₹0'}`, spoken: 'Cap reached' };
  }
  if (u.units <= 0) return { cls: 'none', icon: '–', text: card.per100 && u.amount < 100 ? 'Under ₹100' : 'Not eligible' };
  return { cls: 'earned', icon: '✓', text: `Earned ${earned}` };
}

function splitLine(t) {
  const shares = t.split?.friends || [];
  if (!shares.length) return '';
  const names = shares.map((s) => friendById(s.id)?.name || 'Friend');
  return `${nameList(names)} owe${names.length === 1 ? 's' : ''} you ${f.amount(splitTotal(t.split))}`;
}

function txnRow(t) {
  const r = S.calc.results.get(t.id);
  const c = catById(t.category);
  const card = S.cards[t.card];
  const st = rewardStatus(card, r.used);
  const title = t.merchant || c.label;
  const missed = r.missed >= 0.5 ? `${S.cards[r.best].name} would have earned ${f.reward(r.missed)} more` : '';
  const split = splitLine(t);
  const where = t.intl ? ' · Abroad' : '';
  const label = [title, f.amount(t.amount), card.name, f.dateLong(t.date), c.label, st.spoken || st.text, split, t.note && `Note: ${t.note}`, missed]
    .filter(Boolean).join(', ');
  return `<button class="txn" data-act="openTxn" data-id="${f.esc(t.id)}" aria-label="${f.esc(label)}">
    <span class="txn-ico" aria-hidden="true">${c.icon}</span>
    <span class="txn-main" aria-hidden="true">
      <span class="txn-line"><span class="txn-title">${f.esc(title)}</span><span class="txn-amt">${f.amount(t.amount)}</span></span>
      <span class="txn-line"><span class="txn-sub">${dot(t.card)}${card.short} · ${f.dateLabel(t.date)}${where}</span><span class="txn-status ${st.cls}">${st.icon} ${st.text}</span></span>
      ${split ? `<span class="txn-split">👥 ${f.esc(split)}</span>` : ''}
      ${t.note ? `<span class="txn-note">${f.esc(t.note)}</span>` : ''}
      ${missed ? `<span class="txn-miss">⚠︎ ${f.reward(r.missed)} more on ${S.cards[r.best].short}</span>` : ''}
    </span>
  </button>`;
}

function emptyState(text, action = { act: 'go', to: 'add', label: 'Add a Spend' }) {
  const btn = action ? `<button class="btn primary" data-act="${action.act}" ${action.to ? `data-to="${action.to}"` : ''}>${action.label}</button>` : '';
  return `<div class="empty"><p>${text}</p>${btn}</div>`;
}

function friendTotals() {
  let owed = 0;
  let owe = 0;
  for (const fr of S.data.friends) {
    const b = S.split.bal[fr.id] || 0;
    if (b > 0) owed += b;
    else owe -= b;
  }
  return { owed, owe };
}

// ---------------------------------------------------------------- home

const SCENARIOS = [
  { label: 'Dining out', category: 'dining', channel: 'offline' },
  { label: 'Food delivery', category: 'food_delivery', channel: 'online' },
  { label: 'Groceries in store', category: 'grocery', channel: 'offline' },
  { label: 'Groceries online', category: 'grocery', channel: 'online' },
  { label: 'Shopping in store', category: 'shopping', channel: 'offline' },
  { label: 'Shopping on brand sites', category: 'shopping', channel: 'online' },
  { label: 'Amazon & Flipkart', category: 'marketplace', channel: 'online' },
  { label: 'Bills & recharges', category: 'utilities', channel: 'online' },
  { label: 'Flights, hotels, trains', category: 'travel', channel: 'online' },
  { label: 'Cabs via app', category: 'cabs', channel: 'online' },
  { label: 'Pharmacy in store', category: 'health', channel: 'offline' },
  { label: 'Fuel', category: 'fuel', channel: 'offline' },
];

function scenarioRows(today) {
  return SCENARIOS.map((s, i) => {
    const [best, alt] = advise(S.cards, S.calc.cycles, { ...s, amount: 1000, date: today });
    let right;
    let spoken;
    if (best.net <= 0 && !s.intl) {
      right = '<span class="sc-none">No rewards on either</span>';
      spoken = 'no rewards on either card';
    } else {
      right = `<span class="sc-best">${dot(best.cardId)}<b>${S.cards[best.cardId].short}</b> ${f.pct(best.rate)}</span>
        <span class="sc-alt">${S.cards[alt.cardId].short} ${f.pct(alt.rate)}</span>`;
      spoken = `use ${S.cards[best.cardId].name}, ${f.pct(best.rate)}; ${S.cards[alt.cardId].name} ${f.pct(alt.rate)}`;
    }
    return `<button class="row scenario" data-act="scenario" data-i="${i}" aria-label="${f.esc(`${s.label}: ${spoken}`)}">
      <span class="ico" aria-hidden="true">${s.icon || catById(s.category).icon}</span>
      <span class="grow" aria-hidden="true">${s.label}</span>
      <span class="sc-right" aria-hidden="true">${right}</span>
    </button>`;
  }).join('');
}

const flipIcon = '<svg class="flip-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 10a7.5 7.5 0 0 1 13.4-3.2L20 9M20 4.5V9h-4.5M19.5 14a7.5 7.5 0 0 1-13.4 3.2L4 15M4 19.5V15h4.5"/></svg>';
const flipLabel = (card, flipped) => (flipped ? `Show ${card.name} this cycle` : `Show ${card.name} milestones, fee waiver and credits`);

// Home tile, widget style: the front shows this cycle (spend, earned, cap);
// tap to flip to the back with the card-year goals and reward credits.
function cardTile(card, today) {
  const cyc = cycleOf(today, card.statementDay);
  const st = S.calc.cycles[card.id][cyc.key] || { spend: 0, units: 0, value: 0, accelUsed: 0 };
  const daysLeft = daysBetween(today, cyc.end);
  const earned = isPoints(card) ? `${f.num(st.units)} pts <small>≈ ${f.reward(st.value)}</small>` : f.reward(st.value);
  const flipped = S.flipped.has(card.id);

  let capMeter = '';
  if (card.accelCap > 0) {
    const left = Math.max(0, card.accelCap - st.accelUsed);
    const full = left <= 0;
    const leftText = isPoints(card) ? `${f.num(left)} bonus pts` : `${f.reward(left)} cashback`;
    capMeter = meter({
      label: capLabel(card),
      used: st.accelUsed,
      total: card.accelCap,
      full,
      text: full
        ? `Cap reached this cycle. ${card.capMode === 'bonus' ? `These spends now earn ${rateText(card, card.baseRate)}.` : `Use the other card for ${card.accelLabel}.`}`
        : `${leftText} left ≈ ${f.money((left * 100) / cappedRate(card))} more on ${card.accelLabel}`,
    });
  }

  const milestones = milestoneProgress(S.data.txns, card, today).map((m) => meter({
    label: `${m.label} · ${isPoints(card) ? `${f.num(m.units)} pts (${f.money(m.units * card.pointValue)})` : f.reward(m.units)}`,
    used: m.spend,
    total: m.target,
    text: m.done ? 'Unlocked. The bonus is credited after the period ends.' : `${f.compact(m.remaining)} more by ${f.dateLong(m.end)}`,
  })).join('');

  const fee = feeProgress(S.data.txns, card, today);
  let feeMeter = '';
  if (fee.target) {
    const text = fee.done
      ? `Done. The ${f.money(card.annualFee)} fee is waived this card year.`
      : `${f.compact(fee.remaining)} to go by ${f.dateLong(fee.end)} · ${fee.behind > 0 ? `${f.compact(fee.behind)} behind pace` : 'on pace'}`;
    feeMeter = meter({ label: 'Annual fee waiver', used: fee.spend, total: fee.target, text });
  }

  const facts = [['Statement closes', `${f.dateLabel(cyc.end)}${daysLeft ? ` · in ${daysLeft}d` : ' · today'}`]];
  const credit = rewardCredits(card, S.calc.cycles[card.id], S.data.credits, today)[0];
  if (credit) {
    const status = {
      received: () => `credited ${unitsText(card, credit.got.units)} ✓`,
      short: () => `${unitsText(card, credit.short)} short`,
      overdue: () => `late, was due ${f.dateLabel(credit.due)}`,
      pending: () => `due by ${f.dateLabel(credit.due)}`,
    }[credit.status]();
    facts.push([`${f.monthShort(credit.key)} ${isPoints(card) ? 'points' : 'cashback'}`, `${unitsText(card, credit.expected)} · ${status}`]);
  }
  const factList = `<dl class="ctile-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  const head = (sub) => `<div class="ctile-head"><div><span class="ctile-name">${card.name}</span><span class="ctile-cycle">${sub}</span></div>${flipIcon}</div>`;
  const year = cardYearOf(today, card.anniversaryMonth);
  return `<article class="ctile-flip ${flipped ? 'flipped' : ''}" aria-label="${card.name}">
    <div class="ctile-inner">
      <div class="ctile face front ${card.id}" ${flipped ? 'aria-hidden="true"' : ''}>
        ${cardArt(card.id, `tf-${card.id}`)}
        ${head(`${f.dateLabel(cyc.start)} – ${f.dateLabel(cyc.end)} · ${daysLeft === 0 ? 'last day' : `${daysLeft}d left`}`)}
        <div class="ctile-stats">
          <div><span class="k">Spent this cycle</span><span class="v">${f.money(st.spend)}</span></div>
          <div><span class="k">Earned</span><span class="v">${earned}</span></div>
        </div>
        ${capMeter}
      </div>
      <div class="ctile face back ${card.id}" ${flipped ? '' : 'aria-hidden="true"'}>
        ${cardArt(card.id, `tb-${card.id}`)}
        ${head(`Card year ${f.dateLabel(year.start)} – ${f.dateLong(year.end)}`)}
        ${milestones}${feeMeter}${factList}
      </div>
    </div>
    <button class="flip-btn" data-act="flipTile" data-id="${card.id}" aria-pressed="${flipped}" aria-label="${f.esc(flipLabel(card, flipped))}"></button>
  </article>`;
}

function banner(key, emoji, title, text, cta) {
  const btn = cta ? `<button class="btn small" data-act="${cta.act}" ${cta.to ? `data-to="${cta.to}"` : ''} ${cta.id ? `data-id="${cta.id}"` : ''}>${cta.label}</button>` : '';
  return `<div class="banner">
    <span class="banner-ico" aria-hidden="true">${emoji}</span>
    <div class="grow"><p class="banner-title">${title}</p><p class="banner-text">${text}</p>${btn}</div>
    <button class="banner-x" data-act="dismiss" data-key="${key}" aria-label="Dismiss">${icon.x}</button>
  </div>`;
}

// Closed cycles whose rewards are past their usual credit date and not yet marked.
function lateCredits(today) {
  const late = CARD_ORDER.flatMap((id) => rewardCredits(S.cards[id], S.calc.cycles[id], S.data.credits, today)
    .filter((c) => c.status === 'overdue')
    .map((c) => ({ ...c, card: S.cards[id] })));
  return { late, key: late.map((c) => `${c.card.id}|${c.key}`).join(',') };
}

function homeBanners(today) {
  const m = S.data.meta;
  const out = [];
  if (isIOS() && !isStandalone() && !m.hideInstall) {
    out.push(banner('install', '📲', 'Add to Home Screen', 'In Safari tap <b>Share</b> → <b>Add to Home Screen</b> to open CardMax full-screen, like an app.'));
  }
  if (!m.setupDone) {
    out.push(banner('setup', '🗓️', 'Set your statement dates', 'Caps reset every billing cycle. Set each card’s statement date and anniversary month so the tracking matches your bank.', { act: 'go', to: 'cards', label: 'Set Up Cards' }));
  }
  const lastSeen = [m.lastBackup, m.backupSnooze].filter(Boolean).sort().pop();
  if (S.data.txns.length >= 10 && (!lastSeen || daysBetween(lastSeen.slice(0, 10), today) > 30)) {
    out.push(banner('backup', '💾', 'Back up your data', 'Your spends live only on this iPhone. Save a backup to Files about once a month.', { act: 'export', label: 'Back Up Now' }));
  }
  const { late, key } = lateCredits(today);
  if (late.length && m.creditSeen !== key) {
    const c = late[0];
    const more = late.length > 1 ? ` Also not marked yet: ${nameList(late.slice(1).map((x) => `${x.card.short} ${f.monthShort(x.key)}`))}.` : '';
    out.push(banner('credit', '🔔', `Has ${c.card.short} credited your ${isPoints(c.card) ? 'points' : 'cashback'}?`,
      `${unitsText(c.card, c.expected)} from the ${f.monthLabel(c.key)} statement was due by ${f.dateLong(c.due)}. Check your statement, then mark it in Cards.${more}`,
      { act: 'openCredits', id: c.card.id, label: 'Check' }));
  }
  return out.join('');
}

function viewHome() {
  const today = todayISO();
  const a = aggregate(periodRange('month', today));
  const recent = [...S.data.txns].sort(byRecent).slice(0, 5);
  let pill = '';
  if (a.count) {
    pill = a.missed >= 1
      ? `<p class="pill warn"><span aria-hidden="true">⚠︎</span> ${f.reward(a.missed)} missed by using the other card</p>`
      : '<p class="pill good"><span aria-hidden="true">✓</span> Every spend went on the best card</p>';
  }
  const { owed, owe } = friendTotals();
  const friends = owed >= 0.005 || owe >= 0.005
    ? `<div class="group gap"><button class="row act-row" data-act="go" data-to="friends">
        <span class="ico" aria-hidden="true">👥</span>
        <span class="grow">${owed >= 0.005 ? `Friends owe you <b class="pos">${f.amount(owed)}</b>` : 'Friends'}</span>
        ${owe >= 0.005 ? `<span class="small neg">You owe ${f.amount(owe)}</span>` : ''}
        <span class="chev" aria-hidden="true"></span>
      </button></div>`
    : '';
  return `
    <header class="large-title"><p class="eyebrow">${f.monthLabel(monthKey(today))}</p><h1>Home</h1></header>
    ${homeBanners(today)}
    <section class="hero" aria-label="Rewards this month">
      <p class="hero-label">Rewards this month</p>
      <p class="hero-num">${f.reward(a.value)}</p>
      <p class="hero-sub">on ${f.money(a.spend)} spent${a.spend ? ` · ${f.pct((a.value / a.spend) * 100)} back` : ''}</p>
      ${pill}
    </section>
    ${friends}
    <h2 class="section-title">Which card right now?</h2>
    <div class="group">${scenarioRows(today)}</div>
    <p class="foot">Net return on a ₹1,000 spend today, after what each card has already used of its cap this cycle. Tap a row to record it.</p>
    <h2 class="section-title">This cycle</h2>
    <section class="ctiles">${CARD_ORDER.map((id) => cardTile(S.cards[id], today)).join('')}</section>
    <h2 class="section-title">Recent ${recent.length ? '<button class="link" data-act="go" data-to="history">See All</button>' : ''}</h2>
    ${recent.length ? `<div class="group list">${recent.map(txnRow).join('')}</div>` : emptyState('No spends yet. Add one after each card payment and CardMax tracks the caps for you.')}
  `;
}

// ---------------------------------------------------------------- add / edit spend sheet

const emptySplit = () => ({ ids: [], mode: 'equal', includeMe: true, custom: {} });

function newDraft(prefill) {
  return {
    kind: 'spend', id: null, amount: '', merchant: '', category: null, channel: 'offline', intl: false,
    date: todayISO(), note: '', card: null, cardLocked: false, catTouched: false, createdAt: 0, dirty: false,
    split: emptySplit(), ...prefill,
  };
}

function draftFrom(t) {
  const split = t.split
    ? {
      ids: t.split.friends.map((s) => s.id),
      mode: t.split.mode,
      includeMe: t.split.includeMe !== false,
      custom: Object.fromEntries(t.split.friends.map((s) => [s.id, String(s.share)])),
    }
    : emptySplit();
  return { ...t, kind: 'spend', amount: String(t.amount), cardLocked: true, catTouched: true, dirty: false, split };
}

function draftCycles() {
  const d = S.draft;
  if (!d.id) return S.calc.cycles;
  return (d._cycles ||= replay(S.data.txns.filter((t) => t.id !== d.id), S.cards).cycles);
}

function draftTxn(category = S.draft.category) {
  const d = S.draft;
  const amt = parseAmount(d.amount);
  return { amount: amt > 0 ? amt : 1000, category, channel: d.channel, intl: d.intl, date: d.date || todayISO() };
}

function explain(card, r, category) {
  const what = isPoints(card) ? 'points' : 'cashback';
  if (r.bucket === 'none') return r.intlExcluded ? `No ${what} on international spends` : `No ${what} on ${catById(category).label.toLowerCase()}`;
  const small = card.per100 && r.amount < 100 ? ' · under ₹100 earns nothing' : '';
  if (r.bucket === 'base') return `${rateText(card, card.baseRate)} base rate${small}`;
  if (r.cap === Infinity) return `${rateText(card, card.accelRate)} bonus rate${small}`;
  const after = rateText(card, card.capMode === 'bonus' ? card.baseRate : card.afterCapRate);
  if (r.overCap > 0) {
    return r.accelDelta > 0
      ? `Cap runs out partway: ${f.money(r.overCap)} earns ${after}`
      : `Cap used up this cycle, so this earns ${after}`;
  }
  const left = r.room - r.accelDelta;
  return `${rateText(card, card.accelRate)} · ${isPoints(card) ? `${f.num(left)} bonus pts` : f.reward(left)} of cap left after this${small}`;
}

function verdict(best, second, txn) {
  const diff = best.net - second.net;
  if (best.net <= 0 && second.net <= 0 && !txn.intl) return 'Neither card rewards this. Either is fine, or pay by UPI or debit card.';
  if (diff < Math.max(0.5, txn.amount * 0.001)) {
    const today = todayISO();
    const behind = CARD_ORDER
      .map((id) => ({ id, p: feeProgress(S.data.txns, S.cards[id], today) }))
      .filter((x) => x.p.target && !x.p.done && x.p.behind > 0)
      .sort((a, b) => b.p.behind - a.p.behind)[0];
    if (behind) return `About the same on both. ${S.cards[behind.id].name} is ${f.compact(behind.p.behind)} behind pace for its fee waiver, so use that one.`;
    return 'About the same on both cards.';
  }
  const name = S.cards[best.cardId].name;
  return txn.intl ? `${name} leaves you ${f.reward(diff)} better off after forex markup.` : `${name} earns ${f.reward(diff)} more on this.`;
}

function adviceContext() {
  const d = S.draft;
  if (!d.category) return null;
  const txn = draftTxn();
  const ranked = advise(S.cards, draftCycles(), txn);
  const byId = Object.fromEntries(ranked.map((r) => [r.cardId, r]));
  if (!d.cardLocked) d.card = ranked[0].cardId;
  return { txn, ranked, byId, best: ranked[0], second: ranked[1], sample: !(parseAmount(d.amount) > 0) };
}

function picksHTML(ctx) {
  if (!ctx) return '<p class="sample">Pick a category to compare the two cards.</p>';
  const clearWinner = ctx.best.net - ctx.second.net >= 0.005;
  const upiOn = S.draft.card === 'upi';
  const tiles = CARD_ORDER.map((id) => {
    const card = S.cards[id];
    const r = ctx.byId[id];
    const on = S.draft.card === id;
    const isBest = clearWinner && id === ctx.best.cardId;
    const pctBack = `${Number((r.amount ? (r.net / r.amount) * 100 : 0).toFixed(1))}%${r.fx ? ' net' : ''}`;
    const sub = isPoints(card) ? `${f.reward(r.value)} · ${pctBack}` : pctBack;
    return `<button class="pick ${id} ${on ? 'on' : ''}" data-act="pickCard" data-id="${id}" aria-pressed="${on}"
      aria-label="${f.esc(`${card.name}${isBest ? ', best' : ''}: ${rewardText(card, r)}, ${sub}`)}">
      <span class="pick-head" aria-hidden="true">${dot(id)}<span class="grow">${card.short}</span>${isBest ? '<span class="badge">Best</span>' : ''}</span>
      <span class="pick-main" aria-hidden="true"><b>${rewardText(card, r)}</b><small>${sub}</small></span>
    </button>`;
  }).join('');
  const upi = `<button class="pick upi ${upiOn ? 'on' : ''}" data-act="pickCard" data-id="upi" aria-pressed="${upiOn}" aria-label="UPI or bank account: no rewards">
      <span class="pick-head" aria-hidden="true">${dot('upi')}UPI</span>
      <span class="pick-main" aria-hidden="true"><b>₹0</b><small>no rewards</small></span>
    </button>`;
  return `${ctx.sample ? '<p class="sample">Example for a ₹1,000 spend. Enter the amount for exact figures.</p>' : ''}<div class="picks">${tiles}${upi}</div>`;
}

function whyHTML(ctx) {
  if (!ctx) return '';
  const d = S.draft;
  const items = CARD_ORDER.map((id) => {
    const r = ctx.byId[id];
    const fx = r.fx ? ` <span class="why-fx">· −${f.reward(r.fx)} forex markup</span>` : '';
    return `<li>${dot(id)}<span><b>${S.cards[id].short}:</b> ${explain(S.cards[id], r, d.category)}${fx}</span></li>`;
  }).join('');
  const chosen = ctx.byId[d.card];
  let warn = '';
  if (d.card === 'upi' && ctx.best.net >= 0.5) {
    warn = `<p class="why-warn"><span aria-hidden="true">⚠︎</span> UPI earns nothing. ${S.cards[ctx.best.cardId].name} would earn ${f.reward(ctx.best.net)} here. Fine if the shop only takes UPI.</p>`;
  } else if (chosen && ctx.best.net - chosen.net >= 0.5) {
    warn = `<p class="why-warn"><span aria-hidden="true">⚠︎</span> ${S.cards[d.card].name} earns ${f.reward(ctx.best.net - chosen.net)} less here. Fine if you meant it.</p>`;
  }
  return `<div class="why"><p class="why-text">${verdict(ctx.best, ctx.second, ctx.txn)}</p><ul class="why-list">${items}</ul>${warn}</div>`;
}

// Best net return right now for a category, shown on its tile so each card's
// bonus categories stand out while you pick.
function chipRate(category) {
  const [best] = advise(S.cards, draftCycles(), draftTxn(category));
  if (best.net <= 0 && !S.draft.intl) return '<span aria-hidden="true">No reward</span><span class="sr">, no rewards</span>';
  const rate = `${Number(best.rate.toFixed(1))}%`;
  return `<span aria-hidden="true">${dot(best.cardId)}${rate}</span><span class="sr">, best ${rate} on ${S.cards[best.cardId].name}</span>`;
}

function categoryTiles(d) {
  const all = d.showAll || CATEGORIES.findIndex((c) => c.id === d.category) >= PRIMARY_CATEGORIES;
  const list = all ? CATEGORIES : CATEGORIES.slice(0, PRIMARY_CATEGORIES);
  const tiles = list.map((c) => {
    const on = d.category === c.id;
    return `<button class="cat ${on ? 'on' : ''}" data-act="cat" data-id="${c.id}" aria-pressed="${on}">
      <span class="cat-ico" aria-hidden="true">${c.icon}</span>
      <span class="cat-name"><span aria-hidden="true">${c.short}</span><span class="sr">${c.label}</span></span>
      <span class="cat-rate" data-rate="${c.id}">${chipRate(c.id)}</span></button>`;
  }).join('');
  const more = `<button class="cat more" data-act="moreCats" aria-label="More categories">
    <span class="cat-ico" aria-hidden="true">${icon.more}</span><span class="cat-name" aria-hidden="true">More</span><span class="cat-rate" aria-hidden="true"></span></button>`;
  return all ? tiles : tiles + more;
}

// ---- split with friends (inside the spend sheet)

function draftShares() {
  const d = S.draft;
  const sp = d.split;
  if (!sp.ids.length) return [];
  if (sp.mode === 'equal') {
    const amt = parseAmount(d.amount);
    const shares = equalShares(amt > 0 ? amt : 0, sp.ids.length, sp.includeMe);
    return sp.ids.map((id, i) => ({ id, share: shares[i] || 0 }));
  }
  return sp.ids.map((id) => ({ id, share: parseAmount(sp.custom[id] || '') || 0 }));
}

function splitSummary() {
  const amt = parseAmount(S.draft.amount);
  const shares = draftShares().filter((s) => s.share > 0);
  if (!S.draft.split.ids.length) return '';
  if (!(amt > 0)) return 'Enter the amount to see each share.';
  const owed = splitTotal({ friends: shares });
  if (owed > amt + 0.004) return `⚠︎ Shares add up to ${f.amount(owed)}, more than the ${f.amount(amt)} bill.`;
  if (!shares.length) return 'Enter each friend’s share.';
  const names = shares.map((s) => friendById(s.id).name);
  const each = S.draft.split.mode === 'equal' && shares.length > 1 ? ` (${f.amount(shares[0].share)} each)` : '';
  return `${nameList(names)} owe${names.length === 1 ? 's' : ''} you ${f.amount(owed)}${each} · your share ${f.amount(amt - owed)}`;
}

function splitBoxHTML() {
  const d = S.draft;
  const sp = d.split;
  const chips = S.data.friends.map((fr) => {
    const on = sp.ids.includes(fr.id);
    return `<button class="chip friend ${on ? 'on' : ''}" data-act="splitToggle" data-id="${fr.id}" aria-pressed="${on}">${avatar(fr, 'sm')}${f.esc(fr.name)}</button>`;
  }).join('');
  const adder = d.addingFriend
    ? `<div class="add-friend"><input class="field" data-newfriend placeholder="Friend’s name" enterkeyhint="done" autocomplete="off" aria-label="New friend’s name"><button class="btn small" data-act="addFriendInline">Add</button></div>`
    : `<button class="chip ghost" data-act="showAddFriend">${icon.plus} New Friend</button>`;
  let detail = '';
  if (sp.ids.length) {
    const rows = sp.mode === 'equal'
      ? `<label class="row"><span class="grow">Include my share</span><input type="checkbox" switch data-splitme ${sp.includeMe ? 'checked' : ''}></label>`
      : sp.ids.map((id) => `<label class="row"><span class="grow">${f.esc(friendById(id).name)}</span><span class="muted">₹</span>
          <input class="num" inputmode="decimal" placeholder="0" data-share="${id}" value="${f.esc(sp.custom[id] || '')}" aria-label="${f.esc(friendById(id).name)}’s share"></label>`).join('');
    detail = `<div class="row"><span class="grow">Split</span>
        <div class="seg seg-sm" role="group" aria-label="Split method">
          <button class="${sp.mode === 'equal' ? 'on' : ''}" data-act="splitMode" data-v="equal" aria-pressed="${sp.mode === 'equal'}">Equally</button>
          <button class="${sp.mode === 'custom' ? 'on' : ''}" data-act="splitMode" data-v="custom" aria-pressed="${sp.mode === 'custom'}">Custom</button>
        </div></div>
      ${rows}
      <p class="split-sum" id="splitSum" aria-live="polite">${f.esc(splitSummary())}</p>`;
  }
  return `<div class="chips wrap friend-chips">${chips}${adder}</div>${detail}`;
}

function renderSplitBox() {
  const box = $('#splitBox');
  if (box) box.innerHTML = splitBoxHTML();
}

function addFriend(name) {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!clean) return null;
  const existing = S.data.friends.find((x) => x.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const fr = { id: store.newId(), name: clean, createdAt: Date.now() };
  S.data.friends.push(fr);
  persist();
  return fr.id;
}

function addFriendFromSheet() {
  const input = sheet.querySelector('[data-newfriend]');
  const id = input && addFriend(input.value);
  if (!id) return input?.focus();
  const sp = S.draft.split;
  if (!sp.ids.includes(id)) sp.ids.push(id);
  S.draft.addingFriend = false;
  S.draft.dirty = true;
  renderSplitBox();
}

function updateAdvice() {
  const d = S.draft;
  if (d?.kind !== 'spend' || !$('#picks')) return;
  const ctx = adviceContext();
  $('#picks').innerHTML = picksHTML(ctx);
  $('#advice').innerHTML = whyHTML(ctx);
  const ok = parseAmount(d.amount) > 0 && !!d.category;
  const card = S.cards[d.card];
  for (const b of sheet.querySelectorAll('[data-save]')) b.disabled = !ok;
  $('#saveBtn').textContent = !card ? 'Save' : card.noRewards ? 'Save as UPI' : `Save to ${card.name}`;
  for (const el of sheet.querySelectorAll('[data-rate]')) el.innerHTML = chipRate(el.dataset.rate);
  const sum = $('#splitSum');
  if (sum) sum.textContent = splitSummary();
}

// Updates the form in place so text inputs keep focus and the keyboard stays up.
function syncAddForm() {
  const d = S.draft;
  d.dirty = true;
  if (d.category && !sheet.querySelector(`[data-act="cat"][data-id="${d.category}"]`)) {
    d.showAll = true;
    $('#cats').innerHTML = categoryTiles(d);
  }
  for (const b of sheet.querySelectorAll('[data-act="cat"]')) {
    const on = b.dataset.id === d.category;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  for (const b of sheet.querySelectorAll('[data-act="channel"]')) {
    const on = b.dataset.v === d.channel;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  $('#catHint').textContent = d.category ? catById(d.category).hint : '';
  const m = sheet.querySelector('[data-draft="merchant"]');
  if (m.value !== d.merchant) m.value = d.merchant;
  updateAdvice();
}

function applyMerchant(m) {
  Object.assign(S.draft, { merchant: m.name, category: m.category, channel: m.channel });
}

// ---- fill a spend from a bank SMS

const looksLikeSms = (text) => /(?:inr|rs\.?|₹)\s*[\d,]/i.test(text || '');

function smsHTML(d) {
  const box = d.smsOpen
    ? `<div class="sms-box">
        <textarea class="field" data-sms rows="3" placeholder="Long-press here and paste the bank SMS" aria-label="Bank SMS"></textarea>
        <button class="btn small" data-act="smsFill">Fill In</button>
      </div>`
    : '';
  return `${box}${d.smsNote ? `<p class="sms-note" id="smsNote" role="status">${f.esc(d.smsNote)}</p>` : ''}`;
}

// Reads the clipboard straight away (iOS shows its Paste button), and opens a
// paste box too in case the clipboard holds something else or access is denied.
function pasteSms() {
  let read = Promise.resolve('');
  try {
    if (navigator.clipboard?.readText) read = navigator.clipboard.readText().catch(() => '');
  } catch { /* clipboard blocked */ }
  Object.assign(S.draft, { smsOpen: true, smsNote: '' });
  renderSheet();
  read.then((text) => {
    if (S.draft?.smsOpen && looksLikeSms(text)) applySms(text);
  });
}

function applySms(text) {
  const d = S.draft;
  const r = parseSms(text, { methods: CARD_ORDER.map((id) => S.cards[id]), known: knownMerchants(), today: todayISO() });
  if (!r.amount) {
    Object.assign(d, { smsOpen: true, smsNote: 'No amount found in that text. Paste the whole bank SMS, or fill the spend in by hand.' });
    renderSheet();
    return;
  }
  Object.assign(d, { amount: String(r.amount), smsOpen: false, dirty: true });
  if (r.merchant) d.merchant = r.merchant;
  if (r.category) Object.assign(d, { category: r.category, catTouched: true });
  if (r.channel) d.channel = r.channel;
  if (r.date) d.date = r.date;
  if (r.card) Object.assign(d, { card: r.card, cardLocked: true });
  const found = [f.amount(r.amount), r.card && S.cards[r.card].name, r.merchant, r.date && f.dateLabel(r.date)].filter(Boolean);
  const missing = [!r.card && 'card', !r.category && 'category', !r.date && 'date'].filter(Boolean);
  const dupe = S.data.txns.find((t) => t.amount === r.amount && t.date === d.date && (!r.card || t.card === r.card));
  d.smsNote = [
    `From the SMS: ${found.join(' · ')}.`,
    missing.length ? `Check the ${nameList(missing)}.` : '',
    dupe ? `Already added? ${dupe.merchant || catById(dupe.category).label}, ${f.amount(dupe.amount)} on ${f.dateLabel(dupe.date)}.` : '',
  ].filter(Boolean).join(' ');
  renderSheet();
}

function renderSheet() {
  const y = sheetBody.scrollTop;
  if (S.draft.kind === 'ledger') renderLedgerSheet();
  else renderSpendSheet();
  sheetBody.scrollTop = y;
}

function renderSpendSheet() {
  const d = S.draft;
  const editing = !!d.id;
  const merchants = knownMerchants();
  const chips = merchants.slice(0, 14).map((m, i) => `<button class="chip" data-act="merchant" data-i="${i}">${f.esc(m.name)}</button>`).join('');

  sheetHead.innerHTML = `
    <button class="link" data-act="requestClose">Cancel</button>
    <h2 id="sheetTitle" tabindex="-1" ${editing ? 'autofocus' : ''}>${editing ? 'Edit Spend' : 'New Spend'}</h2>
    <span aria-hidden="true"></span>`;

  sheetBody.innerHTML = `
    <div class="amount-wrap">
      <label class="amount-field"><span class="cur" aria-hidden="true">₹</span><input id="amount" class="amount" data-draft="amount" inputmode="decimal" placeholder="0" autocomplete="off" value="${f.esc(d.amount)}" aria-label="Amount in rupees" ${editing ? '' : 'autofocus'}></label>
      <div class="amount-actions">
        <button type="button" class="pill-btn" data-act="amtPlus">${icon.plus}Add another amount</button>
        ${editing ? '' : `<button type="button" class="pill-btn" data-act="smsPaste">${icon.paste}Paste bank SMS</button>`}
      </div>
    </div>
    ${editing ? '' : smsHTML(d)}

    <input class="field" data-draft="merchant" list="merchantList" placeholder="Merchant (optional)" autocomplete="off" enterkeyhint="done" value="${f.esc(d.merchant)}" aria-label="Merchant">
    <div class="chips scroll-x merchants" aria-label="Quick merchants">${chips}</div>
    <datalist id="merchantList">${merchants.map((m) => `<option value="${f.esc(m.name)}"></option>`).join('')}</datalist>

    <h3 class="label">Category</h3>
    <div class="cats" id="cats">${categoryTiles(d)}</div>
    <p class="hint" id="catHint">${d.category ? catById(d.category).hint : ''}</p>

    <div class="group">
      <div class="row"><span class="grow">Paid</span>
        <div class="seg seg-sm" role="group" aria-label="Where you paid">
          <button class="${d.channel === 'offline' ? 'on' : ''}" data-act="channel" data-v="offline" aria-pressed="${d.channel === 'offline'}">In-store</button>
          <button class="${d.channel === 'online' ? 'on' : ''}" data-act="channel" data-v="online" aria-pressed="${d.channel === 'online'}">Online</button>
        </div>
      </div>
      <label class="row"><span class="grow">Date</span><input type="date" data-draft="date" value="${f.esc(d.date)}"></label>
      <label class="row"><span>Note</span><input class="grow right" data-draft="note" placeholder="Optional" value="${f.esc(d.note)}" enterkeyhint="done"></label>
    </div>

    <h3 class="label">Why this card</h3>
    <div id="advice"></div>

    <h3 class="label">Split with friends</h3>
    <div class="group split-box" id="splitBox">${splitBoxHTML()}</div>
    ${editing ? '<button class="btn danger block" data-act="delete">Delete Spend</button>' : ''}`;

  sheetFoot.innerHTML = `<div id="picks"></div><button class="btn primary block" id="saveBtn" data-act="save" data-save>Save</button>`;
  sizeAmount();
  updateAdvice();
}

function saveSpend() {
  const d = S.draft;
  const amt = parseAmount(d.amount);
  if (!(amt > 0) || !d.category) {
    toast(amt > 0 ? 'Pick a category' : 'Enter the amount first');
    return;
  }
  const shares = draftShares().filter((s) => s.share > 0).map((s) => ({ id: s.id, share: Math.round(s.share * 100) / 100 }));
  if (splitTotal({ friends: shares }) > amt + 0.004) {
    toast('Friends’ shares add up to more than the bill');
    return;
  }
  const t = {
    id: d.id || store.newId(),
    date: d.date || todayISO(),
    amount: amt,
    card: d.card || CARD_ORDER[0],
    category: d.category,
    channel: d.channel,
    intl: !!d.intl,
    merchant: d.merchant.trim(),
    note: d.note.trim(),
    createdAt: d.createdAt || Date.now(),
  };
  if (shares.length) t.split = { mode: d.split.mode, includeMe: d.split.includeMe, friends: shares };
  const i = S.data.txns.findIndex((x) => x.id === t.id);
  if (i >= 0) S.data.txns[i] = t;
  else S.data.txns.push(t);
  persist();
  navigator.storage?.persist?.().catch(() => {});
  const card = S.cards[t.card];
  const owed = shares.length ? ` · friends owe ${f.amount(splitTotal(t.split))}` : '';
  const earned = card.noRewards ? `${f.amount(t.amount)} by UPI` : `${rewardText(card, S.calc.results.get(t.id).used)} on ${card.name}`;
  toast(`${i >= 0 ? 'Updated' : 'Saved'} · ${earned}${owed}`);
  closeSheet();
}

// ---------------------------------------------------------------- settle up / IOU sheet

const LEDGER_TEXT = {
  lent: (n) => `You paid for ${n}`,
  borrowed: (n) => `${n} paid for you`,
  received: (n) => `${n} paid you back`,
  paid: (n) => `You paid ${n} back`,
};
const LEDGER_ICON = { lent: '💸', borrowed: '🧾', received: '✅', paid: '↩️' };

function ledgerDraft(mode, friendId) {
  const bal = S.split.bal[friendId] || 0;
  const settle = mode === 'settle';
  return {
    kind: 'ledger', mode, friendId, dirty: false, date: todayISO(), note: '',
    amount: settle && !isSettled(bal) ? String(Math.abs(bal)) : '',
    entryKind: settle ? (bal < 0 ? 'paid' : 'received') : 'lent',
  };
}

function balanceText(name, bal) {
  if (isSettled(bal)) return 'You’re all settled up';
  return bal > 0 ? `${name} owes you ${f.amount(bal)}` : `You owe ${name} ${f.amount(-bal)}`;
}

function ledgerSummary() {
  const d = S.draft;
  const fr = friendById(d.friendId);
  const amt = parseAmount(d.amount);
  const now = S.split.bal[d.friendId] || 0;
  if (!(amt > 0)) return `Right now: ${balanceText(fr.name, now)}.`;
  return `After this: ${balanceText(fr.name, Math.round((now + LEDGER_SIGN[d.entryKind] * amt) * 100) / 100)}.`;
}

function updateLedger() {
  const sum = $('#ledgerSum');
  if (sum) sum.textContent = ledgerSummary();
  const ok = parseAmount(S.draft.amount) > 0;
  for (const b of sheet.querySelectorAll('[data-save]')) b.disabled = !ok;
}

function renderLedgerSheet() {
  const d = S.draft;
  const name = f.esc(friendById(d.friendId).name);
  const settle = d.mode === 'settle';
  const opts = settle ? ['received', 'paid'] : ['lent', 'borrowed'];
  const optLabel = { received: `${name} paid me`, paid: `I paid ${name}`, lent: `I paid for ${name}`, borrowed: `${name} paid for me` };

  sheetHead.innerHTML = `
    <button class="link" data-act="requestClose">Cancel</button>
    <h2 id="sheetTitle" tabindex="-1" autofocus>${settle ? 'Settle Up' : 'Add IOU'}</h2>
    <span aria-hidden="true"></span>`;

  sheetBody.innerHTML = `
    <div class="ledger-who">${avatar(friendById(d.friendId), 'lg')}<p>${name}</p></div>
    <div class="amount-wrap">
      <label class="amount-field"><span class="cur" aria-hidden="true">₹</span><input id="amount" class="amount" data-draft="amount" inputmode="decimal" placeholder="0" autocomplete="off" value="${f.esc(d.amount)}" aria-label="Amount in rupees"></label>
    </div>
    <div class="seg seg-wide" role="group" aria-label="${settle ? 'Who paid' : 'What happened'}">
      ${opts.map((k) => `<button class="${d.entryKind === k ? 'on' : ''}" data-act="entryKind" data-v="${k}" aria-pressed="${d.entryKind === k}">${optLabel[k]}</button>`).join('')}
    </div>
    <p class="split-sum center" id="ledgerSum" aria-live="polite"></p>
    <div class="group">
      <label class="row"><span class="grow">Date</span><input type="date" data-draft="date" value="${f.esc(d.date)}"></label>
      <label class="row"><span>Note</span><input class="grow right" data-draft="note" placeholder="${settle ? 'e.g. UPI' : 'e.g. Movie tickets'}" value="${f.esc(d.note)}" enterkeyhint="done"></label>
    </div>
    <p class="foot">${settle ? 'Record money that changed hands to clear what’s owed.' : 'For money outside your two cards: cash you lent, or a bill a friend covered for you.'}</p>`;

  sheetFoot.innerHTML = `<button class="btn primary block" data-act="saveLedger" data-save>Save</button>`;
  sizeAmount();
  updateLedger();
}

function saveLedger() {
  const d = S.draft;
  const amt = parseAmount(d.amount);
  if (!(amt > 0)) {
    toast('Enter the amount first');
    return;
  }
  S.data.ledger.push({
    id: store.newId(), friendId: d.friendId, kind: d.entryKind, amount: amt,
    date: d.date || todayISO(), note: d.note.trim(), createdAt: Date.now(),
  });
  persist();
  const fr = friendById(d.friendId);
  toast(balanceText(fr.name, S.split.bal[fr.id] || 0));
  closeSheet();
}

// ---------------------------------------------------------------- friends

function balanceBadge(bal) {
  if (isSettled(bal)) return '<span class="bal zero"><small>settled up</small></span>';
  return bal > 0
    ? `<span class="bal pos"><small>owes you</small><b>${f.amount(bal)}</b></span>`
    : `<span class="bal neg"><small>you owe</small><b>${f.amount(-bal)}</b></span>`;
}

function viewFriends() {
  const { owed, owe } = friendTotals();
  const friends = [...S.data.friends].sort((a, b) => Math.abs(S.split.bal[b.id] || 0) - Math.abs(S.split.bal[a.id] || 0) || a.name.localeCompare(b.name));
  const rows = friends.map((fr) => {
    const bal = S.split.bal[fr.id] || 0;
    const acts = S.split.activity[fr.id] || [];
    const sub = acts.length ? `${acts.length} item${acts.length === 1 ? '' : 's'} · last ${f.dateLabel(acts[0].date)}` : 'Nothing shared yet';
    return `<button class="row friend-row" data-act="openFriend" data-id="${fr.id}" aria-label="${f.esc(`${fr.name}: ${balanceText('they', bal).replace('they owes', 'owes')}`)}">
      ${avatar(fr)}
      <span class="grow" aria-hidden="true"><b>${f.esc(fr.name)}</b><small class="muted block">${sub}</small></span>
      <span aria-hidden="true">${balanceBadge(bal)}</span>
      <span class="chev" aria-hidden="true"></span>
    </button>`;
  }).join('');
  return `
    <header class="large-title"><h1>Friends</h1></header>
    <div class="stats">
      <div class="stat"><span class="k">You get back</span><span class="v pos">${f.amount(owed)}</span><span class="d">friends owe you</span></div>
      <div class="stat"><span class="k">You owe</span><span class="v neg">${f.amount(owe)}</span><span class="d">to friends</span></div>
    </div>
    <h2 class="section-title">Balances</h2>
    ${friends.length ? `<div class="group">${rows}</div>` : '<div class="empty"><p>Add a friend, then split card spends with them from the Add screen. CardMax keeps a running tab of who owes whom.</p></div>'}
    <div class="group gap">
      <div class="row">
        <input class="grow add-input" data-newfriend placeholder="Add a friend" enterkeyhint="done" autocomplete="off" aria-label="New friend’s name">
        <button class="link strong" data-act="addFriend">Add</button>
      </div>
    </div>
    <p class="foot">Card rewards still count the full amount you paid. Splits only track what friends owe you back.</p>
  `;
}

function activityRow(item, fr) {
  if (item.type === 'split') {
    const t = item.txn;
    const c = catById(t.category);
    return `<button class="txn" data-act="openTxn" data-id="${f.esc(t.id)}" aria-label="${f.esc(`${t.merchant || c.label}, ${f.dateLong(t.date)}. You paid ${f.amount(t.amount)}. ${fr.name} owes ${f.amount(item.amount)}`)}">
      <span class="txn-ico" aria-hidden="true">${c.icon}</span>
      <span class="txn-main" aria-hidden="true">
        <span class="txn-line"><span class="txn-title">${f.esc(t.merchant || c.label)}</span><span class="txn-amt pos">+${f.amount(item.amount)}</span></span>
        <span class="txn-line"><span class="txn-sub">${f.dateLabel(t.date)} · you paid ${f.amount(t.amount)} on ${S.cards[t.card].short}</span><span class="txn-status none">owes you</span></span>
        ${t.note ? `<span class="txn-note">${f.esc(t.note)}</span>` : ''}
      </span>
    </button>`;
  }
  const e = item.entry;
  const up = item.amount > 0;
  const title = LEDGER_TEXT[e.kind](f.esc(fr.name));
  return `<button class="txn" data-act="ledgerEntry" data-id="${f.esc(e.id)}" aria-label="${f.esc(`${LEDGER_TEXT[e.kind](fr.name)}, ${f.amount(e.amount)}, ${f.dateLong(e.date)}${e.note ? `, ${e.note}` : ''}. Double tap to delete`)}">
    <span class="txn-ico" aria-hidden="true">${LEDGER_ICON[e.kind]}</span>
    <span class="txn-main" aria-hidden="true">
      <span class="txn-line"><span class="txn-title">${title}</span><span class="txn-amt ${up ? 'pos' : ''}">${up ? '+' : '−'}${f.amount(e.amount)}</span></span>
      <span class="txn-sub">${f.dateLabel(e.date)}${e.note ? ` · ${f.esc(e.note)}` : ''}</span>
    </span>
  </button>`;
}

function viewFriend() {
  const fr = friendById(S.baseArg);
  const bal = S.split.bal[fr.id] || 0;
  const acts = S.split.activity[fr.id] || [];
  let label = 'All settled up';
  let cls = '';
  if (!isSettled(bal)) [label, cls] = bal > 0 ? [`${f.esc(fr.name)} owes you`, 'pos'] : [`You owe ${f.esc(fr.name)}`, 'neg'];
  return `
    <button class="nav-back" data-act="go" data-to="friends">${icon.chev('M15 5l-7 7 7 7')}<span>Friends</span></button>
    <header class="large-title friend-title">${avatar(fr, 'lg')}<h1>${f.esc(fr.name)}</h1></header>
    <section class="hero">
      <p class="hero-label">${label}</p>
      ${isSettled(bal) ? '' : `<p class="hero-num ${cls}">${f.amount(Math.abs(bal))}</p>`}
    </section>
    <div class="btn-row">
      <button class="btn primary" data-act="openLedger" data-v="settle" ${acts.length ? '' : 'disabled'}>Settle Up</button>
      <button class="btn" data-act="openLedger" data-v="iou">Add IOU</button>
    </div>
    <h2 class="section-title">Activity</h2>
    ${acts.length ? `<div class="group list">${acts.map((a) => activityRow(a, fr)).join('')}</div>`
      : emptyState(`Nothing with ${f.esc(fr.name)} yet. Split a spend from the Add screen, or add an IOU.`, { act: 'go', to: 'add', label: 'Add a Spend' })}
    <p class="foot">Tap a split to edit the card spend. Tap a payment or IOU to delete it.</p>
    <button class="btn danger block" data-act="removeFriend">Remove ${f.esc(fr.name)}</button>
  `;
}

// ---------------------------------------------------------------- history

function historyList() {
  const { card, missed, cat, month } = S.hist;
  const q = S.hist.q.trim().toLowerCase();
  const list = S.data.txns
    .filter((t) => card === 'all' || t.card === card)
    .filter((t) => !cat || t.category === cat)
    .filter((t) => !month || monthKey(t.date) === month)
    .filter((t) => !missed || S.calc.results.get(t.id)?.missed >= 0.5)
    .filter((t) => !q || `${t.merchant} ${t.note} ${catById(t.category).label} ${t.amount} ${splitLine(t)}`.toLowerCase().includes(q))
    .sort(byRecent);
  if (!list.length) {
    return S.data.txns.length
      ? emptyState('Nothing matches these filters.', { act: 'clearFilters', label: 'Clear Filters' })
      : emptyState('No spends recorded yet.');
  }

  const groups = new Map();
  for (const t of list) {
    const k = monthKey(t.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  return [...groups].map(([k, ts]) => {
    const spend = ts.reduce((s, t) => s + t.amount, 0);
    const value = ts.reduce((s, t) => s + S.calc.results.get(t.id).used.value, 0);
    return `<h2 class="section-title">${f.monthLabel(k)}<span class="muted">${f.money(spend)} · ${f.reward(value)} earned</span></h2>
      <div class="group list">${ts.map(txnRow).join('')}</div>`;
  }).join('');
}

function viewHistory() {
  const { cat, month } = S.hist;
  const chip = (v, label) => `<button class="chip ${S.hist.card === v ? 'on' : ''}" data-act="histCard" data-v="${v}" aria-pressed="${S.hist.card === v}">${v === 'all' ? '' : dot(v)}${label}</button>`;
  const scopeText = [cat && `${catById(cat).icon} ${catById(cat).label}`, month && f.monthLabel(month)].filter(Boolean).join(' · ');
  const scope = scopeText
    ? `<button class="chip on" data-act="histClearScope" aria-label="${f.esc(`Showing ${scopeText}. Clear`)}">${scopeText} ${icon.x}</button>`
    : '';
  return `
    <header class="large-title"><h1>History</h1></header>
    <div class="search-wrap">${icon.search}<input class="field search" type="search" data-hist="q" placeholder="Search merchant, note, friend" value="${f.esc(S.hist.q)}" enterkeyhint="search" aria-label="Search spends"></div>
    <div class="chips scroll-x">
      ${scope}${chip('all', 'All')}${CARD_ORDER.map((id) => chip(id, S.cards[id].name)).join('')}${S.data.txns.some((t) => t.card === 'upi') ? chip('upi', 'UPI') : ''}
      <button class="chip ${S.hist.missed ? 'on' : ''}" data-act="histMissed" aria-pressed="${S.hist.missed}">Missed rewards</button>
    </div>
    <div id="histList">${historyList()}</div>
  `;
}

// ---------------------------------------------------------------- insights

const addMonths = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(toISO(new Date(y, m - 1 + delta, 1)));
};

function legend(ids = CARD_ORDER) {
  return `<div class="legend">${ids.map((id) => `<span>${dot(id)}${S.cards[id].name}</span>`).join('')}</div>`;
}

function monthStepper() {
  const current = monthKey(todayISO());
  const earliest = S.data.txns.reduce((min, t) => (t.date < min ? t.date : min), todayISO()).slice(0, 7);
  return `<div class="stepper">
    <button data-act="month" data-d="-1" aria-label="Previous month" ${S.month <= earliest ? 'disabled' : ''}>${icon.chev('M15 5l-7 7 7 7')}</button>
    <div class="stepper-mid">
      <span class="stepper-label" aria-live="polite">${f.monthLabel(S.month)}</span>
      <input type="month" data-month value="${S.month}" max="${current}" aria-label="Choose a month">
      ${S.month !== current ? '<button class="today" data-act="thisMonth">This Month</button>' : ''}
    </div>
    <button data-act="month" data-d="1" aria-label="Next month" ${S.month >= current ? 'disabled' : ''}>${icon.chev('M9 5l7 7-7 7')}</button>
  </div>`;
}

function categoryBreakdown(a) {
  const rows = Object.entries(a.byCat).sort((x, y) => y[1].spend - x[1].spend);
  const max = rows[0][1].spend;
  const methods = METHOD_IDS.filter((id) => a.byCard[id] || CARD_ORDER.includes(id));
  const bars = rows.map(([id, c]) => {
    const cat = catById(id);
    const used = methods.filter((cid) => c.byCard[cid] > 0);
    const segs = used.map((cid) => `<span class="bar-seg ${cid}" style="flex:${c.byCard[cid]}"></span>`).join('');
    const split = used.map((cid) => `${S.cards[cid].short} ${f.money(c.byCard[cid])}`).join(' · ');
    const missed = c.missed >= 0.5 ? ` · <span class="miss-ink">missed ${f.reward(c.missed)}</span>` : '';
    const spoken = `${cat.label}: ${f.money(c.spend)} over ${c.count} spends, ${f.reward(c.value)} earned. ${split}.${c.missed >= 0.5 ? ` Missed ${f.reward(c.missed)}.` : ''}`;
    return `<button class="hbar" data-act="catDrill" data-id="${id}" aria-label="${f.esc(spoken)}">
      <span class="hbar-head" aria-hidden="true"><span class="hbar-label">${cat.icon} ${cat.label}</span><span class="hbar-total">${f.money(c.spend)}</span></span>
      <span class="hbar-fill" style="--w:${c.spend / max}" aria-hidden="true">${segs}</span>
      <span class="hbar-sub" aria-hidden="true">${c.count} spend${c.count === 1 ? '' : 's'} · ${f.reward(c.value)} earned · ${split}${missed}</span>
    </button>`;
  }).join('');
  return `${legend(methods)}<div class="hbars">${bars}</div>`;
}

// Month totals per card, plus how much of the bonus cap the statement that
// closes this month has used.
function cardMonthRow(card, a) {
  const c = a.byCard[card.id] || { spend: 0, value: 0, units: 0, count: 0 };
  const st = S.calc.cycles[card.id][S.month];
  const earned = isPoints(card) ? `${f.num(c.units)} pts ≈ ${f.reward(c.value)}` : f.reward(c.value);
  let cap = '';
  if (card.accelCap > 0 && st) {
    const used = Math.min(st.accelUsed, card.accelCap);
    const full = used >= card.accelCap;
    const amounts = isPoints(card) ? `${f.num(used)} of ${f.num(card.accelCap)} pts` : `${f.reward(used)} of ${f.money(card.accelCap)}`;
    const p = (used / card.accelCap) * 100;
    cap = `<div class="meter ink ${card.id} ${full ? 'full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}" aria-valuetext="${f.esc(`${capLabel(card)}: ${amounts}${full ? ', cap reached' : ''}`)}">
      <div class="meter-top" aria-hidden="true"><span>${capLabel(card)}</span><span>${full ? '⊘ Cap reached' : amounts}</span></div>
      <div class="meter-track" aria-hidden="true"><div class="meter-fill" style="width:${p}%"></div></div>
      <p class="meter-text" aria-hidden="true">Statement cycle ${f.dateLabel(st.start)} – ${f.dateLabel(st.end)}${full ? ` · ${amounts}` : ''}</p>
    </div>`;
  }
  return `<div class="row top">${dot(card.id)}
    <div class="grow">
      <div class="split"><b>${card.name}</b><span>${earned}</span></div>
      <div class="split muted small"><span>${c.count} spends · ${f.money(c.spend)}</span><span>${c.spend ? f.pct((c.value / c.spend) * 100) : '–'} back</span></div>
      ${cap}
    </div>
  </div>`;
}

function upiMonthRow(c) {
  return `<div class="row top">${dot('upi')}
    <div class="grow">
      <div class="split"><b>${S.cards.upi.name}</b><span class="muted">No rewards</span></div>
      <div class="split muted small"><span>${c.count} spend${c.count === 1 ? '' : 's'} · ${f.money(c.spend)}</span></div>
    </div>
  </div>`;
}

function niceStep(x) {
  if (!(x > 0)) return 100;
  const p = 10 ** Math.floor(Math.log10(x));
  const n = x / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function trendChart(endMonth) {
  const months = lastMonths(6, `${endMonth}-01`);
  const data = months.map((k) => ({ k, byCard: Object.fromEntries(CARD_ORDER.map((id) => [id, 0])) }));
  for (const t of S.data.txns) {
    const i = months.indexOf(monthKey(t.date));
    if (i >= 0 && t.card in data[i].byCard) data[i].byCard[t.card] += S.calc.results.get(t.id).used.value;
  }
  const totals = data.map((d) => CARD_ORDER.reduce((s, id) => s + d.byCard[id], 0));
  const step = niceStep(Math.max(...totals) / 3);
  const top = Math.max(step, step * Math.ceil(Math.max(...totals) / step));
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);

  const cols = data.map((d, i) => {
    const segs = CARD_ORDER.filter((id) => d.byCard[id] > 0)
      .map((id) => `<span class="col-seg ${id}" style="flex:${d.byCard[id]}"></span>`).join('');
    const tip = [f.monthLabel(d.k), ...CARD_ORDER.map((id) => `${S.cards[id].name}: ${f.reward(d.byCard[id])}`), `Total ${f.reward(totals[i])}`].join('\n');
    const label = i === data.length - 1 && totals[i] > 0 ? `<span class="col-label">${f.compact(totals[i])}</span>` : '';
    return `<button class="col" data-tip="${f.esc(tip)}" aria-label="${f.esc(tip.replace(/\n/g, ', '))}">
      <span class="col-stack" style="height:${(totals[i] / top) * 100}%">${label}${segs}</span>
    </button>`;
  }).join('');

  const table = `<details class="table-toggle" data-key="trend-table" ${S.open.has('trend-table') ? 'open' : ''}>
    <summary>Show as Table</summary>
    <table class="dtable"><thead><tr><th>Month</th>${CARD_ORDER.map((id) => `<th>${S.cards[id].short}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${data.map((d, i) => `<tr><td>${f.monthShort(d.k)}</td>${CARD_ORDER.map((id) => `<td>${f.reward(d.byCard[id])}</td>`).join('')}<td>${f.reward(totals[i])}</td></tr>`).join('')}</tbody></table>
  </details>`;

  return `${legend()}
    <div class="vchart">
      <div class="vgrid" aria-hidden="true">${ticks.map((v) => `<div class="vtick" style="bottom:${(v / top) * 100}%"><span>${f.compact(v)}</span></div>`).join('')}</div>
      <div class="vcols">${cols}</div>
    </div>
    <div class="vx" aria-hidden="true">${months.map((k) => `<span>${f.monthShort(k)}</span>`).join('')}</div>
    ${table}`;
}

function viewInsights() {
  const a = aggregate({ start: `${S.month}-01`, end: `${S.month}-31` });
  const head = `<header class="large-title"><h1>Insights</h1></header>${monthStepper()}`;
  const trend = S.data.txns.length
    ? `<h2 class="section-title">Rewards, last 6 months</h2><div class="panel">${trendChart(S.month)}</div><p class="foot">Tap a column for the split.</p>`
    : '';
  if (!a.count) {
    return `${head}<div class="month-body">${emptyState(`No spends recorded in ${f.monthLabel(S.month)}.`, { act: 'addInMonth', label: 'Add a Spend' })}${trend}</div>`;
  }

  const score = a.optimal > 0 ? Math.max(0, Math.min(100, (a.net / a.optimal) * 100)) : 100;
  const shared = S.data.txns
    .filter((t) => monthKey(t.date) === S.month && t.split)
    .reduce((s, t) => s + splitTotal(t.split), 0);
  return `
    ${head}
    <div class="month-body">
      <section class="hero" aria-label="Spent in ${f.monthLabel(S.month)}">
        <p class="hero-label">Spent</p>
        <p class="hero-num">${f.money(a.spend)}</p>
        <p class="hero-sub">${f.reward(a.value)} rewards · ${f.pct((a.value / a.spend) * 100)} back · ${a.count} spend${a.count === 1 ? '' : 's'}</p>
        ${shared > 0 ? `<p class="hero-sub">Your share ${f.money(a.spend - shared)} · ${f.money(shared)} split with friends</p>` : ''}
      </section>
      <div class="stats">
        <div class="stat"><span class="k">Card choice score</span><span class="v">${Math.round(score)}%</span><span class="d">of the best possible return</span></div>
        <div class="stat"><span class="k">Missed rewards</span><span class="v">${f.reward(a.missed)}</span><span class="d">from using the other card</span></div>
      </div>
      <h2 class="section-title">By category</h2>
      <div class="panel">${categoryBreakdown(a)}</div>
      <p class="foot">Bars are split by the card you paid with. Tap a category to see its spends.</p>
      <h2 class="section-title">By card</h2>
      <div class="group">${CARD_ORDER.map((id) => cardMonthRow(S.cards[id], a)).join('')}${a.byCard.upi ? upiMonthRow(a.byCard.upi) : ''}</div>
      ${a.fx > 0 ? `<p class="foot">Forex markup paid this month: ${f.reward(a.fx)} incl. GST.</p>` : ''}
      ${trend}
    </div>
  `;
}

function changeMonth(next) {
  const current = monthKey(todayISO());
  if (!/^\d{4}-\d{2}$/.test(next) || next > current || next === S.month) return;
  const dir = next > S.month ? 'next' : 'prev';
  const run = () => {
    S.month = next;
    rerender();
  };
  if (!document.startViewTransition || reduceMotion()) return run();
  document.documentElement.dataset.dir = dir;
  document.startViewTransition(run);
}

// ---------------------------------------------------------------- cards / settings

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ruleFields(card) {
  const pts = isPoints(card);
  const bonus = card.capMode === 'bonus';
  return [
    ['accelRate', pts ? 'Bonus-category points per ₹100' : 'Bonus-category cashback %'],
    ['accelCap', bonus ? 'Cap on extra points per cycle (0 = none)' : pts ? 'Cap per cycle (points, 0 = none)' : 'Cap per cycle (₹ cashback, 0 = none)'],
    ...(bonus ? [] : [['afterCapRate', pts ? 'Points per ₹100 after cap' : 'Cashback % after cap']]),
    ['baseRate', pts ? 'Base points per ₹100' : 'Base cashback %'],
    ...(pts ? [['pointValue', 'Value of 1 point (₹)']] : []),
    ['forexMarkup', 'Forex markup % (GST added)'],
    ['annualFee', 'Annual fee (₹)'],
    ['feeWaiverSpend', 'Fee waived at annual spend (₹)'],
  ];
}

function choiceRow(card, field, label, options) {
  const opts = options.map(([v, l]) => `<option value="${v}" ${card[field] === v ? 'selected' : ''}>${l}</option>`).join('');
  return `<label class="row"><span class="grow">${label}</span><select data-cf="${card.id}.${field}" data-kind="text">${opts}</select></label>`;
}

function details(key, summary, body) {
  return `<details class="group details" data-key="${key}" ${S.open.has(key) ? 'open' : ''}><summary>${summary}</summary>${body}</details>`;
}

function mapTable(card) {
  const label = (b) => (b === 'accel' ? rateText(card, card.accelRate) : b === 'base' ? rateText(card, card.baseRate) : 'None');
  const rows = CATEGORIES.map((c) => {
    const pair = card.map[c.id] || ['base', 'base'];
    const sel = (i) => `<select data-cmap="${card.id}.${c.id}.${i}" aria-label="${c.label} ${i ? 'online' : 'in-store'}">${['accel', 'base', 'none'].map((b) => `<option value="${b}" ${pair[i] === b ? 'selected' : ''}>${label(b)}</option>`).join('')}</select>`;
    return `<tr><th>${c.icon} ${c.label}</th><td>${sel(0)}</td><td>${sel(1)}</td></tr>`;
  }).join('');
  return `<table class="maptable"><thead><tr><th></th><th>In-store</th><th>Online</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Wallet-style picker: tap a card to show only its settings below.
function cardPicker() {
  return `<div class="card-picker" role="group" aria-label="Choose a card">${CARD_ORDER.map((id) => {
    const card = S.cards[id];
    const on = S.cardSel === id;
    return `<button class="mini-card ${id} ${on ? 'on' : ''}" data-act="cardSel" data-id="${id}" aria-pressed="${on}" aria-label="${card.name}">
      ${cardArt(id, `pick-${id}`)}
      <span class="mc-top" aria-hidden="true"><span class="mc-chip"></span><span class="mc-type">${isPoints(card) ? 'Reward points' : 'Cashback'}</span></span>
      <span class="mc-bottom" aria-hidden="true"><span class="mc-name">${card.name}</span>${card.last4 ? `<span class="mc-num">•••• ${f.esc(card.last4)}</span>` : ''}</span>
    </button>`;
  }).join('')}</div>`;
}

// Spends made before you started using CardMax: they count toward this card
// year's fee waiver and milestones, and use up the bonus cap of their cycle.
function openingSection(card) {
  const id = card.id;
  const asOf = card.openingDate || todayISO();
  const year = cardYearOf(asOf, card.anniversaryMonth);
  const cyc = cycleOf(asOf, card.statementDay);
  const yearSpend = Number(card.openingYearSpend) || 0;
  const cycleSpend = Number(card.openingCycleBonusSpend) || 0;
  const annual = (card.milestones || []).find((m) => m.window === 'cardYear');
  const welcome = (card.milestones || []).some((m) => m.window === 'issue');
  const counts = [card.feeWaiverSpend && 'fee waiver', annual && 'milestone', welcome && 'welcome bonus'].filter(Boolean);
  const money = (field, value, label, sub) => `<label class="row"><span class="grow">${label}<small class="muted block">${sub}</small></span>
    <span class="muted" aria-hidden="true">₹</span><input class="num" inputmode="decimal" placeholder="0" autocomplete="off"
    value="${value ? f.grouped(value) : ''}" data-cf="${id}.${field}" data-kind="money" aria-label="${f.esc(`${label}, rupees`)}"></label>`;
  const capUsed = card.accelCap > 0 ? Math.min(card.accelCap, (cycleSpend * cappedRate(card)) / 100) : 0;
  const counted = [
    yearSpend ? `${f.compact(yearSpend)} counted toward the ${nameList(counts)}.` : '',
    capUsed ? `Uses ${unitsText(card, capUsed)} of the ${f.monthShort(cyc.key)} statement’s ${unitsText(card, card.accelCap)} ${card.capMode === 'bonus' ? 'bonus cap' : 'cap'}.` : '',
  ].filter(Boolean).join(' ');
  return `<h2 class="section-title">Spent before CardMax</h2>
    <div class="group">
      ${money('openingYearSpend', yearSpend, 'This card year', `${f.dateLabel(year.start)} – ${f.dateLabel(asOf)}, all spends`)}
      ${card.accelCap > 0 ? money('openingCycleBonusSpend', cycleSpend, 'Bonus spends this cycle', `${f.dateLabel(cyc.start)} – ${f.dateLabel(asOf)}, ${card.accelLabel}`) : ''}
      <label class="row"><span class="grow">As of</span><input type="date" data-cf="${id}.openingDate" data-kind="text" value="${f.esc(card.openingDate || '')}" max="${todayISO()}"></label>
    </div>
    <p class="foot">${counted ? `${counted} ` : ''}Totals of spends you haven’t added to CardMax, from your statement or bank app. New card? Leave these blank.</p>`;
}

function creditsSection(card) {
  const list = rewardCredits(card, S.calc.cycles[card.id], S.data.credits, todayISO());
  const what = isPoints(card) ? 'points' : 'cashback';
  const title = '<h2 class="section-title" id="credits">Reward credits</h2>';
  if (!list.length) {
    return `${title}<p class="foot">When a statement closes, the ${what} CardMax expects shows up here. Mark it once the bank credits it, and you’ll be told about any that come late or short.</p>`;
  }
  const rows = list.map((c) => {
    const [ico, cls, text] = {
      received: () => ['✓', 'good', `Credited ${unitsText(card, c.got.units)} on ${f.dateLabel(c.got.date)}`],
      short: () => ['!', 'warn', `Got ${unitsText(card, c.got.units)}, ${unitsText(card, c.short)} short`],
      overdue: () => ['!', 'warn', `Late: due by ${f.dateLabel(c.due)}`],
      pending: () => ['…', 'wait', `Expected by ${f.dateLabel(c.due)}`],
    }[c.status]();
    const label = `${f.monthLabel(c.key)} statement: ${unitsText(card, c.expected)} expected. ${text}`;
    return `<button class="row act credit" data-act="credit" data-id="${card.id}|${c.key}" aria-label="${f.esc(label)}">
      <span class="credit-ico ${cls}" aria-hidden="true">${ico}</span>
      <span class="grow" aria-hidden="true"><b>${f.monthLabel(c.key)}</b><small class="block ${cls}">${text}</small></span>
      <span class="muted" aria-hidden="true">${unitsText(card, c.expected)}</span>
    </button>`;
  }).join('');
  return `${title}<div class="group">${rows}</div>
    <p class="foot">Tap a statement to mark what ${card.short} credited. Expected ${what} comes from the rates below, so a small difference can be rounding.</p>`;
}

function cardSettings(card) {
  const id = card.id;
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
    .map((d) => `<option value="${d}" ${card.statementDay === d ? 'selected' : ''}>${d === 31 ? 'Last day of month' : d}</option>`).join('');
  const months = MONTHS.map((m, i) => `<option value="${i + 1}" ${card.anniversaryMonth === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  const rules = ruleFields(card).map(([k, label]) => `<label class="row"><span class="grow">${label}</span>
    <input class="num" type="number" inputmode="decimal" step="any" min="0" value="${card[k]}" data-cf="${id}.${k}"></label>`).join('');
  const per100 = isPoints(card)
    ? `<label class="row"><span class="grow">Points only per full ₹100</span><input type="checkbox" switch data-cf="${id}.per100" ${card.per100 ? 'checked' : ''}></label>`
    : '';
  const modes = choiceRow(card, 'capMode', 'Cap counts', [['total', 'All bonus-rate earnings'], ['bonus', 'Only the extra over base']])
    + choiceRow(card, 'intlRule', 'Spends abroad', [['same', 'Same as at home'], ['accel', 'Always bonus rate'], ['noBase', 'No base rate']]);
  const benefits = `<ul class="benefits">${card.benefits.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ul>
    <p class="verify-title">Check against your card terms</p>
    <ul class="verify">${card.verify.map((v) => `<li>${v}</li>`).join('')}</ul>
    <a class="link-row" href="${card.officialUrl}" target="_blank" rel="noopener">Official ${card.name} page ↗</a>`;
  const welcome = (card.milestones || []).some((m) => m.window === 'issue');
  const issueMonth = card.issueDate ? Number(card.issueDate.slice(5, 7)) : 0;
  const fixYear = issueMonth && issueMonth !== card.anniversaryMonth
    ? `<button class="row act" data-act="fixAnniv" data-card="${id}">Start the card year in ${MONTHS[issueMonth - 1]}, when the card was issued</button>`
    : '';

  return `<section class="card-sec" aria-label="${card.name} settings">
    <div class="group">
      <label class="row"><span class="grow">Statement date</span><select data-cf="${id}.statementDay">${days}</select></label>
      <label class="row"><span class="grow">Card issue date<small class="muted block">${welcome ? 'Starts the welcome-bonus window' : 'When you got this card'}</small></span><input type="date" data-cf="${id}.issueDate" data-kind="text" value="${f.esc(card.issueDate)}" max="${todayISO()}"></label>
      <label class="row"><span class="grow">Card anniversary month<small class="muted block">The fee-waiver year starts here</small></span><select data-cf="${id}.anniversaryMonth">${months}</select></label>
      ${fixYear}
      <label class="row"><span class="grow">Last 4 digits<small class="muted block">Matches this card in bank SMS</small></span><input class="num" inputmode="numeric" maxlength="4" placeholder="Optional" autocomplete="off" data-cf="${id}.last4" data-kind="text" value="${f.esc(card.last4)}"></label>
    </div>
    <p class="foot">Caps reset the day after the statement date. The anniversary month is usually the month the card was issued.</p>
    ${openingSection(card)}
    ${creditsSection(card)}
    <h2 class="section-title">Rules</h2>
    ${details(`${id}-benefits`, 'Benefits & Fine Print', benefits)}
    ${details(`${id}-rules`, 'Reward Rates', rules + modes + per100 + `<button class="row act" data-act="resetRules" data-card="${id}">Restore Default Rules</button>`)}
    ${details(`${id}-map`, 'Category Rules', `<p class="foot inset">What each category earns on this card. Change one if your statement shows a different rate.</p>${mapTable(card)}`)}
  </section>`;
}

function playbook() {
  const h = S.cards.hsbc;
  const b = S.cards.bob;
  const val = (card, rate) => rate * card.pointValue;
  const capSpend = (card) => (card.accelCap > 0 ? (card.accelCap * 100) / cappedRate(card) : Infinity);
  const annual = (b.milestones || []).find((m) => m.window === 'cardYear');
  const tips = [
    ['🛒', `<b>${h.name} first for dining, delivery, groceries, shopping & bills</b> at ${f.pct(h.accelRate)} until ${f.money(h.accelCap)} cashback a cycle (≈ ${f.money(capSpend(h))} of spend). Past the cap these earn nothing on ${h.short}, so switch to ${b.name}.`],
    ['✈️', `<b>${b.name} for travel, Amazon/Flipkart & everything online</b> at ${f.pct(val(b, b.accelRate))}. The extra points stop after ${f.num(b.accelCap)} a cycle (≈ ${f.money(capSpend(b))} of spend), then it’s ${f.pct(val(b, b.baseRate))}.`],
    ['🛍️', `<b>Other in-store spends → ${h.name}</b> (pharmacy, cabs, movies): ${f.pct(h.baseRate)} beats ${f.pct(val(b, b.baseRate))}.`],
    ['🚫', `<b>${h.short} pays nothing on</b> insurance, education, tax, jewellery, hospitals, tolls and metro. ${b.short} still gives ${f.pct(val(b, b.baseRate))} there.`],
    ['⛽', `<b>Fuel → ${b.name}</b> for the 1% surcharge waiver (₹400–₹5,000). Neither card gives points or cashback on fuel, rent or wallet loads.`],
    ['🪙', `<b>Under ₹100 → ${h.name}</b>. ${b.name} gives points per full ₹100.`],
    ['👥', '<b>Paying for the group?</b> Put the whole bill on the best card, then split it. You earn rewards on the full amount and friends pay you back.'],
    ['🎯', `<b>Fee waivers & milestones</b>: spend over ${f.compact(h.feeWaiverSpend)} on ${h.short} and ${f.compact(b.feeWaiverSpend)} on ${b.short} each card year to skip their annual fees.${annual ? ` ${f.compact(annual.spend)} on ${b.short} adds ${f.num(annual.units)} points (${f.money(annual.units * b.pointValue)}).` : ''} Home tracks your pace.`],
  ];
  return `<div class="group playbook">${tips.map(([i, t]) => `<div class="row top"><span class="ico" aria-hidden="true">${i}</span><span class="grow">${t}</span></div>`).join('')}</div>
    <p class="foot">Based on the HSBC Live+ and BOB Eterna terms in your documents (Oct 2026). Home works it out live from what’s left of each cap.</p>`;
}

function viewCards() {
  const m = S.data.meta;
  return `
    <header class="large-title"><h1>Cards</h1></header>
    ${cardPicker()}
    ${cardSettings(S.cards[S.cardSel])}
    <h2 class="section-title">Playbook</h2>
    ${playbook()}
    <h2 class="section-title">Your data</h2>
    <div class="group">
      <button class="row act" data-act="export">Back Up to Files (JSON)</button>
      <label class="row act">Restore from Backup<input type="file" accept=".json,application/json" data-import hidden></label>
      <button class="row act" data-act="csv">Export Spreadsheet (CSV)</button>
      <button class="row act danger" data-act="erase">Delete All Spends</button>
    </div>
    <p class="foot">${S.data.txns.length} spends and ${S.data.friends.length} friends stored on this device only. Nothing is uploaded anywhere. Last backup: ${m.lastBackup ? f.dateLong(m.lastBackup.slice(0, 10)) : 'never'}.</p>
    <p class="foot center">CardMax ${APP_VERSION} · card rules as of ${RULES_VERSION}<br>Banks change their terms, so check the official pages now and then.</p>
  `;
}

function onCardField(el) {
  const [id, field] = el.dataset.cf.split('.');
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.dataset.kind === 'text') value = el.value;
  else if (el.dataset.kind === 'money') {
    value = el.value.trim() ? parseAmount(el.value) : 0;
    if (!(value >= 0)) {
      toast('Enter an amount like 1,42,000');
      rerender();
      return;
    }
  } else {
    value = Number(el.value);
    if (!Number.isFinite(value) || value < 0) {
      toast('Enter a number of 0 or more');
      rerender();
      return;
    }
  }
  if (field === 'last4' && value && !/^\d{4}$/.test(value)) {
    toast('Enter exactly 4 digits');
    rerender();
    return;
  }
  let note = 'Saved';
  store.setCardField(S.data, id, field, value);
  if (field === 'statementDay' || field === 'anniversaryMonth') S.data.meta.setupDone = true;
  // Totals entered without a date are taken as of today.
  if (field.startsWith('opening') && field !== 'openingDate' && value > 0 && !S.cards[id].openingDate) {
    store.setCardField(S.data, id, 'openingDate', todayISO());
  }
  // The fee-waiver year runs from the month the card was issued.
  if (field === 'issueDate' && value) {
    const month = Number(value.slice(5, 7));
    if (month !== S.cards[id].anniversaryMonth) {
      store.setCardField(S.data, id, 'anniversaryMonth', month);
      note = `Saved · card year now starts in ${MONTHS[month - 1]}`;
    }
    S.data.meta.setupDone = true;
  }
  persist();
  rerender();
  toast(note);
}

function onCardMap(el) {
  const [id, cat, idx] = el.dataset.cmap.split('.');
  store.setCardBucket(S.data, id, cat, Number(idx), el.value);
  persist();
  toast('Saved');
}

// ---------------------------------------------------------------- data in / out

async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

async function exportBackup() {
  const ok = await shareFile(`cardmax-backup-${todayISO()}.json`, store.toBackup(S.data), 'application/json');
  if (!ok) return;
  S.data.meta.lastBackup = new Date().toISOString();
  persist();
  rerender();
  toast('Backup exported');
}

async function importFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const next = store.parseBackup(await file.text());
    if (!confirm(`Restore ${next.txns.length} spends and ${next.friends.length} friends from this backup? This replaces everything currently on this device.`)) return;
    S.data = { ...next, meta: { ...next.meta, setupDone: true } };
    persist();
    rerender();
    toast(`Restored ${next.txns.length} spends`);
  } catch (e) {
    toast(`Couldn’t restore that file. ${e.message}`);
  }
}

// ---------------------------------------------------------------- tooltip & toast

function showTip(el) {
  tipEl.innerHTML = f.esc(el.dataset.tip).replace(/\n/g, '<br>');
  tipEl.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const y = r.top - h - 8 > 60 ? r.top - h - 8 : r.bottom + 8;
  tipEl.style.transform = `translate(${x}px, ${y}px)`;
}

function hideTip() {
  tipEl.hidden = true;
}

let toastTimer;
function hideToast() {
  toastEl.classList.remove('show', 'actionable');
}
function toast(msg, action) {
  toastText.textContent = msg;
  toastAction.hidden = !action;
  toastEl.classList.toggle('actionable', !!action);
  toastAction.onclick = action ? () => { hideToast(); action.run(); } : null;
  if (action) toastAction.textContent = action.label;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2600);
}

// ---------------------------------------------------------------- events

const VIEWS = {
  home: viewHome, history: viewHistory, friends: viewFriends, friend: viewFriend, insights: viewInsights, cards: viewCards,
  add: () => '', edit: () => '', settle: () => '', iou: () => '',
};

function onTab(tab) {
  if (tab === 'add') {
    navigate('add');
    $('#amount')?.focus();
    return;
  }
  if (tab === S.route.name) {
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    return;
  }
  navigate(tab);
}

function addFriendFromPage() {
  const input = view.querySelector('[data-newfriend]');
  const before = S.data.friends.length;
  const id = input && addFriend(input.value);
  if (!id) return input?.focus();
  rerender();
  toast(S.data.friends.length > before ? `Added ${friendById(id).name}` : `${friendById(id).name} is already on your list`);
}

const ACTIONS = {
  go: (el) => (el.dataset.to === 'add' ? onTab('add') : navigate(el.dataset.to)),
  openTxn: (el) => navigate(`edit/${encodeURIComponent(el.dataset.id)}`),
  scenario: (el) => {
    const { category, channel, intl = false } = SCENARIOS[Number(el.dataset.i)];
    S.prefill = { category, channel, intl, catTouched: true };
    onTab('add');
  },
  addInMonth: () => {
    const [y, m] = S.month.split('-').map(Number);
    const date = S.month === monthKey(todayISO()) ? todayISO() : toISO(new Date(y, m, 0));
    S.prefill = { date };
    onTab('add');
  },
  requestClose,
  save: saveSpend,
  saveLedger,
  delete: () => {
    const t = S.data.txns.find((x) => x.id === S.draft.id);
    S.data.txns = S.data.txns.filter((x) => x.id !== t.id);
    persist();
    closeSheet();
    toast('Spend deleted', {
      label: 'Undo',
      run: () => {
        S.data.txns.push(t);
        persist();
        rerender();
        toast('Spend restored');
      },
    });
  },
  amtPlus: () => {
    const a = $('#amount');
    if (a.value && !a.value.trim().endsWith('+')) a.value = `${a.value.trim()}+`;
    S.draft.amount = a.value;
    S.draft.dirty = true;
    sizeAmount(a);
    a.focus();
  },
  cat: (el) => {
    const c = catById(el.dataset.id);
    Object.assign(S.draft, { category: c.id, catTouched: true }, c.channel ? { channel: c.channel } : {});
    syncAddForm();
  },
  moreCats: () => {
    S.draft.showAll = true;
    $('#cats').innerHTML = categoryTiles(S.draft);
  },
  channel: (el) => {
    S.draft.channel = el.dataset.v;
    syncAddForm();
  },
  merchant: (el) => {
    applyMerchant(knownMerchants()[Number(el.dataset.i)]);
    syncAddForm();
  },
  pickCard: (el) => {
    Object.assign(S.draft, { card: el.dataset.id, cardLocked: true, dirty: true });
    updateAdvice();
  },
  splitToggle: (el) => {
    const sp = S.draft.split;
    const id = el.dataset.id;
    sp.ids = sp.ids.includes(id) ? sp.ids.filter((x) => x !== id) : [...sp.ids, id];
    S.draft.dirty = true;
    renderSplitBox();
  },
  splitMode: (el) => {
    const sp = S.draft.split;
    if (el.dataset.v === 'custom' && sp.mode === 'equal') {
      // Start custom amounts from the equal split so you only adjust what differs.
      for (const s of draftShares()) if (!sp.custom[s.id]) sp.custom[s.id] = s.share ? String(s.share) : '';
    }
    sp.mode = el.dataset.v;
    S.draft.dirty = true;
    renderSplitBox();
  },
  showAddFriend: () => {
    S.draft.addingFriend = true;
    renderSplitBox();
    sheet.querySelector('[data-newfriend]')?.focus();
  },
  addFriendInline: addFriendFromSheet,
  entryKind: (el) => {
    S.draft.entryKind = el.dataset.v;
    S.draft.dirty = true;
    for (const b of sheet.querySelectorAll('[data-act="entryKind"]')) {
      b.classList.toggle('on', b === el);
      b.setAttribute('aria-pressed', String(b === el));
    }
    updateLedger();
  },
  addFriend: addFriendFromPage,
  openFriend: (el) => navigate(`friend/${encodeURIComponent(el.dataset.id)}`),
  openLedger: (el) => navigate(`${el.dataset.v}/${encodeURIComponent(S.baseArg)}`),
  ledgerEntry: (el) => {
    const e = S.data.ledger.find((x) => x.id === el.dataset.id);
    if (!e || !confirm(`Delete “${LEDGER_TEXT[e.kind](friendById(e.friendId).name)}” (${f.amount(e.amount)})?`)) return;
    S.data.ledger = S.data.ledger.filter((x) => x.id !== e.id);
    persist();
    rerender();
    toast('Entry deleted', {
      label: 'Undo',
      run: () => {
        S.data.ledger.push(e);
        persist();
        rerender();
      },
    });
  },
  removeFriend: () => {
    const fr = friendById(S.baseArg);
    if (!isSettled(S.split.bal[fr.id])) {
      toast(`Settle up with ${fr.name} first`);
      return;
    }
    if (!confirm(`Remove ${fr.name}? Their splits and payments are removed too.`)) return;
    S.data.friends = S.data.friends.filter((x) => x.id !== fr.id);
    S.data.ledger = S.data.ledger.filter((x) => x.friendId !== fr.id);
    for (const t of S.data.txns) {
      if (!t.split) continue;
      t.split.friends = t.split.friends.filter((s) => s.id !== fr.id);
      if (!t.split.friends.length) delete t.split;
    }
    persist();
    navigate('friends');
    toast(`Removed ${fr.name}`);
  },
  histCard: (el) => {
    S.hist.card = el.dataset.v;
    rerender();
  },
  histMissed: () => {
    S.hist.missed = !S.hist.missed;
    rerender();
  },
  histClearScope: () => {
    Object.assign(S.hist, { cat: null, month: null });
    rerender();
  },
  clearFilters: () => {
    S.hist = { q: '', card: 'all', missed: false, cat: null, month: null };
    rerender();
  },
  catDrill: (el) => {
    S.hist = { q: '', card: 'all', missed: false, cat: el.dataset.id, month: S.month };
    navigate('history');
  },
  month: (el) => changeMonth(addMonths(S.month, Number(el.dataset.d))),
  thisMonth: () => changeMonth(monthKey(todayISO())),
  dismiss: (el) => {
    const m = S.data.meta;
    if (el.dataset.key === 'install') m.hideInstall = true;
    if (el.dataset.key === 'setup') m.setupDone = true;
    if (el.dataset.key === 'backup') m.backupSnooze = new Date().toISOString();
    if (el.dataset.key === 'credit') m.creditSeen = lateCredits(todayISO()).key;
    persist();
    rerender();
  },
  export: exportBackup,
  // Flips in place (no re-render) so the 3D turn animates.
  flipTile: (el) => {
    const id = el.dataset.id;
    const on = !S.flipped.has(id);
    if (on) S.flipped.add(id);
    else S.flipped.delete(id);
    const tile = el.closest('.ctile-flip');
    tile.classList.toggle('flipped', on);
    tile.querySelector('.front').toggleAttribute('aria-hidden', on);
    tile.querySelector('.back').toggleAttribute('aria-hidden', !on);
    el.setAttribute('aria-pressed', String(on));
    el.setAttribute('aria-label', flipLabel(S.cards[id], on));
  },
  cardSel: (el) => {
    S.cardSel = el.dataset.id;
    rerender();
  },
  fixAnniv: (el) => {
    const card = S.cards[el.dataset.card];
    const month = Number(card.issueDate.slice(5, 7));
    store.setCardField(S.data, card.id, 'anniversaryMonth', month);
    persist();
    rerender();
    toast(`${card.short} card year now starts in ${MONTHS[month - 1]}`);
  },
  openCredits: (el) => {
    S.cardSel = el.dataset.id;
    navigate('cards');
    $('#credits')?.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  },
  credit: (el) => {
    const [cardId, key] = el.dataset.id.split('|');
    const card = S.cards[cardId];
    const c = rewardCredits(card, S.calc.cycles[cardId], S.data.credits, todayISO(), Infinity).find((x) => x.key === key);
    if (!c) return;
    const what = isPoints(card) ? 'points' : 'cashback (₹)';
    const input = prompt(`${card.name}: ${what} credited for the ${f.monthLabel(key)} statement. CardMax expects ${unitsText(card, c.expected)}.${c.got ? ' Clear the box to unmark it.' : ''}`,
      String(c.got ? c.got.units : Math.round(c.expected * 100) / 100));
    if (input === null) return;
    if (!input.trim()) {
      store.setCredit(S.data, cardId, key, null);
      persist();
      rerender();
      toast('Unmarked');
      return;
    }
    const units = parseAmount(input);
    if (!(units >= 0)) {
      toast('Enter a number');
      return;
    }
    store.setCredit(S.data, cardId, key, units, todayISO());
    persist();
    rerender();
    const short = c.expected - units;
    toast(short > Math.max(1, c.expected * 0.01) ? `Marked · ${unitsText(card, short)} short. Ask ${card.short} if it doesn’t arrive.` : 'Marked as credited');
  },
  smsPaste: pasteSms,
  smsFill: () => applySms(sheet.querySelector('[data-sms]')?.value || ''),
  csv: () => shareFile(`cardmax-${todayISO()}.csv`, store.toCSV(S.data, S.cards, S.calc.results), 'text/csv'),
  resetRules: (el) => {
    if (!confirm(`Restore the default rules for ${S.cards[el.dataset.card].name}? Your dates, card digits and earlier spends are kept.`)) return;
    store.resetRules(S.data, el.dataset.card);
    persist();
    rerender();
    toast('Default rules restored');
  },
  erase: () => {
    if (!S.data.txns.length) return;
    if (!confirm(`Delete all ${S.data.txns.length} spends from this device? Card settings and friends are kept.`)) return;
    if (!confirm('This can’t be undone unless you have a backup. Delete?')) return;
    S.data.txns = [];
    persist();
    rerender();
    toast('All spends deleted');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-tip], [data-tab]');
  if (!el) return hideTip();
  if (el.dataset.tab) return onTab(el.dataset.tab);
  if (!el.dataset.act) return showTip(el);
  hideTip();
  ACTIONS[el.dataset.act]?.(el, e);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const d = S.draft;
  if (el.dataset.draft && d) {
    const key = el.dataset.draft;
    d[key] = el.value;
    d.dirty = true;
    if (key === 'amount') sizeAmount(el);
    if (d.kind === 'ledger') updateLedger();
    else if (key === 'merchant') {
      const m = knownMerchants().find((x) => x.name.toLowerCase() === el.value.trim().toLowerCase());
      if (m && !d.catTouched) {
        applyMerchant({ ...m, name: el.value });
        syncAddForm();
      }
    } else if (key === 'amount' || key === 'date') {
      updateAdvice();
    }
  } else if (el.dataset.share && d) {
    d.split.custom[el.dataset.share] = el.value;
    d.dirty = true;
    $('#splitSum').textContent = splitSummary();
  } else if (el.dataset.hist) {
    S.hist.q = el.value;
    $('#histList').innerHTML = historyList();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.cf) onCardField(el);
  else if (el.dataset.cmap) onCardMap(el);
  else if (el.matches('[data-import]')) importFile(el);
  else if (el.matches('[data-month]')) changeMonth(el.value);
  else if (el.matches('[data-splitme]')) {
    S.draft.split.includeMe = el.checked;
    S.draft.dirty = true;
    $('#splitSum').textContent = splitSummary();
  }
});

document.addEventListener('paste', (e) => {
  const el = e.target;
  if (el.matches?.('[data-sms]')) setTimeout(() => applySms(el.value), 0);
});

document.addEventListener('toggle', (e) => {
  const key = e.target.dataset?.key;
  if (key) (e.target.open ? S.open.add(key) : S.open.delete(key));
}, true);

// Return dismisses the keyboard (or adds the friend); the "+" key keeps it up.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.matches('[data-newfriend]')) {
    e.preventDefault();
    if (sheet.contains(e.target)) addFriendFromSheet();
    else addFriendFromPage();
  } else if (e.target.matches('input[data-draft], input[data-hist], input[data-share]')) {
    e.preventDefault();
    e.target.blur();
  }
});
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-act="amtPlus"]')) e.preventDefault();
});

// Swipe left/right on the Insights month to step through months.
let swipe = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  swipe = e.target.closest('.month-body') ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) changeMonth(addMonths(S.month, dx < 0 ? 1 : -1));
}, { passive: true });

window.addEventListener('popstate', onRoute);
window.addEventListener('scroll', hideTip, { passive: true });
document.addEventListener('visibilitychange', () => {
  // Rolls "today" over when the app is reopened on a new day.
  if (document.visibilityState === 'visible' && !SHEETS.includes(S.route.name)) rerender();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
}

refresh();
onRoute();
