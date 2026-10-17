#!/usr/bin/env node
'use strict';
// diagnostic/cli.js — diagnostic's commands (genesis 1.5.0's cli.js): every capability its registry declares, run against its
// own running service through the route the registry names. James, 2026-10-17: "the diagnostic needs to be a real system
// matching genasis."
//
//   node diagnostic/cli.js                     list the commands (from registry-components.js)
//   node diagnostic/cli.js <command> [--k v]   run one: its route, on diagnostic's port (config.js); :params come from --k
//   node diagnostic/cli.js status|gaps|audit   the service's own verbs (nexus-diagnostic.js), unchanged
const http = require('http');
const registry = require('./registry-components.js');
const config = require('./config.js').load();

const SERVICE_VERBS = new Set(['status', 'stop', 'gaps', 'audit']);

function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  return out;
}
function commandFor(name) { return registry.find(r => r.name === name || r.id === name || r.id === `diagnostic.${name}`) || null; }

function call(row, args) {
  const params = {};
  const p = row.route.path.replace(/:([A-Za-z_]\w*)/g, (_, k) => { params[k] = true; return encodeURIComponent(args[k] == null ? '' : String(args[k])); });
  const body = Object.fromEntries(Object.entries(args).filter(([k]) => !params[k]));
  const data = row.route.method === 'GET' ? null : JSON.stringify(body);
  const q = row.route.method === 'GET' && Object.keys(body).length ? '?' + new URLSearchParams(body).toString() : '';
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: config.port, path: p + q, method: row.route.method, timeout: 60000,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
      let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (_) { resolve({ ok: res.statusCode < 400, status: res.statusCode, text: s.slice(0, 2000) }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `diagnostic is not answering on :${config.port} (${e.code || e.message}) — start it: node diagnostic/server.js` }));
    req.on('timeout', () => req.destroy(new Error('no answer in 60 s')));
    req.end(data || undefined);
  });
}

async function main(argv = process.argv.slice(2)) {
  const [verb, ...rest] = argv;
  if (verb && SERVICE_VERBS.has(verb)) { process.argv.splice(2, process.argv.length, verb); require('./nexus-diagnostic.js'); return; }
  if (!verb) {
    for (const r of registry) console.log(`  ${r.name.padEnd(28)} ${r.route.method.padEnd(5)} ${r.route.path.padEnd(36)} ${(r.description || '').slice(0, 70)}`);
    console.log(`\n  ${registry.length} commands · diagnostic on :${config.port} · the service's own: ${[...SERVICE_VERBS].join(', ')}`);
    return;
  }
  const row = commandFor(verb);
  if (!row) { console.error(`no command "${verb}" in diagnostic's registry — run with no arguments for the list`); process.exitCode = 2; return; }
  const r = await call(row, parse(rest));
  console.log(JSON.stringify(r, null, 2));
  if (r && r.ok === false) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { main, commandFor, call };
