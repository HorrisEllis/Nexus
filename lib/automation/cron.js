'use strict';
/**
 * clear-glass/src/automation/cron.js — standard 5-field cron, local time.
 * component_id: cg.automation.cron
 *
 * §0.39.265 — schedules beyond "every N" and "daily at": any cron expression.
 *
 *   ┌ minute (0-59)  ┌ hour (0-23)  ┌ day of month (1-31)  ┌ month (1-12 or JAN-DEC)  ┌ day of week (0-6 or SUN-SAT, 7 = Sunday)
 *   examples: "0 9 * * 1-5" (09:00 on weekdays), "every-15" as star-slash-15,
 *   lists "1,15", ranges "1-5", names MON-FRI / JAN-DEC, and the shortcuts
 *   @hourly @daily @weekly @monthly @yearly
 *
 * Day-of-month and day-of-week follow cron's own rule: when BOTH are
 * restricted, a day matches if EITHER does.
 */

const NAMES = {
  month: { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 },
  dow: { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 },
};
const SHORT = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *' };
const FIELDS = [['minute', 0, 59], ['hour', 0, 23], ['dom', 1, 31], ['month', 1, 12], ['dow', 0, 7]];

function _field(src, [name, lo, hi]) {
  const set = new Set();
  const names = name === 'month' ? NAMES.month : name === 'dow' ? NAMES.dow : null;
  const num = (t) => {
    const u = String(t).toUpperCase();
    if (names && names[u] !== undefined) return names[u];
    if (!/^\d+$/.test(u)) throw new Error(`cron ${name}: "${t}" is not a number${names ? ' or name' : ''}`);
    return parseInt(u, 10);
  };
  for (const part of String(src).split(',')) {
    const [range, stepS] = part.split('/');
    const step = stepS === undefined ? 1 : parseInt(stepS, 10);
    if (!(step >= 1)) throw new Error(`cron ${name}: bad step "${stepS}"`);
    let a, b;
    if (range === '*') { a = lo; b = hi; }
    else if (range.includes('-')) { const [x, y] = range.split('-'); a = num(x); b = num(y); }
    else { a = num(range); b = stepS === undefined ? a : hi; }
    if (a < lo || b > hi || a > b) throw new Error(`cron ${name}: ${range} is outside ${lo}-${hi}`);
    for (let v = a; v <= b; v += step) set.add(name === 'dow' && v === 7 ? 0 : v);
  }
  return { set, any: String(src) === '*' };
}

/** parse(expr) -> { minute, hour, dom, month, dow } sets — throws with a readable reason */
function parse(expr) {
  const e = SHORT[String(expr || '').trim().toLowerCase()] || String(expr || '').trim();
  const parts = e.split(/\s+/);
  if (parts.length !== 5) throw new Error(`a cron expression has 5 fields (minute hour day month weekday) — got ${parts.length}`);
  const out = {};
  FIELDS.forEach((f, i) => { out[f[0]] = _field(parts[i], f); });
  return out;
}

function _dayMatches(c, d) {
  const dom = c.dom.set.has(d.getDate()), dow = c.dow.set.has(d.getDay());
  if (!c.dom.any && !c.dow.any) return dom || dow;
  if (!c.dom.any) return dom;
  if (!c.dow.any) return dow;
  return true;
}

/** next(expr, from) -> the next matching time (ms) strictly after `from`, or null within ~4 years */
function next(expr, from = Date.now()) {
  const c = typeof expr === 'object' ? expr : parse(expr);
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = from + 4 * 366 * 86400000;
  while (d.getTime() <= limit) {
    if (!c.month.set.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
    if (!_dayMatches(c, d)) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
    if (!c.hour.set.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
    if (!c.minute.set.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1, 0, 0); continue; }
    return d.getTime();
  }
  return null;
}

/** describe(expr) — a short plain-English reading for the UI */
function describe(expr) {
  try {
    const e = SHORT[String(expr).trim().toLowerCase()] || String(expr).trim();
    const [mi, ho, dm, mo, dw] = e.split(/\s+/);
    const days = { '1-5': 'on weekdays', '0,6': 'on weekends', '6,0': 'on weekends', '*': '' };
    if (/^\*\/\d+$/.test(mi) && ho === '*' && dm === '*' && mo === '*' && dw === '*') return `every ${mi.slice(2)} minutes`;
    if (/^\d+$/.test(mi) && /^\*\/\d+$/.test(ho) && dm === '*' && mo === '*' && dw === '*') return `every ${ho.slice(2)} hours at :${mi.padStart(2, '0')}`;
    if (/^\d+$/.test(mi) && ho === '*' && dm === '*' && mo === '*' && dw === '*') return `every hour at :${mi.padStart(2, '0')}`;
    if (/^\d+$/.test(mi) && /^\d+$/.test(ho) && mo === '*') {
      const t = `${ho.padStart(2, '0')}:${mi.padStart(2, '0')}`;
      if (dm === '*' && dw in days) return `at ${t} ${days[dw] || 'every day'}`.trim();
      if (dm === '*') return `at ${t} on weekdays ${dw}`;
      if (dw === '*') return `at ${t} on day ${dm} of the month`;
    }
    return e;
  } catch (_) { return String(expr); }
}

module.exports = { parse, next, describe };
