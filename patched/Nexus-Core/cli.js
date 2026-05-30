#!/usr/bin/env node
// ═══════════════════════════════════════════════════
// NEXUS — CLI
// cli.js
//
// Dynamic grammar — commands registered by plugins.
// Every command emits an event on the bus.
// No hardcoded command list.
//
// Usage:
//   nexus <command.path> [args] [--flags]
//   nexus manifest.generate "build me an auth API"
//   nexus gate.run target=auth
//   nexus raid.decide --task code --tokens 3000
//   nexus agent.ping ollama
//   nexus rewind --tick 847
//   nexus status
//   nexus help
// ═══════════════════════════════════════════════════

'use strict';

const readline = require('readline');

// Boot — wires all modules
const nexus = require('./boot');
const { kernel }           = nexus;
const { translationLayer } = require('./core/translation');
const { generator }        = require('./core/manifest');
const { raid }             = require('./core/raid');
const { usage }            = require('./core/usage');
const { gapHunter }        = require('./gate/gap-finder');
const { pingAll }          = require('./agents');

// ── Dynamic Grammar Registry ──────────────────────
// Commands registered here — by core and by plugins.
// path:    dot-namespaced  e.g. 'gate.run'
// args:    positional arg names
// flags:   optional named flags
// emits:   event types this command produces
// handler: async function (args, flags, raw) → void

const grammar = new Map();

function register(cmd) {
  grammar.set(cmd.path, cmd);
}

// ── Core commands ──────────────────────────────────

register({
  path:    'manifest.generate',
  args:    ['input'],
  flags:   ['--session', '--no-clarify'],
  emits:   ['translation.started', 'manifest.generating', 'manifest.ready'],
  help:    'Generate a build manifest from natural language.',
  example: 'nexus manifest.generate "build a JWT auth API with PostgreSQL"',
  async handler(args, flags) {
    const input = args.join(' ');
    if (!input) { print.err('Input required.'); return; }

    const sessionId = flags['--session'] || 'cli-default';
    print.info(`Translating intent… (session: ${sessionId})`);

    // Translation layer first
    const ir = await translationLayer.translate(input, { sessionId });

    print.score('Alignment score', ir.alignmentScore);

    if (ir.needsClarification.length && !flags['--no-clarify']) {
      print.warn(`${ir.needsClarification.length} ambiguous term(s) detected:`);
      const clarifications = translationLayer.getClarifications(ir);
      for (const c of clarifications) {
        print.question(c.question);
        const answer = await prompt(`  → `);
        if (answer.trim()) {
          translationLayer.applyClarification(ir, [{ path: c.path, value: answer.trim() }]);
        }
      }
      print.score('Alignment score after clarification', ir.alignmentScore);
    }

    print.info('Generating manifest…');
    try {
      const manifest = await generator.generate(input, { context: ir.sessionCtx, requestEventId: null });
      print.ok(`Manifest ready: ${manifest.id} · ${manifest.nodes?.length} nodes`);
      print.json(manifest);
    } catch (e) {
      print.err(`Manifest failed: ${e.message}`);
    }
  },
});

register({
  path:    'gate.run',
  args:    ['target'],
  flags:   ['--manifest', '--depth'],
  emits:   ['gate.running', 'gate.passed', 'gate.failed'],
  help:    'Run gate verification on a target node or manifest.',
  example: 'nexus gate.run auth --manifest mf-123',
  async handler(args, flags) {
    const target     = args[0] || 'all';
    const manifestId = flags['--manifest'];
    print.info(`Running gates on: ${target}${manifestId ? ` (manifest: ${manifestId})` : ''}`);
    kernel.emit('gate.running', { target, manifestId, source: 'cli' });
    print.ok('Gate events emitted on bus — watch admin panel for results.');
  },
});

