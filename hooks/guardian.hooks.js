'use strict';
/**
 * hooks/guardian.hooks.js — Guardian System Hook Map
 * UUID: guardian-hooks-map-v1-0000-4000
 * Status: pre-release
 * System: Guardian :7820
 * Status: living — auto-updated on hook registration changes
 *
 * §A-2  Hooks are the wire.
 * §A-3  Map before build.
 * §A-4  Spec is living — this file is the canonical guardian hook reference.
 *
 * Structure:
 *   Each hook entry declares:
 *     id:          UUID — stable identifier for this hook declaration
 *     name:        kebab-case unique name
 *     intent:      one sentence — what this wire does and why
 *     type:        one of 22 hook types
 *     direction:   unidirectional | bidirectional | broadcast | sink
 *     from/to:     surface + layer
 *     ui:          where this hook surfaces in the UI (panel, element, action)
 *     config:      runtime configuration
 *     contract:    axioms, side effects, idempotent, replayable
 *     references:  related files, specs, related hooks
 *     seam:        SEAM component ID if this hook is used in a SEAM sequence
 *     status:      active | deprecated | seed
 *     updatedAt:   ISO timestamp of last change
 */

const GUARDIAN_HOOKS = [
  {
    id: "guardian-hook-cockpit-get-0300",
    name: "guardian-cockpit-get",
    intent: "Serve the sovereign Guardian cockpit UI from ui/guardian/index.html. Same handler as '/' and '/cockpit/'.",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/cockpit", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true, methodEnforced: true },
    references: { files: ["guardian/server.js", "ui/guardian/index.html"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-queue-get-0100",
    name: "guardian-queue-get",
    intent: "Read queue (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/queue", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-queue-enqueue-post-0101",
    name: "guardian-queue-enqueue-post",
    intent: "Write queue enqueue (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/queue/enqueue", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-baseline-get-0102",
    name: "guardian-baseline-get",
    intent: "Read baseline (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/baseline", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-version-get-0103",
    name: "guardian-version-get",
    intent: "Read version (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/version", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-alk-last-get-0104",
    name: "guardian-alk-last-get",
    intent: "Read alk last (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/alk/last", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-seam-retry-post-0105",
    name: "guardian-seam-retry-post",
    intent: "Write seam retry (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/seam/retry", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-seam-watchdog-status-get-0106",
    name: "guardian-seam-watchdog-status-get",
    intent: "Read seam watchdog status (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/seam/watchdog/status", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-seam-queues-get-0107",
    name: "guardian-seam-queues-get",
    intent: "Read seam queues (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/seam/queues", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-providers-get-0108",
    name: "guardian-providers-get",
    intent: "Read providers (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/providers", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-heartbeat-post-0109",
    name: "guardian-heartbeat-post",
    intent: "Write heartbeat (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/heartbeat", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-seam-sessions-get-0110",
    name: "guardian-seam-sessions-get",
    intent: "Read seam sessions (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/seam/sessions", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-seam-sessions-post-0111",
    name: "guardian-seam-sessions-post",
    intent: "Write seam sessions (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/seam/sessions", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-queue-compartments-get-0112",
    name: "guardian-queue-compartments-get",
    intent: "Read queue compartments (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/queue/compartments", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-queue-compartments-post-0113",
    name: "guardian-queue-compartments-post",
    intent: "Write queue compartments (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/queue/compartments", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-settings-get-0114",
    name: "guardian-settings-get",
    intent: "Read settings (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/settings", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-settings-reset-post-0115",
    name: "guardian-settings-reset-post",
    intent: "Write settings reset (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/settings/reset", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-artifacts-get-0116",
    name: "guardian-artifacts-get",
    intent: "Read artifacts (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/artifacts", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-gaps-get-0117",
    name: "guardian-gaps-get",
    intent: "Read gaps (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/gaps", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-gaps-summary-get-0118",
    name: "guardian-gaps-summary-get",
    intent: "Read gaps summary (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/gaps/summary", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-sessions-get-0119",
    name: "guardian-sessions-get",
    intent: "Read sessions (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/sessions", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-cli-exec-post-0120",
    name: "guardian-cli-exec-post",
    intent: "Write cli exec (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/cli/exec", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-api-guardian-cfr-state-get-0121",
    name: "guardian-api-guardian-cfr-state-get",
    intent: "Read guardian cfr state (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/api/guardian/cfr/state", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-api-guardian-hooks-summary-get-0122",
    name: "guardian-api-guardian-hooks-summary-get",
    intent: "Read guardian hooks summary (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/api/guardian/hooks/summary", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-api-guardian-nerve-snapshot-get-0123",
    name: "guardian-api-guardian-nerve-snapshot-get",
    intent: "Read guardian nerve snapshot (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/api/guardian/nerve/snapshot", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-api-guardian-cfr-event-post-0124",
    name: "guardian-api-guardian-cfr-event-post",
    intent: "Write guardian cfr event (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/api/guardian/cfr/event", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-api-guardian-organism-queue-get-0125",
    name: "guardian-api-guardian-organism-queue-get",
    intent: "Read guardian organism-queue (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/api/guardian/organism-queue", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-build-post-0126",
    name: "guardian-build-post",
    intent: "Write build (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/build", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-chatgpt-mode-query-post-0127",
    name: "guardian-chatgpt-mode-query-post",
    intent: "Write chatgpt-mode query (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/chatgpt-mode/query", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-bus-get-0128",
    name: "guardian-bus-get",
    intent: "Read bus (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/bus", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-bus-emit-post-0129",
    name: "guardian-bus-emit-post",
    intent: "Write bus emit (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/bus/emit", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-forge-health-get-0130",
    name: "guardian-forge-health-get",
    intent: "Read forge health (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/forge/health", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-jobs-get-0131",
    name: "guardian-jobs-get",
    intent: "Read jobs (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/jobs", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["guardian/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "guardian-hook-copilot-prompt-0031",
    name: "guardian-copilot-prompt",
    intent: "Synchronous ask over the real NCP job pipeline (enqueue + poll)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "guardian", layer: 1, port: 7820 },
    config: { path: "/api/copilot/prompt", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["guardian/ask.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },

  // ── NCP Transport ─────────────────────────────────────────────────────────

  {
    id:        'gd-hook-ncp-channel-0001',
    name:      'guardian-ncp-channel',
    intent:    'Open SSE channel from guardian to browser tab so jobs can be pushed without polling',
    type:      'stream',
    direction: 'unidirectional',
    from:      { surface:'guardian', layer:1, port:7820 },
    to:        { surface:'browser-tab', layer:6 },
    ui: {
      panel:   'GUARDIAN > PROVIDERS',
      element: 'Provider status dot — green when SSE channel open',
      action:  'Auto-opens on GET /channel?provider=<p>&tabId=<id>',
    },
    config: {
      path:        '/channel',
      method:      'GET',
      protocol:    'SSE (text/event-stream)',
      keepalive:   '15s comment heartbeat',
      queryParams: ['provider', 'tabId'],
      auth:        { required:false },
    },
    contract: {
      axioms:      ['§5.2', '§NCP-01'],
      sideEffects: ['guardian._clients.set(provider, res)', 'pendingQueue.flush(provider)'],
      idempotent:  false,
      replayable:  false,
      snrGated:    false,
    },
    references: {
      files:    ['lib/ncp.js → createNCPServer', 'guardian/server.js → GET /channel'],
      related:  ['guardian-ncp-result', 'guardian-ncp-heartbeat'],
      spec:     'docs/specs/GUARDIAN-COMPLETE.md §Transport',
    },
    seam:      null,
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  {
    id:        'gd-hook-ncp-result-0002',
    name:      'guardian-ncp-result',
    intent:    'Receive messages from browser tab over plain fetch POST so guardian can process responses, artifacts, and gaps',
    type:      'api',
    direction: 'unidirectional',
    from:      { surface:'browser-tab', layer:6 },
    to:        { surface:'guardian', layer:1, port:7820 },
    ui: {
      panel:   'GUARDIAN > LOG',
      element: 'Log rows — every inbound message appears here',
      action:  'No direct UI trigger — fired by userscript on every response',
    },
    config: {
      path:    '/result',
      method:  'POST',
      contentType: 'application/json',
      schema:  '{ type, jobId, provider, tabId, text?, content?, hash? }',
    },
    contract: {
      axioms:      ['§1.2', '§NCP-02'],
      sideEffects: ['_handleNCPMessage(msg)', 'jaa.insert(event_log)', '_toCortex(event)'],
      idempotent:  false,
      replayable:  false,
      snrGated:    false,
    },
    references: {
      files:    ['guardian/server.js → POST /result → _handleNCPMessage'],
      related:  ['guardian-ncp-channel', 'guardian-job-complete'],
      spec:     'docs/specs/GUARDIAN-COMPLETE.md §NCP Message Types',
    },
    seam:      null,
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  // ── Job Dispatch ──────────────────────────────────────────────────────────

  {
    id:        'gd-hook-dispatch-0003',
    name:      'guardian-dispatch-job',
    intent:    'Accept a job from orchestrator/UI and route it to the correct connected browser tab provider',
    type:      'api',
    direction: 'unidirectional',
    from:      { surface:'orchestrator', layer:1 },
    to:        { surface:'guardian', layer:1, port:7820 },
    ui: {
      panel:   'GUARDIAN > DISPATCH',
      element: '→ DISPATCH button, provider selector, command input, prompt textarea',
      action:  'POST /command { provider, command, prompt, content? }',
    },
    config: {
      path:    '/command',
      method:  'POST',
      schema:  '{ provider: "claude"|"chatgpt"|"ollama", command: string, prompt: string, content?: string }',
      returns: '{ jobId, status:"queued"|"dispatched" }',
    },
    contract: {
      axioms:      ['§LAW-II', '§2.1', '§1.2'],
      sideEffects: [
        'jobs.set(jobId, job)',
        'jaa.insert("jobs", job)',
        'ncp.push(provider, GUARDIAN_JOB)',
        '_toCortex("agent.call.start")',
      ],
      idempotent:  false,
      replayable:  true,
    },
    references: {
      files:    ['guardian/server.js → POST /command → dispatchJob()', 'lib/ncp.js → push()'],
      related:  ['guardian-job-complete', 'guardian-ncp-channel', 'guardian-seam-dispatch'],
      fault:    'F-NCP-001 — _write not defined (fixed 2026-06-11)',
      spec:     'docs/specs/GUARDIAN-COMPLETE.md §Job Lifecycle',
    },
    seam:      null,
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  {
    id:        'gd-hook-job-complete-0004',
    name:      'guardian-job-complete',
    intent:    'Signal job completion back to cortex, bridge, and orchestrator with response text and usage stats',
    type:      'event-bus',
    direction: 'broadcast',
    from:      { surface:'guardian', layer:1 },
    to:        { surface:'cortex', layer:1 },
    ui: {
      panel:   'GUARDIAN > JOBS',
      element: 'Job row status badge — changes from RUNNING to COMPLETE',
      action:  'Auto-fires on GUARDIAN_COMPLETE NCP message',
    },
    config: {
      eventType:   'guardian.job.complete',
      payload:     '{ jobId, chars, ms, provider, usage }',
      targets:     ['cortex event_log', 'bridge ledger', 'orchestrator SSE broadcast'],
    },
    contract: {
      axioms:      ['§2.1', '§1.2'],
      sideEffects: [
        '_toCortex("guardian.job.complete")',
        '_toBridge("guardian.job.complete")',
        'jaa.update("jobs", {status:"complete", responseText})',
        'scanArtifacts(jobId)',
      ],
      idempotent:  false,
      replayable:  false,
    },
    references: {
      files:    ['guardian/server.js → case GUARDIAN_COMPLETE', 'guardian/userscript-claude.js → _onJobComplete()'],
      related:  ['guardian-dispatch-job', 'guardian-artifact', 'guardian-gaps'],
      fault:    'F-SEAM-001 — complete never routed to queue.onResponse() (fixed 2026-06-11)',
    },
    seam:      null,
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  // ── SEAM ──────────────────────────────────────────────────────────────────

  {
    id:        'gd-hook-seam-dispatch-0005',
    name:      'guardian-seam-dispatch',
    intent:    'Dispatch a .spec file as a SEAM sequence — intake chunk first, then N implementation chunks, each gated by SEAM VERDICT',
    type:      'seam',
    direction: 'unidirectional',
    from:      { surface:'orchestrator', layer:1 },
    to:        { surface:'guardian', layer:1, port:7820 },
    ui: {
      panel:   'GUARDIAN > SEAM',
      element: 'SEAM queue cards — shows spec name, chunk count, provider, current status',
      action:  'POST /command { specText, provider } or SEAM QUEUE button',
    },
    config: {
      path:        '/command',
      specField:   'specText',
      chunkFormat: '[SEAM CHUNK N/TOTAL] title\n\ncontent\n\nSEAM END — EXECUTE SEAM N',
      verdictPattern: 'SEAM VERDICT: PASS|FAIL',
      retryStrategies: ['context', 'shorter', 'forensic'],
      maxRetries:  2,
    },
    contract: {
      axioms:      ['§SEAM-01', '§2.1', '§1.2'],
      sideEffects: [
        '_activeQueues.set(uuid, SEAMQueue)',
        'SEAMQueue.start()',
        'jaa.insert("seam_sessions")',
      ],
      idempotent:  false,
      replayable:  false,
      snrGated:    false,
    },
    references: {
      files:    ['guardian/lib/seam-queue.js', 'guardian/lib/spec-parser.js', 'guardian/server.js → POST /command'],
      related:  ['guardian-dispatch-job', 'guardian-seam-chunk-verified'],
      fault:    'F-SEAM-001 — GUARDIAN_COMPLETE never routed to queue.onResponse() (fixed 2026-06-11)',
      spec:     'docs/specs/SEAM-SPEC-v1.0.0.md',
    },
    seam: {
      componentId: 'guardian-seam-dispatcher',
      intentId:    'dispatch-spec-as-sequential-chunks',
    },
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  // ── Artifacts ─────────────────────────────────────────────────────────────

  {
    id:        'gd-hook-artifact-0006',
    name:      'guardian-artifact-capture',
    intent:    'Capture code artifacts from AI responses with SHA-256 dedup so nothing is re-sent or re-built unnecessarily',
    type:      'event-bus',
    direction: 'unidirectional',
    from:      { surface:'browser-tab', layer:6 },
    to:        { surface:'guardian', layer:1 },
    ui: {
      panel:   'GUARDIAN > ARTIFACTS',
      element: 'Artifact list — hash, language, size, jobId',
      action:  'Auto-fires after each job completes',
    },
    config: {
      hashAlgo:    'SHA-256 (SubtleCrypto.digest)',
      storage:     'IDB artifacts store + guardian JAA artifacts table',
      maxContent:  4000,
      dedup:       'by hash — skip if already in IDB',
    },
    contract: {
      axioms:      ['§US-05', '§2.1'],
      sideEffects: ['idb.put("artifacts", art)', 'jaa.insert("artifacts", art)', '_toCortex("guardian.artifact")'],
      idempotent:  true,
    },
    references: {
      files:    ['guardian/userscript-claude.js → scanArtifacts()', 'guardian/userscript-chatgpt.js → scanArtifacts()'],
      related:  ['guardian-job-complete'],
    },
    seam: {
      componentId: 'guardian-artifact-capture',
      intentId:    'sha256-dedup-code-from-responses',
    },
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  // ── DOM Map ───────────────────────────────────────────────────────────────

  {
    id:        'gd-hook-dom-map-0007',
    name:      'guardian-dom-map',
    intent:    'Receive DOM structure signals from browser tabs so cortex can build a spatial model of the conversation state',
    type:      'event-bus',
    direction: 'unidirectional',
    from:      { surface:'browser-tab', layer:6 },
    to:        { surface:'guardian', layer:1 },
    ui: {
      panel:   'GUARDIAN > LOG',
      element: 'Log entries tagged guardian.dom_map.received',
      action:  'Auto-fires on connect and navigation in userscripts',
    },
    config: {
      messageType:  'NEXUS_DOM_MAP',
      rateLimit:    'once on connect + once per navigation (not per mutation)',
      nodeLimit:    20,
      payload:      '{ nodes[{tag,role,text}], context:{url,chatId,ts} }',
    },
    contract: {
      axioms:      ['§1.2', '§F-DOM-001'],
      sideEffects: ['_toCortex("guardian.dom_map.received")', 'bus.emit("guardian.dom_map.received")'],
      idempotent:  false,
      replayable:  false,
    },
    references: {
      files:    ['guardian/server.js → case NEXUS_DOM_MAP', 'guardian/userscript-claude.js → sendDOMMap()'],
      fault:    'F-DOM-001 — was silently dropped (fixed 2026-06-11)',
    },
    seam:      null,
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

  // ── Intelligence Pre-prompt ───────────────────────────────────────────────

  {
    id:        'gd-hook-intel-inject-0008',
    name:      'guardian-intelligence-inject',
    intent:    'Pull pre-prompt context from cortex intelligence before each job so agents start with known failure modes and reusable artifacts',
    type:      'api',
    direction: 'bidirectional',
    from:      { surface:'browser-tab', layer:6 },
    to:        { surface:'cortex', layer:1, port:3748 },
    ui: {
      panel:   'GUARDIAN userscript widget > INTEL tab',
      element: 'Intel tab shows last pulled context: failure modes, reuse candidates, patterns',
      action:  'Auto-fires before each job in userscript handleJob()',
    },
    config: {
      endpoint:    'GET :3753/api/intelligence/context',
      queryParams: ['intent', 'command', 'provider'],
      timeout:     3000,
      fallback:    'proceed without context (non-blocking)',
    },
    contract: {
      axioms:      ['§US-04', '§CC-001'],
      sideEffects: ['injects context header into prompt'],
      idempotent:  true,
      snrGated:    false,
    },
    references: {
      files:    ['guardian/userscript-claude.js → pullIntelligenceContext()', 'cortex/intelligence/index.js → getContext()'],
      related:  ['guardian-dispatch-job'],
    },
    seam: {
      componentId: 'guardian-pre-prompt-injection',
      intentId:    'inject-cortex-context-before-dispatch',
    },
    status:    'active',
    updatedAt: '2026-06-11T17:30:00Z',
  },

];

// ── Registry interface ─────────────────────────────────────────────────────
// Consumed by architect/src/hooks/Registry.js on boot to pre-populate
// the guardian surface hooks.

module.exports = {
  systemId:  'guardian',
  port:      7820,
  version:   '3.0.0',
  updatedAt: '2026-06-11T17:30:00Z',
  hooks:     GUARDIAN_HOOKS,

  // Quick lookups
  byId:   (id)   => GUARDIAN_HOOKS.find(h => h.id === id),
  byName: (name) => GUARDIAN_HOOKS.find(h => h.name === name),
  byType: (type) => GUARDIAN_HOOKS.filter(h => h.type === type),
  withSEAM: ()   => GUARDIAN_HOOKS.filter(h => h.seam !== null),
  active:   ()   => GUARDIAN_HOOKS.filter(h => h.status === 'active'),
};
