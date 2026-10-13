'use strict';
/**
 * guardian/lib/provider-ready.js — 0.60.28 PF1 — can each browser agent take a job right now, and if not, why.
 *
 * James (2026-10-13): "can we work on inventing anything that will get this pipeline going. like why doesn't this work
 * yet?" — and, offered "ready before run" then "a plan without a model", he chose "A then B".
 *
 * His SB9 run climbed the ladder into claude (its page needed his ◎ pick: an empty reply) and deepseek (no tab, and its
 * tab behind a sign-in wall): ladder exhausted, every fact already known to Guardian before the run began. This reads
 * those facts for every provider at once, so a build drops what cannot answer before it asks, instead of after.
 *
 *   readiness({ ids, connected, channels, login, jobs, chains, now }) → { [id]: { ready, order, opens, why } }
 *     ready  false — a job sent now cannot succeed: behind a sign-in wall, every account in its chain resting, or at its
 *                    usage limit with no account to fall back to. The build leaves it off, said on the run.
 *     order  'last' — it may answer, but its last job waited on the person (a ◎ pick): tried after the others. Never a
 *                    drop: the pick clears it, and nothing here can see the pick, so a drop could last forever.
 *     opens  true — no tab yet: the dispatcher opens one on demand (0.60.25), about a minute.
 * Pure: the route hands it ncp's providers, provider-login's walls, the job list and the account chains.
 */
const VERSION = '1.0.0';
const NEEDS_YOU_MS = 2 * 3600 * 1000;   // a ◎ wait older than this is not held against the provider

function _when(ts) { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return String(ts); } }

function readiness({ ids = [], connected = {}, channels = {}, login = {}, jobs = [], chains = {}, now = Date.now() } = {}) {
  const out = {};
  for (const id of ids) {
    const isOn = connected[id] === 'connected';
    const ch = channels[id] || null;
    const wall = login[id] || null;
    const chain = chains[id] || { chain: [], exhausted: [] };
    const resting = new Set((chain.exhausted || []).map(r => r.account));
    const left = (chain.chain || []).filter(a => !resting.has(a));
    const mine = jobs.filter(j => j && j.provider === id);
    const lastDone = Math.max(0, ...mine.filter(j => j.status === 'complete').map(j => j.completedAt || j.updatedAt || 0));
    const waiting = mine.filter(j => j.needsYou && (j.failedAt || j.updatedAt || 0) > lastDone && now - (j.failedAt || j.updatedAt || 0) < NEEDS_YOU_MS)
      .sort((a, b) => (b.failedAt || 0) - (a.failedAt || 0))[0] || null;
    let r;
    if (wall) r = { ready: false, why: `${id} needs a sign-in in its Clear Glass tab (${wall})` };
    else if ((chain.chain || []).length && !left.length) {
      const back = Math.min(...(chain.exhausted || []).map(x => x.until || Infinity));
      r = { ready: false, why: `every ${id} account is resting at its limit${Number.isFinite(back) ? `, the first back at ${_when(back)}` : ''}` };
    } else if (ch && ch.usage && ch.usage.limited && !left.length) r = { ready: false, why: `${id} is at its usage limit${ch.usage.message ? ` ("${String(ch.usage.message).slice(0, 80)}")` : ''} and has no other account in its chain` };
    else if (waiting) r = { ready: true, order: 'last', why: `${id}'s last job waits on you: ${waiting.needsYou}` };
    else r = { ready: true, why: isOn ? `${id} tab connected` : `${id} has no tab yet — it is opened when the job comes (about a minute)` };
    if (!isOn && r.ready) r.opens = true;
    out[id] = r;
  }
  return out;
}

module.exports = { VERSION, NEEDS_YOU_MS, readiness };