register({
  path:    'raid.decide',
  args:    [],
  flags:   ['--task', '--tokens', '--context'],
  emits:   ['raid.deciding', 'raid.routed'],
  help:    'Ask RAID to route a task. Shows decision + fallback chain.',
  example: 'nexus raid.decide --task code --tokens 3000',
  async handler(args, flags) {
    const task   = flags['--task']    || 'code';
    const tokens = parseInt(flags['--tokens'] || '2000');
    print.info(`RAID deciding: task=${task} tokens=${tokens}`);
    try {
      const decision = await raid.decide({ type: task, tokens });
      print.ok(`Routed to: ${decision.agent}`);
      print.kv('Reason',         decision.reason);
      print.kv('Fallback chain', decision.fallbackChain.join(' → '));
      print.kv('Signature',      `successRate=${(decision.signature.core.successRate * 100).toFixed(0)}% drift=${decision.signature.drift.magnitude.toFixed(3)}`);
    } catch (e) {
      print.err(`RAID failed: ${e.message}`);
    }
  },
});

register({
  path:    'agent.ping',
  args:    ['agent'],
  flags:   [],
  emits:   ['agent.*.connected', 'agent.*.disconnected'],
  help:    'Ping an agent or all agents.',
  example: 'nexus agent.ping ollama',
  async handler(args) {
    const target = args[0] || 'all';
    if (target === 'all') {
      print.info('Pinging all agents…');
      const results = await pingAll();
      for (const [id, ok] of Object.entries(results)) {
        ok ? print.ok(`${id}: online`) : print.warn(`${id}: offline`);
      }
    } else {
      const { getAgent } = require('./agents');
      try {
        const agent = getAgent(target);
        const ok    = await agent.ping();
        ok ? print.ok(`${target}: online`) : print.warn(`${target}: offline`);
      } catch (e) { print.err(e.message); }
    }
  },
});

register({
  path:    'usage.status',
  args:    ['agent'],
  flags:   [],
  emits:   [],
  help:    'Show current usage status for all agents.',
  example: 'nexus usage.status',
  async handler(args) {
    const all = usage.all();
    const cols = ['agent','percent','tier','trend','resetIn'];
    printTable(Object.entries(all).map(([id,s]) => ({
      agent:   id,
      percent: `${s.percent}%`,
      tier:    s.tier,
      trend:   s.trend,
      resetIn: s.msUntilReset ? `${Math.round(s.msUntilReset/60000)}m` : '—',
    })), cols);
  },
});

register({
  path:    'rewind',
  args:    [],
  flags:   ['--tick', '--stream', '--fork'],
  emits:   ['admin.rewind.seek'],
  help:    'Rewind event log to a tick. --fork to re-run from that point.',
  example: 'nexus rewind --tick 847',
  async handler(args, flags) {
    const tick   = parseInt(flags['--tick'] || '0');
    const stream = flags['--stream'];
    const fork   = '--fork' in flags;
    print.info(`Rewinding to tick ${tick}${stream ? ` (stream: ${stream})` : ''}${fork ? ' [fork mode]' : ''}…`);
    const entries = stream
      ? kernel.log.byStream(parseInt(stream)).filter(e => e.tick <= tick)
      : kernel.log.upTo(tick);
    print.kv('Events in range', entries.length);
    entries.slice(-10).forEach(e => print.event(e));
    if (fork) {
      kernel.emit('admin.rewind.fork', { tick, streamId: stream ? parseInt(stream) : null });
      print.ok('Fork event emitted — pipeline will re-run from this point.');
    }
  },
});

register({
  path:    'translate',
  args:    ['input'],
  flags:   ['--session', '--json'],
  emits:   ['translation.started', 'translation.complete'],
  help:    'Run the translation layer on input and show the IR.',
  example: 'nexus translate "fast auth system"',
  async handler(args, flags) {
    const input = args.join(' ');
    if (!input) { print.err('Input required.'); return; }
    const ir = await translationLayer.translate(input, { sessionId: flags['--session'] || 'cli' });
    if (flags['--json']) { print.json(ir); return; }
    print.section('Intent IR');
    print.kv('Domain',           ir.normalized.domain);
    print.kv('Alignment score',  `${(ir.alignmentScore * 100).toFixed(0)}%`);
    print.kv('Confident terms',  ir.confident.join(', ') || 'none');
    print.kv('Ambiguous terms',  ir.ambiguous.join(', ') || 'none');
    print.kv('Implied deps',     ir.impliedDeps.join(', ') || 'none');
    if (ir.gaps.length) {
      print.section('Gaps');
      ir.gaps.forEach(g => print.gap(g));
    }
    if (ir.needsClarification.length) {
      print.section('Needs clarification');
      translationLayer.getClarifications(ir).forEach(c => print.question(c.question));
    }
  },
});

