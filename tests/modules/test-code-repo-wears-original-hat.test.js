'use strict';
/**
 * tests/modules/test-code-repo-wears-original-hat.test.js — §0.39.276 James: "the code tab needs to use the same hat from
 * the original repo. when you click code in the original spec, it creates a new repo, i need that repo to use the same
 * hat ... full agent settings in the original repo."
 * Real RepoLayer, real hat-forge, real _buildIdentity: the repo speceng.codegen makes (source 'spec.codegen',
 * promotedFromSpec = the original spec) is built by the ORIGINAL repo's hat, on the ORIGINAL repo's backend and model.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'coderhat-inject-'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

async function ingest(layer, args) {
  let r = null;
  for (let i = 0; i < 20; i++) {
    r = layer.ingest({ source: 'test', files: [{ path: 'src/a.js', content: `const a = '${args.name}';\n` }], ...args });
    if (!(r && r.error && /no spec-engine/.test(r.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  return r && (r.repo || r);
}

(async () => {
  console.log('\ntest-code-repo-wears-original-hat\n');
  const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));
  const RA = require(path.join(ROOT, 'lib', 'repo-agent.js'));
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const tag = Date.now();

  const origin = await ingest(layer, { name: `orig-${tag}`, compartmentId: `cos.orig.${tag}` });
  check('the original repo exists', !!(origin && origin.uuid), JSON.stringify(origin).slice(0, 160));
  const ens = RH.ensureRepoHat({ repo: origin, repoDir: null });
  check('the original has its hat', ens.ok, JSON.stringify(ens.errors || ''));
  RA.setProvider(origin.uuid, 'ollama');
  RA.setOllamaModel(origin.uuid, '', {});

  // the repo the Code button makes
  const code = await ingest(layer, { name: `orig-${tag} · code`, source: 'spec.codegen', promotedFromSpec: origin.specUuid, compartmentId: `cos.code.${tag}` });
  check('the code repo exists and points at the original spec', !!(code && code.uuid) && code.promotedFromSpec === origin.specUuid, JSON.stringify(code).slice(0, 160));
  check('before any link, it has no hat of its own and no share', RH.originOf(code.uuid) === null);

  // building the code spec — the link is made on the way (also how repos made before 0.39.276 are picked up)
  const who = api._buildIdentity(code.specUuid);
  check('the code spec is built by the ORIGINAL repo\'s hat', who.hat && who.hat.name === RH.hatNameFor(origin.uuid), JSON.stringify(who.hat && who.hat.name));
  check('the source says so', who.hatSource === 'repo (original)', who.hatSource);
  check('it is not the_builder', !who.hat || who.hat.name !== 'the_builder');
  check('the hat worn names the code repo so the code tools get its uuid', who.hat.personaPrompt.includes(`repoUuid="${code.uuid}"`));
  check('the build goes to the ORIGINAL\'s backend', who.provider === 'ollama');
  check('the code repo\'s own agent id is kept (its own memory of builds)', who.repoUuid === code.uuid && /repo/.test(String(who.agentId)) && String(who.agentId).includes(code.uuid));
  check('the link is recorded', RH.originOf(code.uuid) === origin.uuid);
  check('the code repo forged no hat of its own', RH.getRepoHat(code.uuid).name === RH.hatNameFor(origin.uuid));

  // changing the original's settings changes the code repo's
  RA.setProvider(origin.uuid, 'chatgpt');
  check('changing the original\'s backend moves the code build with it', api._buildIdentity(code.specUuid).provider === 'chatgpt');

  // an ordinary repo's spec is unchanged
  const plain = await ingest(layer, { name: `plain-${tag}`, compartmentId: `cos.plain.${tag}` });
  RH.ensureRepoHat({ repo: plain, repoDir: null });
  const wp = api._buildIdentity(plain.specUuid);
  check('a repo that is not a code repo still wears its own hat', wp.hat.name === RH.hatNameFor(plain.uuid) && wp.hatSource === 'repo');

  // a code repo whose original spec has no repo: nothing to link, builder as before
  const lone = await ingest(layer, { name: `lone-${tag}`, source: 'spec.codegen', promotedFromSpec: `spec-nobody-${tag}`, compartmentId: `cos.lone.${tag}` });
  const wl = api._buildIdentity(lone.specUuid);
  check('no original repo → no link; the code spec is built as before', RH.originOf(lone.uuid) === null && wl.hatSource !== 'repo (original)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
