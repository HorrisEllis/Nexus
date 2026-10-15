'use strict';
// CC-01..CC-18 (0.60.55): the personal-chat crawl plan — completeness, the stopping edge, pace, stop rules, restart. Pure: fake clock, fixed rng.
const assert = require('assert');
const P = require('../../lib/chat-crawl-plan.js'), S = require('../../lib/chat-crawl-settings.js');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
const cfg = (o = {}) => S.clean({ paceMinSec: 5, paceMaxSec: 5, perHour: 600, perDay: 5000, ...o }).settings;
const mkList = (n, upd = 1) => Array.from({ length: n }, (_, i) => ({ url: `https://c/${n - i}`, title: `chat ${n - i}`, updated: `${upd}` }));   // newest first: c/n ... c/1
const rng = () => 0.5;
// drive: visit everything the plan hands out, reporting ok with a hash from `hashOf(url)`
function drain(st, c, now0 = 1e9, hashOf = (u) => 'h' + u, max = 10000) {
  let now = now0, visits = []; for (let i = 0; i < max; i++) { const a = P.next(st, c, now, rng); if (a.action === 'wait') { now += a.ms; continue; } if (a.action !== 'visit') break; visits.push(a.url); P.report(st, a.url, { kind: 'ok', turns: 4, hash: hashOf(a.url), updated: '1' }, c, now); }
  return { visits, now };
}

