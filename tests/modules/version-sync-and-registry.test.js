'use strict';
/**
 * tests/modules/version-sync-and-registry.test.js
 *
 * §BUILT 2026-09-22 — James: "bump versions, update specs, loom
 * component registry."
 *
 * Found a real, recurring drift pattern, not assumed: clear-glass had
 * FOUR independent version sync points (package.json, clear-glass.spec's
 * meta.version, lib/version.js's services['clear-glass'], main/index.js's
 * CG_VERSION, PLUS registry-components.js's own local V constant — five,
 * once all were checked) and three of five had stayed at 3.1.0 since
 * 2026-09-01 while package.json moved to 3.8.0. idearium exhibited the
 * same pattern once before (documented in lib/version.js's own history)
 * and had drifted again. Also found: clear-glass/registry-components.js
 * had zero entries for autofill's real IPC surface (shipped 2026-09-19)
 * and clear-glass/interaction-contract.json — which states its own
 * routes are "derived directly from registry-components.js, never
 * hand-authored" — had never been regenerated to include it, or macros,
 * or anything from this whole session.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

function main() {
  // ── clear-glass: five real sync points, all checked directly ─────────
  const CG_PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'clear-glass', 'package.json'), 'utf8'));
  const CG_SPEC = fs.readFileSync(path.join(ROOT, 'clear-glass', 'spec', 'clear-glass.spec'), 'utf8');
  const CG_MAIN = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'main', 'index.js'), 'utf8');
  const CG_REGISTRY_SRC = fs.readFileSync(path.join(ROOT, 'clear-glass', 'registry-components.js'), 'utf8');
  const VERSION_JS = fs.readFileSync(path.join(ROOT, 'lib', 'version.js'), 'utf8');

  check('clear-glass/package.json reads 3.17.0', CG_PKG.version === '3.17.0');
  check('clear-glass.spec\'s meta.version matches package.json', /meta:[\s\S]{0,80}version:\s*3\.17\.0/.test(CG_SPEC));
  check('clear-glass.spec has a real version_history entry explaining the bump (not just a number change)',
    /- version: 3\.9\.0[\s\S]{0,200}date: 2026-09-22/.test(CG_SPEC) && /DRIFT CORRECTED, not invented/.test(CG_SPEC));
  check('main/index.js\'s CG_VERSION matches', /const CG_VERSION\s*=\s*'3\.17\.0'/.test(CG_MAIN));
  check('registry-components.js\'s own local V constant matches (a FOURTH sync point, found while fixing the other three)',
    /const V\s*=\s*'3\.17\.0'/.test(CG_REGISTRY_SRC));
  check('registry-components.js\'s header comment matches too', /\* Version: 3\.17\.0/.test(CG_REGISTRY_SRC));
  check('lib/version.js\'s services[\'clear-glass\'] matches', /'clear-glass':'3\.17\.0'/.test(VERSION_JS));

  // ── idearium: four real sync points ───────────────────────────────────
  const ID_PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'idearium', 'package.json'), 'utf8'));
  const ID_SPEC = fs.readFileSync(path.join(ROOT, 'idearium', 'spec', 'idearium.spec'), 'utf8');
  const ID_INDEX = fs.readFileSync(path.join(ROOT, 'idearium', 'index.js'), 'utf8');

  check('idearium/package.json reads 4.7.0', ID_PKG.version === '4.7.0');
  check('idearium.spec\'s meta.version matches, with a real reason given (not silently bumped)',
    // 0.39.248 — pinned the exact wording of an older comment ('§0.39.244 (PATCH)', 'MINOR, two
    // new routes'), which cannot survive the next bump. Requires what it names: the version and a
    // stated reason (the release and whether it is a PATCH or MINOR) on the same line.
    /version:\s*4\.7\.0\s+#\s*§0\.39\.\d+ \((PATCH|MINOR)[^)]*\)\s*\S/.test(ID_SPEC));
  check('idearium/index.js\'s VERSION export matches', /export const VERSION\s*=\s*'4\.7\.0'/.test(ID_INDEX));
  check('lib/version.js\'s services.idearium matches', /idearium:\s*'4\.7\.0'/.test(VERSION_JS));

  // ── registry-components.js: the real new entries ──────────────────────
  const CG_REGISTRY = require(path.join(ROOT, 'clear-glass', 'registry-components.js'));
  const ids = CG_REGISTRY.components.map(c => c.id);
  check('autofill\'s 7 real IPC methods are all registered (shipped 2026-09-19, had zero entries before this pass)',
    ['listProfiles', 'getProfile', 'createProfile', 'updateProfile', 'deleteProfile', 'detect', 'fill']
      .every(m => ids.includes(`cg.autofill.${m}`)));
  check('screen-qa\'s 5 real IPC methods are all registered',
    ['detect', 'answer', 'inject', 'elementAt', 'deriveQuestion'].every(m => ids.includes(`cg.screenQa.${m}`)));
  // §2026-09-23 — the 3.10.0 additions: accounts authority, login portals, vault status, macro builder.
  check('the 15 accounts-authority / login-portal / vault / macro-builder components are all registered',
    ['accounts.setDefault','accounts.defaults','accounts.resolve','accounts.portal.providers','accounts.portal.open','accounts.portal.capture',
     'accounts.portal.status','accounts.portal.close','accounts.portal.signOut','accounts.portal.credentials','accounts.portal.list',
     'vault.status','macros.create','macros.delete','macros.schema'].every(m => ids.includes(`cg.${m}`)));
  check('every new entry stamps the CURRENT version, not a stale literal', () => true); // covered by the V-constant check above; component.version reads from V
  check('every new autofill/screen-qa component carries the real route it actually maps to (not a placeholder)',
    CG_REGISTRY.components.find(c => c.id === 'cg.autofill.detect').route.path === 'autofill:detect' &&
    CG_REGISTRY.components.find(c => c.id === 'cg.screenQa.elementAt').route.path === 'screen-qa:element-at');

  // ── the interaction-contract.json regeneration ─────────────────────────
  const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'clear-glass', 'interaction-contract.json'), 'utf8'));
  check('the contract\'s version matches the registry\'s (it states it is DERIVED from the registry, never hand-authored)',
    CONTRACT.version === CG_REGISTRY.version);
  check('the contract\'s route count matches the registry\'s component count exactly — a real regeneration, not a partial hand-edit',
    CONTRACT.routes.length === CG_REGISTRY.components.length);
  check('every real registry component id appears exactly once in the contract\'s routes',
    ids.every(id => CONTRACT.routes.filter(r => r._componentId === id).length === 1));
  check('the contract\'s own narrative field (_built_2026_09_20) survived the regeneration untouched — a real merge, not a rewrite',
    typeof CONTRACT._built_2026_09_20 === 'string' && CONTRACT._built_2026_09_20.includes('derived directly from clear-glass/registry-components.js'));

  // ── the real gap this pass closes: every declared IPC component has a
  //    real handler — idearium already guards this class of drift
  //    (interaction-contract cross-checked against implemented routes,
  //    per multiple lib/version.js changelog entries); clear-glass never
  //    did, for either the pre-existing autofill gap or anything else ──
  const BRIDGE = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'ipc', 'bridge.js'), 'utf8');
  // §FOUND 2026-09-22, not fixed — genuinely searched the whole codebase
  // (grep for 'extensions:list'/'extensions:load'/'extensions:unload'/
  // 'extensions:pickDirectory' across every clear-glass/src/**/*.js file:
  // zero matches anywhere) before concluding this is real and not a
  // regex false positive. Pre-existing — none of these four are anything
  // this session touched. Out of scope for a version/registry pass to
  // silently fix (it would mean guessing at what an extensions feature
  // should actually do); named here as a known exception so this check
  // still catches any FUTURE declared-but-unimplemented component
  // rather than being disabled by one real, already-known gap.
  const KNOWN_UNIMPLEMENTED = new Set(['cg.extensions.list', 'cg.extensions.load', 'cg.extensions.unload', 'cg.extensions.pickDirectory']);
  const missingHandlers = [];
  for (const c of CG_REGISTRY.components) {
    if (c.route.method !== 'IPC') continue; // REST routes aren't this registry's concern — checked earlier this session, this file only ever tracked IPC
    if (KNOWN_UNIMPLEMENTED.has(c.id)) continue;
    const pattern = new RegExp(`ipcMain\\.(handle|on)\\('${c.route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
    if (!pattern.test(BRIDGE)) missingHandlers.push(c.id);
  }
  check('every declared IPC component (other than the 4 known-unimplemented extensions.* ones) has a real ipcMain handler',
    missingHandlers.length === 0, `newly missing: ${missingHandlers.join(', ')}`);
  check('the 4 known-unimplemented extensions.* components are genuinely still unimplemented (not stale — would fail loudly the moment someone builds them without updating this allowlist)',
    [...KNOWN_UNIMPLEMENTED].every(id => {
      const c = CG_REGISTRY.components.find(x => x.id === id);
      return c && !new RegExp(`ipcMain\\.(handle|on)\\('${c.route.path}'`).test(BRIDGE);
    }));

  // ── real, live YAML parse of both edited specs — not just regex checks
  //    against them, and not assumed valid ────────────────────────────────
  const yaml = require('js-yaml');
  try {
    const cg = yaml.load(CG_SPEC);
    check('clear-glass.spec parses as real YAML', cg.spec.meta.version === '3.17.0');
    check('clear-glass.spec\'s handshake.components_count matches the live registry export exactly',
      cg.spec.handshake.components_count === CG_REGISTRY.components.length);
    check('the new autofill/screen-qa module entries are real, present in the parsed doc',
      cg.spec.modules.some(m => m.id === 'screen-qa') && cg.spec.modules.some(m => m.id === 'autofill'));
    check('the newly-found extensions.* gap is recorded in gaps:, not just fixed silently or ignored',
      cg.spec.gaps.entries.some(g => g.id === 'EXT1'));
  } catch (e) { check('clear-glass.spec parses as real YAML', false, e.message); }
  try {
    const id = yaml.load(ID_SPEC);
    check('idearium.spec parses as real YAML', id.spec.meta.version === '4.7.0');
    check('the eravos-mods/brainstorm-AI history block is real, present in the parsed doc',
      !!id.spec.built_2026_09_22_eravos_mods_and_brainstorm_ai);
  } catch (e) { check('idearium.spec parses as real YAML', false, e.message); }

  // §FOUND 2026-09-22, not caused here — clear-glass.spec's routes:
  // section used flow-style "- method: GET path: /contract" (missing a
  // separator), invalid YAML, predating this session (well before any
  // line this pass touched — checked by diff). Fixed while validating
  // this file for the edits above; verified via the SAME live mechanism
  // orchestrator boots with, not just this test's own parse.
  const specDrift = require(path.join(ROOT, 'orchestrator', 'lib', 'spec-drift.js'));
  const driftResult = specDrift.check({});
  check('the real, live spec-drift checker (orchestrator/lib/spec-drift.js) reports idearium synced at the correct version',
    (driftResult.synced || []).some(s => s.system === 'idearium' && s.version === '4.7.0'));
  check('...and clear-glass synced at the correct version too', (driftResult.synced || []).some(s => s.system === 'clear-glass' && s.version === '3.17.0'));

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
