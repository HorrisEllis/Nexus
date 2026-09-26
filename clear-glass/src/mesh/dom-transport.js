'use strict';
/**
 * clear-glass/src/mesh/dom-transport.js — host side of the mesh's DOM transport (2026-09-19).
 * Drives page/agent-page.js inside an agent's chat page and exposes JOBS, not blocking calls:
 *
 *   send(args)  -> { accepted, jobId, status }   returns at once; idempotent by jobId
 *   getJob(id)  -> { known, status, progress, result? }
 *
 * WHY JOBS. Whole-code-base prompts run for many minutes. A single long HTTP call would have to survive proxies,
 * timeouts and a guardian restart. Jobs are polled instead, and IDEMPOTENT BY jobId: if guardian restarts and asks
 * again, the mesh returns the running/finished job. The (expensive, already-sent) prompt is never sent twice.
 * Jobs for the same agent run ONE AT A TIME (a lane per agentId): one chat box, one conversation.
 *
 * Failures carry `sent` (true | false | null). null means "clicked send but unconfirmed": treat as sent.
 */
const fs = require('fs');
const path = require('path');
const PAGE_SRC = fs.readFileSync(path.join(__dirname, 'page/agent-page.js'), 'utf8');
const j = (x) => JSON.stringify(x);

function createDomTransport({ resolvePage, execJs, sleep = (ms) => new Promise(r => setTimeout(r, ms)), now = Date.now,
                              pollMs = 1500, retainMs = 3600000, loadWaitMs = 30000, settleMs = 1500, onProgress = () => {}, log = () => {} } = {}) {
  const jobs = new Map();          // jobId -> record
  const lanes = new Map();         // agentId -> tail promise

  const pub = (r) => ({ known: true, jobId: r.jobId, agentId: r.agentId, status: r.status, progress: r.progress, result: r.result || null });
  function sweep() { const t = now(); for (const [id, r] of jobs) if (r.status === 'done' && t - r.endedAt > retainMs) jobs.delete(id); }

  async function waitReady(wc) {
    const t0 = now();
    while (wc.isLoading && wc.isLoading() && now() - t0 < loadWaitMs) await sleep(250);
    if (settleMs) await sleep(settleMs);                     // SPA hydration
  }
  async function attach(args) {
    const wc = await resolvePage(args.agentId, { preferUrl: args.url || null });
    await waitReady(wc);
    await execJs(wc, PAGE_SRC);
    return wc;
  }
  const finish = (r, result) => { r.result = result; r.status = 'done'; r.endedAt = now(); r.progress = { ...r.progress, phase: 'done' }; return result; };

  async function pollUntilDone(r, wc) {
    const deadline = now() + (r.timeoutMs || 4 * 3600000) + 60000;
    for (;;) {
      let p;
      try { p = await execJs(wc, `window.__cgAgent.poll(${j(r.jobId)})`); }
      catch (e) { return finish(r, { ok: false, sent: r.lastSent === true ? true : (r.lastSent === null ? null : (r.started ? null : false)), stage: 'page_navigated', error: `lost the page: ${e.message}` }); }
      if (!p || p.known === false) return finish(r, { ok: false, sent: r.lastSent === false ? null : (r.lastSent ?? null), stage: 'page_navigated', error: 'the page reloaded and the job state was lost' });
      r.lastSent = p.sent;
      r.progress = { phase: p.phase, chars: p.chars, generating: p.generating, elapsedMs: p.elapsedMs, continues: p.continues, sent: p.sent };
      try { onProgress({ jobId: r.jobId, agentId: r.agentId, provider: r.provider, ...r.progress }); } catch (_) {}
      if (p.done) {
        try { if (p.ok) await execJs(wc, `window.__cgAgent.forget(${j(r.jobId)})`); } catch (_) {}
        return finish(r, { ok: !!p.ok, text: p.text || '', sent: p.sent, stage: p.stage || null, error: p.error || null, chars: p.chars, continues: p.continues, via: p.via, chatUrl: p.url });
      }
      if (now() > deadline) {
        try { await execJs(wc, `window.__cgAgent.abort(${j(r.jobId)})`); } catch (_) {}
        return finish(r, { ok: false, sent: p.sent === false ? false : true, stage: 'timeout', error: 'exceeded the job deadline' });
      }
      await sleep(pollMs);
    }
  }

  async function runJob(r, args) {
    r.status = 'running';
    let wc;
    try { wc = await attach(args); }
    catch (e) { return finish(r, { ok: false, sent: false, stage: e.stage || 'no_webview', error: e.message }); }
    r.started = true;
    const payload = { jobId: r.jobId, selectors: args.selectors, prompt: args.prompt || '', content: args.content || '', opts: { ...(args.opts || {}), maxMs: args.timeoutMs || undefined } };
    if (!payload.opts.maxMs) delete payload.opts.maxMs;
    let started;
    try { started = await execJs(wc, `window.__cgAgent.start(${j(payload)})`); }
    catch (e) { return finish(r, { ok: false, sent: false, stage: 'inject_failed', error: e.message }); }
    r.wc = wc;
    return pollUntilDone(r, wc);
  }

  function send(args) {
    sweep();
    const existing = jobs.get(args.jobId);
    if (existing) return { accepted: true, existing: true, jobId: args.jobId, status: existing.status };   // idempotent: never resend
    const r = { jobId: args.jobId, agentId: args.agentId, provider: args.provider, status: 'queued', progress: { phase: 'queued' }, createdAt: now(), timeoutMs: args.timeoutMs, lastSent: false };
    jobs.set(r.jobId, r);
    const tail = (lanes.get(args.agentId) || Promise.resolve()).catch(() => {}).then(() => runJob(r, args));
    lanes.set(args.agentId, tail.catch(() => {}));
    return { accepted: true, existing: false, jobId: r.jobId, status: r.status };
  }
  function getJob(jobId) { const r = jobs.get(jobId); return r ? pub(r) : { known: false }; }

  // Re-read an already-sent job's response with (repaired) selectors. Never resends.
  async function read({ jobId, selectors }) {
    const r = jobs.get(jobId);
    if (!r || !r.wc) return { ok: false, error: 'unknown job' };
    r.status = 'running'; r.result = null;
    try { await execJs(r.wc, `window.__cgAgent.read(${j({ jobId, selectors })})`); } catch (e) { return { ok: false, error: e.message }; }
    pollUntilDone(r, r.wc);
    return { ok: true, jobId };
  }

  // Automatic DOM mapping: verify the selectors we have, propose replacements ONLY for the ones that fail.
  async function diagnose({ agentId, url, selectors, stage }) {
    let wc;
    try { wc = await attach({ agentId, url }); } catch (e) { return { ok: false, repaired: false, error: e.message, stage: e.stage }; }
    const map = await execJs(wc, 'window.__cgAgent.map()');
    const check = await execJs(wc, `(function(S){var o={};Object.keys(S).forEach(function(k){try{o[k]=document.querySelectorAll(S[k]).length}catch(e){o[k]=-1}});return o})(${j(selectors)})`);
    const want = stage === 'response_not_found' ? ['resp'] : stage === 'send_not_found' ? ['send'] : stage === 'input_not_found' ? ['input', 'send'] : ['input', 'send', 'resp'];
    const repaired = {}, evidence = { url: map.url, title: map.title, checked: check, candidates: {} };
    for (const k of want) {
      evidence.candidates[k] = map[k];
      if (check[k] > 0 && stage !== 'response_not_found') continue;                    // this selector still works: leave it alone
      if (k === 'resp' && check[k] > 0 && stage !== 'response_not_found') continue;
      const best = (map[k] || []).find((c) => c.matches >= 1 && c.score > 0);
      if (best && best.selector !== selectors[k]) repaired[k] = best.selector;
    }
    return { ok: true, repaired: Object.keys(repaired).length > 0, selectors: repaired, evidence };
  }

  return { send, getJob, read, diagnose, _jobs: jobs };
}
module.exports = { createDomTransport, PAGE_SRC };
