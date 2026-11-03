'use strict';
/**
 * lib/registry-sovereign-check.js — AXIOMS §5.16 enforced: every system's component registry is its own (RG0, 0.60.384).
 * Map: docs/2026-11-03-registry-per-system-phasemap.spec RG0.
 *
 * James, 2026-11-03: "No component registry is per system.  That needs to be implemented" · "And enforce that. I’m sick of you confusing that.
 * It’s fucking sovereign. Do not  make this mistake again." · "Not loom. Never said loom. Loom is going to be removed"
 *
 * A ratchet, as lib/system-boundary.js is for crossings: what exists on 2026-11-03 is the baseline to undo, and nothing new may be added.
 *   - the central registry (lib/component-registry.js): no file outside the baseline may require it;
 *   - Loom (loom/maps/*.js): no new map, and no map may grow (removing is always allowed);
 *   - the law stays written: docs/AXIOMS-v3.1.md §5.16, docs/CLAUDE.md rule 3 and the root CLAUDE.md say it.
 * Each rule shrinks only: when a caller is moved to its own system's registry, its line leaves the baseline (check({ write }) rewrites it smaller).
 *
 *   scan({ root }) → { centralCallers[], loomMaps { file: lines } }
 *   check({ root, baseline }) → { ok, newCallers[], newMaps[], grownMaps[{ file, was, now }], lawMissing[], shrunk { callers[], maps[] } }
 */
const fs = require('fs');
const path = require('path');

const BASELINE = 'lib/contracts/registry-sovereign-baseline.json';   // beside the boundary ratchet's baseline
const SKIP = /^(node_modules|_archive|data|\.git|tests)$/;

function scan({ root = path.resolve(__dirname, '..') } = {}) {
  const target = path.join(root, 'lib', 'component-registry.js'), callers = [];
  const walk = (dir) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (SKIP.test(e.name)) continue; const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (!/\.(c|m)?js$/.test(e.name) || abs === target) continue;
      let src; try { src = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
      for (const m of src.matchAll(/require\(\s*['"`]([^'"`]*component-registry(?:\.js)?)['"`]\s*\)/g)) {
        let r = null; try { r = require.resolve(path.resolve(path.dirname(abs), m[1])); } catch (_) { try { r = path.resolve(path.dirname(abs), m[1]) + (m[1].endsWith('.js') ? '' : '.js'); } catch (_) {} }
        if (r === target) { callers.push(path.relative(root, abs).split(path.sep).join('/')); break; }
      }
    }
  };
  walk(root);
  const loomMaps = {}; const md = path.join(root, 'loom', 'maps');
  try { for (const f of fs.readdirSync(md)) if (f.endsWith('.js')) loomMaps[`loom/maps/${f}`] = fs.readFileSync(path.join(md, f), 'utf8').split('\n').length; } catch (_) {}
  return { centralCallers: [...new Set(callers)].sort(), loomMaps };
}

function lawMissing(root) {
  const need = [['docs/AXIOMS-v3.1.md', /§5\.16 Every System's Component Registry Is Its Own/], ['docs/CLAUDE.md', /THE COMPONENT REGISTRY IS PER SYSTEM, AND SOVEREIGN/], ['CLAUDE.md', /component registry is its own.*Loom is NOT it/]];
  return need.filter(([f, re]) => { try { return !re.test(fs.readFileSync(path.join(root, f), 'utf8')); } catch (_) { return true; } }).map(([f]) => f);
}

function check({ root = path.resolve(__dirname, '..'), baseline = null, write = false } = {}) {
  const now = scan({ root });
  const base = baseline || (() => { try { return JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8')); } catch (_) { return null; } })();
  if (!base) return { ok: false, error: `no baseline at ${BASELINE}: nothing to hold the line against (said, not passed)` };
  const newCallers = now.centralCallers.filter(c => !base.centralCallers.includes(c));
  const newMaps = Object.keys(now.loomMaps).filter(f => !(f in base.loomMaps));
  const grownMaps = Object.entries(now.loomMaps).filter(([f, n]) => f in base.loomMaps && n > base.loomMaps[f]).map(([file, n]) => ({ file, was: base.loomMaps[file], now: n }));
  const shrunk = { callers: base.centralCallers.filter(c => !now.centralCallers.includes(c)), maps: Object.keys(base.loomMaps).filter(f => !(f in now.loomMaps) || now.loomMaps[f] < base.loomMaps[f]) };
  const missing = lawMissing(root);
  const ok = !newCallers.length && !newMaps.length && !grownMaps.length && !missing.length;
  if (write && ok && (shrunk.callers.length || shrunk.maps.length)) fs.writeFileSync(path.join(root, BASELINE), JSON.stringify({ ...base, centralCallers: now.centralCallers, loomMaps: now.loomMaps, shrunkAt: new Date().toISOString() }, null, 2) + '\n');
  return { ok, newCallers, newMaps, grownMaps, lawMissing: missing, shrunk };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  if (process.argv.includes('--baseline')) { const s = scan({ root }); fs.writeFileSync(path.join(root, BASELINE), JSON.stringify({ about: 'AXIOMS §5.16: what existed on 2026-11-03 against every system owning its own component registry. It only shrinks (lib/registry-sovereign-check.js).', at: '2026-11-03', ...s }, null, 2) + '\n'); console.log(`baseline: ${s.centralCallers.length} callers of the central registry, ${Object.keys(s.loomMaps).length} Loom maps`); }
  else { const r = check({ root, write: process.argv.includes('--write') }); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
}

module.exports = { scan, check, BASELINE, MODULE_ID: 'nexus.lib.registry-sovereign-check', VERSION: '1.0.0' };
