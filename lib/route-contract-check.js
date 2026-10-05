'use strict';
// lib/route-contract-check.js — EV0 (2)(3): is every route a system serves declared in its interaction-contract.json?
// component_id: lib.route-contract-check
// Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (EV0, invariant E14)
//
// The route half of the contract check (lib/event-contract-check.js is the event half). It reads the routes out of a
// system's own server source — the contract is a projection of the code, as idearium's contract.live is — and compares
// them with the system's interaction-contract.json:
//   undeclared — served, not in the contract (fails)
//   unserved   — in the contract, not served (fails: a declaration is a claim until the code serves it, §1.1)
// A path parameter's name is not compared (`:key` and `:id` are the same slot); the method and the segments are.
//
// What it reads, said (§1.1 — no guess presented as a finding):
//   - `req.method === 'M' && parts[0] === 'x' && parts.length === n`  → M /x/:2/…/:n   (cos/vaultd/server.js)
//   - `url==='/x' && method==='M'`                                   → M /x
//   - `url==='/x'` inside an `if (req.method==='POST') {` block        → POST /x
//   - `url==='/x'` anywhere else                                      → GET /x            (emerge/emerge-ide.js)
//   - a system with no server source (warp is a library) serves nothing; its contract says so with routes: [].
// Only the files named in SERVERS are read; a new server is added there, or its routes are unseen — said in `files`.
// Pure core (projectRoutes, compare) + one IO wrapper (checkSystem). Never writes anything.

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'lib.route-contract-check';
const VERSION = '1.0.0';

// The systems EV0 (2) gives a contract, and the files that serve their routes.
const SERVERS = Object.freeze({
  cos: ['cos/vaultd/server.js'],          // cos/kernel.js: no http in cos core — vaultd is its one server
  emerge: ['emerge/emerge-ide.js'],
  warp: [],                               // a library: no server
});

function _norm(p) { return '/' + String(p || '').split('/').filter(Boolean).map(s => (s.startsWith(':') ? ':' : s)).join('/'); }
function _key(r) { return `${String(r.method).toUpperCase()} ${_norm(r.path)}`; }

/** projectRoutes(src) -> [{ method, path, line }] — the routes one server file serves, read from its dispatch. */
function projectRoutes(src) {
  const text = String(src || '');

  const out = [];
  const add = (method, p, line) => { if (!out.some(r => r.method === method && r.path === p)) out.push({ method, path: p, line }); };

  // the extent of each `if (req.method==='POST') {` block, by brace depth
  const postBlocks = [];
  for (const m of text.matchAll(/if\s*\(\s*req\.method\s*===\s*'POST'\s*\)\s*\{/g)) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
    postBlocks.push([m.index, i]);
  }
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;

  // vaultd: req.method === 'M' && parts[0] === 'x' (&& parts.length === n)
  for (const m of text.matchAll(/req\.method\s*===\s*'([A-Z]+)'\s*&&\s*parts\[0\]\s*===\s*'([^']+)'(?:\s*&&\s*parts\.length\s*===\s*(\d+))?/g)) {
    const n = m[3] ? +m[3] : 1;
    const segs = [m[2], ...Array.from({ length: Math.max(0, n - 1) }, (_, k) => `:${k + 2}`)];
    add(m[1], '/' + segs.join('/'), lineOf(m.index));
  }
  // emerge-ide: url==='/x' (&& method==='M')
  for (const m of text.matchAll(/url\s*===\s*'(\/[^']*)'(?:\s*&&\s*(?:req\.)?method\s*===\s*'([A-Z]+)')?/g)) {
    const inPost = postBlocks.some(([a, b]) => m.index > a && m.index < b);
    add(m[2] || (inPost ? 'POST' : 'GET'), m[1], lineOf(m.index));
  }
  return out;
}

/** compare(served, declared) -> { ok, undeclared:[route], unserved:[route] } */
function compare(served, declared) {
  const s = new Map((served || []).map(r => [_key(r), r]));
  const d = new Map((declared || []).map(r => [_key(r), r]));
  const undeclared = [...s.keys()].filter(k => !d.has(k)).map(k => s.get(k));
  const unserved = [...d.keys()].filter(k => !s.has(k)).map(k => d.get(k));
  return { ok: !undeclared.length && !unserved.length, undeclared, unserved };
}

/** checkSystem(root, system) -> { system, contractFile, files, served, declared, undeclared, unserved, ok, error? } */
function checkSystem(root, system) {
  const files = SERVERS[system];
  const contractFile = `${system}/interaction-contract.json`;
  if (!files) return { system, ok: false, error: `${system} has no server list in lib/route-contract-check.js SERVERS` };
  let contract;
  try { contract = JSON.parse(fs.readFileSync(path.join(root, contractFile), 'utf8')); }
  catch (e) { return { system, contractFile, ok: false, error: `no readable ${contractFile}: ${e.message}` }; }
  const served = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const r of projectRoutes(src)) served.push({ ...r, file: f });
  }
  const declared = Array.isArray(contract.routes) ? contract.routes : [];
  return { system, contractFile, files, served, declared, ...compare(served, declared) };
}

module.exports = { MODULE_ID, VERSION, SERVERS, projectRoutes, compare, checkSystem };
