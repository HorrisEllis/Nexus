'use strict';
/**
 * lib/agent-record.js — what Nexus has learned about each agent from the phases it built, and the ladder ordered by it.
 * §0.39.361 AR1.
 * UUID: nexus-lib-agent-record-v1-0000-2026-1006-jamesbrooks-001
 *
 * James, with BL15's Plan (chatgpt replied a bare path; then every rung timed out, 3b → 7b → 16b → gemini → chatgpt →
 * claude → deepseek): "like needs to learn from this: routing and adapting" · earlier: "need to know what agents coded
 * what … nexus is supposed to learn the agents limits and strengths overtime. dynamically route."
 *
 * A projection (§10.2, I4): computed from idearium_phase_runs (one row per state change) and the inject nodes on every
 * read; it stores nothing. lib/pipeline-routing plan() already learns per CHUNK from the economy ledger; this is the
 * same for a PHASE build's escalation ladder, which until now was the same fixed order every time.
 *
 * Per attempt (a row naming a provider, in an attempt state), its outcome:
 *   landed      replied, files came back                      good
 *   proven      landed, and the phase's proof run then passed good ×2
 *   undone      landed, and the person reverted or rejected a file it wrote   bad (the worst kind: it looked done)
 *   failed      timeout · empty · provider-down · incomplete (wrote nothing / missed files) · blocked · tool-errors · …
 * Its size: the request's prompt chars (the run's building row), bucketed small < 4000 ≤ medium < 12000 ≤ large.
 *
 * record(rows, { injects }) -> { providers: { [provider]: { attempts, landed, proven, undone, failed, byClass, buckets,
 *                                 maxLanded, limit, medianMs, last } }, attempts }
 *   limit: { from, fails, why } — it failed for size-shaped reasons (timeout, empty, incomplete, tool-errors) at least
 *          twice at or above `from` chars and never landed at or above it. A request that big goes to it last.
 * orderLadder(rungs, rec, { promptChars, minRecords }) -> { rungs, why: [{ provider, score, limited, why }], changed }
 *   score: the Beta posterior (1+good)/(2+good+bad) for this size bucket (else overall), an untried or barely tried
 *   agent at 0.5 — tried before one that keeps failing, after one that works. Limited rungs go last. Ties keep the
 *   ladder's own order (cheapest first), so with nothing learned the ladder is exactly as configured.
 */

const MODULE_ID = 'nexus.lib.agent-record';
const VERSION = '1.1.0';   // 1.1.0 (RA1): scored per kind of brick (code.js, test.js, …), and a ladder ordered by kind

// §RA1 — James, 2026-10-17: "Need nexus to hold as much of the complexity as possible, and let the right agent for the job, be
// in charge." The job's kind is the file it builds: a test or code, by its extension. Written on each attempt row (row.kind);
// an older row without it is read from its file, so the record learns from history too.
function kindOf(row) {
  if (!row) return null;
  if (row.kind) return String(row.kind);
  const f = String(row.file || '');
  if (!f) return null;
  const ext = (f.match(/\.([A-Za-z0-9]+)$/) || [, 'file'])[1].toLowerCase();
  const test = /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[A-Za-z0-9]+$/.test(f);
  return `${test ? 'test' : 'code'}.${ext}`;
}

const ATTEMPT = new Set(['replied', 'incomplete', 'failed', 'blocked']);
const SIZE_SHAPED = new Set(['timeout', 'empty', 'incomplete', 'tool-errors', 'truncated']);
const BUCKETS = [['small', 4000], ['medium', 12000], ['large', Infinity]];

function bucketOf(chars) {
  const n = Number(chars) || 0;
  for (const [k, max] of BUCKETS) if (n < max) return k;
  return 'large';
}

function classOf(row) {
  if (row.state === 'replied') return 'landed';
  if (row.toolErrors) return 'tool-errors';
  if (row.state === 'incomplete') return 'incomplete';
  if (row.state === 'blocked') return 'blocked';
  try { return require('./pipeline-routing.js').classify({ error: row.error || '', ok: false }); } catch (_) { return 'unknown'; }
}

function _median(xs) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