register({
  path:    'gap.scan',
  args:    ['target'],
  flags:   ['--manifest'],
  emits:   ['gap.found', 'gap_hunter.complete'],
  help:    'Run GapHunter on a manifest or code file.',
  example: 'nexus gap.scan --manifest mf-123',
  async handler(args, flags) {
    print.info('GapHunter scanning…');
    kernel.emit('gap_hunter.scanning', { source: 'cli', target: args[0] });
    print.ok('Gap scan triggered — results on bus.');
  },
});

register({
  path:    'status',
  args:    [],
  flags:   [],
  emits:   [],
  help:    'Show system status: bus, agents, usage.',
  example: 'nexus status',
  async handler() {
    print.section('NEXUS Status');
    print.kv('Bus events',    kernel.log.entries.length);
    print.kv('Bus tick',      kernel.ring.at(-1)?.tick || 0);
    print.kv('Ring buffer',   kernel.ring.length);
    print.kv('Laws',          'I · II · III · IV');
    print.section('Agents');
    const results = await pingAll();
    Object.entries(results).forEach(([id,ok]) =>
      print.kv(id, ok ? '● online' : '○ offline')
    );
    print.section('Usage');
    Object.entries(usage.all()).forEach(([id,s]) =>
      print.kv(id, `${s.percent}% (${s.tier})`)
    );
  },
});

register({
  path:    'events.tail',
  args:    [],
  flags:   ['--n', '--filter'],
  emits:   [],
  help:    'Tail the last N events from the bus.',
  example: 'nexus events.tail --n 20 --filter gate',
  async handler(args, flags) {
    const n      = parseInt(flags['--n'] || '20');
    const filter = flags['--filter'];
    const entries = kernel.log.entries
      .filter(e => !filter || e.type.includes(filter))
      .slice(-n);
    print.section(`Last ${n} events${filter ? ` (filter: ${filter})` : ''}`);
    entries.forEach(e => print.event(e));
  },
});

register({
  path:    'plugin.register',
  args:    ['path'],
  flags:   [],
  emits:   ['plugin.registered'],
  help:    'Register a plugin from a directory path.',
  example: 'nexus plugin.register ./plugins/my-plugin',
  async handler(args) {
    const pluginPath = args[0];
    if (!pluginPath) { print.err('Plugin path required.'); return; }
    try {
      const plugin = require(require('path').resolve(pluginPath));
      if (plugin.commands) {
        plugin.commands.forEach(cmd => {
          register({ ...cmd, source: plugin.name });
          print.ok(`Registered command: ${cmd.path}`);
        });
      }
      plugin.init?.(kernel, {});
      kernel.emit('plugin.registered', { name: plugin.name, uuid: plugin.uuid });
      print.ok(`Plugin registered: ${plugin.name}`);
    } catch (e) {
      print.err(`Plugin load failed: ${e.message}`);
    }
  },
});

