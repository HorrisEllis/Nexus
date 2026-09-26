#!/usr/bin/env node
// idearium/spec-engine/manifest/cli.js
// UUID: nexus-idearium-manifest-cli-v1-0000-2026-0925-jamesbrooks-001
// Intent: pure entry point — loads nothing but the manifest modules, so
// `context` output is clean JSON a chunk prompt can consume directly.
import { dispatch } from './commands.js';
const args = process.argv.slice(2), pos = [], flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { const k = args[i].slice(2); flags[k] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true; }
  else pos.push(args[i]);
}
const r = dispatch(pos, flags);
if (r.json) process.stdout.write(JSON.stringify(r.json, null, 2) + '\n');
for (const l of r.out || []) (r.code ? console.error : console.log)(l);
process.exitCode = r.code;
