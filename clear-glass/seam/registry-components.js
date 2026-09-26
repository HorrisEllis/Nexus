'use strict';
/**
 * seam/registry-components.js — Clear Glass Component Registry
 * UUID: cg-seam-registry-v1-0000-0000-000000000008
 * comp_id: clear-glass.registry
 *
 * Follows lib/component-registry.js schema exactly.
 * id format: namespace.name (lowercase, dot-separated) — CR-004.
 * Registered on orchestrator :9000 on boot.
 * Drift engine diffs this against the spec on every boot.
 */

const V  = '3.0.0';
const NS = 'cg';

function _c(id, method, path, desc, opts = {}) {
  return {
    id:           `${NS}.${id}`,
    namespace:    NS,
    name:         id,
    version:      V,
    grammar:      opts.grammar || [id.replace(/\./g, ' '), id.replace(/\./g, '-')],
    route:        { method, path },
    description:  desc,
    params:       opts.params       || [],
    tags:         [NS, ...(opts.tags || [])],
    permissions:  opts.permissions  || ['system'],
    hooks:        opts.hooks        || {},
    // Phase 40 descriptor extensions
    tier:         opts.tier         || 'T2',
    capabilities: opts.capabilities || [],
    lifecycle:    opts.lifecycle    || 'versioned',
    // Typecode — machine-readable payload schema identifier
    typecode:     opts.typecode     || null,
  };
}