// ── Help ──────────────────────────────────────────
// ── version ───────────────────────────────────────────────────────────────────
register({
  path:    'version',
  args:    [],
  flags:   ['--bump', '--set'],
  emits:   ['nexus.version.read', 'nexus.version.bumped'],
  help:    'Show NEXUS version. --bump minor|patch|major to increment. --set X.Y.Z to set.',
  example: 'nexus version\nnexus version --bump minor\nnexus version --set 2.1.0',
  async handler(args, flags) {
    const fs  = require('fs');
    const pkg = require('./package.json');
    let   ver = pkg.version || '1.0.0';

    if (flags['--set']) {
      const next = flags['--set'];
      if (!/^\d+\.\d+\.\d+$/.test(next)) { print.err(`Invalid version format: ${next} — use X.Y.Z`); return; }
      pkg.version = next;
      fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
      kernel.emit('nexus.version.bumped', { from: ver, to: next, method: 'set' });
      print.ok(`Version set: ${ver} → ${next}`);
      return;
    }

    if (flags['--bump']) {
      const part = flags['--bump'];
      if (!['major','minor','patch'].includes(part)) { print.err(`Unknown bump: ${part} — use major|minor|patch`); return; }
      const [ma, mi, pa] = ver.split('.').map(Number);
      const next = part === 'major' ? `${ma+1}.0.0`
                 : part === 'minor' ? `${ma}.${mi+1}.0`
                 :                    `${ma}.${mi}.${pa+1}`;
      pkg.version = next;
      fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
      kernel.emit('nexus.version.bumped', { from: ver, to: next, method: 'bump', part });
      print.ok(`Version bumped (${part}): ${ver} → ${next}`);
      return;
    }

    print.section('NEXUS Version');
    print.kv('Package',  ver);
    print.kv('Kernel',   '2.0.0');
    print.kv('Protocol', 'CFR + CESL + RAT + SSE');
    print.kv('Built',    pkg.buildDate || 'unknown');
    kernel.emit('nexus.version.read', { version: ver });
  },
});

// ── reboot ────────────────────────────────────────────────────────────────────
register({
  path:    'reboot',
  args:    [],
  flags:   ['--hard', '--reason'],
  emits:   ['nexus.reboot.requested'],
  help:    'Gracefully restart NEXUS. --hard to force-exit without cleanup.',
  example: 'nexus reboot\nnexus reboot --hard --reason "config change"',
  async handler(args, flags) {
    const hard   = '--hard' in flags;
    const reason = flags['--reason'] || 'manual reboot';
    print.warn(`Rebooting NEXUS${hard ? ' (hard)' : ' (graceful)'}… reason: ${reason}`);
    kernel.emit('nexus.reboot.requested', { hard, reason, tick: kernel.ring.at(-1)?.tick || 0 });
    // Give SSE clients a moment to receive the event
    await new Promise(r => setTimeout(r, 400));
    if (hard) {
      print.warn('Hard exit.');
      process.exit(0);
    }
    // Graceful: flush pending writes, then exit (supervisor/pm2 will restart)
    print.info('Flushing… (supervisor will restart)');
    await new Promise(r => setTimeout(r, 800));
    process.exit(0);
  },
});

// ── modules ───────────────────────────────────────────────────────────────────
register({
  path:    'modules',
  args:    [],
  flags:   ['--json'],
  emits:   [],
  help:    'List all registered modules and plugins with status.',
  example: 'nexus modules',
  async handler(args, flags) {
    const { grammar } = require('./cli');
    const namespaces  = {};
    for (const [path, cmd] of grammar.entries()) {
      const ns = path.split('.')[0];
      if (!namespaces[ns]) namespaces[ns] = [];
      namespaces[ns].push(path);
    }
    if (flags['--json']) { print.json(namespaces); return; }
    print.section('Registered Modules');
    for (const [ns, cmds] of Object.entries(namespaces)) {
      print.kv(ns, cmds.join('  '));
    }
    print.kv('Total commands', grammar.size);
  },
});

