'use strict';
/**
 * lib/economy/ledger.js — the economy's usage ledger: the ONE writer of usage records (I3). §0.39.281 EC1.
 * comp_id: nexus.lib.economy.ledger
 * UUID: nexus-lib-economy-ledger-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-provider-economy-phasemap.spec (EC1).
 *
 * record({ provider, jobType, jobId, tokensIn, tokensOut, ms, outcome, model, tokenMethod, usd? }) appends one JSON line to
 * <NEXUS_DATA_ROOT or data>/economy/usage-YYYY-MM-DD.jsonl. outcome: ok | failed | truncated | timeout | login | refused.
 * Reads: records({ since, provider }) (the learners' input), usage(provider, now) → { lastHour, lastDay, tokensDay,
 * lastAt, inFlight } for the gate, and begin/end for in-flight counts (in this process). Append-only; nothing edited.
 */
const fs = require('fs');
const path = require('path');

const OUTCOMES = new Set(['ok', 'failed', 'truncated', 'timeout', 'login', 'refused']);
const DAY = 86400000, HOUR = 3600000;
const _inFlight = new Map();   // provider → Set(jobId)

function dir() { return path.join(process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', '..', 'data'), 'economy'); }
function _file(ts) { return path.join(dir(), `usage-${new Date(ts).toISOString().slice(0, 10)}.jsonl`); }

function record(r = {}) {
  const provider = String(r.provider || '').toLowerCase();
  if (!provider) return { ok: false, error: 'provider is required' };
  const outcome = OUTCOMES.has(r.outcome) ? r.outcome : 'failed';
  const at = Number.isFinite(r.at) ? r.at : Date.now();
  const row = { at, provider, jobType: r.jobType || 'chat', jobId: r.jobId || null, model: r.model || null,
    tokensIn: Math.max(0, Math.round(Number(r.tokensIn) || 0)), tokensOut: Math.max(0, Math.round(Number(r.tokensOut) || 0)),
    tokenMethod: r.tokenMethod || 'estimate', ms: Number.isFinite(r.ms) ? Math.round(r.ms) : null, outcome, reason: r.reason ? String(r.reason).slice(0, 300) : null };
  if (Number.isFinite(r.usd)) row.usd = Math.round(r.usd * 1e6) / 1e6;   // §IN2a — what the provider itself reported spending (claude-code's total_cost_usd); absent = not reported
  try { fs.mkdirSync(dir(), { recursive: true }); fs.appendFileSync(_file(at), JSON.stringify(row) + '\n'); }
  catch (e) { return { ok: false, error: e.message }; }
  if (r.jobId) end(provider, r.jobId);
  return { ok: true, record: row };
}

function records({ since = Date.now() - 30 * DAY, provider = null } = {}) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir()).filter(f => /^usage-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); } catch (_) { return out; }
  const firstDay = new Date(since).toISOString().slice(0, 10);
  for (const f of files) {
    if (f.slice(6, 16) < firstDay) continue;
    let text = ''; try { text = fs.readFileSync(path.join(dir(), f), 'utf8'); } catch (_) { continue; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch (_) { continue; }
      if (r.at >= since && (!provider || r.provider === provider)) out.push(r);
    }
  }
  return out;
}

function begin(provider, jobId) { const k = String(provider).toLowerCase(); if (!_inFlight.has(k)) _inFlight.set(k, new Set()); _inFlight.get(k).add(jobId); }
function end(provider, jobId) { const s = _inFlight.get(String(provider).toLowerCase()); if (s) s.delete(jobId); }

function usage(provider, now = Date.now(), rows = null) {
  const rs = rows || records({ since: now - DAY, provider });
  const mine = rs.filter(r => r.provider === provider && r.outcome !== 'refused');
  return { lastHour: mine.filter(r => r.at > now - HOUR).length, lastDay: mine.filter(r => r.at > now - DAY).length,
    tokensDay: mine.filter(r => r.at > now - DAY).reduce((a, r) => a + r.tokensIn + r.tokensOut, 0),
    lastAt: mine.length ? Math.max(...mine.map(r => r.at)) : null, inFlight: (_inFlight.get(provider) || new Set()).size };
}

module.exports = { record, records, usage, begin, end, dir, OUTCOMES, MODULE_ID: 'nexus.lib.economy.ledger', VERSION: '1.0.0' };
