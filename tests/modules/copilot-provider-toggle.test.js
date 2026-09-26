'use strict';
// James: "a toggle switch to switch between ollama and guardian." Real gap
// found before building anything new: copilot/lifeline.js's route() already
// accepts an explicit opts.provider override (validated against guardian's
// own live /providers), but copilot/server.js's real POST /bridge/deliver
// handler never passed the caller's own choice through — always let
// lifeline auto-decide. Fixed at that exact gap.
//
// §FIX 2026-09-07 (merge) — this test's own first draft asserted
// `body.provider`, which turned out to be a real, separate bug: body is
// the RAW, still-wrapped {request:{uuid,payload}} object this handler
// receives — provider actually lives at payload.provider (this same
// handler's own top already does the real unwrap for exactly this
// reason). body.provider was always undefined, so the original fix
// never actually worked end to end despite this test passing — caught
// while merging a parallel thread's real toggle-UI work, which sends a
// real, specific provider value that only surfaced the bug once
// something downstream actually depended on receiving it correctly.
// Updated to assert the real, correct field.
//
// Same real, established pattern this test suite already uses for
// copilot/lifeline.js itself (tests/modules/test-lifeline-ask.js) — a
// structural check against the real shipped source, since spinning up
// copilot's full real HTTP server (session store, context assembly, RAG
// checks, guardian reachability) for one isolated behavior is a much
// bigger, riskier undertaking than this file's own convention already
// avoids.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
const LIFELINE_SRC = fs.readFileSync(path.join(ROOT, 'copilot/lifeline.js'), 'utf8');
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'copilot/config.js'), 'utf8');

test('T-001', "the real _lifeline.route() call passes resolvedProvider through — a real variable computed from payload.provider, not body.provider (the raw wrapped object)", () => {
  const callSiteStart = SRC.indexOf("`${contextText}\\n\\nUSER: ${prompt}\\nNEXUS CO-PILOT: `");
  assert.ok(callSiteStart > -1, 'could not find the real route() call site at all — has it moved or been rewritten?');
  const optsSlice = SRC.slice(callSiteStart, callSiteStart + 400);
  assert.ok(/provider:\s*resolvedProvider/.test(optsSlice), `expected provider: resolvedProvider in the real opts object passed to route(), got: ${optsSlice}`);
  assert.ok(!/provider:\s*body\.provider/.test(optsSlice), 'the old, always-undefined body.provider read must be genuinely gone, not just shadowed');
});

test('T-002', "resolvedProvider is genuinely computed FROM payload.provider (not body.provider), somewhere before the real route() call", () => {
  const callSiteStart = SRC.indexOf("`${contextText}\\n\\nUSER: ${prompt}\\nNEXUS CO-PILOT: `");
  const before = SRC.slice(Math.max(0, callSiteStart - 600), callSiteStart);
  assert.ok(/payload\.provider/.test(before), 'expected resolvedProvider\'s real computation to read payload.provider somewhere before the route() call');
  assert.ok(!/const resolvedProvider[\s\S]{0,150}body\.provider/.test(before), 'resolvedProvider must never be computed from body.provider — the raw, still-wrapped object where provider is always undefined');
});

test('T-003', 'lifeline.route() genuinely already supports an explicit provider override (the real capability this fix reuses, not duplicates)', () => {
  assert.ok(/let\s+ragProvider\s*=\s*opts\.provider/.test(LIFELINE_SRC), 'route() no longer reads opts.provider — the real capability this fix depends on may have changed underneath it');
});

test('T-004', 'lifeline.route() already treats \'auto\' as a real, valid value — the toggle\'s "guardian" option can rely on it rather than guessing a real agent name', () => {
  assert.ok(/'auto'/.test(LIFELINE_SRC), "expected a real 'auto' literal somewhere in lifeline's own provider-resolution logic");
});

// §NEW 2026-09-07 (merge) — the two real, symmetric gaps found while
// merging: neither side of the toggle actually guaranteed staying on
// its chosen backend before this fix.
test('T-005', 'provider:"guardian" has real, explicit handling that skips Ollama entirely, before the normal cascade ever runs', () => {
  const guardianIdx = LIFELINE_SRC.indexOf("if (opts.provider === 'guardian')");
  const ollamaCascadeIdx = LIFELINE_SRC.indexOf('// ── 1. Try Ollama');
  assert.ok(guardianIdx !== -1, 'expected a real, explicit provider:guardian branch');
  assert.ok(guardianIdx < ollamaCascadeIdx, 'the guardian branch must return before Ollama is ever attempted');
});

test('T-006', 'provider:"ollama" has real, explicit handling that never auto-escalates to Guardian on low confidence — honoring the user\'s explicit choice', () => {
  const ollamaExplicitIdx = LIFELINE_SRC.indexOf("if (opts.provider === 'ollama')");
  const ollamaCascadeIdx = LIFELINE_SRC.indexOf('// ── 1. Try Ollama');
  assert.ok(ollamaExplicitIdx !== -1, 'expected a real, explicit provider:ollama branch');
  assert.ok(ollamaExplicitIdx < ollamaCascadeIdx, 'the explicit-ollama branch must return before the normal (escalating) cascade runs');
  const block = LIFELINE_SRC.slice(ollamaExplicitIdx, ollamaExplicitIdx + 700);
  assert.ok(!/_tryGuardian/.test(block), 'the explicit-ollama branch must never call guardian — that is the exact real bug this closes');
});