// ── rewind.module ─────────────────────────────────────────────────────────────
register({
  path:    'rewind.module',
  args:    ['module'],
  flags:   ['--tick', '--show', '--validate'],
  emits:   ['admin.rewind.module.seek', 'admin.rewind.module.fork'],
  help:    'Rewind a specific module to a tick. Shows its event slice and validates against schema.',
  example: 'nexus rewind.module gate --tick 120\nnexus rewind.module raid --tick 80 --validate',
  async handler(args, flags) {
    const module   = args[0];
    const tick     = parseInt(flags['--tick'] || '0');
    const validate = '--validate' in flags;
    const show     = '--show' in flags;

    if (!module) { print.err('Module name required. e.g. nexus rewind.module gate --tick 120'); return; }

    // Module → event prefix map (canonical)
    const MODULE_PREFIXES = {
      manifest:    ['manifest.', 'translation.'],
      raid:        ['raid.'],
      gate:        ['gate.', 'gap.'],
      healer:      ['healer.'],
      agent:       ['agent.', 'ollama.'],
      guardian:    ['guardian.'],
      crystalball: ['crystalball.'],
      memory:      ['memory.', 'stream.'],
      automation:  ['automation.'],
      translation: ['translation.'],
      index:       ['index.'],
    };

    const prefixes = MODULE_PREFIXES[module];
    if (!prefixes) {
      print.err(`Unknown module: ${module}`);
      print.info(`Known modules: ${Object.keys(MODULE_PREFIXES).join(', ')}`);
      return;
    }

    // Filter ring events for this module up to tick
    const events = kernel.ring.filter(e =>
      e.tick <= tick && prefixes.some(p => e.type.startsWith(p))
    );

    print.section(`Rewind — ${module} — tick ≤${tick}`);
    print.kv('Events found', events.length);
    print.kv('Module prefixes', prefixes.join(', '));

    if (!events.length) {
      print.warn(`No ${module} events in ring up to tick ${tick}.`);
      kernel.emit('admin.rewind.module.seek', { module, tick, found: 0, prefixes });
      return;
    }

    // Show event slice
    const shown = show ? events : events.slice(-10);
    shown.forEach(e => print.event(e));
    if (!show && events.length > 10) print.info(`… ${events.length - 10} earlier events omitted (--show for all)`);

    // Validate against module schema if requested
    if (validate) {
      print.section('Schema Validation');
      let schemaPath;
      try {
        schemaPath = `./schemas/${module}.schema.json`;
        const schema  = require(schemaPath);
        const Ajv     = require('ajv');
        const ajv     = new Ajv({ allErrors: true });
        const validate_fn = ajv.compile(schema);
        let passed = 0, failed = 0;
        for (const ev of events) {
          const ok = validate_fn(ev.payload || {});
          if (ok) { passed++; }
          else { failed++; print.err(`tick:${ev.tick} ${ev.type} — ${ajv.errorsText(validate_fn.errors)}`); }
        }
        print.kv('Passed', passed);
        print.kv('Failed', failed);
        if (!failed) print.ok('All events valid against schema.');
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') {
          print.warn(`No schema found at ${schemaPath} — skipping validation.`);
          print.info('Add a schema to schemas/ to enable validation.');
        } else {
          print.err(`Schema validation error: ${e.message}`);
        }
      }
    }

    kernel.emit('admin.rewind.module.seek', { module, tick, found: events.length, prefixes });
    print.ok(`Rewind complete. Emit admin.rewind.module.fork to re-run from tick ${tick}.`);
  },
});

// ── schema.validate ───────────────────────────────────────────────────────────
register({
  path:    'schema.validate',
  args:    ['schema', 'data'],
  flags:   ['--file', '--event-type'],
  emits:   ['schema.validated', 'schema.violation'],
  help:    'Validate data or ring events against a named schema. §1.2 — loud on failure.',
  example: 'nexus schema.validate manifest --event-type manifest.ready\nnexus schema.validate gap --file ./data/gap.json',
  async handler(args, flags) {
    const schemaName = args[0];
    if (!schemaName) { print.err('Schema name required.'); return; }

    let data;
    if (flags['--file']) {
      const fs = require('fs');
      try { data = JSON.parse(fs.readFileSync(flags['--file'], 'utf8')); }
      catch (e) { print.err(`Cannot read file: ${e.message}`); return; }
    } else if (flags['--event-type']) {
      const evType = flags['--event-type'];
      const events = kernel.ring.filter(e => e.type === evType);
      if (!events.length) { print.err(`No events of type '${evType}' in ring.`); return; }
      data = events.map(e => e.payload || {});
      print.info(`Found ${events.length} events of type '${evType}'`);
    } else {
      print.err('Provide --file or --event-type'); return;
    }

    let schema;
    try { schema = require(`./schemas/${schemaName}.schema.json`); }
    catch { print.err(`Schema not found: schemas/${schemaName}.schema.json`); return; }

    const Ajv      = require('ajv');
    const ajv      = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const items    = Array.isArray(data) ? data : [data];
    let passed = 0, failed = 0;

    items.forEach((item, i) => {
      const ok = validate(item);
      if (ok) { passed++; }
      else {
        failed++;
        print.err(`Item ${i}: ${ajv.errorsText(validate.errors)}`);
        kernel.emit('schema.violation', { schema: schemaName, item: i, errors: validate.errors });
      }
    });

    print.section('Schema Validation Result');
    print.kv('Schema',  schemaName);
    print.kv('Passed',  passed);
    print.kv('Failed',  failed);
    if (!failed) {
      print.ok('All items valid.');
      kernel.emit('schema.validated', { schema: schemaName, count: passed });
    } else {
      print.err(`${failed} violation(s). §1.2 — fix before shipping.`);
    }
  },
});

