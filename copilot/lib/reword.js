'use strict';
/**
 * copilot/lib/reword.js — copilot's semantic randomizer: what a job says, reworded every time, same meaning.
 * comp_id: nexus.copilot.reword
 * §0.39.265
 *
 * James: "Can we have copilot create .jobs to chat gpt. With a semantic randomizer to change what the job says
 * each time. and force novelty each time. That way it can explain it like a person … Maybe even have copilot
 * create alternative semantic sentences with the same meaning?" (asked: local model first, JS rewriter fallback)
 *
 * reword({ text, key, n, model, useModel }) -> { ok, text, variants[], source, novel, similarity, tried[], canonical }
 *   1. protect(text) — code, paths, identifiers, numbers, quotes, URLs become ⟦n⟧ markers (lib/semantic-variant.js)
 *   2. Ollama (through lifeline's ollama-bridge job API) is asked for alternatives of the MASKED text: same
 *      meaning, different words and sentence shape, every ⟦n⟧ kept; each answer is restored and validated —
 *      a variant that lost a protected part, changed code, or is the original, is thrown away with its reason
 *   3. no usable model variant → lib/semantic-variant.js jsVariant with several seeds
 *   4. novelty: each candidate is scored against what this key (the agent) was actually sent before
 *      (NoveltyStore); the least similar valid candidate wins, and `novel` says honestly whether it cleared
 *      the threshold. The winner is recorded, so the next job must differ from it too.
 *   Nothing usable at all → the original text, source 'original', with every reason — never a guess.
 */
const SV = require('../../lib/semantic-variant.js');

const PROMPT = (masked, n, guidance = '') => [
  `Rewrite the message below ${n > 1 ? `${n} different ways` : 'one way'}. Each rewrite must mean exactly the same thing`,
  'and ask for exactly the same things, in different words and a different sentence shape, the way a person would say it.',
  'Keep every marker like ⟦0⟧ exactly as written, the same number of times. Do not answer the message. Do not add anything.',
  ...(guidance ? [`Guidance: ${String(guidance).slice(0, 600)}`] : []),
  n > 1 ? 'Put each rewrite on its own line starting with "- ".' : 'Return only the rewrite.',
  '',
  'Message:',
  masked,
].join('\n');

function _parse(out, n) {
  const t = String(out || '').trim();
  if (n <= 1) return [t.replace(/^["'“]|["'”]$/g, '').trim()].filter(Boolean);
  const lines = t.split('\n').map(l => l.trim()).filter(l => /^[-*•]\s+|^\d+[.)]\s+/.test(l)).map(l => l.replace(/^[-*•]\s+|^\d+[.)]\s+/, '').trim());
  return (lines.length ? lines : [t]).filter(Boolean);
}

async function reword({ text, key = 'default', n = 3, model = null, useModel = true, callModel = null, store = null, seeds = 6, guidance = '' } = {}) {
  const original = String(text || '');
  if (!original.trim()) return { ok: false, error: 'text required' };
  const S = store || new SV.NoveltyStore();
  const { masked, tokens } = SV.protect(original);
  const tried = [];
  const cands = [];
  const consider = (v, source) => {
    const val = SV.validate(original, v, tokens);
    if (!val.ok) { tried.push({ source, ok: false, reasons: val.reasons, text: String(v).slice(0, 300) }); return; }
    const nov = S.check(key, v);
    cands.push({ text: v, source, novel: nov.novel, similarity: nov.maxSimilarity, toOriginal: +SV.similarity(original, v).toFixed(3) });
    tried.push({ source, ok: true, similarity: nov.maxSimilarity });
  };

  if (useModel) {
    const ask = callModel || (async (prompt) => {
      const lifeline = require('../lifeline.js');
      const r = await lifeline.dispatchToOllama(prompt, { model: model || undefined, maxTokens: Math.min(2048, 200 + original.length * 2), timeoutMs: 60000, intent: 'rewrite' });
      return r && r.ok ? r.text : null;
    });
    try {
      const out = await ask(PROMPT(masked, n, guidance));
      if (!out) tried.push({ source: 'ollama', ok: false, reasons: ['no answer (ollama-bridge down, or no model)'] });
      else for (const v of _parse(out, n)) consider(SV.restore(v, tokens), 'ollama');
    } catch (e) { tried.push({ source: 'ollama', ok: false, reasons: [e.message] }); }
  }
  if (!cands.some(c => c.novel)) {
    const base = Date.now();
    for (let i = 0; i < seeds; i++) consider(SV.jsVariant(original, base + i * 7919), 'js');
  }
  if (!cands.length) return { ok: true, text: original, canonical: original, source: 'original', novel: false, similarity: null, variants: [], tried };
  cands.sort((a, b) => (b.novel - a.novel) || (a.similarity - b.similarity) || (a.source === 'ollama' ? -1 : 1));
  const win = cands[0];
  try { S.record(key, win.text, { source: win.source }); } catch (_) {}
  return { ok: true, text: win.text, canonical: original, source: win.source, novel: win.novel, similarity: win.similarity,
           variants: cands.slice(0, 5).map(c => ({ text: c.text, source: c.source, novel: c.novel, similarity: c.similarity })), tried };
}

module.exports = { reword, PROMPT };
