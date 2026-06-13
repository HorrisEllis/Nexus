'use strict';
// ── cortex/agent-tools/index.js ───────────────────────────────────────────────
// UUID: nexus-agent-tools-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// Tools available to agents (Ollama, Claude, Guardian) via the RAID dispatch
// system. Every tool is a pure function that reads JAA and returns structured
// output. Tools that mutate state write to JAA first (§2.1).
//
// Schema: each tool has { name, description, input_schema, fn }
// Agents receive the tool list as context and call tools by name via agent_calls.
//
// §1.2  Every tool failure returns { ok: false, error } — never throws to caller
// §2.1  State-mutating tools write JAA record before executing action

const { execSync }   = require('child_process');
const { jaaDB, uid } = require('../memory/jaa-db');
const snapshot       = require('../snapshot');

const MODULE_ID = 'agent-tools';
const VERSION   = '1.0.0';

// ── Tool registry ─────────────────────────────────────────────────────────────

const TOOLS = {

  // ── System state ─────────────────────────────────────────────────────────

  'nexus.status': {
    description: 'Get live health status of all NEXUS systems',
    input_schema: {},
    fn: async () => {
      const http = require('http');
      const PORTS = { orchestrator:9000, cortex:3748, guardian:7820, idearium:4800, emerge:4242 };
      const results = {};
      await Promise.all(Object.entries(PORTS).map(([name, port]) =>
        new Promise(resolve => {
          const r = http.get({ hostname:'127.0.0.1', port, path:'/health', timeout:2000 }, res => {
            let d=''; res.on('data', c=>d+=c);
            res.on('end', () => {
              try { results[name] = { online: true, ...JSON.parse(d) }; }
              catch { results[name] = { online: res.statusCode < 500 }; }
              resolve();
            });
          });
          r.on('error', () => { results[name] = { online: false }; resolve(); });
          r.on('timeout', () => { r.destroy(); results[name] = { online: false, error: 'timeout' }; resolve(); });
        })
      ));
      return { ok: true, systems: results };
    }},

  'nexus.gaps': {
    description: 'List open gaps in the system',
    input_schema: {
      status:   { type: 'string', default: 'pending', enum: ['pending','needs_manual','forge_failed','human_required','all'] },
      severity: { type: 'string', default: 'all' },
      limit:    { type: 'number', default: 20 }},
    fn: async ({ status = 'pending', severity = 'all', limit = 20 } = {}) => {
      const gaps = jaaDB.query('gaps', r => {
        if (status !== 'all' && r.status !== status) return false;
        if (severity !== 'all' && r.severity !== severity) return false;
        return true;
      }, limit);
      return { ok: true, gaps, count: gaps.length };
    }},

  'nexus.failures': {
    description: 'Get recent system failures',
    input_schema: { limit: { type: 'number', default: 20 } },
    fn: async ({ limit = 20 } = {}) => {
      const failures = jaaDB.tail('failures', limit);
      return { ok: true, failures, count: failures.length };
    }},

  'nexus.events': {
    description: 'Get recent event log entries, optionally filtered by type',
    input_schema: {
      limit: { type: 'number', default: 30 },
      type:  { type: 'string', default: '' }},
    fn: async ({ limit = 30, type = '' } = {}) => {
      const events = type
        ? jaaDB.query('event_log', e => e.type === type || e.type?.startsWith(type), limit)
        : jaaDB.tail('event_log', limit);
      return { ok: true, events, count: events.length };
    }},

  'nexus.table': {
    description: 'Query any JAA table',
    input_schema: {
      table: { type: 'string', required: true },
      limit: { type: 'number', default: 20 }},
    fn: async ({ table, limit = 20 } = {}) => {
      if (!table) return { ok: false, error: 'table required' };
      if (!jaaDB._tables[table]) return { ok: false, error: `unknown table: ${table}. Known: ${Object.keys(jaaDB._tables).join(', ')}` };
      const rows = jaaDB.tail(table, limit);
      return { ok: true, table, rows, count: rows.length };
    }},

  // ── Diagnostics ───────────────────────────────────────────────────────────

  'nexus.diagnose': {
    description: 'Run the NEXUS diagnostic sequencer for a specific system or all',
    input_schema: {
      system: { type: 'string', default: 'all', enum: ['all','orchestrator','cortex','guardian','idearium','emerge'] }},
    fn: async ({ system = 'all' } = {}) => {
      try {
        const result = execSync(
          `node cli/diagnose.js ${system}`,
          { cwd: require('path').join(__dirname, '..', '..'), timeout: 30000, encoding: 'utf8' }
        );
        const pass = (result.match(/✓/g) || []).length;
        const fail = (result.match(/✗/g) || []).length;
        return { ok: fail === 0, system, pass, fail, output: result.slice(-2000) };
      } catch (e) {
        return { ok: false, error: e.message, output: e.stdout?.slice(-1000) };
      }
    }},

  'nexus.replay': {
    description: 'Run the replay engine to verify system state consistency',
    input_schema: {
      mode:  { type: 'string', default: 'verify', enum: ['inspect','verify'] },
      fromTs: { type: 'number', default: 0 }},
    fn: async ({ mode = 'verify', fromTs = 0 } = {}) => {
      const replay = require('../replay');
      if (mode === 'verify') return { ok: true, ...replay.verify({ fromTs }) };
      return { ok: true, ...replay.inspect({ fromTs }) };
    }},

  // ── Snapshots ─────────────────────────────────────────────────────────────

  'nexus.snapshot.create': {
    description: 'Create a .nex system snapshot',
    input_schema: {
      message: { type: 'string', default: 'agent-triggered snapshot' }},
    fn: async ({ message = 'agent-triggered snapshot' } = {}) => {
      const result = snapshot.create({ type: 'agent', message });
      return { ok: true, ...result };
    }},

  'nexus.snapshot.list': {
    description: 'List available snapshots',
    input_schema: { limit: { type: 'number', default: 10 } },
    fn: async ({ limit = 10 } = {}) => {
      const snaps = snapshot.list(limit);
      return { ok: true, snapshots: snaps, count: snaps.length };
    }},

  'nexus.snapshot.rollback': {
    description: 'Dry-run rollback to a snapshot (returns what would change)',
    input_schema: {
      snapId: { type: 'string', required: true },
      apply:  { type: 'boolean', default: false }},
    fn: async ({ snapId, apply = false } = {}) => {
      if (!snapId) return { ok: false, error: 'snapId required' };
      try {
        const result = snapshot.rollback(snapId, { apply });
        return { ok: true, ...result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }},

  // ── Repair ────────────────────────────────────────────────────────────────

  'nexus.gap.resolve': {
    description: 'Manually mark a gap as resolved',
    input_schema: {
      gapUuid: { type: 'string', required: true },
      reason:  { type: 'string', default: 'agent-resolved' }},
    fn: async ({ gapUuid, reason = 'agent-resolved' } = {}) => {
      if (!gapUuid) return { ok: false, error: 'gapUuid required' };
      const gap = jaaDB.get('gaps', gapUuid);
      if (!gap) return { ok: false, error: `gap not found: ${gapUuid}` };
      jaaDB.update('gaps', gapUuid, { status: 'resolved', resolvedAt: Date.now(), fixStrategy: reason });
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'gap.resolved',
        payload: { gapUuid, reason, resolvedBy: 'agent' },
        source: MODULE_ID, causedBy: gapUuid, ts: Date.now()});
      return { ok: true, gapUuid, status: 'resolved' };
    }},

  'nexus.forge.patches': {
    description: 'List recent forge patches (proposed or applied)',
    input_schema: { limit: { type: 'number', default: 10 } },
    fn: async ({ limit = 10 } = {}) => {
      const patches = jaaDB.tail('forge_patches', limit);
      return { ok: true, patches, count: patches.length };
    }},

  'nexus.event.inject': {
    description: 'Inject a synthetic event into event_log (for testing/simulation)',
    input_schema: {
      type:    { type: 'string', required: true },
      payload: { type: 'object', default: {} }},
    fn: async ({ type, payload = {} } = {}) => {
      if (!type) return { ok: false, error: 'type required' };
      const row = jaaDB.insert('event_log', {
        uuid: uid(), type, payload,
        source: `${MODULE_ID}/inject`,
        causedBy: null, ts: Date.now(),
        synthetic: true});
      return { ok: true, uuid: row.uuid, type };
    }},

  // ── Self-awareness ────────────────────────────────────────────────────────

  'nexus.context': {
    description: 'Get full system context: health + recent gaps + recent events + patches',
    input_schema: {},
    fn: async () => {
      const [gaps, failures, events, patches, snaps] = [
        jaaDB.query('gaps', r => r.status !== 'resolved', 10),
        jaaDB.tail('failures', 10),
        jaaDB.tail('event_log', 20),
        jaaDB.tail('forge_patches', 5),
        jaaDB.tail('backup_records', 5)];
      return {
        ok: true,
        openGaps:       gaps.length,
        recentFailures: failures.length,
        recentEvents:   events.map(e => ({ type: e.type, ts: e.ts, source: e.source })),
        forgePatchCount: patches.length,
        snapshotCount:   snaps.length,
        latestSnapshot:  snaps[0]?.snapId || null};
    }}};

