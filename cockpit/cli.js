/**
 * forge-cli.js — CLI command layer + interaction contract
 * ─────────────────────────────────────────────────────────
 * UUID:    forge-cli-0003-2026-0530-jamesbrooks
 * VERSION: 1.0.0
 *
 * All commands route through SISO bus — same hooks, different surface (ME-2).
 * CLI = UI = same contract.
 *
 * Commands (all prefixed forge):
 *   forge pipeline list
 *   forge pipeline create <name>
 *   forge pipeline run <id> [--payload <json>]
 *   forge pipeline add-node <pid> <type> [--config <json>]
 *   forge pipeline connect <pid> <from> <to> [--if <condition>]
 *   forge pipeline arm <id>       — enable scheduler
 *   forge pipeline disarm <id>    — disable scheduler
 *   forge pipeline delete <id>
 *   forge pipeline export <id>
 *   forge pipeline import <json>
 *   forge seam compile <file|->
 *   forge seam validate <file|->
 *   forge idea list
 *   forge idea create <title>
 *   forge gap list
 *   forge gap create <title>
 *   forge gap resolve <id> <resolution>
 *   forge snapshot create [--message <msg>]
 *   forge trust list
 *   forge guardian dispatch <provider> <prompt>
 *   forge idearium health
 *   forge bus emit <channel> [--payload <json>]
 *   forge bus history
 *   forge jaa stats
 *   forge jaa query <table>
 *   forge help
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════
// INTERACTION CONTRACT
// (machine-readable: every surface reads this to know what's available)
// ══════════════════════════════════════════════════════════════════════

const INTERACTION_CONTRACT = {
  version: '1.0.0',
  name:    'forge-cli',
  uuid:    'forge-cli-contract-0003-2026-0530-jamesbrooks',
  description: 'Full CLI + UI interaction contract for Forge IDE pipeline platform',

  commands: [
    // ── Pipeline ──────────────────────────────────────────────────
    {
      cmd: 'forge pipeline list',
      description: 'List all pipelines',
      output: 'pipeline[]',
      busEvent: 'cli.pipeline.list',
    },
    {
      cmd: 'forge pipeline create',
      args: [{ name: 'name', type: 'string', required: true }],
      opts: [{ name: 'description', type: 'string' }, { name: 'tags', type: 'string[]' }],
      description: 'Create a new pipeline',
      output: 'pipeline',
      busEvent: 'cli.pipeline.create',
    },
    {
      cmd: 'forge pipeline run',
      args: [{ name: 'id', type: 'string', required: true }],
      opts: [{ name: 'payload', type: 'json', default: '{}' }],
      description: 'Trigger a pipeline run',
      output: 'run',
      busEvent: 'cli.pipeline.run',
    },
    {
      cmd: 'forge pipeline add-node',
      args: [
        { name: 'pipeline_id', type: 'string', required: true },
        { name: 'type',        type: 'string', required: true, enum: [
          'trigger','condition','transform','api_call','agent_call',
          'store','emit','loop','delay','seam_compile','gap','notify',
          'merge','fork','webhook_out',
        ]},
      ],
      opts: [
        { name: 'label',  type: 'string' },
        { name: 'config', type: 'json', default: '{}' },
        { name: 'x',      type: 'number', default: 0 },
        { name: 'y',      type: 'number', default: 0 },
      ],
      description: 'Add a node to a pipeline',
      output: 'node',
      busEvent: 'cli.pipeline.add-node',
    },
    {
      cmd: 'forge pipeline connect',
      args: [
        { name: 'pipeline_id', type: 'string', required: true },
        { name: 'from_id',     type: 'string', required: true },
        { name: 'to_id',       type: 'string', required: true },
      ],
      opts: [{ name: 'if', type: 'string', description: 'SEAM condition expression' }],
      description: 'Connect two nodes with an optional condition',
      output: 'ok',
      busEvent: 'cli.pipeline.connect',
    },
    {
      cmd: 'forge pipeline arm',
      args: [{ name: 'id', type: 'string', required: true }],
      description: 'Enable pipeline scheduler',
      busEvent: 'cli.pipeline.arm',
    },
    {
      cmd: 'forge pipeline disarm',
      args: [{ name: 'id', type: 'string', required: true }],
      description: 'Disable pipeline scheduler',
      busEvent: 'cli.pipeline.disarm',
    },
    {
      cmd: 'forge pipeline delete',
      args: [{ name: 'id', type: 'string', required: true }],
      description: 'Delete a pipeline',
      busEvent: 'cli.pipeline.delete',
    },
    {
      cmd: 'forge pipeline export',
      args: [{ name: 'id', type: 'string', required: true }],
      description: 'Export pipeline as JSON',
      output: 'json',
      busEvent: 'cli.pipeline.export',
    },
    {
      cmd: 'forge pipeline import',
      args: [{ name: 'json', type: 'json', required: true }],
      description: 'Import pipeline from JSON',
      output: 'pipeline',
      busEvent: 'cli.pipeline.import',
    },
    // ── SEAM ──────────────────────────────────────────────────────
    {
      cmd: 'forge seam compile',
      args: [{ name: 'source', type: 'string', required: true }],
      description: 'Compile SEAM source → constraint field + JS',
      output: 'compile_result',
      busEvent: 'cli.seam.compile',
    },
    {
      cmd: 'forge seam validate',
      args: [{ name: 'source', type: 'string', required: true }],
      description: 'Validate SEAM source (Pass 0 only)',
      output: 'validation',
      busEvent: 'cli.seam.validate',
    },
    {
      cmd: 'forge seam chunk',
      args: [{ name: 'source', type: 'string', required: true }],
      opts: [{ name: 'size', type: 'number', default: 4000 }],
      description: 'Chunk SEAM/spec source into delivery protocol chunks',
      output: 'chunk[]',
      busEvent: 'cli.seam.chunk',
    },
    // ── Idearium ──────────────────────────────────────────────────
    {
      cmd: 'forge idea list',
      opts: [{ name: 'phase', type: 'string' }, { name: 'tag', type: 'string' }, { name: 'limit', type: 'number' }],
      description: 'List ideas from Idearium',
      output: 'idea[]',
      busEvent: 'cli.idea.list',
    },
    {
      cmd: 'forge idea create',
      args: [{ name: 'title', type: 'string', required: true }],
      opts: [{ name: 'body', type: 'string' }, { name: 'tags', type: 'string[]' }],
      description: 'Create a new idea in Idearium',
      output: 'idea',
      busEvent: 'cli.idea.create',
    },
    {
      cmd: 'forge gap list',
      opts: [{ name: 'status', type: 'string' }, { name: 'severity', type: 'string' }],
      description: 'List gaps',
      output: 'gap[]',
      busEvent: 'cli.gap.list',
    },
    {
      cmd: 'forge gap create',
      args: [{ name: 'title', type: 'string', required: true }],
      opts: [{ name: 'pressure', type: 'number', default: 0.5 }, { name: 'description', type: 'string' }],
      description: 'Create a gap',
      output: 'gap',
      busEvent: 'cli.gap.create',
    },
    {
      cmd: 'forge gap resolve',
      args: [{ name: 'id', type: 'string', required: true }, { name: 'resolution', type: 'string', required: true }],
      description: 'Resolve a gap',
      output: 'ok',
      busEvent: 'cli.gap.resolve',
    },
    {
      cmd: 'forge snapshot create',
      opts: [{ name: 'message', type: 'string' }, { name: 'causedBy', type: 'string' }],
      description: 'Create Idearium snapshot',
      output: 'snapshot',
      busEvent: 'cli.snapshot.create',
    },
    // ── Trust ──────────────────────────────────────────────────────
    {
      cmd: 'forge trust list',
      description: 'List all trust scores (Beta distribution)',
      output: 'trust_score[]',
      busEvent: 'cli.trust.list',
    },
    {
      cmd: 'forge trust record',
      args: [{ name: 'sourceId', type: 'string', required: true }],
      opts: [{ name: 'passed', type: 'boolean', default: true }],
      description: 'Record a trust event for a source',
      output: 'trust',
      busEvent: 'cli.trust.record',
    },
    // ── Guardian ──────────────────────────────────────────────────
    {
      cmd: 'forge guardian dispatch',
      args: [
        { name: 'provider', type: 'string', required: true, enum: ['claude','chatgpt','gemini','deepseek','perplexity','ollama'] },
        { name: 'prompt',   type: 'string', required: true },
      ],
      opts: [{ name: 'timeout', type: 'number', default: 90000 }],
      description: 'Dispatch prompt to Guardian agent',
      output: 'string',
      busEvent: 'cli.guardian.dispatch',
    },
    {
      cmd: 'forge guardian health',
      description: 'Check Guardian connection',
      output: 'health',
      busEvent: 'cli.guardian.health',
    },
    {
      cmd: 'forge idearium health',
      description: 'Check Idearium connection',
      output: 'health',
      busEvent: 'cli.idearium.health',
    },
    // ── Bus ───────────────────────────────────────────────────────
    {
      cmd: 'forge bus emit',
      args: [{ name: 'channel', type: 'string', required: true }],
      opts: [{ name: 'payload', type: 'json', default: '{}' }],
      description: 'Emit a SISO bus event',
      output: 'event',
      busEvent: 'cli.bus.emit',
    },
    {
      cmd: 'forge bus history',
      opts: [{ name: 'n', type: 'number', default: 20 }],
      description: 'Show recent SISO bus events',
      output: 'event[]',
      busEvent: 'cli.bus.history',
    },
    // ── JAA ───────────────────────────────────────────────────────
    {
      cmd: 'forge jaa stats',
      description: 'Show JAA store row counts by table',
      output: 'stats',
      busEvent: 'cli.jaa.stats',
    },
    {
      cmd: 'forge jaa query',
      args: [{ name: 'table', type: 'string', required: true }],
      opts: [{ name: 'limit', type: 'number', default: 20 }],
      description: 'Query a JAA table',
      output: 'row[]',
      busEvent: 'cli.jaa.query',
    },
    {
      cmd: 'forge help',
      description: 'Show all available commands',
      busEvent: 'cli.help',
    },
  ],

  // ── Node type specs for UI form builder ───────────────────────────
  node_types: {
    trigger: {
      label: 'Trigger',
      icon: '⚡',
      color: '#f59e0b',
      fields: [
        { name: 'type', type: 'select', options: ['manual','cron','interval','event','webhook','condition','chain'], default: 'manual' },
        { name: 'expression', type: 'string', label: 'Cron Expression', showIf: 'type === cron', placeholder: '0 * * * *' },
        { name: 'every',      type: 'number',  label: 'Interval (ms)',  showIf: 'type === interval', default: 60000 },
        { name: 'channel',    type: 'string',  label: 'Event Channel',  showIf: 'type === event' },
        { name: 'filter',     type: 'code',    label: 'Filter Condition (SEAM)', showIf: 'type === event', placeholder: 'payload.severity === "high"' },
        { name: 'webhookId',  type: 'string',  label: 'Webhook ID',     showIf: 'type === webhook' },
        { name: 'check',      type: 'code',    label: 'Condition (SEAM)', showIf: 'type === condition' },
        { name: 'checkEvery', type: 'number',  label: 'Poll Interval (ms)', showIf: 'type === condition', default: 5000 },
      ],
    },
    condition: {
      label: 'Condition (IF·WHEN)',
      icon: '⚖',
      color: '#a78bfa',
      fields: [
        { name: 'condition', type: 'code', label: 'SEAM Condition', placeholder: 'payload.score > 0.85' },
      ],
      outputs: [
        { id: 'then', label: 'Then (true)', color: '#22c55e' },
        { id: 'otherwise', label: 'Otherwise (false)', color: '#ef4444' },
      ],
    },
    transform: {
      label: 'Transform (MAKE·SET)',
      icon: '⚙',
      color: '#60a5fa',
      fields: [
        { name: 'input', type: 'string', label: 'Input Path', placeholder: 'trigger.payload' },
        { name: 'map',   type: 'json',   label: 'Field Mapping (JSON)', placeholder: '{"output_key": "{{input.field}}"}' },
      ],
    },
    api_call: {
      label: 'API Call (CALL·STREAM)',
      icon: '🌐',
      color: '#34d399',
      fields: [
        { name: 'url',     type: 'string', label: 'URL', required: true, placeholder: 'https://api.example.com/endpoint' },
        { name: 'method',  type: 'select', options: ['GET','POST','PUT','PATCH','DELETE'], default: 'GET' },
        { name: 'headers', type: 'json',   label: 'Headers (JSON)', placeholder: '{"Authorization": "Bearer {{variables.token}}"}' },
        { name: 'body',    type: 'json',   label: 'Request Body' },
        { name: 'timeout', type: 'number', label: 'Timeout (ms)', default: 30000 },
      ],
    },
    agent_call: {
      label: 'Agent Call (ROUTE·SNR)',
      icon: '🤖',
      color: '#f472b6',
      fields: [
        { name: 'provider', type: 'select', options: ['claude','chatgpt','gemini','deepseek','perplexity','ollama'], default: 'claude' },
        { name: 'prompt',   type: 'textarea', label: 'Prompt', required: true, placeholder: 'Analyze this: {{trigger.payload.data}}' },
        { name: 'timeout',  type: 'number', label: 'Timeout (ms)', default: 90000 },
      ],
    },
    store: {
      label: 'Store (WRITE·READ)',
      icon: '💾',
      color: '#fbbf24',
      fields: [
        { name: 'table',  type: 'string', label: 'JAA Table', required: true, placeholder: 'artifacts' },
        { name: 'record', type: 'json',   label: 'Record (JSON)', placeholder: '{"data": "{{trigger.payload}}"}' },
      ],
    },
    emit: {
      label: 'Emit (EMIT·WATCH)',
      icon: '📡',
      color: '#818cf8',
      fields: [
        { name: 'channel', type: 'string', label: 'Event Channel', required: true, placeholder: 'forge.event.fired' },
        { name: 'payload', type: 'json',   label: 'Payload (JSON)', placeholder: '{"key": "{{trigger.payload.value}}"}' },
      ],
    },
    loop: {
      label: 'Loop (FOR·EACH)',
      icon: '🔄',
      color: '#67e8f9',
      fields: [
        { name: 'over', type: 'string', label: 'Array Path', required: true, placeholder: 'trigger.payload.items' },
        { name: 'as',   type: 'string', label: 'Item Variable', default: 'item' },
      ],
    },
    delay: {
      label: 'Delay (WHILE·UNTIL)',
      icon: '⏱',
      color: '#94a3b8',
      fields: [
        { name: 'ms', type: 'number', label: 'Delay (ms)', required: true, default: 1000 },
      ],
    },
    seam_compile: {
      label: 'SEAM Compile',
      icon: '🔮',
      color: '#c084fc',
      fields: [
        { name: 'source', type: 'textarea', label: 'SEAM Source', required: true, placeholder: 'make score = 0.8\nif score > 0.65:\n  emit "pass" with { score }' },
      ],
    },
    gap: {
      label: 'Gap (GAP·FILL)',
      icon: '◈',
      color: '#f97316',
      fields: [
        { name: 'id',          type: 'string', label: 'Gap ID' },
        { name: 'description', type: 'string', label: 'Description' },
        { name: 'pressure',    type: 'number', label: 'Pressure (0-1)', default: 0.5 },
      ],
    },
    notify: {
      label: 'Notify (SHOW)',
      icon: '🔔',
      color: '#fb923c',
      fields: [
        { name: 'message', type: 'string', label: 'Message', required: true, placeholder: 'Pipeline step: {{system.wall}}' },
        { name: 'level',   type: 'select', options: ['info','success','warn','error'], default: 'info' },
      ],
    },
    merge: {
      label: 'Merge',
      icon: '⊕',
      color: '#64748b',
      fields: [],
    },
    fork: {
      label: 'Fork (Parallel)',
      icon: '⑂',
      color: '#0ea5e9',
      fields: [],
    },
    webhook_out: {
      label: 'Webhook Out',
      icon: '📤',
      color: '#10b981',
      fields: [
        { name: 'url',    type: 'string', label: 'Webhook URL', required: true },
        { name: 'method', type: 'select', options: ['POST','PUT'], default: 'POST' },
        { name: 'payload',type: 'json',   label: 'Payload (JSON)' },
      ],
    },
  },

  // ── Agent providers ──────────────────────────────────────────────
  providers: {
    claude:  { name: 'Claude',  port: 7820, via: 'guardian', icon: '⚡' },
    chatgpt: { name: 'ChatGPT', port: 7820, via: 'guardian', icon: '🤖' },
    gemini:  { name: 'Gemini',  port: 7820, via: 'guardian', icon: '♊' },
    ollama:  { name: 'Ollama',  port: 11434,via: 'direct',   icon: '🦙' },
  },

  // ── Connection endpoints ─────────────────────────────────────────
  endpoints: {
    idearium: { host: '127.0.0.1', port: 4800, protocol: 'http' },
    guardian: { host: '127.0.0.1', port: 7820, protocol: 'http', wss: 7821 },
    nexus:    { host: '127.0.0.1', port: 3748, protocol: 'http' },
  },
};

// ══════════════════════════════════════════════════════════════════════
// CLI RUNNER — executes commands via SISO bus
// ══════════════════════════════════════════════════════════════════════

class ForgeCLI {
  constructor({ bus, jaa, registry, executor, compiler, guardian, idearium, trust, pipelineClass } = {}) {
    this._bus       = bus;
    this._jaa       = jaa;
    this._registry  = registry;
    this._executor  = executor;
    this._compiler  = compiler;
    this._guardian  = guardian;
    this._idearium  = idearium;
    this._trust     = trust;
    this._pipelineClass = pipelineClass || null;
    this._history   = [];
  }

  // ── Parse and execute a command string ───────────────────────────
  async exec(cmdStr, opts = {}) {
    const parts  = cmdStr.trim().split(/\s+/);
    const result = await this._route(parts, opts);
    this._history.push({ cmd: cmdStr, result, ts: Date.now() });
    if (this._history.length > 200) this._history.shift();
    this._bus?.emit('cli.exec.done', { cmd: cmdStr, result });
    return result;
  }

  async _route(parts, opts) {
    const cmd = parts.slice(0, 3).join(' ');
    const args = parts.slice(3);

    // Help
    if (parts[1] === 'help' || parts[0] === 'help') {
      return { type:'help', commands: INTERACTION_CONTRACT.commands.map(c => `  ${c.cmd} — ${c.description}`) };
    }

    // ── Pipeline ────────────────────────────────────────────────
    if (parts[1] === 'pipeline') {
      switch (parts[2]) {
        case 'list':    return { type:'list', items: this._registry?.all().map(p => ({ id:p.id, name:p.name, nodes:p.nodes.size, enabled:p.enabled })) ?? [] };
        case 'create':  {
          const name = args.join(' ') || opts.name || 'New Pipeline';
          const p    = new (this._getPipelineClass())({ name, description: opts.description });
          await this._registry?.save(p);
          return { type:'created', pipeline: p.toJSON() };
        }
        case 'run': {
          const id  = args[0];
          const payload = opts.payload ? JSON.parse(opts.payload) : {};
          const result  = await this._registry?.trigger(id, payload);
          return { type:'run', ...result };
        }
        case 'add-node': {
          const [pid, ntype] = args;
          const p = this._registry?.get(pid);
          if (!p) return { type:'error', error:`Pipeline not found: ${pid}` };
          const config = opts.config ? JSON.parse(opts.config) : {};
          const node = p.addNode({ type: ntype, label: opts.label || ntype, config, x: opts.x ?? 0, y: opts.y ?? 0 });
          await this._registry?.save(p);
          return { type:'added', node };
        }
        case 'connect': {
          const [pid, fromId, toId] = args;
          const p = this._registry?.get(pid);
          if (!p) return { type:'error', error:`Pipeline not found: ${pid}` };
          p.connect(fromId, toId, opts.if ?? null);
          await this._registry?.save(p);
          return { type:'connected', from: fromId, to: toId, condition: opts.if };
        }
        case 'arm':     { this._registry?.arm(args[0]);   return { type:'armed', id: args[0] }; }
        case 'disarm':  { this._registry?.disarm(args[0]);return { type:'disarmed', id: args[0] }; }
        case 'delete':  { await this._registry?.delete(args[0]); return { type:'deleted', id: args[0] }; }
        case 'export':  {
          const p = this._registry?.get(args[0]);
          return p ? { type:'export', json: JSON.stringify(p.toJSON(), null, 2) } : { type:'error', error:'not found' };
        }
        case 'import':  {
          const def = JSON.parse(args.join(' ') || opts.json || '{}');
          const p   = new (this._getPipelineClass())(def);
          await this._registry?.save(p);
          return { type:'imported', id: p.id, name: p.name };
        }
      }
    }

    // ── SEAM ────────────────────────────────────────────────────
    if (parts[1] === 'seam') {
      const source = args.join(' ') || opts.source || '';
      switch (parts[2]) {
        case 'compile': {
          const result = this._compiler?.compile(source);
          return { type:'compile', ...result };
        }
        case 'validate': {
          const wp = this._compiler?.pass0(source);
          return { type:'validate', valid: (wp?.violations?.length ?? 0) === 0, ...wp };
        }
        case 'chunk': {
          const size   = parseInt(opts.size ?? 4000);
          const chunks = _chunkSpec(source, size);
          return { type:'chunks', count: chunks.length, chunks };
        }
      }
    }

    // ── Ideas ────────────────────────────────────────────────────
    if (parts[1] === 'idea') {
      if (!this._idearium) return { type:'error', error:'Idearium not connected' };
      switch (parts[2]) {
        case 'list':   { const r = await this._idearium.ideas(opts); return { type:'list', ideas: r.ideas ?? [] }; }
        case 'create': { const r = await this._idearium.createIdea({ title: args.join(' '), ...opts }); return { type:'created', idea: r.idea }; }
      }
    }

    // ── Gaps ─────────────────────────────────────────────────────
    if (parts[1] === 'gap') {
      if (!this._idearium) return { type:'error', error:'Idearium not connected' };
      switch (parts[2]) {
        case 'list':   { const r = await this._idearium.gaps(opts); return { type:'list', gaps: r.gaps ?? [] }; }
        case 'create': { const r = await this._idearium.createGap({ title: args.join(' '), ...opts }); return { type:'created', gap: r.gap }; }
        case 'resolve':{ const r = await this._idearium.resolveGap(args[0], args.slice(1).join(' ')); return { type:'resolved', ...r }; }
      }
    }

    // ── Snapshot ─────────────────────────────────────────────────
    if (parts[1] === 'snapshot' && parts[2] === 'create') {
      if (!this._idearium) return { type:'error', error:'Idearium not connected' };
      const r = await this._idearium.snapshot(opts.message ?? '', opts.causedBy ?? '');
      return { type:'snapshot', snapshot: r.snapshot };
    }

    // ── Trust ────────────────────────────────────────────────────
    if (parts[1] === 'trust') {
      switch (parts[2]) {
        case 'list':   return { type:'list', scores: this._trust?.all() ?? [] };
        case 'record': {
          const passed = opts.passed !== 'false';
          const trust  = await this._trust?.record(args[0], passed);
          return { type:'recorded', trust };
        }
      }
    }

    // ── Guardian ─────────────────────────────────────────────────
    if (parts[1] === 'guardian') {
      switch (parts[2]) {
        case 'health': {
          const h = await this._guardian?.health?.().catch(() => null);
          return { type:'health', connected: !!h, ...h };
        }
        case 'dispatch': {
          const [provider, ...promptParts] = args;
          const text = await this._guardian?.dispatch(provider, promptParts.join(' '), { timeout: opts.timeout });
          return { type:'response', content: text };
        }
      }
    }

    // ── Idearium health ──────────────────────────────────────────
    if (parts[1] === 'idearium' && parts[2] === 'health') {
      const h = await this._idearium?.health?.().catch(() => null);
      return { type:'health', connected: !!h, ...h };
    }

    // ── Bus ──────────────────────────────────────────────────────
    if (parts[1] === 'bus') {
      switch (parts[2]) {
        case 'emit': {
          const payload = opts.payload ? JSON.parse(opts.payload) : {};
          const ev = this._bus?.emit(args[0], payload);
          return { type:'emitted', event: ev };
        }
        case 'history': {
          const sample = this._bus?.sample?.();
          return { type:'history', events: sample?.history?.slice(-(opts.n ?? 20)) ?? [] };
        }
      }
    }

    // ── JAA ──────────────────────────────────────────────────────
    if (parts[1] === 'jaa') {
      switch (parts[2]) {
        case 'stats': return { type:'stats', stats: this._jaa?.stats() ?? {} };
        case 'query': {
          const rows = this._jaa?.tail(args[0], parseInt(opts.limit ?? '20')) ?? [];
          return { type:'rows', table: args[0], rows };
        }
      }
    }

    return { type:'error', error:`Unknown command: ${parts.join(' ')}. Try: forge help` };
  }

  _getPipelineClass() {
    // §FIXED 2026-07-06 — this only checked a bare global and
    // window.Pipeline, i.e. browser-only. In Node, "forge pipeline
    // create" could never have worked — found by the first real
    // end-to-end test the moment cockpit/live.js became the first-ever
    // composition of this class. Injectable dep first, old lookups kept.
    if (this._pipelineClass) return this._pipelineClass;
    if (typeof Pipeline !== 'undefined') return Pipeline;
    if (typeof window !== 'undefined' && window.Pipeline) return window.Pipeline;
    throw new Error('Pipeline class not loaded');
  }

  get history() { return [...this._history]; }
  get contract() { return INTERACTION_CONTRACT; }
}

// ── SEAM spec chunker (from seam-spec-chunker.html logic) ───────────
function _chunkSpec(text, maxSize = 4000) {
  const lines  = text.split('\n');
  const chunks = [];
  let   cur    = [];
  let   size   = 0;

  for (const line of lines) {
    const ls = line.length + 1;
    if (size + ls > maxSize && cur.length) {
      chunks.push({ index: chunks.length, content: cur.join('\n'), size });
      cur = []; size = 0;
    }
    cur.push(line); size += ls;
  }
  if (cur.length) chunks.push({ index: chunks.length, content: cur.join('\n'), size });

  return chunks.map((c, i) => ({
    ...c,
    title:    _chunkTitle(c.content),
    total:    chunks.length,
    status:   'pending',
    verified: false,
    tests:    _extractTests(c.content),
  }));
}

function _chunkTitle(content) {
  const lines = content.split('\n').filter(l => l.trim());
  for (const l of lines) {
    const m = l.match(/^#{1,4}\s+(.+)/) || l.match(/^[A-Z][^#\n]{3,60}$/) || l.match(/^(\w+):/);
    if (m) return m[1].slice(0, 60);
  }
  return lines[0]?.slice(0, 60) ?? 'Chunk';
}

function _extractTests(content) {
  const tests = [];
  const lines = content.split('\n');
  for (const l of lines) {
    if (/test:|verify:|check:|assert:|invariant:/i.test(l)) {
      tests.push({ label: l.trim().slice(0, 80), done: false });
    }
  }
  return tests;
}

// ── Exports ──────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ForgeCLI, INTERACTION_CONTRACT, _chunkSpec, _chunkTitle };
} else if (typeof window !== 'undefined') {
  Object.assign(window, { ForgeCLI, INTERACTION_CONTRACT, _chunkSpec, _chunkTitle });
}