// ── log.export ────────────────────────────────────────────────────────────────
register({
  path:    'log.export',
  args:    [],
  flags:   ['--filter', '--from', '--to', '--file', '--format'],
  emits:   ['nexus.log.exported'],
  help:    'Export event log to file. --filter by type prefix. --from/--to by tick. --format json|jsonl.',
  example: 'nexus log.export --filter gate --file ./exports/gate-log.jsonl --format jsonl',
  async handler(args, flags) {
    const fs     = require('fs');
    const filter = flags['--filter'];
    const from   = parseInt(flags['--from'] || '0');
    const to     = parseInt(flags['--to']   || String(Infinity));
    const file   = flags['--file'];
    const fmt    = flags['--format'] || 'jsonl';

    let events = kernel.ring
      .filter(e => e.tick >= from && e.tick <= to)
      .filter(e => !filter || e.type.startsWith(filter));

    print.kv('Events matched', events.length);

    if (!file) {
      events.slice(-20).forEach(e => print.event(e));
      if (events.length > 20) print.info(`… ${events.length - 20} more. Use --file to export all.`);
      return;
    }

    const output = fmt === 'jsonl'
      ? events.map(e => JSON.stringify(e)).join('
')
      : JSON.stringify(events, null, 2);

    fs.writeFileSync(file, output);
    print.ok(`Exported ${events.length} events → ${file} (${fmt})`);
    kernel.emit('nexus.log.exported', { file, count: events.length, filter, fmt });
  },
});

register({
  path:    'help',
  args:    ['command'],
  flags:   [],
  emits:   [],
  help:    'Show help for all commands or a specific command.',
  example: 'nexus help manifest.generate',
  async handler(args) {
    const target = args[0];
    if (target) {
      const cmd = grammar.get(target);
      if (!cmd) { print.err(`Unknown command: ${target}`); return; }
      print.section(cmd.path);
      print.kv('Help',    cmd.help);
      print.kv('Example', cmd.example);
      print.kv('Emits',   (cmd.emits || []).join(', '));
      return;
    }
    print.section('NEXUS Commands');
    for (const [path, cmd] of grammar) {
      console.log(`  ${CYAN}${path.padEnd(28)}${RESET} ${cmd.help}`);
    }
    console.log(`\n  ${DIM}nexus help <command> for details${RESET}`);
  },
});

// ── REPL mode ─────────────────────────────────────
async function repl() {
  // Wait for system.booted before opening stdin.
  // Boot is async; opening readline before it completes swallows stdin.
  await new Promise(resolve => {
    // Kernel may already be booted (synchronous path)
    if (kernel._booted) return resolve();
    // Prefer once() if available
    if (typeof kernel.once === 'function') {
      kernel.once('system.booted', resolve);
    } else {
      const handler = () => { kernel.off?.('system.booted', handler); resolve(); };
      kernel.on('system.booted', handler);
    }
    // Safety fallback — resolve after 4s regardless
    setTimeout(resolve, 4000);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n${CYAN}NEXUS${RESET} ready — type a command or 'exit'\n`);
  rl.setPrompt(`${CYAN}nexus>${RESET} `);
  rl.prompt();
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === 'exit' || trimmed === 'quit') { rl.close(); process.exit(0); }
    await dispatch(trimmed.split(/\s+/));
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
}

// ── Dispatch ──────────────────────────────────────
async function dispatch(argv) {
  if (!argv.length) { await grammar.get('help').handler([], {}); return; }

  const commandPath = argv[0];
  const rawArgs     = argv.slice(1);

  const cmd = grammar.get(commandPath);
  if (!cmd) {
    // Fuzzy match
    const fuzzy = [...grammar.keys()].filter(k => k.includes(commandPath));
    if (fuzzy.length === 1) {
      print.warn(`Did you mean: ${fuzzy[0]}?`);
      return dispatch([fuzzy[0], ...rawArgs]);
    }
    if (fuzzy.length > 1) {
      print.warn(`Ambiguous command. Did you mean one of:`);
      fuzzy.forEach(f => console.log(`  ${f}`));
      return;
    }
    print.err(`Unknown command: ${commandPath}`);
    print.info('Run "nexus help" to see all commands.');
    return;
  }

  // Parse flags and positional args
  const flags  = {};
  const args   = [];
  for (const arg of rawArgs) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.split('=');
      flags[k] = v || true;
    } else {
      args.push(arg);
    }
  }

  kernel.emit('cli.command', { path: commandPath, args, flags });

  try {
    await cmd.handler(args, flags, rawArgs);
  } catch (e) {
    print.err(`Command failed: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
  }
}

// ── Prompt helper ─────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

// ── Print helpers ─────────────────────────────────
const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m',
      CYAN  = '\x1b[36m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      RED   = '\x1b[31m', MAGENTA = '\x1b[35m';

const print = {
  ok:      (msg)       => console.log(`${GREEN}✓${RESET} ${msg}`),
  err:     (msg)       => console.error(`${RED}✗${RESET} ${msg}`),
  warn:    (msg)       => console.warn(`${YELLOW}⚠${RESET} ${msg}`),
  info:    (msg)       => console.log(`${CYAN}→${RESET} ${msg}`),
  section: (title)     => console.log(`\n${BOLD}${title}${RESET}\n${'─'.repeat(40)}`),
  kv:      (k, v)      => console.log(`  ${DIM}${k.padEnd(20)}${RESET} ${v}`),
  question:(q)         => console.log(`  ${YELLOW}?${RESET} ${q}`),
  json:    (obj)       => console.log(JSON.stringify(obj, null, 2)),
  score:   (label, s)  => {
    const pct = Math.round(s * 100);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct/5));
    const color = pct > 75 ? GREEN : pct > 50 ? YELLOW : RED;
    console.log(`  ${DIM}${label.padEnd(20)}${RESET} ${color}${bar}${RESET} ${pct}%`);
  },
  gap:     (g)         => console.log(`  ${RED}[${g.type}]${RESET} ${DIM}${g.path}${RESET}\n    ${g.body}`),
  event:   (e)         => console.log(`  ${DIM}t:${String(e.tick).padStart(5)}${RESET} ${CYAN}${e.type}${RESET} ${DIM}s:${e.streamId}${RESET}`),
};

function printTable(rows, cols) {
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] || '').length)));
  const header = cols.map((c,i) => c.padEnd(widths[i])).join('  ');
  const sep    = widths.map(w => '─'.repeat(w)).join('  ');
  console.log(`\n${BOLD}${header}${RESET}\n${DIM}${sep}${RESET}`);
  rows.forEach(r => console.log(cols.map((c,i) => String(r[c] || '').padEnd(widths[i])).join('  ')));
}

// ── Entry point ───────────────────────────────────
const argv = process.argv.slice(2);

if (!argv.length || argv[0] === '--repl' || argv[0] === '-i') {
  repl();
} else {
  dispatch(argv).then(() => {
    // Give bus time to flush events, then exit
    setTimeout(() => process.exit(0), 1500);
  });
}

// Export grammar for plugin registration
module.exports = { register, grammar, dispatch };
