'use strict';
/**
 * guardian/registry-components.js
 * comp_id: nexus.guardian.registry
 * uuid: nexus-guardian-registry-v1-0000-2026-0627-jamesbrooks-001
 * Declares every Guardian capability to the orchestrator on boot.
 */

const V = '3.20.0';   // 0.41.0: 3.20.0 (PF3 append-only store). 0.39.335: 3.19.2 (jaa-store flush max wait). §5.4 — tracks canonical lib/version.js services.guardian. 0.39.282: 3.14.0 -> 3.19.0 (re-synced; 3.15.0–3.19.0 moved lib/version.js and the spec only — test-system-record-discipline caught it). 0.39.256: 3.13.0 -> 3.14.0 (gate trail: every failure names its gate; /status carries gate + gates; transcript streaming). 0.39.255: 3.12.0 -> 3.13.0 (a job completes from its chat transcript; a chat is filed under the job whose prompt it holds; repo jobs wear their repo hat). 0.39.254: 3.11.1 -> 3.12.0 (every provider chat logged as one versioned transcript per chat; /api/chats). 0.39.252: 3.11.0 -> 3.11.1 (agent wakes answered once, by wake-loop, as a job). 0.39.237: 3.8.0 -> 3.9.0 (repo jobs go to their own tab or wait; guardian.job.agent_tab_fallback). 2026-08-08: was 3.6.1, drifted. 2026-09-23: 3.6.2 -> 3.7.0 with the account-authority + job-evidence + .job-source-of-truth work (guardian/spec/guardian.spec built_2026_09_23 block)
const NS = 'guardian';
function _c(id, method, path, desc, opts = {}) {
  return {
    id: `${NS}.${id}`, namespace: NS, name: id, version: V,
    grammar: opts.grammar || [id.replace(/\./g,' '), id.replace(/\./g,'-')],
    route: { method, path },
    description: desc,
    params:      opts.params || [],
    tags:        [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
    hooks:       opts.hooks || {},
  };
}

module.exports = [
  // ── Health / introspection ─────────────────────────────────────────────
  _c('health',               'GET',  '/health',                 'Guardian health, job counts, provider status'),
  _c('contract',             'GET',  '/contract',               'Guardian interaction contract'),
  _c('version',              'GET',  '/version',                'Guardian + userscript versions'),
  _c('baseline',             'GET',  '/baseline',               'Friction + sigma baseline'),
  _c('events',               'GET',  '/events',                 'SSE — all guardian bus events', { tags:['stream'] }),
  _c('bus.log',              'GET',  '/bus',                    'Recent SISO bus log'),
  _c('bus.emit',             'POST', '/bus/emit',               'Emit event onto bus'),

  // ── NCP / providers ────────────────────────────────────────────────────
  _c('providers.list',       'GET',  '/providers',              'Connected NCP browser tab providers'),
  _c('provider.channel',     'GET',  '/channel',                'NCP SSE channel — browser tabs connect here', { tags:['ncp'] }),
  _c('provider.result',      'POST', '/result',                 'NCP result from browser tab', { tags:['ncp'] }),
  // 0.39.254 — chat transcripts (lib/chat-transcripts.js): every provider chat, one versioned record per chat in Clear Glass's downloads index. The recall side agents read to remember.
  _c('chats.list',           'GET',  '/api/chats',              'Every logged chat at its newest version (?agentId ?provider ?q=text recall ?limit)', { tags:['chats','memory'] }),
  _c('chats.versions',       'GET',  '/api/chats/versions',     'Every version of one chat (?key=provider:chatId), newest first', { tags:['chats','memory'] }),
  _c('chats.item',           'GET',  '/api/chats/item/:id',     'One chat version: the full transcript from its .response file', { tags:['chats','memory'] }),

  // ── Jobs ───────────────────────────────────────────────────────────────
  _c('job.list',             'GET',  '/jobs',                   'Active + recent jobs'),
  _c('job.dispatch',         'POST', '/command',                'Dispatch job to provider (raw or SEAM)', {
    tags: ['dispatch'],
    hooks: {
      in:  [{ id:'guardian.job.dispatch.receive', intent:['build','ask','forge','compile'], contract:'nexus-interaction-contract-v1::guardian', tags:['dispatch'] }],
      out: [{ id:'guardian.job.dispatch.complete', wires_to:['cortex.raid.feedback'], tags:['result'] }],
    }
  }),
  _c('job.build',            'POST', '/build',                  'Full T0→T1→T2 build pipeline from spec', { tags:['build'] }),
  _c('job.status',           'GET',  '/status/:jobId',          'Single job status'),
  _c('job.response',         'GET',  '/response/:jobId',        'Full response for a job'),

  // ── SEAM ───────────────────────────────────────────────────────────────
  _c('seam.queues',          'GET',  '/seam/queues',            'Active SEAM queues'),
  _c('seam.queue',           'GET',  '/seam/queues/:id',        'Single SEAM queue detail'),
  _c('seam.sessions',        'GET',  '/seam/sessions',          'SEAM session history'),
  _c('seam.session.create',  'POST', '/seam/sessions',          'Create SEAM session'),
  _c('seam.retry',           'POST', '/seam/retry',             'Retry a failed SEAM chunk'),
  _c('seam.watchdog',        'GET',  '/seam/watchdog/status',   'SEAM watchdog + stall detection'),

  // ── Queue / compartments ───────────────────────────────────────────────
  _c('queue.status',         'GET',  '/queue',                  'Physical queue status'),
  _c('queue.enqueue',        'POST', '/queue/enqueue',          'Enqueue item to physical queue'),
  _c('queue.compartments',   'GET',  '/queue/compartments',     'Job compartment list'),
  _c('queue.compartment.create','POST','/queue/compartments',   'Create job compartment'),

  // ── Artifacts / gaps / sessions ────────────────────────────────────────
  _c('artifacts.list',       'GET',  '/artifacts',              'SHA-256 deduplicated code artifacts'),
  _c('gaps.list',            'GET',  '/gaps',                   'Open gaps detected by guardian'),
  _c('gaps.summary',         'GET',  '/gaps/summary',           'Gap summary by type + severity'),
  _c('sessions.list',        'GET',  '/sessions',               'NCP session history'),
  _c('settings.get',         'GET',  '/settings',               'Guardian settings'),
  _c('settings.reset',       'POST', '/settings/reset',         'Reset settings to defaults'),

  // ── Co-pilot (proxy to :3750) ──────────────────────────────────────────
  _c('copilot.prompt',       'POST', '/api/copilot/prompt',     'Route to co-pilot :3750/api/prompt', {
    tags: ['copilot'],
    hooks: {
      in:  [{ id:'guardian.copilot.receive', intent:['ask','build','diagnose','note'], contract:'nexus-interaction-contract-v1::guardian', tags:['copilot'] }],
      out: [{ id:'guardian.copilot.to-copilot', wires_to:['copilot.prompt.receive'], tags:['proxy'] }],
    }
  }),
  _c('copilot.memory',       'POST', '/api/copilot/memory',     'Co-pilot memory operations'),
];