function record(rows = [], { injects = [], faults = [] } = {}) {
  // the run's prompt size lives on its building row
  const promptOf = new Map();
  for (const r of rows) if (r && r.state === 'building' && r.promptChars && !promptOf.has(r.runId)) promptOf.set(r.runId, r.promptChars);
  // the build run a proof belongs to → proven / unproven
  const provenRuns = new Set(rows.filter(r => r && r.state === 'proven').map(r => r.buildRunId || String(r.runId || '').replace(/-proof$/, '')));
  // a file the person undid: path → [undo times, creation times]
  const undone = injects.filter(n => n && (n.status === 'reverted' || n.status === 'rejected'));

  const attempts = [];
  for (const r of rows) {
    if (!r || !r.provider || !ATTEMPT.has(r.state)) continue;
    const files = (r.injects && r.injects.injected) || [];
    let cls = classOf(r);
    if (cls === 'landed' && !files.length) cls = 'incomplete';
    let wasUndone = false;
    if (cls === 'landed') {
      const t = r.ts || 0;
      wasUndone = undone.some(n => files.includes(n.path) && (n.createdAt || 0) >= t - 5 * 60000 && (n.createdAt || 0) <= t + 60000
        && (!r.targetRepo || !n.repoUuid || n.repoUuid === r.targetRepo || n.repoUuid === r.repoUuid));
    }
    const chars = r.promptChars || promptOf.get(r.runId) || null;
    attempts.push({ provider: r.provider, runId: r.runId, phase: r.phase, ts: r.ts || 0, chars, bucket: bucketOf(chars), cls, kind: kindOf(r),
      undone: wasUndone, proven: cls === 'landed' && !wasUndone && provenRuns.has(r.runId), ms: r.elapsedMs || null, error: r.error || null });
  }

  const providers = {};
  for (const a of attempts.sort((x, y) => x.ts - y.ts)) {
    const p = providers[a.provider] = providers[a.provider] || { provider: a.provider, attempts: 0, landed: 0, proven: 0, undone: 0, failed: 0, byClass: {},
      buckets: {}, kinds: {}, maxLanded: null, limit: null, ms: [], last: null, _fails: [] };
    p.attempts++;
    const b = p.buckets[a.bucket] = p.buckets[a.bucket] || { good: 0, bad: 0, attempts: 0 };
    b.attempts++;
    // §RA1 — the same tally per kind of brick; one row counts in both its size bucket and its kind
    const kd = a.kind ? (p.kinds[a.kind] = p.kinds[a.kind] || { good: 0, bad: 0, attempts: 0 }) : null;
    if (kd) kd.attempts++;
    const both = (field, w) => { b[field] += w; if (kd) kd[field] += w; };
    if (a.cls === 'landed' && !a.undone) {
      p.landed++; if (a.proven) p.proven++;
      const w = a.proven ? 2 : 1; both('good', w);
      if (a.chars) p.maxLanded = Math.max(p.maxLanded || 0, a.chars);
      if (a.ms) p.ms.push(a.ms);
    } else {
      if (a.undone) { p.undone++; p.byClass.undone = (p.byClass.undone || 0) + 1; both('bad', 2); }
      else { p.failed++; p.byClass[a.cls] = (p.byClass[a.cls] || 0) + 1; both('bad', 1); }
      if (SIZE_SHAPED.has(a.cls) && a.chars) p._fails.push(a.chars);
    }
    p.last = { ts: a.ts, cls: a.undone ? 'undone' : a.cls, phase: a.phase, runId: a.runId, error: a.error ? String(a.error).slice(0, 200) : null };
  }
  for (const p of Object.values(providers)) {
    // the limit: the smallest size it failed at twice-or-more (counting failures at or above it) and never landed at or above
    const fails = p._fails.filter(c => !(p.maxLanded && c <= p.maxLanded)).sort((a, b) => a - b);
    for (const from of fails) {
      const n = fails.filter(c => c >= from).length;
      if (n >= 2) { p.limit = { from, fails: n, why: `failed ${n}× on requests of ${from}+ chars${p.maxLanded ? `, never landed above ${p.maxLanded}` : ', never landed one'}` }; break; }
    }
    p.medianMs = _median(p.ms);
    const good = Object.values(p.buckets).reduce((s, b) => s + b.good, 0), bad = Object.values(p.buckets).reduce((s, b) => s + b.bad, 0);
    p.score = +((1 + good) / (2 + good + bad)).toFixed(3);
    for (const b of Object.values(p.buckets)) b.score = +((1 + b.good) / (2 + b.good + b.bad)).toFixed(3);
    for (const kd of Object.values(p.kinds || {})) kd.score = +((1 + kd.good) / (2 + kd.good + kd.bad)).toFixed(3);
    delete p._fails; delete p.ms;
  }
  // §0.39.361 AR2 — the faults themselves, not only their counts: each agent's fault_log records (lib/phase-faults.js),
  // newest first, whole — its failure modes as data, each with what it was building, how big the request was, the error
  const unassigned = [];
  for (const f of faults) {
    const p = f.agent && providers[f.agent];
    const brief = { uuid: f.uuid, ts: f.ts, mode: f.mode, phase: f.phase || null, component: f.component || null, causedBy: f.causedBy || null,
      promptChars: (f.meta && f.meta.promptChars) || null, error: f.meta && (f.meta.error || f.meta.reason) ? String(f.meta.error || f.meta.reason).slice(0, 300) : null, path: (f.meta && f.meta.path) || null };
    if (!p) { if (!f.agent) unassigned.push(brief); else (providers[f.agent] = providers[f.agent] || { provider: f.agent, attempts: 0, landed: 0, proven: 0, undone: 0, failed: 0, byClass: {}, buckets: {}, kinds: {}, maxLanded: null, limit: null, medianMs: null, last: null, score: 0.5 }); }
    const q = providers[f.agent]; if (!q) continue;
    (q.faults = q.faults || []).push(brief);
    q.modes = q.modes || {}; q.modes[f.mode] = (q.modes[f.mode] || 0) + 1;
  }
  for (const p of Object.values(providers)) { p.faults = (p.faults || []).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 25); p.modes = p.modes || {}; }
  return { providers, attempts: attempts.length, unassigned: unassigned.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 25), faults: faults.length };
}

