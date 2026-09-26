'use strict';
/**
 * guardian/lib/job-retry.js — a tab that could not take a job is a reason to try again, not the end of the job.
 * comp_id: nexus.guardian.job-retry
 * §0.39.265
 *
 * James: "Guardian needs better retry logic. It got stuck earlier when I ran two jobs. Can reuse the same .jobs.
 * The .jobs file in guardian can link to the response. That way if it runs again can check for the response
 * first. Maybe using the vector storage? Chat logs? … So queue for guardian and retry logic."
 *
 * What was wrong: every GUARDIAN_ERROR from a tab was terminal. The two-job case: job 1's reply was still
 * streaming when job 2 reached the tab, the composer was not there ("Input not found — no contenteditable"),
 * and job 2 was marked error at gate 5 — although nothing was wrong with it except timing.
 *
 * Now, on a tab error:
 *   classify(gate, error)   retryable: tab-busy · input · submit · no-reply · provider-error
 *                           final:     needs you (login, captcha, rate limit, usage cap, refusal) · unknown
 *   a retryable error       → the attempt is written into the .job (attempts[]: at, gate, error, kind), the tab's
 *                             slot is released, and after a backoff the job goes back through dispatchJob — the
 *                             same pool, so it waits its turn behind whatever the tab is doing.
 *                             Backoff: 4s, 12s, 30s (tab-busy: 15s, 30s, 60s — a reply takes time to finish).
 *   before every re-send    → answerFirst(job): the job's own answer, if it already exists anywhere —
 *                               1. job.responseText (the job completed in the meantime)
 *                               2. its .response node (guardian/lib/response-sink.js readNode) — the .job's link
 *                               3. its chat transcript (chat-transcripts replyFor: the prompt as a user turn,
 *                                  answered by the next assistant turn — "chat logs")
 *                             Found → the job completes from it through the normal completion handler, never
 *                             re-sent. The vector store is NOT used to decide this: a similar question is not
 *                             the same job, and answering one job with another's reply would be a guess.
 *   attempt ≥ 2, input or submit failure, and ErosmancerOS reachable
 *                           → the job is marked transport 'eros': the dispatcher has Clear Glass's ErosmancerOS
 *                             type it into the provider's own tab with human timing and press send; the reply
 *                             comes back through the tab's transcript like any other.
 *   attempts exhausted (4)  → terminal, and the error lists every attempt's reason.
 *
 * inFlightTwin(spec) — "Can reuse the same .jobs": a job identical to one already in flight (same provider,
 * agent and canonical text) joins it instead of being sent twice; a caller polling either id sees one answer.
 */
const crypto = require('crypto');

const MODULE_ID = 'guardian.job-retry';
const VERSION = '1.0.0';

const FINAL = /log ?in|sign ?in|captcha|verify you are (a )?human|rate.?limit|usage (cap|limit)|too many requests|quota|refus|not allowed|blocked by/i;
const RETRYABLE = [
  { kind: 'tab-busy', re: /still answering|another job|tab is busy|already (answering|generating)/i },
  { kind: 'input', re: /input not found|no contenteditable|composer (was )?not (detected|found)|no (input|composer)/i },
  { kind: 'submit', re: /never sent|submit.?failed|send button|could not (press|click) send/i, gates: ['submit'] },
  { kind: 'no-reply', re: /no reply|reply never (started|appeared)|did not start (a |the )?repl|NO_REPLY|watch timed out/i },
  { kind: 'provider-error', re: /something went wrong|network error|an error occurred|conversation not found|hmm\.\.\.|failed to fetch/i },
];
const IN_FLIGHT = new Set(['pending', 'queued', 'pinging', 'dispatched', 'delivered', 'retry_wait', 'awaiting_transcript']);
const DELAYS = { default: [4000, 12000, 30000], 'tab-busy': [15000, 30000, 60000] };

