import { parseISO } from './engine.js';

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const money = (v) => inr0.format(Math.round(v));
// Amounts keep paise only when they have them.
export const amount = (v) => (Math.round(v * 100) % 100 ? inr2.format(v) : inr0.format(v));
// Rewards are usually small, so show paise below ₹100.
export const reward = (v) => (Math.abs(v) < 0.005 ? inr0.format(0) : Math.abs(v) < 100 ? inr2.format(v) : inr0.format(v));
export const compact = (v) => (Math.abs(v) >= 100000 ? inrCompact.format(v) : inr0.format(Math.round(v)));
export const num = (v) => num0.format(Math.round(v));
// For editable amounts: grouped like 1,42,000 but keeps paise.
export const grouped = (v) => num2.format(v);
export const pct = (v) => `${Number((+v).toFixed(2))}%`;

export const dateLabel = (iso) => parseISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const dateLong = (iso) => parseISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const monthLabel = (key) => parseISO(`${key}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
export const monthShort = (key) => parseISO(`${key}-01`).toLocaleDateString('en-IN', { month: 'short' });

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
