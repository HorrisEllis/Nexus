'use strict';
/**
 * lib/economy/gate.js — may this job go to this provider now? §0.39.281 EC2.
 * comp_id: nexus.lib.economy.gate
 * UUID: nexus-lib-economy-gate-v1-0000-2026-0929-jamesbrooks-001
 *
 * decide({ provider, jobType, estTokens }, { policy, usage, now }) →
 *   { verdict: 'allow' }
 *   { verdict: 'wait', ms, reason }             try again after ms (min gap, hourly window, quiet hours, concurrency)
 *   { verdict: 'stop', reason }                 not today / not allowed; the job fails with the reason
 *   { verdict: 'fallback', provider, reason }   the person configured another provider for this case (onLimit)
 * A limit of 0 means "no limit". Nothing here swaps a chosen provider on its own (I1): only onLimit does, and the
 * reason says so. Pure.
 */
const HOUR = 3600000;

function _inQuiet(q, now) {
  if (!q) return false;
  const h = new Date(now).getHours();
  const [a, b] = q;
  return a === b ? false : a < b ? h >= a && h < b : h >= a || h < b;
}
function _msToHourEnd(q, now) {
  const d = new Date(now); const target = new Date(now); target.setMinutes(0, 0, 0);
  let h = d.getHours();
  for (let i = 0; i < 24; i++) { h = (h + 1) % 24; target.setTime(target.getTime() + HOUR); if (!_inQuiet(q, target.getTime())) return Math.max(1000, target.getTime() - now); }
  return HOUR;
}

function decide({ provider, jobType = 'chat', estTokens = 0 } = {}, { policy, usage = {}, now = Date.now() } = {}) {
  const p = policy && policy.providers && policy.providers[provider];
  if (!p) return { verdict: 'allow', reason: `${provider} has no economy entry — not limited` };
  const onLimit = (reason, ms) => {
    if (p.onLimit === 'stop') return { verdict: 'stop', reason };
    const fb = /^fallback:(.+)$/.exec(p.onLimit || '');
    if (fb && fb[1] !== provider) return { verdict: 'fallback', provider: fb[1], reason: `${reason} — the economy sends it to ${fb[1]} (onLimit, set by you)` };
    return ms == null ? { verdict: 'stop', reason: `${reason} (nothing to wait for today)` } : { verdict: 'wait', ms, reason };
  };
  if (!p.enabled) return onLimit(`${provider} is switched off in the economy`, null);
  const jt = policy.jobTypes && policy.jobTypes[jobType];
  if (jt && Array.isArray(jt.tiers) && !jt.tiers.includes(p.tier)) return onLimit(`${jobType} jobs may not use ${p.tier} providers (${provider})`, null);
  if (_inQuiet(p.quietHours, now)) return onLimit(`${provider}'s quiet hours (${p.quietHours[0]}:00–${p.quietHours[1]}:00)`, _msToHourEnd(p.quietHours, now));
  const L = p.limits || {};
  const u = { lastHour: 0, lastDay: 0, tokensDay: 0, lastAt: null, inFlight: 0, ...usage };
  if (L.jobsPerDay && u.lastDay >= L.jobsPerDay) return onLimit(`${provider}: ${u.lastDay}/${L.jobsPerDay} jobs today`, null);
  if (L.tokensPerDay && u.tokensDay + (estTokens || 0) > L.tokensPerDay) return onLimit(`${provider}: ${u.tokensDay} + ~${estTokens} tokens would pass today's ${L.tokensPerDay}`, null);
  if (L.jobsPerHour && u.lastHour >= L.jobsPerHour) return onLimit(`${provider}: ${u.lastHour}/${L.jobsPerHour} jobs in the last hour`, 5 * 60000);
  if (L.concurrent && u.inFlight >= L.concurrent) return onLimit(`${provider}: ${u.inFlight} job(s) already running (max ${L.concurrent})`, 15000);
  if (L.minGapMs && u.lastAt && now - u.lastAt < L.minGapMs) return onLimit(`${provider}: ${Math.round((L.minGapMs - (now - u.lastAt)) / 1000)}s left of the ${Math.round(L.minGapMs / 1000)}s gap between jobs`, L.minGapMs - (now - u.lastAt));
  return { verdict: 'allow' };
}

module.exports = { decide, _inQuiet, MODULE_ID: 'nexus.lib.economy.gate', VERSION: '1.0.0' };
