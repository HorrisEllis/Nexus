'use strict';
/**
 * guardian/lib/gate-trail.js — which gate a job is at, and why it stopped there.
 * comp_id: nexus.guardian.gate-trail
 *
 * §BUILT 0.39.256 — James: "can we make the error specific to the gate? not just a
 * generic error?" The Agent tab showed "copilot: timed out after 90000ms — job
 * cccaafb0 may still complete; poll GET /jobs" (guardian/ask.js). Guardian knew
 * exactly where that job was — typed and sent at 02:00:59, 4 mutations, no reply node
 * read — but that knowledge was spread over events nobody joined: guardian.job.queued
 * (with reasons ping_gate_failed / stale_socket), .dispatched, .progress (submitted,
 * dom), .chunk, .timeout, .complete, and .error (the userscript's gate: tab_busy,
 * submit, watch). This module joins them into one trail per job.
 *
 * §THE GATES, in order — a job passes each before the next:
 *   create   job created            guardian accepted it (.job file written)
 *   tab      provider tab           a tab for the provider is connected
 *   ping     tab answers            the ping gate
 *   deliver  sent to the tab        NCP delivery (stale socket = fail)
 *   accept   tab takes the job      a tab still answering another job refuses (tab_busy)
 *   submit   typed and sent         composer + send button
 *   reply    reply appears          the first text of the answer is read
 *   complete reply complete         the answer is finished and recorded
 *
 * Pure reducer (apply) + describe(): no I/O, so every path is testable. server.js
 * feeds it the bus, stores the trail on the job (job.gates, job.gate), serves it on
 * GET /status/:jobId and emits guardian.job.gate on each change (the Agent tab's feed).
 */

const MODULE_ID = 'guardian/gate-trail';
const VERSION = '1.0.0';

const GATES = Object.freeze([
  { id: 'create',   label: 'job created' },
  { id: 'tab',      label: 'provider tab' },
  { id: 'ping',     label: 'tab answers' },
  { id: 'deliver',  label: 'sent to the tab' },
  { id: 'accept',   label: 'tab takes the job' },
  { id: 'submit',   label: 'typed and sent' },
  { id: 'reply',    label: 'reply appears' },
  { id: 'complete', label: 'reply complete' },
]);
const ORDER = Object.fromEntries(GATES.map((g, i) => [g.id, i]));
const LABEL = Object.fromEntries(GATES.map(g => [g.id, g.label]));

// What to do when a gate fails or waits too long. Said plainly, and only what is known to help.
const FIX = Object.freeze({
  create:   'guardian could not write the job — check guardian/data/jobs is writable',
  tab:      'open the provider in Clear Glass (or your browser with its Guardian userscript) and sign in',
  ping:     'the tab did not answer — it may be frozen or mid-reply; reload it',
  deliver:  'the tab\'s connection went stale — reload the tab',
  accept:   'the tab is still answering another job — wait for it, or reload the tab',
  submit:   'the composer or send button was not found — pick them with ◎ (the element picker)',
  reply:    'no reply was read — pick the reply with ◎, or wait: the chat transcript completes the job when the chat settles',
  complete: '',
});

// The userscripts' and dispatcher's own gate names → this trail's gates.
const ERROR_GATE = Object.freeze({
  tab_busy: 'accept', submit: 'submit', watch: 'reply', no_reply: 'reply', no_reply_element: 'reply',
  ping: 'ping', ping_gate_failed: 'ping', stale_socket: 'deliver', raid_unavailable: 'deliver',
});

/** The furthest gate passed so far, or null. */
function _lastPassed(trail) {
  let best = null;
  for (const e of trail) if (e.state === 'passed' && (best === null || ORDER[e.gate] > ORDER[best])) best = e.gate;
  return best;
}
/** The gate a job is at now: the one after the furthest passed. */
function currentGate(trail) {
  const last = _lastPassed(trail);
  if (last === null) return 'create';
  return GATES[Math.min(ORDER[last] + 1, GATES.length - 1)].id;
}

/**
 * apply(trail, type, data, now) -> { trail, change } — the trail after one bus event.
 * `change` is the entry added (or null when the event says nothing new).
 * A later gate passing implies every earlier one passed; those are filled in as
 * 'passed (implied)' so the trail always reads start to finish.
 */
