'use strict';
/**
 * tests/modules/test-repo-hat-coder-link.js — §0.39.276 James: "the code tab needs to use the same hat from the original
 * repo ... full agent settings in the original repo." A spec's code repo (the Code button) is LINKED to the repo that owns
 * the spec: one hat, one set of agent settings (provider, Ollama model, tool scope, prompt blocks), the original's.
 * Runs against the real hat-forge, jaa-db and settings stores in a temp data dir.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'coderlink-jaa-'));
try { process.env.NEXUS_HAT_DIR = process.env.NEXUS_HAT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'coderlink-hat-')); } catch (_) {}

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));
const RA = require(path.join(ROOT, 'lib', 'repo-agent.js'));
const PB = require(path.join(ROOT, 'lib', 'repo-prompt-blocks.js'));

console.log('\ntest-repo-hat-coder-link\n');
const origin = { uuid: 'aaaaaaaa-1111-4111-8111-000000000001', name: 'ERAVOS', compartmentId: 'idearium-repo-orig' };
const coder  = { uuid: 'bbbbbbbb-2222-4222-8222-000000000002', name: 'ERAVOS · code', compartmentId: 'idearium-repo-code' };
const other  = { uuid: 'cccccccc-3333-4333-8333-000000000003', name: 'Unrelated', compartmentId: 'idearium-repo-other' };

// ── linking ──
check('unlinked repo has no origin', RH.originOf(coder.uuid) === null);
check('a repo cannot share its own agent', RH.linkCoder(origin, origin).ok === false);
const l = RH.linkCoder(coder, origin);
check('link is stored', l.ok && l.linked && RH.originOf(coder.uuid) === origin.uuid);
check('linking again is a no-op, not a second row', RH.linkCoder(coder, origin).linked === false);
check('a link to a repo that is itself linked is refused', RH.linkCoder(other, coder).ok === false);
check('agentKeyFor: coder → origin, origin → itself', RH.agentKeyFor(coder.uuid) === origin.uuid && RH.agentKeyFor(origin.uuid) === origin.uuid);

// ── one hat ──
const own = RH.ensureRepoHat({ repo: origin, repoDir: null });
check('the original forges its hat', own.ok && own.created, JSON.stringify(own.errors || ''));
const viaCoder = RH.getRepoHat(coder.uuid);
check('the code repo finds the SAME hat', !!viaCoder && viaCoder.name === RH.getRepoHat(origin.uuid).name && viaCoder.name === RH.hatNameFor(origin.uuid));
const ens = RH.ensureRepoHat({ repo: coder, repoDir: null });
check('ensure on the code repo finds it, forges nothing', ens.ok && ens.created === false && ens.sharedFrom === origin.uuid);
check('the code repo has no hat of its own', !require(path.join(ROOT, 'lib', 'hat-forge.js')).bySeedKey(RH.seedKeyFor(coder.uuid)));

// ── worn in the code repo: shared persona + one honest line ──
const worn = RH.wearable(viaCoder, coder);
check('worn in the code repo, the persona names the code repo uuid', worn.personaPrompt.includes(`repoUuid="${coder.uuid}"`) && worn.personaPrompt.includes(origin.uuid));
check('the stored hat is not modified by wearing it', !viaCoder.personaPrompt.includes(coder.uuid));
check('worn in the original, the hat is unchanged', RH.wearable(viaCoder, origin) === viaCoder);

// ── the shared hat cannot be overwritten or revoked from the code repo ──
const rf = RH.refreshRepoHatPersona({ repo: coder, repoDir: null });
check('refresh from the code repo is refused and says where', rf.ok === false && rf.sharedFrom === origin.uuid);
check('the hat persona still describes the original', RH.getRepoHat(origin.uuid).personaPrompt.includes('"ERAVOS"') && !RH.getRepoHat(origin.uuid).personaPrompt.includes(coder.uuid));
check('revoke from the code repo is refused', RH.revokeRepoHat(coder.uuid).ok === false && !!RH.getRepoHat(origin.uuid));

// ── learning goes to the shared agent ──
const lr = RH.learn({ repo: coder, repoDir: null, kind: 'convention', text: 'kernel state lives in one module' });
check('what the coder learns is stored on the original', lr.ok && lr.sharedFrom === origin.uuid);
const MEM = require(path.join(ROOT, 'lib', 'repo-hat-memory.js'));
check('the original has the observation, the code repo has none', (MEM.stats(origin.uuid).total || MEM.stats(origin.uuid).count || 0) >= 1 && !(MEM.stats(coder.uuid).total || MEM.stats(coder.uuid).count || 0));

// ── settings live in the original ──
const prov = RA.providers().find(p => p !== 'auto') || 'ollama';
check('setProvider from the code repo writes the original\'s settings', RA.setProvider(coder.uuid, prov).ok && RA.getProvider(origin.uuid) === prov && RA.getProvider(coder.uuid) === prov);
check('an unrelated repo is not affected', RA.getProvider(other.uuid) !== undefined && (prov === RA.defaultProvider() || RA.getProvider(other.uuid) !== prov));
check('setToolScope from the code repo writes the original\'s', RA.setToolScope(coder.uuid, 'project').ok && RA.getToolScope(origin.uuid) === 'project');
check('settingsView on the code repo says where the settings live', RA.settingsView(coder.uuid).settingsFrom === origin.uuid && RA.settingsView(origin.uuid).settingsFrom === null);
const blocks = PB.getBlocks(origin.uuid);
const first = blocks[0];
check('prompt blocks edited from the code repo land on the original', PB.setBlocks(coder.uuid, [{ id: first.id, enabled: first.enabled, text: first.text + '\n[coder-edit]' }]).ok
  && PB.getBlocks(origin.uuid).find(b => b.id === first.id).text.includes('[coder-edit]'));
check('status on the code repo reports the share', RA.status({ repo: coder, repoDir: null }).sharedFrom === origin.uuid);

// ── unlink ──
check('unlink puts the repo back on its own', RH.unlinkCoder(coder.uuid).ok && RH.originOf(coder.uuid) === null && !RH.getRepoHat(coder.uuid));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
