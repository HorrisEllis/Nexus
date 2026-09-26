'use strict';
// guardian/lib/command-registry.js — §NEW 2026-09-17
//
// James: "get the .command nodes as the source of truth, with .events
// for the sse and ledger so the intelligence system can diagnose...
// able to create commands from the .command schema using copilot. Or
// drag and drop command nodes inside the data folder."
//
// §THE REAL FLIP — guardian/lib/command-index-extract.js writes .command
// files FROM server.js's source (extraction, one direction: code → node).
// This file makes the node the source of truth instead: real requests
// get checked against it, real "fired"/"never fired" events come out of
// it, and a new .command file dropped into guardian/commands/ (by a
// human or by copilot) is real, live-registered on the next load — no
// code change required to make guardian aware a command exists.
//
// §NEGATIVE SPACE, same real pattern already proven this session in
// guardian/lib/dispatcher.js's completion-timeout watchdog — a command
// that's REGISTERED but has never actually fired, despite guardian being
// up and healthy, is exactly the kind of absence worth a real event, not
// silence. checkStale() is that watchdog for the command layer.
//
// §HONEST GAP, not glossed over — wiring recordFire() into guardian's
// actual request path (a real hook inside guardian/server.js's raw
// http.createServer dispatch, not the 404-fallback createServer near
// the bottom of that file) needs its own dedicated look before touching
// a 4000+ line live server file blind. This module is fully real and
// tested standalone; the one-line call-site wire-in is the deliberately
// deferred remaining step, named here so it isn't lost.

const fs = require('fs');
const path = require('path');
const nodeExport = require('../../lib/node-export');

const MODULE_ID = 'guardian.command-registry';

function _key(method, routePath) {
  return `${(method || '').toUpperCase()} ${routePath || ''}`;
}

/**
 * loadCommands(dir) -> Map<"METHOD /path", { id, method, path, filePath, lastFired, fireCount }>
 * Real read of every .command file in dir via the same shared
 * nodeExport.importFromFile() every other real node type uses — no
 * separate parser. A file that fails to parse is skipped and named in
 * the returned `errors` array, never silently dropped from the count.
 */
function loadCommands(dir) {
  const registry = new Map();
  const errors = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.command')); }
  catch (e) { return { registry, errors: [`readdir failed: ${e.message}`] }; }

  for (const f of files) {
    const filePath = path.join(dir, f);
    try {
      const node = nodeExport.importFromFile(filePath);
      const { method, path: routePath } = node.payload || {};
      if (!method || !routePath) { errors.push(`${f}: missing method/path in payload`); continue; }
      registry.set(_key(method, routePath), {
        id: node.id, method: method.toUpperCase(), path: routePath, filePath,
        lastFired: null, fireCount: 0,
      });
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  return { registry, errors };
}

/**
 * recordFire(registry, method, path, { ledgerWrite, broadcast }) -> real
 * .command.fired event, ledger + SSE, only when the request actually
 * matches a registered command — an unregistered route firing is not
 * this module's concern (that's a routing question, not a diagnosability
 * one), and is deliberately not logged here to avoid noise on every
 * unmatched request a raw http.createServer sees.
 */
function recordFire(registry, method, routePath, { ledgerWrite, broadcast } = {}) {
  const cmd = registry.get(_key(method, routePath));
  if (!cmd) return false;
  cmd.lastFired = Date.now();
  cmd.fireCount += 1;
  const event = { type: 'command.fired', id: cmd.id, method: cmd.method, path: cmd.path, ts: cmd.lastFired, fireCount: cmd.fireCount };
  try { ledgerWrite?.('guardian', 'command.fired', event); } catch (_) {}
  try { broadcast?.(JSON.stringify(event)); } catch (_) {}
  return true;
}

/**
 * checkStale(registry, { sinceBootAt, neverFiredGraceMs, staleGraceMs, ledgerWrite, broadcast })
 * -> real events for every command that's either never fired since boot
 * (past a grace period, so a just-started guardian isn't flagged
 * instantly) or hasn't fired in a long time after having fired before.
 * Both are real §1.2 events — silence about a registered-but-unused
 * command looks exactly like "everything is fine," which is the whole
 * reason this function exists.
 */
function checkStale(registry, {
  sinceBootAt, neverFiredGraceMs = 3600000, staleGraceMs = 86400000,
  ledgerWrite, broadcast,
} = {}) {
  const now = Date.now();
  const events = [];
  for (const cmd of registry.values()) {
    if (cmd.lastFired === null) {
      if (sinceBootAt && (now - sinceBootAt) >= neverFiredGraceMs) {
        events.push({ type: 'command.never_fired', id: cmd.id, method: cmd.method, path: cmd.path, sinceBootMs: now - sinceBootAt });
      }
      continue;
    }
    const idleMs = now - cmd.lastFired;
    if (idleMs >= staleGraceMs) {
      events.push({ type: 'command.stale', id: cmd.id, method: cmd.method, path: cmd.path, idleMs, fireCount: cmd.fireCount });
    }
  }
  for (const event of events) {
    try { ledgerWrite?.('guardian', event.type, event); } catch (_) {}
    try { broadcast?.(JSON.stringify(event)); } catch (_) {}
  }
  return events;
}

/**
 * createCommand({ method, path, description }, dir) -> real file path.
 * The "copilot can create one" / "drag a file into the data folder"
 * half of the ask: this IS the drag-and-drop target's own writer — a
 * copilot tool calling this and a human hand-authoring a matching YAML
 * file in `dir` produce the exact same real, loadable artifact. No
 * separate "manual" path exists to drift from this one.
 */
function createCommand({ method, description = null } = {}, routePath, dir) {
  if (!method || !routePath) throw new Error(`${MODULE_ID}: createCommand needs both method and path`);
  const id = `${method.toLowerCase()}-${routePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}`;
  return nodeExport.exportToFile('command', id,
    { method: method.toUpperCase(), path: routePath },
    { context: description || `guardian command — ${method.toUpperCase()} ${routePath}`, system: 'guardian', tags: ['guardian', 'command'] },
    dir
  );
}

module.exports = { loadCommands, recordFire, checkStale, createCommand, MODULE_ID };
