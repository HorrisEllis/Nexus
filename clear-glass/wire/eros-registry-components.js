'use strict';
/**
 * wire/eros-registry-components.js
 * comp_id: erosmancer-os.registry
 * uuid: eros-registry-v1-0000-0000-000000000012
 *
 * ErosmancerOS component declarations for NEXUS component-registry.
 * Follows lib/component-registry.js schema exactly — CR-004 id format.
 * Registered at NEXUS boot via the wire layer.
 */

const V  = '0.1.0';
const NS = 'eros';

function _c(id, method, path, desc, opts = {}) {
  return {
    id:          `${NS}.${id}`,
    namespace:   NS,
    name:        id,
    version:     V,
    grammar:     opts.grammar || [id.replace(/\./g, ' '), id.replace(/\./g, '-')],
    route:       { method, path },
    description: desc,
    params:      opts.params      || [],
    tags:        [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
    hooks:       opts.hooks       || {},
    tier:        opts.tier        || 'T2',
    typecode:    opts.typecode    || null,
    lifecycle:   opts.lifecycle   || 'versioned',
  };
}

module.exports = [
  // ── System ────────────────────────────────────────────────────────────────
  _c('health',          'GET',  '/api/health',          'ErosmancerOS health + module status'),
  _c('status',          'GET',  '/api/os/status',       'Full OS status — bridge, nodes, queue, routing'),
  _c('events',          'GET',  '/api/events',          'WebSocket event stream', { tags: ['stream'] }),

  // ── OS lifecycle ──────────────────────────────────────────────────────────
  _c('os.start',        'POST', '/api/os/start',        'Start OS — connect CDP bridge, enable observer', { typecode: 'EROS-OS-001' }),
  _c('os.shutdown',     'POST', '/api/os/shutdown',     'Shutdown OS cleanly', { typecode: 'EROS-OS-002' }),

  // ── Tab management ────────────────────────────────────────────────────────
  _c('tab.open',        'POST', '/api/tab/open',        'Open new CDP tab', { typecode: 'EROS-TAB-001', tags: ['tab'] }),
  _c('tab.close',       'POST', '/api/tab/close',       'Close tab by targetId', { tags: ['tab'] }),
  _c('tab.list',        'GET',  '/api/tab/list',        'List open CDP tabs', { tags: ['tab'] }),
  _c('tab.attach',      'POST', '/api/tab/attach',      'Attach CDP session to existing tab', { tags: ['tab'] }),
  _c('tab.shadow',      'POST', '/api/tab/shadow',      'Attach shadow/proxy tab for redundant routing', { tags: ['tab', 'routing'] }),
  _c('tab.shadow.map',  'POST', '/api/tab/shadow/map',  'Map shadow DOM tree for tab', { tags: ['tab', 'dom'] }),

  // ── Node registry ─────────────────────────────────────────────────────────
  _c('node.register',   'POST', '/api/node/register',   'Register DOM node — UUID + fingerprint + CDP identity', {
    typecode: 'EROS-NODE-001',
    tags: ['registry'],
    hooks: {
      out: [{ id: 'eros.node.registered', wires_to: ['cortex.memory.insert', 'clear-glass.dom.pick'], tags: ['registry'] }],
    },
  }),
  _c('node.get',        'GET',  '/api/node/:uuid',      'Get node by UUID', { tags: ['registry'] }),
  _c('node.tab',        'GET',  '/api/node/tab/:tabId', 'All nodes for a tab', { tags: ['registry'] }),
  _c('node.sweep',      'POST', '/api/node/sweep',      'Sweep stale nodes (last-seen > threshold)', { tags: ['registry'] }),

  // ── Command dispatch ──────────────────────────────────────────────────────
  _c('cmd.click',       'POST', '/api/os/click',        '7-strategy node resolution + CDP click', {
    typecode: 'EROS-CMD-001',
    tags: ['driver', 'cdp'],
    hooks: {
      in:  [{ id: 'eros.cmd.click.receive', intent: ['click'], contract: 'nexus-interaction-contract-v1::eros', tags: ['cdp'] }],
      out: [{ id: 'eros.cmd.result',        wires_to: ['clear-glass.driver.result.emit', 'cortex.events.write'], tags: ['result'] }],
    },
  }),
  _c('cmd.type',        'POST', '/api/os/type',         'CDP type into node', { typecode: 'EROS-CMD-002', tags: ['driver'] }),
  _c('cmd.hover',       'POST', '/api/os/hover',        'CDP hover over node', { tags: ['driver'] }),
  _c('cmd.scroll',      'POST', '/api/os/scroll',       'CDP scroll', { tags: ['driver'] }),
  _c('cmd.navigate',    'POST', '/api/os/navigate',     'CDP navigate to URL', { typecode: 'EROS-CMD-003', tags: ['driver'] }),
  _c('cmd.evaluate',    'POST', '/api/os/evaluate',     'CDP evaluate JS — no string interpolation', { typecode: 'EROS-CMD-004', tags: ['driver'] }),
  _c('cmd.screenshot',  'POST', '/api/os/screenshot',   'CDP screenshot', { typecode: 'EROS-CMD-005', tags: ['driver'] }),
  _c('cmd.wait',        'POST', '/api/os/wait',         'Wait for selector to appear', { tags: ['driver'] }),
  _c('cmd.attribute',   'POST', '/api/os/attribute',    'Get node attribute', { tags: ['driver'] }),

  // ── Behavior engine ───────────────────────────────────────────────────────
  _c('behavior.plan',   'POST', '/api/behavior/plan',   'Generate execution plan from intent + context', {
    typecode: 'EROS-BEH-001',
    tags: ['behavior'],
    hooks: {
      out: [{ id: 'eros.behavior.plan.emit', wires_to: ['cortex.intelligence.event'], tags: ['intelligence'] }],
    },
  }),
  _c('behavior.profile','POST', '/api/behavior/profile','Set behavior profile for session', { tags: ['behavior'] }),
  _c('behavior.snapshot','GET', '/api/behavior/snapshot/:sessionId', 'Session fatigue + error rate snapshot', { tags: ['behavior'] }),

  // ── Routing engine ────────────────────────────────────────────────────────
  _c('routing.level',   'POST', '/api/routing/level',   'Set route level: direct|parallel|redundant', { tags: ['routing'] }),
  _c('routing.snapshot','GET',  '/api/routing/snapshot','Current routing state + session map', { tags: ['routing'] }),

  // ── Hostile detection ─────────────────────────────────────────────────────
  _c('hostile.status',  'GET',  '/api/hostile/status',  'Current threat level + active signals', {
    tags: ['hostile', 'security'],
    hooks: {
      out: [{ id: 'eros.hostile.detected', wires_to: ['clear-glass.context.fp.switch', 'cortex.gaps.open', 'wire.hook.hostile'], tags: ['threat'] }],
    },
  }),
  _c('hostile.reset',   'POST', '/api/hostile/reset',   'Reset threat signals for tab', { tags: ['hostile'] }),

  // ── Replay ────────────────────────────────────────────────────────────────
  _c('replay.frames',   'GET',  '/api/replay/frames',   'List recorded script frames', { tags: ['replay'] }),
  _c('replay.start',    'POST', '/api/replay/start',    'Replay from checkpoint frame', { tags: ['replay'] }),
  _c('replay.checkpoint','POST','/api/replay/checkpoint','Create checkpoint from current state', { tags: ['replay'] }),

  // ── Adaptive layer ────────────────────────────────────────────────────────
  _c('adaptive.stats',  'GET',  '/api/adaptive/stats',  'PatternMemory + StrategyOptimizer statistics', { tags: ['adaptive'] }),
  _c('adaptive.recommend','POST','/api/adaptive/recommend','Recommend (profile × variant) for intent', { tags: ['adaptive'] }),

  // ── Observer ──────────────────────────────────────────────────────────────
  _c('observer.watch',  'POST', '/api/observer/watch',  'Start DOM observer on tab', { tags: ['observer'] }),
  _c('observer.unwatch','POST', '/api/observer/unwatch','Stop DOM observer on tab', { tags: ['observer'] }),

  // ── Telemetry ─────────────────────────────────────────────────────────────
  _c('telemetry.recent','GET',  '/api/telemetry/recent','Recent telemetry events', { tags: ['telemetry'] }),
  _c('telemetry.flush', 'POST', '/api/telemetry/flush', 'Force flush telemetry to disk', { tags: ['telemetry'] }),
];
