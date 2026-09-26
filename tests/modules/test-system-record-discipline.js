'use strict';
/**
 * tests/modules/test-system-record-discipline.js
 * §2026-09-23 — handoff item 3: "every change updates .git, .spec, atlas,
 * component registry" is a STANDING RULE, not a per-pass intention. 0.39.223
 * shipped guardian's account authority in code and skipped its .spec, which
 * is exactly how the rule gets lost — so the rule gets a test.
 *
 * This asserts the parts a test can actually prove: one version string per
 * system across lib/version.js, <system>/spec/<system>.spec and
 * <system>/registry-components.js, and that a system with an atlas has one
 * that is not a stub. It deliberately does NOT try to prove "the spec
 * describes the code" — no test can, and pretending otherwise would be worse
 * than the gap it claims to close.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

const services = require(path.join(ROOT, 'lib', 'version.js')).services;

function specVersion(sys) {
  for (const p of [path.join(ROOT, sys, 'spec', `${sys}.spec`), path.join(ROOT, sys, `${sys}.spec`)]) {
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^\s*version:\s*['"]?([\d.]+)/m);
    return { path: p, version: m && m[1] };
  }
  return null;
}
function registryVersion(sys) {
  const p = path.join(ROOT, sys, 'registry-components.js');
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf8').match(/const V\s*=\s*['"]([\d.]+)['"]/);
  return { path: p, version: m && m[1] };
}

console.log('\ntest-system-record-discipline\n');

// Guardian is the system the handoff names; it is asserted by name so the
// specific miss that prompted this rule cannot silently return.
const gSpec = specVersion('guardian'), gReg = registryVersion('guardian');
check('guardian has a spec with a version', !!(gSpec && gSpec.version), JSON.stringify(gSpec));
check('guardian spec version matches lib/version.js',
  gSpec && gSpec.version === services.guardian, `${gSpec && gSpec.version} vs ${services.guardian}`);
check('guardian registry version matches lib/version.js',
  gReg && gReg.version === services.guardian, `${gReg && gReg.version} vs ${services.guardian}`);
check('guardian spec records the account authority that 0.39.223 shipped in code',
  /accountAuthority|cg-account-authority/.test(fs.readFileSync(gSpec.path, 'utf8')));
check('guardian spec records the .job source-of-truth change',
  /_persistJob|source_of_truth|job_file_is_the_source_of_truth/.test(fs.readFileSync(gSpec.path, 'utf8')));
check('guardian emits guardian.job.progress and its spec says so',
  /guardian\.job\.progress/.test(fs.readFileSync(gSpec.path, 'utf8')) &&
  /guardian\.job\.progress/.test(fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'ncp-handler.js'), 'utf8')));

// Every system that declares BOTH a spec and a registry must agree with the
// canonical version registry. Systems with neither are not in scope here.
const drifted = [];
for (const sys of Object.keys(services)) {
  const sp = specVersion(sys), rg = registryVersion(sys);
  if (!sp || !sp.version || !rg || !rg.version) continue;
  if (sp.version !== services[sys] || rg.version !== services[sys]) {
    drifted.push(`${sys}: version.js=${services[sys]} spec=${sp.version} registry=${rg.version}`);
  }
}
check('no system with a spec AND a registry drifts from lib/version.js (§5.4)',
  drifted.length === 0, drifted.join(' | '));

// An atlas that exists must say something. A stub atlas is worse than none:
// it reads as documented when it is not.
const atlasDir = path.join(ROOT, 'docs', 'atlases');
const stubs = [];
for (const f of fs.readdirSync(atlasDir)) {
  if (!f.endsWith('-atlas.md')) continue;
  const body = fs.readFileSync(path.join(atlasDir, f), 'utf8');
  if (body.length < 400 || !/^## /m.test(body)) stubs.push(f);
}
check('every atlas has real content, not a stub', stubs.length === 0, stubs.join(', '));
check('guardian\'s atlas records this session\'s changes',
  /Jobs are files \(2026-09-23\)/.test(fs.readFileSync(path.join(atlasDir, 'guardian-atlas.md'), 'utf8')));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
