'use strict';
/**
 * lib/economy/tokens.js — token estimates and the limits learned from what actually happened. §0.39.281 EC3.
 * comp_id: nexus.lib.economy.tokens
 * UUID: nexus-lib-economy-tokens-v1-0000-2026-0929-jamesbrooks-001
 *
 * James: "What about using the tokenizer and graphs to learn token constraints."
 *   estimate(text)   an ESTIMATE, said so (method 'estimate-v1'): no vendor tokenizer is bundled. Word pieces (~4
 *                    characters each), each punctuation/symbol run, and code density (symbols tokenize tighter).
 *   learn(records)   per provider (and model): the largest input that came back ok, the smallest that came back
 *                    truncated / failed / timeout, p50 / p95 of ok inputs, and a safe limit — below the smallest
 *                    failure, and never above what has worked unless nothing has failed — with the number of records
 *                    it rests on and how sure it is.
 *   series(records)  the graph: every job's input size and outcome, per provider
 *   split(text, n)   chunks under n tokens, cut at blank lines and outside code fences where possible
 * Pure.
 */
function estimate(text) {
  const s = String(text || '');
  if (!s) return 0;
  let n = 0;
  for (const w of s.match(/[A-Za-z]+|\d+|[^\sA-Za-z\d]+/g) || []) {
    if (/^[A-Za-z]+$/.test(w)) n += Math.max(1, Math.ceil(w.length / 4));
    else if (/^\d+$/.test(w)) n += Math.max(1, Math.ceil(w.length / 3));
    else n += w.length;   // punctuation / symbols: about one token each
  }
  n += Math.ceil((s.match(/\n/g) || []).length * 0.5);
  return n;
}

const BAD = new Set(['truncated', 'failed', 'timeout']);
function _q(arr, p) { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; }

function learn(records = []) {
  const by = new Map();
  for (const r of records) {
    const k = r.model ? `${r.provider}::${r.model}` : r.provider;
    if (!by.has(k)) by.set(k, { provider: r.provider, model: r.model || null, ok: [], bad: [] });
    const g = by.get(k);
    if (r.outcome === 'ok') g.ok.push(r.tokensIn || 0);
    else if (BAD.has(r.outcome)) g.bad.push(r.tokensIn || 0);
  }
  const out = {};
  for (const [k, g] of by) {
    const maxOk = g.ok.length ? Math.max(...g.ok) : null;
    const minBad = g.bad.length ? Math.min(...g.bad.filter(x => x > 0).concat(g.bad.length ? [Infinity] : [])) : null;
    const badBig = minBad && minBad !== Infinity ? minBad : null;
    let safe = null, basis;
    if (badBig && maxOk) { safe = Math.floor(Math.min(badBig * 0.9, Math.max(maxOk, badBig * 0.75))); basis = `below the smallest failed input (${badBig})`; }
    else if (badBig) { safe = Math.floor(badBig * 0.75); basis = `75% of the smallest failed input (${badBig}); nothing has succeeded yet`; }
    else if (maxOk) { safe = null; basis = `no failure seen — the largest input that worked is ${maxOk}`; }
    else basis = 'no records';
    const n = g.ok.length + g.bad.length;
    out[k] = { provider: g.provider, model: g.model, records: n, ok: g.ok.length, bad: g.bad.length, maxOk, minBad: badBig,
      p50: _q(g.ok, 0.5), p95: _q(g.ok, 0.95), safeLimit: safe, basis, confidence: n >= 50 ? 'high' : n >= 10 ? 'medium' : 'low' };
  }
  return out;
}

function series(records = []) {
  const s = {};
  for (const r of records) (s[r.provider] = s[r.provider] || []).push({ at: r.at, tokensIn: r.tokensIn || 0, outcome: r.outcome });
  return s;
}

function split(text, limit) {
  const s = String(text || '');
  if (!limit || estimate(s) <= limit) return [s];
  const blocks = []; let cur = []; let inFence = false;
  for (const line of s.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    cur.push(line);
    if (!inFence && line.trim() === '') { blocks.push(cur.join('\n')); cur = []; }
  }
  if (cur.length) blocks.push(cur.join('\n'));
  const out = []; let acc = '';
  for (const b of blocks) {
    const next = acc ? acc + '\n' + b : b;
    if (estimate(next) <= limit) { acc = next; continue; }
    if (acc) out.push(acc);
    if (estimate(b) <= limit) { acc = b; continue; }
    // one block alone is too big: cut it by lines
    let part = '';
    for (const line of b.split('\n')) { const n2 = part ? part + '\n' + line : line; if (estimate(n2) > limit && part) { out.push(part); part = line; } else part = n2; }
    acc = part;
  }
  if (acc) out.push(acc);
  return out;
}

module.exports = { estimate, learn, series, split, METHOD: 'estimate-v1', MODULE_ID: 'nexus.lib.economy.tokens', VERSION: '1.0.0' };