module.exports = [
  // ── Health / status ─────────────────────────────────────────────────────
  _c('health',  'GET', '/health',   'Clear Glass health, context count, bus stats'),
  _c('status',  'GET', '/status',   'Full system status — bus sample, agents, listeners, TLS'),
  _c('events',  'GET', '/events',   'SSE — all SISO bus events', { tags: ['stream'] }),
  _c('bus.log', 'GET', '/bus/log',  'SISO StreamLog entries', { tags: ['debug'] }),

  // ── Driver ──────────────────────────────────────────────────────────────
  _c('driver.exec', 'POST', '/cmd', 'Execute ClearDriver browser action', {
    tags: ['driver', 'automation'],
    tier: 'T2',
    typecode: 'CG-DRV-001',
    capabilities: [{ verb: 'execute', noun: 'browser-action', input: 'DriverPayload', output: 'DriverResult' }],
    hooks: {
      in:  [{ id: 'clear-glass.driver.exec.receive',  intent: ['navigate','click','type','eval','screenshot'], contract: 'nexus-interaction-contract-v1::clear-glass', tags: ['driver'] }],
      out: [{ id: 'clear-glass.driver.result.emit',   wires_to: ['cortex.events.write', 'guardian.artifacts.list'], tags: ['result'] }],
    },
  }),

  // ── DOM ─────────────────────────────────────────────────────────────────
  _c('dom.query',  'POST', '/cmd', 'Query live DOM tree by selector, cgId, or full tree', { tags: ['dom'], typecode: 'CG-DOM-001' }),
  _c('dom.mutate', 'POST', '/cmd', 'Mutate DOM node — text, html, style, attrs, remove',  { tags: ['dom'], typecode: 'CG-DOM-002' }),
  _c('dom.pick',   'POST', '/cmd', 'Register element picker result as named NEXUS hook',  { tags: ['dom', 'seam'], typecode: 'CG-DOM-003' }),
  _c('dom.tokens', 'POST', '/cmd', 'Token archaeology — detect LLM API patterns on page', {
    tags: ['dom', 'archaeology'],
    hooks: {
      out: [{ id: 'clear-glass.dom.tokens.relay', wires_to: ['cortex.intelligence.event'], tags: ['intelligence'] }],
    },
  }),

  // ── Contexts ─────────────────────────────────────────────────────────────
  _c('context.create',    'POST', '/cmd',       'Create isolated Chromium partition for agent', {
    tags: ['context', 'agent'],
    typecode: 'CG-CTX-001',
    hooks: {
      out: [{ id: 'clear-glass.context.created', wires_to: ['cortex.memory.insert'], tags: ['lifecycle'] }],
    },
  }),
  _c('context.switch',    'POST', '/cmd',       'Switch active agent context', { tags: ['context'], typecode: 'CG-CTX-001' }),
  _c('context.list',      'GET',  '/contexts',  'List agent contexts with health scores', { tags: ['context'] }),
  _c('context.fp.switch', 'POST', '/cmd',       'Switch fingerprint mode (firefox|chrome|safari)', { tags: ['context', 'fingerprint'], typecode: 'CG-CTX-002' }),
  _c('context.health',    'GET',  '/contexts',  'Agent health — RAID routing weight', { tags: ['context', 'raid'] }),

  // ── Cookie vault ──────────────────────────────────────────────────────────
  _c('cookie.save',     'POST', '/cmd', 'Save per-account cookies — AES-256-GCM vault', { tags: ['cookie', 'vault'], typecode: 'CG-CKI-001' }),
  _c('cookie.restore',  'POST', '/cmd', 'Restore cookies from vault into session',       { tags: ['cookie', 'vault'], typecode: 'CG-CKI-002' }),
  _c('cookie.snapshot', 'POST', '/cmd', 'Snapshot current session cookies',              { tags: ['cookie', 'vault'] }),
  _c('cookie.health',   'POST', '/cmd', 'Check token validity heuristic for RAID',       {
    tags: ['cookie', 'raid'],
    hooks: {
      out: [{ id: 'clear-glass.cookie.health.result', wires_to: ['cortex.raid.health'], tags: ['raid'] }],
    },
  }),

  // ── Co-pilot ─────────────────────────────────────────────────────────────
  _c('copilot.message', 'POST', '/cmd', 'Route to Clear Glass co-pilot (Cortex-wired, DOM-aware)', {
    tags: ['copilot'],
    typecode: 'CG-CPL-001',
    hooks: {
      in:  [{ id: 'clear-glass.copilot.receive',       intent: ['ask','build','navigate','diagnose','pick'], contract: 'nexus-interaction-contract-v1::clear-glass', tags: ['copilot'] }],
      out: [{ id: 'clear-glass.copilot.response.emit', wires_to: ['cortex.chat.log', 'cortex.memory.insert'], tags: ['copilot'] }],
    },
  }),
  _c('copilot.clear', 'POST', '/cmd', 'Clear co-pilot conversation history for agent', { tags: ['copilot'] }),

  // ── Agent mesh ────────────────────────────────────────────────────────────
  _c('mesh.spawn',   'POST', '/cmd',     'Spawn free AI agent in isolated context', { tags: ['mesh', 'agent'], typecode: 'CG-MSH-001' }),
  _c('mesh.send',    'POST', '/cmd',     'Send prompt to specific mesh agent',       { tags: ['mesh'], typecode: 'CG-MSH-002' }),
  _c('mesh.route',   'POST', '/cmd',     'RAID-route prompt to healthiest agent', {
    tags: ['mesh', 'raid'],
    typecode: 'CG-MSH-003',
    hooks: {
      out: [{ id: 'clear-glass.mesh.result', wires_to: ['cortex.raid.decide', 'guardian.job.dispatch.receive'], tags: ['mesh', 'routing'] }],
    },
  }),
  _c('mesh.enqueue', 'POST', '/cmd',     'Queue task for mesh processing', { tags: ['mesh'] }),
  _c('mesh.list',    'GET',  '/agents',  'List mesh agents with health + status', { tags: ['mesh'] }),
  _c('mesh.registry','GET',  '/agents',  'List available AI agents and their URLs', { tags: ['mesh'] }),

  // ── URL listeners ─────────────────────────────────────────────────────────
  _c('url.listen',       'POST', '/cmd',        'Add URL pattern listener → fires NEXUS hook on match', {
    tags: ['listener', 'automation'],
    typecode: 'CG-URL-001',
    hooks: {
      out: [{ id: 'clear-glass.url.match', wires_to: ['cortex.events.write', 'guardian.artifacts.list'], tags: ['listener'] }],
    },
  }),
  _c('url.listen.remove','POST', '/cmd',        'Remove URL pattern listener by ID', { tags: ['listener'] }),
  _c('url.listen.list',  'GET',  '/listeners',  'List active URL listeners', { tags: ['listener'] }),

  // ── Diagnostics ───────────────────────────────────────────────────────────
  _c('diag.run',     'POST', '/cmd',           'Run custom diagnostic suite', { tags: ['diagnostic'], typecode: 'CG-DGN-001' }),
  _c('diag.nexus',   'POST', '/cmd',           'NEXUS home UI audit — navigate, assert, screenshot', {
    tags: ['diagnostic', 'audit'],
    typecode: 'CG-DGN-002',
    hooks: {
      out: [{ id: 'clear-glass.diag.complete', wires_to: ['cortex.gaps.open', 'cortex.events.write'], tags: ['diagnostic'] }],
    },
  }),
  _c('diag.page',    'POST', '/cmd',           'Page audit — broken images, JS errors, performance', { tags: ['diagnostic'], typecode: 'CG-DGN-003' }),
  _c('diag.reports', 'GET',  '/diag/reports',  'List diagnostic run reports', { tags: ['diagnostic'] }),

  // ── Fingerprint ───────────────────────────────────────────────────────────
  _c('fingerprint.get',    'GET',  '/fingerprint/:id', 'Get agent Firefox fingerprint profile', { tags: ['fingerprint'] }),
  _c('fingerprint.import', 'POST', '/cmd',             'Import Firefox profile for agent',       { tags: ['fingerprint'], typecode: 'CG-FPR-001' }),

  // ── TLS proxy ─────────────────────────────────────────────────────────────
  _c('tls.stats', 'GET', '/status', 'TLS proxy — JA4 rewrite stats, tunnels, errors', { tags: ['tls'] }),

  // ── Windows ───────────────────────────────────────────────────────────────
  _c('window.open',  'POST', '/cmd', 'Open agent browser window', { tags: ['window'], typecode: 'CG-WIN-001' }),
  _c('window.close', 'POST', '/cmd', 'Close agent window (hides to tray)', { tags: ['window'], typecode: 'CG-WIN-002' }),
  _c('window.list',  'GET',  '/status', 'List open agent windows', { tags: ['window'] }),
];
