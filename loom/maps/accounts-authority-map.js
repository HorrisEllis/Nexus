'use strict';
/**
 * loom/maps/accounts-authority-map.js — Clear Glass account authority + login
 * portals + sealed vaults (v0.39.223). Same shape as ui-map.js / warp-map.js.
 * comp_id: nexus.loom.maps.accounts-authority
 * UUID: nexus-loom-map-accounts-authority-v1-0000-2026-0923-001
 *
 * Registries these edges belong to: clear-glass/registry-components.js (mesh.jobSend,
 * mesh.jobStatus, mesh.jobIntake, accounts.*) and guardian/registry-components.js (guardian 3.8.0:
 * the claim is an internal .job write rule, no new HTTP component).
 *
 * Hand-mapped (not left to the source scanner) because the edges that matter
 * here are NOT require() edges the scanner can see:
 *   - guardian's registry is handed the authority by INJECTION (server.js);
 *   - the authority reaches Clear Glass over HTTP (GET :7702/accounts/resolve);
 *   - the Settings sections reach the backend over IPC (preload -> bridge);
 *   - the login portal is handed options/vault/passwordVault by main/index.js.
 * Each wire below is a real call edge, checked against source, named by kind
 * in the comment beside it. Ids follow source-map.js's idFor() scheme so the
 * scanned tree's wires into these files resolve.
 */
const FILES = [
  ['clear-glass/src/security/vault-key.js',      'nexus.clear-glass.src.security.vault-key',      []],
  ['clear-glass/src/cookies/vault.js',           'nexus.clear-glass.src.cookies.vault',           ['nexus.clear-glass.src.security.vault-key']],        // require
  ['clear-glass/src/passwords/vault.js',         'nexus.clear-glass.src.passwords.vault',         ['nexus.clear-glass.src.security.vault-key']],        // require
  ['clear-glass/src/options/store.js',           'nexus.clear-glass.src.options.store',           []],
  ['clear-glass/src/accounts/login-portal.js',   'nexus.clear-glass.src.accounts.login-portal',   [                                                     // injected by main/index.js
    'nexus.clear-glass.src.options.store', 'nexus.clear-glass.src.cookies.vault', 'nexus.clear-glass.src.passwords.vault']],
  ['guardian/lib/cg-account-authority.js',       'nexus.guardian.lib.cg-account-authority',       ['nexus.clear-glass.src.options.store']],             // HTTP GET :7702/accounts/resolve
  ['guardian/lib/agent-registry.js',             'nexus.guardian.lib.agent-registry',             ['nexus.guardian.lib.cg-account-authority']],         // injected (accountAuthority)
  ['guardian/lib/dispatch-ladder.js',            'nexus.guardian.lib.dispatch-ladder',            ['nexus.guardian.lib.agent-registry', 'nexus.guardian.lib.mesh-client']],   // injected (registry, mesh)
  // v0.39.227 — guardian job -> Clear Glass intake (both edges are HTTP, invisible to the source scanner)
  ['guardian/lib/jobs.js',                       'nexus.guardian.lib.jobs',                       []],
  ['clear-glass/src/jobs/intake.js',             'nexus.clear-glass.src.jobs.intake',             ['nexus.guardian.lib.jobs']],                         // HTTP GET :7820/jobs?id= (guardian reads its own .job)
  ['guardian/lib/mesh-client.js',                'nexus.guardian.lib.mesh-client',                ['nexus.clear-glass.src.jobs.intake']],               // HTTP POST /agent-mesh/send, GET /agent-mesh/job
  ['clear-glass/renderer/settings/core.js',      'nexus.clear-glass.renderer.settings.core',      []],
  ['clear-glass/renderer/settings/sections/accounts.js', 'nexus.clear-glass.renderer.settings.sections.accounts', [                     // IPC accounts:* / accounts:portal:* / vault:status
    'nexus.clear-glass.renderer.settings.core', 'nexus.clear-glass.src.accounts.login-portal', 'nexus.clear-glass.src.options.store']],
];

function mapAccountsAuthority(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0',
      uuid: `nexus-loom-map-acct-${id}-v1-0000-2026-0923-001` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);
  for (const [, id, requires] of FILES) {
    if (requiredBy.has(id)) {
      const e = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-acct-${id}-export-v1-0000-2026-0923-001` });
      (e.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r: e });
    }
    if (requires.length) {
      const i = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-acct-${id}-import-v1-0000-2026-0923-001` });
      (i.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r: i });
    }
  }
  let n = 0;
  for (const [, id, requires] of FILES) for (const dep of requires) {
    n++;
    const w = driver.declare('wire', { id: `acct.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-acct-wire-${n}-v1-0000-2026-0923-001` });
    (w.ok ? results.wires : results.failures).push({ from: dep, to: id, r: w });
  }
  return results;
}

module.exports = { mapAccountsAuthority, FILES };