test('T-007', 'both explicit branches fail honestly (ok:false) rather than silently falling back to the other backend — a silent fallback would recreate the exact "toggle shows one thing, does another" bug', () => {
  const guardianIdx = LIFELINE_SRC.indexOf("if (opts.provider === 'guardian')");
  const guardianBlock = LIFELINE_SRC.slice(guardianIdx, guardianIdx + 1600);
  assert.ok(/ok: false, text: null/.test(guardianBlock));

  const ollamaIdx = LIFELINE_SRC.indexOf("if (opts.provider === 'ollama')");
  const ollamaBlock = LIFELINE_SRC.slice(ollamaIdx, ollamaIdx + 700);
  assert.ok(/ok: false, text: null/.test(ollamaBlock));
});

// §NEW 2026-09-06 — James: "copilot is the middie option for what ever
// is enabled in the programmable configuration file." The real,
// 3-position toggle's middle option resolves through a real, single,
// named config value, not a second guess baked into this route.
test('T-008', 'copilot/config.js has a real, exported DEFAULT_PROVIDER value', () => {
  assert.ok(/DEFAULT_PROVIDER:\s*process\.env\.COPILOT_DEFAULT_PROVIDER/.test(CONFIG_SRC), 'expected a real, env-overridable DEFAULT_PROVIDER in copilot/config.js');
});

test('T-009', "a payload.provider of 'copilot' resolves through config.DEFAULT_PROVIDER, not a second, separate default", () => {
  const callSiteStart = SRC.indexOf("`${contextText}\\n\\nUSER: ${prompt}\\nNEXUS CO-PILOT: `");
  const before = SRC.slice(Math.max(0, callSiteStart - 600), callSiteStart);
  assert.ok(/payload\.provider\s*===\s*'copilot'/.test(before), "expected a real check for payload.provider === 'copilot' right before the real route() call");
  assert.ok(/config\.DEFAULT_PROVIDER/.test(before), "expected the real resolution to read config.DEFAULT_PROVIDER, not a hardcoded literal");
});

test('T-010', 'a genuinely absent provider also resolves through the same real config value, not a second, silently-different default', () => {
  const callSiteStart = SRC.indexOf("`${contextText}\\n\\nUSER: ${prompt}\\nNEXUS CO-PILOT: `");
  const before = SRC.slice(Math.max(0, callSiteStart - 600), callSiteStart);
  assert.ok(/!payload\.provider\s*\|\|\s*payload\.provider\s*===\s*'copilot'/.test(before), 'expected one real condition covering both "no provider sent" and "copilot explicitly chosen" — not two, possibly-divergent defaults');
});

// ── /api/prompt — the sibling endpoint, same real bug, fixed separately ────
// James: "It's giving me blank responses with a confidence score. The
// toggle, and drop menus aren't hooked into anything." Confirmed real:
// this endpoint (ui/tv-shell/menu.js's only real target) never read
// body.provider at all, unlike /bridge/deliver above — same bug class,
// a genuinely separate real handler, fixed with the same real
// resolvedProvider convention rather than a third, different one.
test('T-011', "POST /api/prompt's handler computes a real resolvedProvider from body.provider, not the raw wrapped object", () => {
  const idx = SRC.indexOf("method === 'POST' && p === '/api/prompt'");
  assert.ok(idx > -1, "could not find the real POST /api/prompt route at all — has it moved?");
  const block = SRC.slice(idx, idx + 2200);
  assert.ok(/const resolvedProvider = \(!body\.provider \|\| body\.provider === 'copilot'\)/.test(block));
});

test('T-012', "/api/prompt's real lifeline.route() call actually passes resolvedProvider through, not the old, ignored body.provider", () => {
  const idx = SRC.indexOf("method === 'POST' && p === '/api/prompt'");
  // 0.39.265 — was SRC.slice(idx, idx + 13000): the handler grew and its
  // lifeline.route() call sits ~17k characters in, so this failed on correct
  // code (the boot "VITALS CHECK FAILED" item). Read to the next route instead.
  const end = SRC.indexOf("if (method ===", idx + 1);
  assert.ok(idx > 0 && end > idx, '/api/prompt handler not found');
  const block = SRC.slice(idx, end);
  assert.ok(/await _lifeline\.route\([^;]*provider:\s*resolvedProvider/.test(block), "expected the real lifeline.route() call in this handler to use resolvedProvider");
});

test('T-013', "ui/tv-shell/menu.js sends the real, current toggle/dropdown state on every /api/prompt call, not a hardcoded or missing value", () => {
  const menuSrc = fs.readFileSync(path.join(ROOT, 'ui/tv-shell/menu.js'), 'utf8');
  const idx = menuSrc.indexOf('_copilotPrompt');
  const block = menuSrc.slice(idx, idx + 1200);
  assert.ok(/const provider = _backend === 'guardian' \? _agent : _backend;/.test(block));
  const postIdx = block.indexOf('_post(');
  assert.ok(postIdx > -1 && /provider\s*[,}\s]/.test(block.slice(postIdx, postIdx + 220)), 'the computed provider must actually be sent in the real request body');
});