t('CC-01 backfill reads every chat once, newest first, and is done only when the list is complete', () => {
  const st = P.create('chatgpt:a1'), c = cfg(); const r = P.observeList(st, mkList(5), { complete: false, now: 1e9 }, c);
  assert.strictEqual(r.needMore, true); assert.strictEqual(st.phase, 'backfill');
  const d = drain(st, c); assert.deepStrictEqual(d.visits, ['https://c/5', 'https://c/4', 'https://c/3', 'https://c/2', 'https://c/1']);
  assert.strictEqual(st.phase, 'backfill', 'list not complete: not done'); assert.strictEqual(P.audit(st).nothingMissed, false);
  P.observeList(st, mkList(5), { complete: true, now: d.now }, c); assert.strictEqual(st.phase, 'caught-up'); assert.strictEqual(P.audit(st).nothingMissed, true);
});
t('CC-02 a list that grows as it is scrolled adds only the new chats', () => {
  const st = P.create('x'), c = cfg(); P.observeList(st, mkList(3), { complete: false }, c); drain(st, c);
  const r = P.observeList(st, mkList(6), { complete: true }, c); assert.strictEqual(r.queued, 3, 'only c/1..c/3 are old; the 3 new ones queue');
});
t('CC-03 oldest-first backfill order', () => { const st = P.create('x'), c = cfg({ backfillOrder: 'oldest' }); P.observeList(st, mkList(3), { complete: true }, c); assert.deepStrictEqual(drain(st, c).visits, ['https://c/1', 'https://c/2', 'https://c/3']); });
t('CC-04 a chat already logged and unchanged is never visited again', () => {
  const st = P.create('x'), c = cfg(); P.observeList(st, mkList(4), { complete: true }, c); drain(st, c);
  const r = P.observeList(st, mkList(4), { complete: true, now: 2e9 }, c); assert.strictEqual(r.queued, 0); assert.deepStrictEqual(drain(st, c, 2e9).visits, []);
});
t('CC-05 catch-up: a new chat is visited; the walk stops at the first run of unchanged chats (the edge)', () => {
  const st = P.create('x'), c = cfg({ anchorRun: 2, verifyAnchor: false }); P.observeList(st, mkList(10), { complete: true }, c); drain(st, c);
  const list = [{ url: 'https://c/new', updated: '9' }, ...mkList(10)]; const r = P.observeList(st, list, { complete: true, now: 2e9 }, c);
  assert.strictEqual(r.queued, 1); assert.strictEqual(r.anchor, 'https://c/9'); assert.deepStrictEqual(drain(st, c, 2e9).visits, ['https://c/new']);
});
t('CC-06 a chat whose `updated` changed is visited again; new data counts as logged, same data as unchanged', () => {
  const st = P.create('x'), c = cfg({ verifyAnchor: false }); P.observeList(st, mkList(3), { complete: true }, c); drain(st, c);
  const list = mkList(3); list[2].updated = '5';   // c/1 changed
  P.observeList(st, list, { complete: true, now: 2e9 }, c); const before = { ...st.counts };
  drain(st, c, 2e9, (u) => 'h' + u);   // same hash as before: visited because `updated` moved, but there is no new data
  assert.strictEqual(st.counts.unchanged, before.unchanged + 1); assert.strictEqual(st.counts.logged, before.logged);
});
t('CC-07 the stopping chat is re-checked once; if it changed, the walk goes on past it', () => {
  const st = P.create('x'), c = cfg({ anchorRun: 1, verifyAnchor: true }); P.observeList(st, mkList(6), { complete: true }, c); drain(st, c);
  const list = [{ url: 'https://c/new', updated: '9' }, ...mkList(6)]; P.observeList(st, list, { complete: true, now: 2e9 }, c);
  assert.strictEqual(st.verify, 'https://c/6');
  let now = 2e9, visits = []; for (let i = 0; i < 6; i++) { const a = P.next(st, c, now, rng); if (a.action === 'wait') { now += a.ms; continue; } if (a.action !== 'visit') break; visits.push(a.url);
    const r = P.report(st, a.url, { kind: 'ok', turns: a.url === 'https://c/6' ? 9 : 4, hash: a.url === 'https://c/6' ? 'CHANGED' : 'h' + a.url, updated: '1' }, c, now); if (a.url === 'https://c/6') assert.strictEqual(r.extend, true); }
  assert.deepStrictEqual(visits, ['https://c/new', 'https://c/6']); assert.strictEqual(st.extend, c.anchorRun);
});
t('CC-08 pinned chats at the top do not fool the edge: anchorRun > 1 reads past one unchanged chat', () => {
  const st = P.create('x'), c = cfg({ anchorRun: 3, verifyAnchor: false }); P.observeList(st, mkList(8), { complete: true }, c); drain(st, c);
  const list = mkList(8); const pinned = list.pop(); list.unshift(pinned);   // an old pinned chat first, then a changed chat, then the rest
  list[1].updated = '7'; const r = P.observeList(st, list, { complete: true, now: 2e9 }, c); assert.ok(r.queued >= 1 && drain(st, c, 2e9).visits.includes(list[1].url));
});
t('CC-09 pace: one chat at a time, never faster than the wait', () => {
  const st = P.create('x'), c = cfg({ paceMinSec: 30, paceMaxSec: 30 }); P.observeList(st, mkList(3), { complete: true }, c);
  assert.strictEqual(P.next(st, c, 1e9, rng).action, 'visit'); P.report(st, 'https://c/3', { kind: 'ok', turns: 1, hash: 'a' }, c, 1e9);
  const a = P.next(st, c, 1e9 + 10000, rng); assert.strictEqual(a.action, 'wait'); assert.strictEqual(a.ms, 20000);
});
t('CC-10 the hourly cap holds', () => {
  const st = P.create('x'), c = cfg({ perHour: 2, paceMinSec: 5, paceMaxSec: 5 }); P.observeList(st, mkList(5), { complete: true }, c);
  let now = 1e9, n = 0; for (let i = 0; i < 40; i++) { const a = P.next(st, c, now, rng); if (a.action === 'visit') { n++; P.report(st, a.url, { kind: 'ok', turns: 1, hash: 'h' + a.url }, c, now); now += 6000; if (now - 1e9 > 3.5e6) break; } else if (a.action === 'wait') { if (/hourly/.test(a.why)) { assert.ok(a.ms > 0); break; } now += a.ms; } else break; }
  assert.strictEqual(n, 2);
});
t('CC-11 three failures in a row stop it, with the reason, until the person resumes', () => {
  const st = P.create('x'), c = cfg({ maxFailures: 3, maxAttempts: 9 }); P.observeList(st, mkList(6), { complete: true }, c); let now = 1e9;
  for (let i = 0; i < 3; i++) { const a = P.next(st, c, now, rng); if (a.action === 'wait') { now += a.ms; i--; continue; } P.report(st, a.url, { kind: 'error', error: 'timeout' }, c, now); }
  assert.strictEqual(st.status, 'paused'); assert.match(st.pausedReason, /3 failures in a row/); assert.strictEqual(P.next(st, c, now + 1e6, rng).action, 'stopped');
  P.resume(st); assert.strictEqual(P.next(st, c, now + 1e6, rng).action, 'visit');
});
t('CC-12 a challenge page stops the queue and keeps the chat for later', () => {
  const st = P.create('x'), c = cfg(); P.observeList(st, mkList(3), { complete: true }, c); const a = P.next(st, c, 1e9, rng);
  P.report(st, a.url, { kind: 'challenge' }, c, 1e9); assert.strictEqual(st.status, 'paused'); assert.match(st.pausedReason, /captcha|challenge/); assert.strictEqual(st.queue[0], a.url);
});
t('CC-13 a rate-limit message cools down, and the cool-down doubles', () => {
  const st = P.create('x'), c = cfg({ coolDownMin: 10 }); P.observeList(st, mkList(3), { complete: true }, c); let a = P.next(st, c, 1e9, rng);
  let r = P.report(st, a.url, { kind: 'ratelimit' }, c, 1e9); assert.strictEqual(r.ms, 600000); assert.strictEqual(P.next(st, c, 1e9 + 1000, rng).action, 'wait');
  a = P.next(st, c, 1e9 + 600001, rng); assert.strictEqual(a.action, 'visit'); r = P.report(st, a.url, { kind: 'ratelimit' }, c, 1e9 + 600001); assert.strictEqual(r.ms, 1200000);
});
t('CC-14 a signed-out account pauses, never a loop', () => { const st = P.create('x'), c = cfg(); P.observeList(st, mkList(2), { complete: true }, c); const a = P.next(st, c, 1e9, rng); P.report(st, a.url, { kind: 'login' }, c, 1e9); assert.match(st.pausedReason, /signed out/); assert.strictEqual(P.next(st, c, 9e9, rng).action, 'stopped'); });
t('CC-15 a chat that fails every try is listed as failed with its reason, and backfill still finishes; nothingMissed stays false', () => {
  const st = P.create('x'), c = cfg({ maxAttempts: 2, maxFailures: 99 }); P.observeList(st, mkList(2), { complete: true }, c); let now = 1e9;
  for (let i = 0; i < 20; i++) { const a = P.next(st, c, now, rng); if (a.action === 'wait') { now += a.ms; continue; } if (a.action !== 'visit') break; P.report(st, a.url, a.url === 'https://c/2' ? { kind: 'error', error: 'page never settled' } : { kind: 'ok', turns: 1, hash: 'z' }, c, now); }
  const a = P.audit(st); assert.strictEqual(a.failed.length, 1); assert.strictEqual(a.failed[0].error, 'page never settled'); assert.strictEqual(a.nothingMissed, false); assert.strictEqual(st.phase, 'caught-up');
  assert.strictEqual(P.retryFailed(st), 1); assert.strictEqual(P.next(st, c, now + 1e6, rng).action, 'visit');
});
t('CC-16 restart: the state survives JSON and continues where it left off', () => {
  const st = P.create('x'), c = cfg(); P.observeList(st, mkList(6), { complete: true }, c); for (let i = 0; i < 2; i++) { const a = P.next(st, c, 1e9 + i * 1e5, rng); P.report(st, a.url, { kind: 'ok', turns: 1, hash: 'h' }, c, 1e9 + i * 1e5); }
  const back = JSON.parse(JSON.stringify(st)); const rest = drain(back, c, 3e9).visits; assert.deepStrictEqual(rest, ['https://c/4', 'https://c/3', 'https://c/2', 'https://c/1']);
});
t('CC-17 exclusions and Nexus chats are skipped WITH a reason, and appear in the audit', () => {
  const st = P.create('x'), c = cfg({ excludeTitles: ['private'], excludeUrls: ['/secret/'] }); const list = [{ url: 'https://c/1', title: 'my Private plan' }, { url: 'https://c/secret/2', title: 'x' }, { url: 'https://c/3', title: 'job', nexus: true }, { url: 'https://c/4', title: 'ok' }];
  P.observeList(st, list, { complete: true }, c); assert.deepStrictEqual(drain(st, c).visits, ['https://c/4']); const a = P.audit(st); assert.strictEqual(a.skipped.length, 3); assert.ok(a.skipped.every(s => s.why)); assert.strictEqual(a.nothingMissed, true);
});
t('CC-18 settings: out-of-range values are clamped and said; pace order and quiet hours are repaired; per-account overrides only touch per-account keys', () => {
  const r = S.clean({ perHour: 99999, paceMinSec: 100, paceMaxSec: 5, quietFrom: 3 }); assert.strictEqual(r.settings.perHour, 600); assert.strictEqual(r.settings.paceMaxSec, 100); assert.strictEqual(r.settings.quietFrom, -1); assert.ok(r.notes.length >= 3);
  const e = S.effective({ perHour: 10, anchorRun: 3 }, { perHour: 20, anchorRun: 9, enabled: true }); assert.strictEqual(e.perHour, 20); assert.strictEqual(e.anchorRun, 3); assert.strictEqual(e.enabled, true);
  assert.strictEqual(S.defaults().enabled, false);
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