function classify(gate, error) {
  const text = `${gate || ''} ${error || ''}`;
  if (FINAL.test(text)) return { retry: false, kind: 'needs-you' };
  for (const r of RETRYABLE) {
    if (r.re.test(text) || (r.gates && r.gates.includes(gate))) return { retry: true, kind: r.kind };
  }
  return { retry: false, kind: 'unknown' };
}

const _norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** fingerprint({ provider, agentId, canonical|prompt }) — what "the same job" means */
function fingerprint({ provider, agentId, canonical, prompt }) {
  return crypto.createHash('sha256').update(`${provider || ''}|${agentId || ''}|${_norm(canonical || prompt)}`).digest('hex').slice(0, 32);
}

/**
 * createJobRetry({ jobs, updateJob, bus, pool, dispatchJob, complete, readResponse, replyFor, erosAvailable, log,
 *                  maxAttempts, delays, now, setTimer })
 */
function createJobRetry({ jobs, updateJob, bus, pool, dispatchJob, complete, readResponse = () => null, replyFor = () => null,
                          erosAvailable = () => false, log = console, maxAttempts = 4, delays = DELAYS, setTimer = setTimeout } = {}) {
  for (const [k, v] of Object.entries({ jobs, updateJob, dispatchJob, complete })) if (!v) throw new Error(`[${MODULE_ID}] missing dependency: ${k}`);
  const stats = { retried: 0, answeredFromResponse: 0, answeredFromTranscript: 0, viaEros: 0, exhausted: 0, joined: 0, final: 0 };
  const _timers = new Map();

  /** answerFirst(job) -> { text, source } | null — the job's own answer, if it already exists */
  function answerFirst(job) {
    if (!job) return null;
    if (job.responseText && String(job.responseText).trim()) return { text: job.responseText, source: 'job' };
    try {
      const node = readResponse(job.id);
      if (node && node.status === 'complete' && String(node.text || '').trim()) return { text: node.text, source: 'response-node' };
    } catch (_) {}
    try {
      const r = replyFor(job);
      if (r && String(r.text || '').trim()) return { text: r.text, source: 'transcript', chatUrl: r.chatUrl || null };
    } catch (_) {}
    return null;
  }

  function _say(job, how, extra = {}) {
    if (bus) bus.emit('guardian.job.progress', { jobId: job.id, provider: job.provider, stage: 'retrying', how, ...extra, ts: Date.now() });
  }

  function _redispatch(jobId) {
    _timers.delete(jobId);
    const job = jobs.get(jobId);
    if (!job || job.status !== 'retry_wait') return;          // completed, cancelled or already moving
    const found = answerFirst(job);
    if (found) {
      stats[found.source === 'transcript' ? 'answeredFromTranscript' : 'answeredFromResponse']++;
      log.log && log.log(`[guardian/retry] ${String(job.id).slice(0, 8)} — its answer already exists (${found.source}); completing from it, not re-sending`);
      _say(job, `the answer already existed (${found.source}) — not sent again`);
      complete(job, found.text, found.chatUrl || job.chatUrl || null, found.source);
      return;
    }
    const n = (job.attempts || []).length;
    const last = (job.attempts || [])[n - 1] || {};
    const viaEros = n >= 2 && (last.kind === 'input' || last.kind === 'submit') && erosAvailable();
    if (viaEros) stats.viaEros++;
    updateJob(job.id, { status: 'pending', retryAt: null, ...(viaEros ? { transport: 'eros' } : {}) });
    log.log && log.log(`[guardian/retry] ${String(job.id).slice(0, 8)} — attempt ${n + 1} of ${maxAttempts}${viaEros ? ' through ErosmancerOS (the tab could not take it twice)' : ''}`);
    _say(job, `attempt ${n + 1} of ${maxAttempts}${viaEros ? ' — ErosmancerOS types it' : ''}`);
    dispatchJob(jobs.get(job.id));
  }

  /**
   * onError(jobId, { gate, error, provider }) -> { handled, kind, attempt, delayMs } — handled:false means the
   * caller records the error as terminal (and its message is finalError()).
   */
  function onError(jobId, { gate = null, error = '', provider = null } = {}) {
    const job = jobs.get(jobId);
    if (!job) return { handled: false, kind: 'no-job' };
    if (job.status === 'complete') return { handled: true, kind: 'already-complete' };
    const c = classify(gate, error);
    const attempts = [...(job.attempts || []), { at: Date.now(), gate, error: String(error || '').slice(0, 400), kind: c.kind }];
    if (!c.retry) {
      stats.final++;
      updateJob(job.id, { attempts });
      return { handled: false, kind: c.kind };
    }
    if (attempts.length >= maxAttempts) {
      stats.exhausted++;
      updateJob(job.id, { attempts });
      return { handled: false, kind: c.kind, exhausted: true };
    }
    // Maybe it answered anyway (the error came late, or from a watch that gave up early)
    const found = answerFirst(job);
    if (found) {
      updateJob(job.id, { attempts });
      stats[found.source === 'transcript' ? 'answeredFromTranscript' : 'answeredFromResponse']++;
      complete(job, found.text, found.chatUrl || job.chatUrl || null, found.source);
      return { handled: true, kind: c.kind, answered: found.source };
    }
    const table = delays[c.kind] || delays.default;
    const delayMs = table[Math.min(attempts.length - 1, table.length - 1)];
    updateJob(job.id, { status: 'retry_wait', attempts, retryAt: Date.now() + delayMs, error: null });
    const prov = provider || job.provider;
    try { if (pool && typeof pool.release === 'function') pool.release(prov, job.id); } catch (_) {}
    stats.retried++;
    log.warn && log.warn(`[guardian/retry] ${String(job.id).slice(0, 8)} → ${prov}: ${c.kind} (${String(error || gate || '').slice(0, 120)}) — trying again in ${Math.round(delayMs / 1000)}s (attempt ${attempts.length + 1} of ${maxAttempts})`);
    _say(job, `${c.kind}: ${String(error || gate || '').slice(0, 160)} — trying again in ${Math.round(delayMs / 1000)}s (attempt ${attempts.length + 1} of ${maxAttempts})`, { kind: c.kind, attempt: attempts.length + 1, delayMs });
    const t = setTimer(() => _redispatch(job.id), delayMs);
    if (t && t.unref) t.unref();
    _timers.set(job.id, t);
    return { handled: true, kind: c.kind, attempt: attempts.length + 1, delayMs };
  }

  /** the terminal message once retries are over: every attempt, in order */
  function finalError(job, error) {
    const a = (job && job.attempts) || [];
    if (a.length < 2) return error;
    return `${error} — after ${a.length} attempts: ${a.map((x, i) => `${i + 1}) ${x.kind}${x.gate ? ` at ${x.gate}` : ''}: ${String(x.error || '').slice(0, 80)}`).join(' · ')}`;
  }

  /** inFlightTwin(spec) -> the in-flight job this one duplicates, or null */
  function inFlightTwin(spec, { windowMs = 10 * 60000 } = {}) {
    const fp = fingerprint(spec);
    const since = Date.now() - windowMs;
    for (const j of jobs.values()) {
      if (!j || !IN_FLIGHT.has(j.status) || (j.ts || 0) < since) continue;
      if ((j.fingerprint || fingerprint(j)) === fp) { stats.joined++; return j; }
    }
    return null;
  }

  function cancel(jobId) { const t = _timers.get(jobId); if (t) { clearTimeout(t); _timers.delete(jobId); } }

  return { onError, answerFirst, finalError, inFlightTwin, cancel, classify, stats };
}

module.exports = { createJobRetry, classify, fingerprint, MODULE_ID, VERSION, IN_FLIGHT };