function orderLadder(rungs = [], rec = { providers: {} }, { promptChars = null, minRecords = 2, kind = null } = {}) {
  const bucket = bucketOf(promptChars);
  const rows = rungs.map((rg, i) => {
    const p = (rec.providers || {})[rg.provider];
    if (!p || p.attempts < minRecords) return { rg, i, score: 0.5, limited: false, why: p ? `${p.attempts} attempt${p.attempts === 1 ? '' : 's'} — still learning` : 'not tried yet' };
    // §RA1 — the kind of job first (how it did on this kind of file), then the size of the request, then its overall record
    const kd = kind && p.kinds ? p.kinds[kind] : null;
    const useK = !!(kd && kd.attempts >= minRecords);
    const b = p.buckets[bucket];
    const useB = !useK && b && b.attempts >= minRecords;
    const score = useK ? kd.score : useB ? b.score : p.score;
    const limited = !!(p.limit && promptChars && promptChars >= p.limit.from);
    const tally = useK ? `${kd.attempts} ${kind} attempt${kd.attempts === 1 ? '' : 's'}` : `${p.landed}/${p.attempts} landed${p.proven ? `, ${p.proven} proven` : ''}${p.undone ? `, ${p.undone} undone` : ''}`;
    return { rg, i, score, limited, why: limited ? `past its limit — ${p.limit.why}` : `${tally}${useK ? ` (${kind} ${Math.round(score * 100)}%)` : useB ? ` (${bucket} requests ${Math.round(score * 100)}%)` : ` (${Math.round(score * 100)}%)`}` };
  });
  const sorted = [...rows].sort((a, b) => (a.limited - b.limited) || (b.score - a.score) || (a.i - b.i));
  return { rungs: sorted.map(x => x.rg), why: sorted.map(x => ({ provider: x.rg.provider, score: x.score, limited: x.limited, why: x.why })),
    changed: sorted.some((x, k) => x.i !== k), bucket, kind };
}

module.exports = { MODULE_ID, VERSION, record, orderLadder, bucketOf, kindOf, BUCKETS };
