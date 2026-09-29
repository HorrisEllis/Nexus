#!/usr/bin/env node
'use strict';
/**
 * cli/nodes.js — every system's nodes from the command line (0.39.271 X1).
 * UUID: nexus-cli-nodes-v1-0000-2026-0927-jamesbrooks-001
 *
 *   node cli/nodes.js sync [--dry] [--only guardian,idearium]   regenerate (lib/system-nodes.js)
 *   node cli/nodes.js index                                     counts per type, per system
 *   node cli/nodes.js list <type> [--system x] [--q text]       one type across systems
 *   node cli/nodes.js get <type> <id> [--system x]              one node's envelope
 *   node cli/nodes.js drift                                     commands declared but not served, and served but not declared
 */
const SN = require('../lib/system-nodes.js');
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(`--${k}`); return i === -1 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const cmd = argv[0] || 'index';

if (cmd === 'sync') {
  const only = typeof flag('only') === 'string' ? flag('only').split(',') : null;
  const r = SN.sync({ only, dryRun: !!flag('dry') });
  for (const [k, v] of Object.entries(r.systems)) console.log(`${k.padEnd(14)} ${String(v.written).padStart(4)} written ${String(v.unchanged).padStart(4)} unchanged ${String(v.archived).padStart(3)} archived · ${v.capabilities} capabilities · ${v.commands} commands${v.declaredNotServed ? ` · ${v.declaredNotServed} declared-not-served` : ''}`);
  if (r.guardian) console.log(`${'hats+agents'.padEnd(14)} ${String(r.guardian.written).padStart(4)} written ${String(r.guardian.unchanged).padStart(4)} unchanged`);
  for (const e of r.errors) console.error(`✗ ${e}`);
  console.log(`${flag('dry') ? '(dry run) ' : ''}${r.ms}ms`);
  process.exit(r.ok ? 0 : 1);
} else if (cmd === 'index') {
  const r = SN.index();
  for (const [t, n] of Object.entries(r.types).sort()) console.log(`${t.padEnd(20)} ${n}`);
  console.log('');
  for (const [s, types] of Object.entries(r.systems)) console.log(`${s.padEnd(14)} ${Object.entries(types).map(([t, n]) => `${t} ${n}`).join(' · ')}`);
} else if (cmd === 'list' && argv[1]) {
  for (const n of SN.list({ type: argv[1], system: typeof flag('system') === 'string' ? flag('system') : null, q: typeof flag('q') === 'string' ? flag('q') : null, limit: 5000 })) {
    console.log(`${n.system.padEnd(14)} ${n.id}${n.method ? `  ${n.method} ${n.path}${n.declared === false ? '  [not declared]' : ''}${n.served === false ? '  [NOT SERVED]' : ''}` : ''}`);
  }
} else if (cmd === 'get' && argv[2]) {
  const n = SN.get(argv[1], argv[2], { system: typeof flag('system') === 'string' ? flag('system') : null });
  if (!n) { console.error(`no ${argv[1]} node ${argv[2]}`); process.exit(1); }
  console.log(JSON.stringify(n, null, 2));
} else if (cmd === 'drift') {
  for (const s of SN.systems()) {
    const cmds = SN.plan(s.dir).filter(n => n.type === 'command');
    const dns = cmds.filter(n => n.payload.declared && n.payload.served === false);
    const snd = cmds.filter(n => !n.payload.declared && n.payload.served === true);
    if (!dns.length && !snd.length) continue;
    console.log(`\n${s.dir}`);
    for (const n of dns) console.log(`  declared, NOT served   ${n.payload.method} ${n.payload.path}`);
    for (const n of snd) console.log(`  served, not declared   ${n.payload.method} ${n.payload.path}`);
  }
} else {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(3, 11).map(l => l.replace(/^ \* ?/, '')).join('\n'));
}