// ── Execute a tool ────────────────────────────────────────────────────────────
async function execute(toolName, input = {}) {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { ok: false, error: `unknown tool: ${toolName}. Available: ${Object.keys(TOOLS).join(', ')}` };
  }

  const callId = uid();
  const t0 = Date.now();

  // Write tool call record first (§2.1)
  jaaDB.insert('agent_calls', {
    uuid:           callId,
    intent:         `tool:${toolName}`,
    prompt:         JSON.stringify(input),
    preferredAgent: 'agent-tools',
    routedTo:       'agent-tools',
    status:         'processing',
    source:         MODULE_ID,
    causedBy:       null,
    ts:             t0});

  try {
    const result = await tool.fn(input);
    const ms = Date.now() - t0;

    jaaDB.update('agent_calls', callId, {
      status: 'complete',
      result: JSON.stringify(result).slice(0, 5000),
      completedAt: Date.now(),
      latencyMs: ms});

    return result;
  } catch (err) {
    jaaDB.update('agent_calls', callId, { status: 'failed', error: err.message });
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, causedBy: callId, ts: Date.now() });
    return { ok: false, error: err.message };
  }
}

// ── Tool manifest (for agents to read) ───────────────────────────────────────
function manifest() {
  return Object.entries(TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: tool.input_schema}));
}

module.exports = { execute, manifest, TOOLS, VERSION, MODULE_ID };
