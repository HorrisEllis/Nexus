'use strict';
/**
 * tests/modules/test-repo-agent-provider.js — (0.39.253: + the three-way switch and the Ollama model) §2026-09-21 chatgpt/gemini/
 * deepseek/… wearing the repo hat. A real http stub on copilot's :3750
 * records the route each dispatch carries (backend/agent — what copilot's
 * /api/prompt reads to call guardian's dispatchToNcpAgent), and answers like
 * a provider would: code, @learn lines, and a placement answer. Writes go
 * through the REAL idearium RepoLayer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-inject-'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

async function main() {
  console.log('\ntest-repo-agent-provider\n');
  const RA = require(path.join(ROOT, 'lib', 'repo-agent.js'));
  const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));
  const RI = require(path.join(ROOT, 'lib', 'repo-inject.js'));
  const MEM = require(path.join(ROOT, 'lib', 'repo-hat-memory.js'));
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();

  // ── the provider list is guardian's own userscripts ──
  const onDisk = fs.readdirSync(path.join(ROOT, 'guardian')).map(f => (f.match(/^userscript-([a-z0-9-]+)\.js$/) || [])[1]).filter(n => n && !['memory', 'nexus-wake', 'chat-stream'].includes(n));   // 0.39.279 — shared preludes are not agents
  check('browser providers are exactly guardian\'s userscripts on disk', JSON.stringify(RA.guardianProviders()) === JSON.stringify(onDisk.sort()));
  check('chatgpt, gemini and deepseek are all available', ['chatgpt', 'gemini', 'deepseek'].every(p => RA.providers().includes(p)));
  check('a browser provider routes through guardian', JSON.stringify(RA.routeFor('deepseek')) === JSON.stringify({ backend: 'guardian', agent: 'deepseek' }));
  check('ollama routes through its own backend', RA.routeFor('ollama').backend === 'ollama');
  check('auto leaves routing to copilot', RA.routeFor('auto').backend === null);

  let repoRec = null;
  for (let i = 0; i < 20; i++) {
    repoRec = layer.ingest({ name: `prov-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
    if (!(repoRec && repoRec.error && /no spec-engine/.test(repoRec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = { ...(repoRec.repo || repoRec), compartmentId: 'cos.test.provider' };
  const U = repo.uuid;
  check('a real repo exists', !!U, JSON.stringify(repoRec).slice(0, 160));
  check('an unknown provider is refused with the list', RA.setProvider(U, 'bard').ok === false);
  // §DEFAULT-GUARDIAN 2026-09-21 — James: "needs to default to guardian".
  // Was 'auto' (copilot's own routing, unobservable from the settings tab);
  // deliberately changed, not silently — a fresh compartment now defaults
  // to a real, named guardian agent, same as any explicitly-set one.
  // §0.39.282 — the global default (repos.default_provider) is ollama now. The fallback when that setting is CLEARED is
  // still guardian's first agent — these cases exercise that fallback, so they clear the source first.
  const core0 = require('../../idearium/lib/config-core.cjs');
  check('repos.default_provider defaults to ollama (James: "Ollama should be default")', core0.resolve('repos.default_provider').def.default === 'ollama');
  RA.setDefaultProviderSource(null);
  check('with the global default cleared, the fallback is a real guardian agent (chatgpt), not auto', RA.getProvider(U) === 'chatgpt' && RA.defaultProvider() === 'chatgpt');
  check('isGuardianProvider is true for the default, false for auto/ollama', RA.isGuardianProvider(RA.getProvider(U)) === true && !RA.isGuardianProvider('auto') && !RA.isGuardianProvider('ollama'));
  { // settingsView — the one derivation the switch+dropdown API route reads
    const sv = RA.settingsView(U);
    check('settingsView: fresh compartment (global default cleared) is guardian-on, agent chatgpt', sv.useGuardian === true && sv.guardianAgent === 'chatgpt');
    RA.setProvider(U, 'ollama');
    const sv2 = RA.settingsView(U);
    check('settingsView: ollama reports guardian-off, agent null', sv2.useGuardian === false && sv2.guardianAgent === null);
    RA.setProvider(U, 'auto');
    const sv3 = RA.settingsView(U);
    check('settingsView: explicit auto reports guardian-on (not ollama), agent null — honest, not invented', sv3.useGuardian === true && sv3.guardianAgent === null);
  }
  { // §THREE-WAY 0.39.253 — James: "i want the cli in idearium to be like the 3 way cli in the floating menu cli in the tv ui"
    check('backendOf: ollama → ollama, auto → copilot, a guardian agent → guardian', RA.backendOf('ollama') === 'ollama' && RA.backendOf('auto') === 'copilot' && RA.backendOf('gemini') === 'guardian');
    RA.setProvider(U, 'auto'); check('settingsView reports the switch position: auto is copilot', RA.settingsView(U).backend === 'copilot');
    RA.setProvider(U, 'ollama'); check('…ollama is ollama', RA.settingsView(U).backend === 'ollama');
    RA.setProvider(U, 'chatgpt'); check('…a guardian agent is guardian', RA.settingsView(U).backend === 'guardian');
    check('a fresh compartment has no Ollama model of its own (null = the bridge default)', RA.settingsView(U).ollamaModel === null);
    const inst = ['qwen2.5-coder:7b', 'llama3.2:3b'];
    check('a model cannot be set without Ollama\'s installed list (bridge down) — refused, said why', RA.setOllamaModel(U, 'llama3.2:3b', { installed: null }).ok === false);
    const bad = RA.setOllamaModel(U, 'bard:1b', { installed: inst });
    check('a model that is not installed is refused, with the installed list', bad.ok === false && /not installed/.test(bad.errors[0]) && bad.errors[0].includes('llama3.2:3b'));
    check('an installed model is stored', RA.setOllamaModel(U, 'llama3.2:3b', { installed: inst }).ok && RA.settingsView(U).ollamaModel === 'llama3.2:3b');
    check('setting the model does not touch which backend wears the hat', RA.getProvider(U) === 'chatgpt');
    RA.setProvider(U, 'ollama');
    check('…and switching backend keeps the model', RA.settingsView(U).ollamaModel === 'llama3.2:3b');
    RA.setProvider(U, 'auto');   // the dispatch checks below start from an explicit auto, as they always have
  }

  const bodies = [];
  let reply = '';
  const srv = await new Promise((res, rej) => {
    const s = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
      let b = {}; try { b = JSON.parse(d); } catch (_) {}
      if (q.url === '/api/prompt/resolve') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ ok: true, provider: 'auto', backend: 'ollama', agent: null })); }
      if (q.url === '/api/prompt') bodies.push(b);
      const resolveQ = /Which repo-relative file does it belong in\?/.test(b.prompt || '');
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ ok: true, text: resolveQ ? 'src/helper.js' : reply, provider_used: b.agent || b.backend || 'copilot' }));
    }); });
    s.on('error', rej); s.listen(3750, '127.0.0.1', () => res(s));
  }).catch(e => { console.log(`  ! cannot bind :3750 — ${e.message}`); return null; });
  if (!srv) { process.exitCode = 1; return; }

  try {
    reply = 'plain';
    await RA.dispatch({ repo, repoDir: null, message: 'hi', layer });
    // 0.39.258 — the copilot position asks copilot which backend its default resolves to and sends the composed
    // prompt there (the plain path adds copilot's own context, which the agent settings cannot edit).
    check('auto (explicitly set above) asks copilot, then sends the resolved backend, composed', bodies[0].backend === 'ollama' && bodies[0].agent === undefined && bodies[0].tools && bodies[0].tools.composed === true);

    // §THREE-WAY 0.39.253 — the compartment's Ollama model reaches copilot as `model` (copilot passes it to the bridge).
    RA.setProvider(U, 'ollama'); bodies.length = 0; reply = 'plain';
    await RA.dispatch({ repo, repoDir: null, message: 'hi', layer });
    check('ollama wearing the hat sends backend ollama with the chosen model', bodies[0].backend === 'ollama' && bodies[0].model === 'llama3.2:3b', JSON.stringify({ backend: bodies[0].backend, model: bodies[0].model }));
    RA.setOllamaModel(U, null); bodies.length = 0;
    await RA.dispatch({ repo, repoDir: null, message: 'hi', layer });
    check('the default model sends no model at all (the bridge decides, as before)', bodies[0].backend === 'ollama' && !('model' in bodies[0]));
    RA.setOllamaModel(U, 'llama3.2:3b', { installed: ['llama3.2:3b'] }); RA.setProvider(U, 'chatgpt'); bodies.length = 0;
    await RA.dispatch({ repo, repoDir: null, message: 'hi', layer });
    check('a guardian dispatch never carries the Ollama model', bodies[0].backend === 'guardian' && !('model' in bodies[0]));
    RA.setOllamaModel(U, null);

    RA.setProvider(U, RA.defaultProvider());
    bodies.length = 0; reply = 'plain';
    await RA.dispatch({ repo, repoDir: null, message: 'hi', layer });
    check('the fallback provider (chatgpt) really routes guardian → chatgpt end to end', bodies[0].backend === 'guardian' && bodies[0].agent === 'chatgpt');

    for (const prov of ['chatgpt', 'gemini', 'deepseek']) {
      RA.setProvider(U, prov);
      bodies.length = 0;
      reply = `Done.\n\`\`\`js src/${prov}.js\nexport const who = '${prov}';\n\`\`\`\n\`\`\`js\nexport function helper_${prov}() {}\n\`\`\`\n@learn convention: ${prov} says exports are named, never default`;
      RI.setMode(U, 'auto');
      const r = await RA.dispatch({ repo, repoDir: null, message: `write the ${prov} file`, layer });
      const main = bodies.find(b => !/Which repo-relative file/.test(b.prompt || ''));
      const side = bodies.find(b => /Which repo-relative file/.test(b.prompt || ''));
      check(`${prov}: the dispatch routes guardian → ${prov}`, main && main.backend === 'guardian' && main.agent === prov);
      check(`${prov}: it wears the same hat (persona + protocols reach it)`, main && main.prompt.includes('@learn <fact|convention|pitfall>') && main.prompt.includes('Code you write for this project is written into it'));
      check(`${prov}: its stated-path code is written into the compartment`, r.injects && r.injects.injects.some(i => i.path === `src/${prov}.js` && i.status === 'applied'));
      const rb = layer.readFile(U, `src/${prov}.js`);
      check(`${prov}: the file is really in the repo, exact bytes`, rb && rb.content === `export const who = '${prov}';\n`);
      check(`${prov}: its unlabelled block is placed by asking the SAME provider`, side && side.agent === prov && r.injects.injects.some(i => i.addressedBy === 'agent'));
      check(`${prov}: what it learned is recorded, attributed to the agent`, MEM.list(U).some(o => o.text.includes(`${prov} says exports are named`) && o.source === 'agent'));
      check(`${prov}: the reply says which provider answered`, r.providerUsed === prov && r.provider === prov);
    }

    RA.setProvider(U, 'gemini'); bodies.length = 0; reply = 'x';
    await RA.dispatch({ repo, repoDir: null, message: 'q', provider: 'deepseek', layer });
    check('an explicit provider on one message beats the stored choice', bodies[0].agent === 'deepseek');
    bodies.length = 0;
    await RA.dispatch({ repo, repoDir: null, message: 'q', layer });
    check('…and the stored choice still holds afterwards', bodies[0].agent === 'gemini');
    const SRC = fs.readFileSync(path.join(ROOT, 'lib', 'repo-agent.js'), 'utf8');
    check('a browser provider gets a longer wait than 90s', /backend === 'guardian' && timeoutMs === DEFAULT_TIMEOUT_MS\) timeoutMs = 300000/.test(SRC));
  } finally {
    RI.setMode(U, 'review');
    try { RH.revokeRepoHat(U); } catch (_) {}
    MEM.clear(U); RA.clearHistory(U); srv.close();
  }

  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  // §DEFAULT-GUARDIAN 2026-09-21 — the flat <select id="agent-provider"> is
  // now a switch (guardian on/off) + a guardian-agent dropdown.
  // §THREE-WAY 0.39.253 — the guardian on/off checkbox is gone; the three-way switch replaces it everywhere.
  check('no checkbox decides the backend any more', !APP.includes('id="agent-use-guardian"') && !APP.includes('agentSetUseGuardian'));
  // §IN2a 2026-10-02 — a fourth position, claude-code (headless Claude Code, lib/claude-code-backend.js)
  check('the switch: ollama · copilot · guardian · claude-code, each sending only what it owns',
    /btn\('ollama',[\s\S]{0,80}btn\('copilot',[\s\S]{0,80}btn\('guardian',[\s\S]{0,80}btn\('claude-code',/.test(APP)
    && /backend === 'ollama' \? \{ provider: 'ollama' \} : backend === 'copilot' \? \{ provider: 'auto' \} : backend === 'claude-code' \? \{ provider: 'claude-code' \} : \{ useGuardian: true \}/.test(APP));
  check('the Agent tab CLI and Settings → Agents both render the same control', (APP.match(/_agentBackendHtml\(/g) || []).length >= 3);
  check('guardian shows its agents; ollama shows the installed models; copilot shows no dropdown',
    APP.includes('onchange="agentSetGuardianAgent(this.value)"') && APP.includes('onchange="agentSetOllamaModel(this.value)"') && APP.includes("copilot picks who answers; what is sent is still only these settings"));   // 0.39.258 wording
  check('the CLI has /model, documented in /help', APP.includes("case 'model':") && /'\s*\/model \[name\|default\]/.test(APP));   // 0.39.257 — /help regrouped (indented lines)
  const COP = fs.readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
  check('copilot /api/prompt passes body.model to Ollama (it dropped it)', /const olModel = body\.backend === 'ollama'[^\n]*body\.model/.test(COP) && /dispatchFn\(prompt, \{[^}]*model: olModel/.test(COP));
  { // idearium's model list, against a stub ollama bridge on :3749 — and without one
    const down = await api._ollamaModels();
    const okDown = down.ok === false && /unreachable|did not answer/.test(down.error) && Array.isArray(down.models) && down.models.length === 0;
    const bridge = await new Promise((res) => { const s = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(q.url === '/api/models' ? { ok: true, models: ['qwen2.5-coder:7b', 'llama3.2:3b'], active: 'qwen2.5-coder:7b' } : {})); });
      s.on('error', () => res(null)); s.listen(3749, '127.0.0.1', () => res(s)); });
    if (!bridge) { check('stub ollama bridge on :3749', false, 'port in use — a real bridge is running; not asserting against it'); }
    else {
      const up = await api._ollamaModels(); bridge.close();
      check('the model list is Ollama\'s installed models, with the bridge default', up.ok === true && JSON.stringify(up.models) === '["qwen2.5-coder:7b","llama3.2:3b"]' && up.active === 'qwen2.5-coder:7b');
      check('with no bridge the list is unavailable, with the reason — never a guessed list', okDown, JSON.stringify(down));
    }
  }
  // §0.39.282 — James, live: "was supposed to be ollama, set in the settings." A repo with no provider of its own
  // answers with the global choice (idearium config repos.default_provider → setDefaultProviderSource), never a literal.
  {
    const RAx = require('../../lib/repo-agent.js');
    const fresh = `fresh-${Date.now()}`;
    RAx.setDefaultProviderSource(() => 'ollama');
    check('a repo with no settings row answers with the global default (ollama)', RAx.getProvider(fresh) === 'ollama', RAx.getProvider(fresh));
    RAx.setDefaultProviderSource(() => 'no-such-provider');
    check('a stale global default falls back to a live provider, never an unknown one', RAx.providers().includes(RAx.getProvider(fresh)));
    RAx.setDefaultProviderSource(null);
    const core = require('../../idearium/lib/config-core.cjs');
    check('repos.default_provider is a real config key the settings console lists', core.resolve('repos.default_provider').def.type === 'string');
    check('idearium registers the source at boot', /setDefaultProviderSource\(\(\) => \{ try \{ return getIdeariumValue\('repos\.default_provider'\)/.test(fs.readFileSync(path.join(__dirname, '../../idearium/api/index.js'), 'utf8')));
  }
  check('the CLI has /provider, documented in /help', APP.includes("case 'provider':") && /'\s*\/provider \[name\]/.test(APP));   // 0.39.257 — /help regrouped

  fs.rmSync(process.env.NEXUS_INJECT_DIR, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 300);
}
setTimeout(() => main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); }), 2500);