function apply(trail = [], type, data = {}, now = Date.now()) {
  const t = trail.slice();
  const add = (gate, state, detail) => {
    if (state === 'passed') {
      if (t.some(e => e.gate === gate && e.state === 'passed')) return null;       // already passed: nothing new
      for (const g of GATES) {
        if (ORDER[g.id] >= ORDER[gate]) break;
        if (!t.some(e => e.gate === g.id && e.state === 'passed')) t.push({ gate: g.id, state: 'passed', implied: true, at: now, detail: null });
      }
    } else {
      const prev = t[t.length - 1];
      if (prev && prev.gate === gate && prev.state === state && prev.detail === detail) return null;   // same news
    }
    const e = { gate, state, at: now, detail: detail || null };
    t.push(e);
    return e;
  };
  let change = null;
  switch (type) {
    case 'guardian.job.created': change = add('create', 'passed', null); break;
    case 'guardian.job.queued': {
      const r = data.reason || null;
      // A ping is only sent to a connected tab; a stale socket is found only after the ping passed.
      if (r === 'ping_gate_failed') { add('tab', 'passed'); change = add('ping', 'waiting', 'the tab did not answer a ping — waiting to retry'); }
      else if (r === 'stale_socket') { add('ping', 'passed'); change = add('deliver', 'waiting', 'the tab\'s connection was stale — waiting for it to reconnect'); }
      else { add('create', 'passed'); change = add('tab', 'waiting', `no ${data.provider || 'provider'} tab free yet${r ? ` (${r})` : ''} — waiting`); }
      break;
    }
    case 'guardian.job.dispatched': change = add('deliver', 'passed', data.transport ? `via ${data.transport}` : null); break;
    case 'guardian.job.progress': {
      if (data.stage === 'submitted') change = add('submit', 'passed', data.how ? `by ${data.how}` : null);
      else if (data.stage === 'dom' && !t.some(e => e.gate === 'reply' && e.state === 'passed')) {
        add('submit', 'passed');
        const a = data.anchor;
        change = add('reply', 'waiting', `${data.mutations ?? '?'} mutations, no reply text read yet${a && a.path ? ` (watching ${a.path})` : ''}`);
      }
      break;
    }
    case 'guardian.job.chunk': change = add('reply', 'passed', data.source === 'transcript' ? 'read from the chat transcript' : null); break;
    case 'guardian.job.complete': change = add('complete', 'passed', data.source === 'transcript' ? 'completed from the chat transcript' : null); break;
    case 'guardian.job.timeout': {
      const g = currentGate(t);
      change = add(g, 'failed', `${data.reason || 'timed out'}${data.waitedMs ? ` after ${Math.round(data.waitedMs / 1000)}s` : ''}${data.retry ? ` (retry ${data.retry})` : ''}`);
      break;
    }
    case 'guardian.job.error': {
      const g = ERROR_GATE[data.gate] || ERROR_GATE[data.error] || currentGate(t);
      change = add(g, 'failed', String(data.error || data.gate || 'failed'));
      break;
    }
    default: break;
  }
  return { trail: t, change };
}

/**
 * describe(trail, { provider }) -> { gate, label, state, detail, fix, sentence, passed }
 * The gate the job is stopped at (its last failure, else the current gate with its
 * latest news), in one sentence a person can act on.
 */
function describe(trail = [], { provider = null } = {}) {
  const passed = GATES.filter(g => trail.some(e => e.gate === g.id && e.state === 'passed')).map(g => g.id);
  const done = passed.includes('complete');
  const lastFail = [...trail].reverse().find(e => e.state === 'failed');
  // The latest news names where the job is: waiting news is its position even when later gates passed
  // before — a requeue (delivered, then queued again on a failed ping) puts the job back at 'ping'.
  const cur = currentGate(trail);
  const latest = [...trail].reverse().find(e => !e.implied) || null;
  const gate = done ? 'complete' : (lastFail ? lastFail.gate : latest && latest.state === 'waiting' ? latest.gate : cur);
  const news = done ? trail.find(e => e.gate === 'complete' && e.state === 'passed')
    : lastFail || [...trail].reverse().find(e => e.gate === gate) || null;
  const state = done ? 'passed' : lastFail ? 'failed' : (news ? news.state : 'waiting');
  const detail = news ? news.detail : null;
  const fix = state === 'passed' ? '' : FIX[gate] || '';
  const where = `gate ${ORDER[gate] + 1}/${GATES.length} "${LABEL[gate]}"${provider ? ` (${provider})` : ''}`;
  const sentence = state === 'passed'
    ? `complete${detail ? ` — ${detail}` : ''}`
    : `${state === 'failed' ? 'stopped at' : 'waiting at'} ${where}${detail ? `: ${detail}` : ''}${fix ? ` — ${fix}` : ''}`;
  return { gate, label: LABEL[gate], index: ORDER[gate] + 1, of: GATES.length, state, detail, fix, sentence, passed };
}

/**
 * attach({ bus, jobs }) — keep job.gates / job.gate current from the bus and emit
 * guardian.job.gate on each change. Returns { onEvent } for tests and direct calls.
 */
function attach({ bus, jobs } = {}) {
  const TYPES = ['guardian.job.created', 'guardian.job.queued', 'guardian.job.dispatched', 'guardian.job.progress',
    'guardian.job.chunk', 'guardian.job.complete', 'guardian.job.timeout', 'guardian.job.error'];
  function onEvent(type, data) {
    if (!data || !data.jobId || !jobs) return null;
    const job = jobs.get(data.jobId);
    if (!job) return null;
    if (!Array.isArray(job.gates) || !job.gates.length) job.gates = apply([], 'guardian.job.created', {}, job.ts || Date.now()).trail;
    const { trail, change } = apply(job.gates, type, data);
    job.gates = trail;
    if (!change) return null;
    job.gate = describe(trail, { provider: job.provider });
    if (bus) bus.emit('guardian.job.gate', { jobId: job.id, provider: job.provider, agentId: job.agentId || null,
      gate: job.gate.gate, state: job.gate.state, label: job.gate.label, detail: job.gate.detail, fix: job.gate.fix });
    return job.gate;
  }
  if (bus) for (const t of TYPES) bus.on(t, (ev) => { const d = ev && ev.data && typeof ev.data === 'object' ? ev.data : ev; onEvent(t, d); });
  return { onEvent };
}

module.exports = { MODULE_ID, VERSION, GATES, FIX, ERROR_GATE, apply, describe, currentGate, attach };