test('T-014', "menu.js's /backend and /agent are real, event-driven CLI commands — James: 'make them event driven command line based, since they're commands'", () => {
  const menuSrc = fs.readFileSync(path.join(ROOT, 'ui/tv-shell/menu.js'), 'utf8');
  assert.ok(/\/backend\\s\+\(ollama\|copilot\|guardian\)/.test(menuSrc.replace(/\\\\/g, '\\')) || /\^\\\/backend/.test(menuSrc));
  assert.ok(/function setBackend/.test(menuSrc));
  assert.ok(/function setAgent/.test(menuSrc));
  assert.ok(/window\.NexusMenu = \{[^}]*setBackend[^}]*setAgent/.test(menuSrc), 'setBackend/setAgent must be genuinely exported, not just defined locally');
});

// ── Real backend bypass — James: "I don't want it to route through
// lifeline. Toggle needs to actually toggle copilot between guardian." ────
test('T-015', 'lifeline.js exports dispatchToOllama alongside the existing dispatchToNcpAgent — both real, direct dispatch functions the toggle can call without going through route()\'s cascade', () => {
  const lifelineSrc = fs.readFileSync(path.join(ROOT, 'copilot/lifeline.js'), 'utf8');
  assert.ok(/dispatchToNcpAgent:\s*_tryGuardian/.test(lifelineSrc));
  assert.ok(/dispatchToOllama:\s*_tryOllama/.test(lifelineSrc));
});

test('T-016', "POST /api/prompt's real backend bypass exists, checked BEFORE copilot's own intent routing — a genuine bypass of copilot itself, not just lifeline", () => {
  const idx = SRC.indexOf("body.backend === 'guardian' || body.backend === 'ollama'");
  const intentsIdx = SRC.indexOf("require('./intents.js')");
  assert.ok(idx > -1, 'expected the real backend bypass check to exist');
  assert.ok(intentsIdx > -1 && idx < intentsIdx, 'the backend bypass must run before copilot\'s own intent routing, not after');
});

test('T-017', 'the real bypass calls dispatchToNcpAgent/dispatchToOllama directly — never lifeline.route()', () => {
  const idx = SRC.indexOf("body.backend === 'guardian' || body.backend === 'ollama'");
  const block = SRC.slice(idx, idx + 900);
  assert.ok(/_lifeline\.dispatchToNcpAgent/.test(block));
  assert.ok(/_lifeline\.dispatchToOllama/.test(block));
  assert.ok(!/_lifeline\.route\(/.test(block), 'the bypass block itself must never call route() — that would defeat the whole point');
});

test('T-018', 'a failed direct dispatch fails honestly (502, real error) — never silently falls through to the lifeline-routed path, which would recreate the exact "toggle does something else" bug', () => {
  const idx = SRC.indexOf("body.backend === 'guardian' || body.backend === 'ollama'");
  // 0.39.248 — was SRC.slice(idx, idx + 900): the block's comments grew past 900
  // characters, so this failed on correct code (a boot "VITALS CHECK FAILED" item
  // since at least 0.39.236). Read to the block's own end instead.
  const end = SRC.indexOf('\n      return;\n    }', idx);
  assert.ok(idx > 0 && end > idx, 'direct-dispatch block not found');
  const block = SRC.slice(idx, end);
  assert.ok(/json\(res, 502,/.test(block));
  assert.ok(!/_lifeline\.route\(/.test(block), 'the direct block must never fall through to lifeline.route()');
});

test('T-019', 'menu.js sends backend and agent explicitly on every _copilotPrompt call, activating the real bypass when toggled away from copilot', () => {
  const menuSrc = fs.readFileSync(path.join(ROOT, 'ui/tv-shell/menu.js'), 'utf8');
  const idx = menuSrc.indexOf('_copilotPrompt');
  const block = menuSrc.slice(idx, idx + 1200);
  assert.ok(/backend:\s*_backend/.test(block));
});

test('T-020', "the real /tell command exists and deliberately sends provider WITHOUT backend — James: 'Tell <provider> prompt uses lifeline' — so it flows through the existing, unchanged lifeline-routed path, not the new bypass", () => {
  const menuSrc = fs.readFileSync(path.join(ROOT, 'ui/tv-shell/menu.js'), 'utf8');
  const idx = menuSrc.indexOf('tellMatch');
  assert.ok(idx > -1, 'expected a real /tell command handler');
  const block = menuSrc.slice(idx, idx + 700);
  assert.ok(/provider:\s*targetAgent/.test(block));
  assert.ok(!/backend:/.test(block), '/tell must NOT send backend — sending it would wrongly trigger the direct bypass instead of using lifeline');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
