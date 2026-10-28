'use strict';
/**
 * cos/compartment/boundary.js — COMPARTMENT OS: the wall. A compartment's process reaches only what its compartment allows.
 *
 * Author: James Brooks (Erosmancer)
 * 0.60.242 LM4 (docs/2026-10-24-loom-into-cos-phasemap.spec LM_D3). James, 2026-10-24: "once it's merged with COS, those fucking
 * boundaries, they're not, it's not coupling after that. There's no coupling after that." · "Do it."
 *
 * Until now a compartment's mounts were a record and nothing more (lib/cos-bridge.js mountPath: "a RECORD, not an enforcement";
 * process-runner set cwd only). This makes the code boundary real: process-runner preloads this file (node --require) into a compartment
 * whose env carries COS_BOUNDARY, and every require() that resolves to a file outside the allowed paths is refused. In a compartment,
 * reaching into another system's code is not a habit to police; it cannot happen.
 *
 *   COS_BOUNDARY = JSON { name, allow: [absolute dir or file], mode: 'enforce' | 'audit' }
 *     enforce  the require throws (code COS_BOUNDARY), naming the file and the way that is open (the other system's route)
 *     audit    the require goes through, and the refusal is said once per file (to see what a system would break before it moves)
 *   Node built-ins are always allowed. Each refusal is written to stderr as one line: [cos-boundary] <name> refused <file> (from <parent>).
 *
 * Not walled by this (said, §1.2): reads and writes through fs, child processes, and the network. A compartment's process can still open
 * another system's file with fs.readFileSync; only code coupling is enforced here. The next wall is the filesystem (the VM runtime,
 * compartment/qemu-runtime.js, or a namespace).
 */
const Module = require('module');
const path = require('path');

function install(spec) {
  const allow = (spec.allow || []).map(p => path.resolve(p));
  const name = spec.name || 'compartment';
  const mode = spec.mode === 'audit' ? 'audit' : 'enforce';
  const said = new Set();
  const inside = (file) => allow.some(a => file === a || file.startsWith(a.endsWith(path.sep) ? a : a + path.sep));
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    const file = orig.call(this, request, parent, isMain, options);
    if (!path.isAbsolute(file) || inside(file)) return file;   // a built-in, or inside the compartment
    const from = parent && parent.filename ? parent.filename : '(entry)';
    if (!said.has(file)) { said.add(file); try { process.stderr.write(`[cos-boundary] ${name} ${mode === 'enforce' ? 'refused' : 'would refuse'} ${file} (from ${from})\n`); } catch (_) {} }
    if (mode === 'audit') return file;
    const e = new Error(`COS boundary: ${name} cannot load ${file} (required from ${from}). It belongs to another system; reach it through that system's route.`);
    e.code = 'COS_BOUNDARY';
    throw e;
  };
  return { name, mode, allow };
}

if (process.env.COS_BOUNDARY) {
  let spec = null;
  try { spec = JSON.parse(process.env.COS_BOUNDARY); } catch (e) { process.stderr.write(`[cos-boundary] COS_BOUNDARY is not JSON (${e.message}): the wall is NOT up\n`); }
  if (spec) install(spec);
}

module.exports = { install };
