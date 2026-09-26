'use strict';
/**
 * copilot/module-builder.js
 * comp_id: nexus.copilot.module-builder
 * uuid: nexus-copilot-module-builder-v1-0000-2026-0627-jamesbrooks-001
 * spec: docs/copilot-expansion.spec
 *
 * Co-pilot builds its own modules from user descriptions.
 * Always: map → spec → QC → contract → build → verify → merge.
 * Uses nexus-system-foundation template. Follows architecture + axioms.
 * Every step is a contract in the relevant system's input/ folder.
 */
'use strict';

const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const lifeline = require('./lifeline');
const axiomMgr = require('./axiom-manager');

const ROOT      = path.join(__dirname, '..');
const MODULE_ID = 'copilot/module-builder';
const VERSION   = '1.0.0';

// System foundation template (from docs/nexus-system-foundation.spec)
const SPEC_TEMPLATE = (name, purpose, port, targetSystem) => `spec:
  meta:
    name:        ${name}
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        ${port || 'N/A'}
    uuid:        nexus-${name}-v1-0000-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-jamesbrooks-001
    status:      active
    purpose: >
      ${purpose}

  core:
    schemas:   []
    axioms:    [AX-001, AX-002, AX-003, AX-004, AX-005]
    constants: {}

  events:
    emits:   []
    handles: []

  routes:
    - method: GET  path: /health
    - method: GET  path: /contract
    - method: GET  path: /events

  handshake:
    components: []

  modules:
    - id: core
      path: ${targetSystem}/${name}.js
      description: >
        ${purpose}

  tests: []

  phases:
    - id: 0
      name: Foundation (L0)
      status: next
      builds: [schemas, constants, axioms]
    - id: 1
      name: Event bus (L1)
      status: pending
    - id: 2
      name: CLI (L2)
      status: pending
    - id: 3
      name: API (L3)
      status: pending
    - id: 4
      name: Handshake (L4)
      status: pending
    - id: 5
      name: UI (L5)
      status: pending
`;

/**
 * Map a user description to a module plan.
 * Uses LIFELINE to understand intent + identify target system.
 */
async function map(description, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();

  // §SELF-BUILD-EXT 2026-08-14 — the real gap found and confirmed by
  // reading this function's OLD prompt directly: it only ever asked the
  // LLM to invent a brand-new module. Zero concept of "this request is
  // about something that already exists" — confirmed, not assumed, by
  // checking generateSpec() too (it never read a real file either).
  // Fixed at the SOURCE, before the LLM is ever asked anything: try to
  // resolve a real, already-registered component from the description's
  // own words FIRST, deterministically, via lib/loom-map.js's real
  // resolveComponent() (built this session) — no LLM call needed for
  // this part, same "deterministic first, LLM only where it adds value"
  // discipline generateSpec()'s own architecture-selection step already
  // uses (_tryIdeariumArchitecture, real, unmodified, right below).
  const existingTarget = _resolveExistingTarget(description, opts);

  const mapPrompt = `You are the NEXUS architecture system. A user wants to add a capability.

User request: "${description}"
${existingTarget ? `
A REAL, ALREADY-REGISTERED component was resolved from this request before you were asked anything — do not invent a competing one:
  id: ${existingTarget.componentId}
  system: ${existingTarget.system}
  file: ${existingTarget.dir || '(no dir on record)'}
  comp_status: ${existingTarget.compStatus || '(not set)'}
  real current content (the actual file, not a guess) follows between the markers:
--- EXISTING FILE START ---
${existingTarget.content ? existingTarget.content.slice(0, 4000) : '(file content unavailable — component is registered but its real file could not be read; treat as edit-blind and say so in gaps)'}
--- EXISTING FILE END ---
This request is almost certainly an EDIT, EXPANSION, or REPAIR of this real component, not a new one. Set scope accordingly (see #6 below) and reference the existing content in your plan rather than proposing a parallel reinvention.
` : ''}
Map this to:
1. A module name (snake_case, short)
2. A one-sentence purpose
3. Which NEXUS system it belongs to (guardian/cortex/copilot/eravos/idearium/architect/emerge/bridge/ollama)
4. What existing NEXUS capabilities it should use
5. Any gaps or questions before building
6. Scope: "cli" if this is just asking for a new CLI command / shortcut /
   alias for something co-pilot can already do (no new logic, no new route,
   no new system) — "module" if it needs genuinely new code with no real
   existing target — "edit" if a real existing component (above, if
   present) needs a specific, scoped change — "expand" if it needs new
   capability ADDED to a real existing component without replacing what's
   there — "repair" if something existing is broken and needs fixing back
   to its own intended behavior. When in doubt between "module" and one of
   edit/expand/repair, and a real existingTarget was resolved above, prefer
   the existing-target scope — inventing a parallel module next to a real
   one that already does the job is worse than asking one more question.

Respond as JSON only:
{ "name": string, "purpose": string, "targetSystem": string, "usesCapabilities": string[], "gaps": string[], "ready": boolean, "scope": "cli" | "module" | "edit" | "expand" | "repair", "grammarAliases": string[], "contractType": "build" | "module" | "expand" | "repair" }`;

  const result = await lifeline.route(mapPrompt, { requestId, intent: 'map', ...opts });

  if (!result.ok) return { ok: false, error: 'Lifeline unavailable' };

  // Parse the JSON response
  let plan = null;
  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
    plan = JSON.parse(cleaned);
  } catch(_) {
    // Fallback: extract what we can
    plan = { name: 'new-module', purpose: description, targetSystem: 'copilot', gaps: ['Could not parse plan'], ready: false };
  }

  // §SELF-BUILD-EXT — the real existing content/id travels WITH the plan
  // regardless of what the LLM's JSON did or didn't echo back, so
  // generateSpec() downstream never has to re-resolve or re-guess it.
  if (existingTarget) {
    plan.existingComponentId = existingTarget.componentId;
    plan.existingContent = existingTarget.content;
    plan.existingDir = existingTarget.dir;
    if (!['edit', 'expand', 'repair'].includes(plan.scope)) {
      // The LLM didn't pick an existing-target scope despite one being
      // handed to it — surfaced as a real gap, not silently overridden
      // (the LLM may have a real reason; a human/caller should see this).
      plan.gaps = [...(plan.gaps || []), `A real existing component (${existingTarget.componentId}) was resolved but scope came back "${plan.scope}", not edit/expand/repair — confirm this is intentional before building.`];
    }
  }

  return { ok: true, plan, confidence: result.confidence, requestId };
}

/**
 * §SELF-BUILD-EXT 2026-08-14 — deterministic, no-LLM resolution of an
 * existing target from the description's own words. Real, not fuzzy:
 * tries each individual word/hyphenated-token in the description against
 * lib/loom-map.js's real resolveComponent() (checks loom's actual live
 * registry, honest found:false for anything not really registered —
 * never fabricates a match). Returns null, not a guess, when nothing
 * resolves — a request for something genuinely new must still be able
 * to reach scope:"module" cleanly.
 */
function _resolveExistingTarget(description, opts = {}) {
  let loomMap;
  try { loomMap = require('../lib/loom-map'); } catch (_) { return null; }
  const tokens = description
    .toLowerCase()
    .split(/[\s,.:;!?]+/)
    .filter(t => t.length > 2)
    .map(t => t.replace(/[^a-z0-9._-]/g, ''));

  // §SELF-BUILD-EXT — try an exact id/hook match first (resolveComponent's
  // own real, honest exact lookup), THEN fall back to a real segment
  // match against loom's actual registered ids. Confirmed by testing
  // directly that natural language never contains a fully-qualified
  // dotted id ("contracts" resolves to nothing via resolveComponent
  // alone, even though "nexus.lib.agent-system.contracts" is a real,
  // registered component) — exact-only would make this feature useless
  // for how people actually describe things. Segment match is still
  // deterministic and honest: a token must equal a whole dotted segment
  // of a real id, not a fuzzy substring, so "contract" doesn't
  // accidentally match "contracts" or "contract-queue" by coincidence.
  let map = null;
  try { map = loomMap.getMap(opts); } catch (_) { map = null; }
  const allIds = map?.available ? Object.keys(map.components) : [];

  // §SELF-BUILD-EXT — collect ALL matches across every token first, THEN
  // decide — found the greedy "return on first token that happens to
  // match" version is wrong in practice: a common word early in a
  // sentence (e.g. "system") can uniquely match some unrelated real
  // component before a later, more semantically specific word ("contracts")
  // ever gets a chance. Confirmed by testing directly: "I want to expand
  // the contracts system for agents" resolved to loom.phasemap.system
  // (matched on the word "system") instead of the actually-intended
  // agent-system.contracts component. Collecting every token's match and
  // only auto-resolving when the WHOLE description points at exactly one
  // real component (not just one token) is the honest fix — ambiguous
  // stays unresolved rather than confidently wrong.
  // §SELF-BUILD-EXT — a single token is often ambiguous alone (agent-system
  // -> {contracts, submit}; contracts -> 10 real components) but the
  // INTERSECTION of multiple co-occurring tokens' candidate sets is often
  // exactly one. Confirmed by testing directly: "agent-system contracts"
  // individually resolve to 2 and 10 candidates respectively; their
  // intersection is exactly nexus.lib.agent-system.contracts. Computing
  // per-token candidate sets first, then intersecting, catches this
  // without ever being told which tokens "belong together" — still fully
  // deterministic, still refuses (empty or >1 intersection) rather than
  // guessing.
  const candidateSets = [];
  for (const token of tokens) {
    const exact = loomMap.resolveComponent(token, opts);
    if (exact.found) { candidateSets.push(new Set([exact.componentId])); continue; }
    const segmentMatches = allIds.filter(id => id.split('.').includes(token));
    if (segmentMatches.length > 0) candidateSets.push(new Set(segmentMatches));
  }

  if (candidateSets.length >= 2) {
    // Intersect every pair of candidate sets that share at least one real
    // id — a real, present token narrowing the search, not a coincidence.
    const counts = new Map();
    for (const set of candidateSets) for (const id of set) counts.set(id, (counts.get(id) || 0) + 1);
    const inMultipleSets = [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
    if (inMultipleSets.length === 1) {
      const componentId = inMultipleSets[0];
      return _hydrateTarget({ found: true, componentId, system: loomMap.resolveSystem(componentId) }, loomMap, opts);
    }
  }

  const uniqueMatches = new Map(); // componentId -> which token(s) matched it
  for (const token of tokens) {
    const exact = loomMap.resolveComponent(token, opts);
    if (exact.found) {
      if (!uniqueMatches.has(exact.componentId)) uniqueMatches.set(exact.componentId, []);
      uniqueMatches.get(exact.componentId).push(token);
      continue;
    }
    const segmentMatches = allIds.filter(id => id.split('.').includes(token));
    if (segmentMatches.length === 1) {
      const id = segmentMatches[0];
      if (!uniqueMatches.has(id)) uniqueMatches.set(id, []);
      uniqueMatches.get(id).push(token);
    }
    // segmentMatches.length > 1 (token itself is ambiguous, e.g. "system")
    // contributes nothing — correctly excluded, not guessed.
  }

  if (uniqueMatches.size === 1) {
    const [componentId] = uniqueMatches.keys();
    return _hydrateTarget({ found: true, componentId, system: loomMap.resolveSystem(componentId) }, loomMap, opts);
  }
  // 0 matches: nothing real referenced, correctly null (genuinely new work).
  // 2+ matches: the description points at multiple distinct real
  // components — genuinely ambiguous, correctly left unresolved rather
  // than picking one arbitrarily.
  return null;
}

function _hydrateTarget(resolved, loomMap, opts) {
  let content = null;
  let dir = null;
  try {
    const map = loomMap.getMap(opts);
    const comp = map.components[resolved.componentId];
    dir = comp?.dir || null;
    if (dir) {
      const candidate = path.join(ROOT, dir);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        content = fs.readFileSync(candidate, 'utf8');
      }
    }
  } catch (_) { /* content/dir stay null — honest, not fatal */ }
  return {
    componentId: resolved.componentId, system: resolved.system, dir, content,
    compStatus: (() => { try { return loomMap.getMap(opts).components[resolved.componentId]?.comp_status; } catch (_) { return null; } })(),
  };
}

/**
 * §Phase-36 / capability_cli_authoring fix, 2026-06-29.
 * map() classified this as scope:'cli' — a shortcut for something co-pilot
 * can already do, not a new module. Register a component directly instead
 * of running the full spec→QC→build pipeline. componentRegistry.register()
 * already auto-projects (.cli, .grammar, Phase 40 T1.5) and emits
 * component.registered, which grammar-engine.js already rebuilds its trie
 * from live — both of those were already wired. This function is the only
 * piece that was actually missing: the short-circuit itself.
 * Route points at copilot's own /api/prompt with the original description
 * as the default prompt param, so invoking the new command just re-asks
 * co-pilot the same thing — it's a saved shortcut, not new logic.
 */
async function registerCliCommand(plan, description, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();
  if (!plan?.name) {
    return { ok: false, error: 'No name in plan — cannot register a CLI command', requestId };
  }

  const componentRegistry = require('../lib/component-registry');
  const projector         = require('../copilot/lib/descriptor-projector');

  const aliases = Array.isArray(plan.grammarAliases) && plan.grammarAliases.length
    ? plan.grammarAliases
    : [plan.name.replace(/_/g, ' ')];

  const component = {
    id:           `copilot.cli.${plan.name}`,
    namespace:    'copilot',
    name:         plan.name,
    version:      '1.0.0',
    description:  plan.purpose || description,
    grammar:      aliases,
    route:        { method: 'POST', path: '/api/prompt' },
    params:       [{ name: 'prompt', type: 'string', required: false, default: description }],
    registeredBy: 'copilot',
    tags:         ['copilot', 'cli-authored'],
  };

  const reg = componentRegistry.register(component);
  if (!reg.ok) {
    return { ok: false, error: 'Component registration failed', details: reg.errors, requestId };
  }

  let projections = null;
  try { projections = projector.project(component); } catch(_) {}

  return {
    ok: true,
    skippedFullPipeline: true,
    component,
    cli: projections?.cli || null,
    grammar: projections?.grammar || null,
    message: `Registered "${plan.name}" as a CLI command — try: ${aliases[0]}`,
    requestId,
  };
}

/**
 * Generate a spec from the map plan.
 */
// §NEW 2026-07-11 — real "pick the best architecture for the job," not the
// LLM inventing structure from scratch on every single build. idearium's
// spec-engine has real, deterministic architecture templates (this same
// session added architecture/schemas/checklists/axioms/compartments plus
// system-archetype templates minimal-kernel/api-service/event-system/
// plugin-runtime/ai-agent-system) — until now, generateSpec() never used
// any of them; every spec was a fresh LLM freeform generation with no
// persisted architectural decision behind it. This selects the best-
// matching templates by real signal (plan.purpose/usesCapabilities/name),
// creates a REAL spec in idearium (persisted, versioned, rootHash-
// tracked — an inspectable record of which architecture was chosen and
// why, not just an LLM's ephemeral choice), and uses its deterministic
// content as grounding context for the final YAML spec generation —
// Emerge's compiler still gets the exact format it expects; the decision
// behind it is now real and durable instead of reinvented every call.
const IDEARIUM_URL = process.env.IDEARIUM_URL || 'http://127.0.0.1:4800';

function _selectArchitectureTemplates(plan) {
  const signal = `${plan.name || ''} ${plan.purpose || ''} ${(plan.usesCapabilities || []).join(' ')}`.toLowerCase();
  const picks = ['compartments', 'axioms']; // always: every module gets a real map + the standing axiom set
  const rules = [
    { test: /\bapi\b|\brest\b|\bendpoint/,                     template: 'api-service' },
    { test: /\bevent\b|\bqueue\b|\bpubsub\b|\bpub\/sub\b/,      template: 'event-system' },
    { test: /\bplugin\b|\bextensible\b|\bmodular\b/,           template: 'plugin-runtime' },
    { test: /\bagent\b|\bai\b|\bllm\b|\bassistant\b/,           template: 'ai-agent-system' },
    { test: /.*/,                                              template: 'minimal-kernel' }, // fallback — always matches, always last
  ];
  for (const r of rules) {
    if (r.test.test(signal)) { picks.push(r.template); break; } // first real match wins; minimal-kernel is the catch-all
  }
  picks.push('architecture', 'schemas', 'checklists');
  return picks;
}

async function _tryIdeariumArchitecture(plan, opts) {
  const templateIds = _selectArchitectureTemplates(plan);
  try {
    const res = await fetch(`${IDEARIUM_URL}/api/spec-engine/specs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: plan.name, type: plan.targetSystem || 'component',
        description: plan.purpose, templateIds, buildEngine: 'auto',
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const manifest = data.manifest;
    if (!manifest) return null;

    // Pull whatever sections idearium seeded deterministically (no agent
    // dispatch — this is the real, zero-token architectural grounding).
    const grounding = (manifest.chunks || [])
      .filter(c => c.status === 'complete' && c.content)
      .map(c => `### ${c.sectionId}\n${c.content.slice(0, 800)}`)
      .join('\n\n');

    return {
      ideariumSpecUuid: manifest.uuid,
      ideariumRootHash: manifest.rootHash,
      templateIds,
      grounding,
    };
  } catch (e) {
    console.warn(`[module-builder] idearium architecture selection unreachable, falling back to freeform: ${e.message}`);
    return null;
  }
}

async function generateSpec(plan, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();

  // Real architecture selection first — deterministic templates, no LLM
  // needed for this part, persisted and traceable in idearium regardless
  // of whether the LLM call below succeeds.
  const arch = await _tryIdeariumArchitecture(plan, opts);

  // §SELF-BUILD-EXT 2026-08-14 — the actual fix: when map() resolved a
  // real existing target, its real content travels through plan
  // (existingComponentId/existingContent, set in map() above) and gets
  // INCLUDED in the prompt here — previously this function never checked
  // for it at all, confirmed by reading the old code directly, so even
  // if map() had somehow known about an existing file, generateSpec()
  // would still have invented a spec with zero awareness of it.
  const specPrompt = `Generate a NEXUS spec for this ${plan.existingComponentId ? 'CHANGE to an existing component' : 'module'} using the nexus-system-foundation template.

Module: ${plan.name}
Purpose: ${plan.purpose}
Target system: ${plan.targetSystem}
Uses: ${(plan.usesCapabilities || []).join(', ')}
${arch ? `\nA deterministic architecture was already selected for this module (idearium spec ${arch.ideariumSpecUuid}, templates: ${arch.templateIds.join(', ')}). Ground the spec below in this real, chosen structure — don't invent a different architecture:\n\n${arch.grounding}\n` : ''}
${plan.existingComponentId ? `
This is a real EDIT/EXPAND/REPAIR against an existing, already-registered component — NOT a fresh module. The spec must describe the DIFFERENCE from what's already there, not a parallel reinvention:
  existing component id: ${plan.existingComponentId}
  existing comp_status:  (see plan)
  real current content follows (empty means it couldn't be read — say so in the spec's own gaps, don't invent replacement content for what you can't see):
--- EXISTING CONTENT START ---
${plan.existingContent ? plan.existingContent.slice(0, 4000) : '(unavailable)'}
--- EXISTING CONTENT END ---
` : ''}
The spec must:
- Follow L0→L1→L2→L3→L4→L5 build order
- Declare all components with comp_id and uuid
- Declare all hooks (in/out) with wires_to[]
- Include a phase map
- Follow SISO architecture
- Reference relevant axioms (§AX-001 through §AX-007)
${plan.existingComponentId ? '- Set comp_dependencies to include ' + plan.existingComponentId + ' if this is additive (expand), or note it directly replaces/patches that component if this is edit/repair' : ''}

Respond with the full spec in YAML format starting with "spec:"`;

  const result = await lifeline.route(specPrompt, { requestId, intent: 'generate-spec', ...opts });

  if (!result.ok) {
    // Fall back to template
    return { ok: true, spec: SPEC_TEMPLATE(plan.name, plan.purpose, null, plan.targetSystem), fromTemplate: true, architecture: arch };
  }

  return { ok: true, spec: result.text, confidence: result.confidence, requestId, architecture: arch };
}

/**
 * Run the QC pipeline on a spec.
 * Returns { passed, stage_failed, reason, suggestions, confidence }
 */
async function runQC(spec, plan, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();

  // Stage 1: Axiom check
  const axiomResult = axiomMgr.check(spec);
  if (!axiomResult.passed) {
    return {
      passed: false,
      stage_failed: 'axiom_check',
      reason: `Axiom violations: ${axiomResult.violations.map(v => v.axiom + ': ' + v.reason).join('; ')}`,
      suggestions: ['Remove mocks/stubs', 'Add explicit error handling', 'Preserve all data (§2.1)'],
      confidence: 0,
      requestId,
    };
  }

  // Stage 2: Architecture check via LIFELINE
  const archPrompt = `Review this NEXUS module spec for architecture compliance.

SPEC:
${spec.slice(0, 2000)}

Check:
1. Does it follow nexus-system-foundation layers (L0→L5)?
2. Does it follow SISO principles?
3. Are components properly declared with comp_id + uuid?
4. Are hooks declared with wires_to[]?
5. Is there a phase map?

Respond as JSON: { "passed": boolean, "score": 0-1, "issues": string[], "suggestions": string[] }`;

  const archResult = await lifeline.route(archPrompt, { requestId, intent: 'qc-architecture', ...opts });

  let archCheck = { passed: true, score: 0.8, issues: [], suggestions: [] };
  try {
    const cleaned = (archResult.text || '').replace(/```json\n?|\n?```/g, '').trim();
    archCheck = JSON.parse(cleaned);
  } catch(_) {}

  if (!archCheck.passed && archCheck.score < 0.6) {
    return {
      passed: false,
      stage_failed: 'architecture_check',
      reason: archCheck.issues?.join('; ') || 'Architecture does not follow nexus-system-foundation',
      suggestions: archCheck.suggestions || [],
      confidence: archCheck.score || 0.3,
      requestId,
    };
  }

  // Stage 3: Adversarial review via LIFELINE
  const adversarialPrompt = `You are a hostile reviewer. Tear apart this NEXUS module spec.

SPEC:
${spec.slice(0, 1500)}

Find:
- Silent failures
- Missing error handling
- Axiom violations
- Assumptions not validated
- Missing tests
- Coupling violations

Be constructive. Respond as JSON: { "passed": boolean, "violations": string[], "fixes": string[], "confidence": 0-1 }`;

  const advResult = await lifeline.route(adversarialPrompt, { requestId, intent: 'qc-adversarial', ...opts });

  let advCheck = { passed: true, violations: [], fixes: [], confidence: 0.8 };
  try {
    const cleaned = (advResult.text || '').replace(/```json\n?|\n?```/g, '').trim();
    advCheck = JSON.parse(cleaned);
  } catch(_) {}

  if (!advCheck.passed && (advCheck.violations || []).length > 3) {
    return {
      passed: false,
      stage_failed: 'adversarial_review',
      reason: advCheck.violations?.slice(0,3).join('; ') || 'Failed adversarial review',
      suggestions: advCheck.fixes || [],
      confidence: advCheck.confidence || 0.4,
      requestId,
    };
  }

  return {
    passed: true,
    stage_failed: null,
    reason: 'All QC stages passed',
    suggestions: [...(advCheck.fixes || [])],
    confidence: Math.min(archCheck.score || 0.8, advCheck.confidence || 0.8),
    requestId,
  };
}

/**
 * Full pipeline: map → spec → QC → contract.
 * Returns a build contract ready for Emerge.
 */
async function build(description, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();
  let iteration   = 0;
  const MAX_ITER  = 3;

  console.log(`[module-builder] build request: "${description.slice(0, 80)}"`);

  // Step 1: Map
  const mapped = await map(description, { ...opts, requestId });
  if (!mapped.ok) return { ok: false, error: mapped.error, requestId };

  const plan = mapped.plan;
  console.log(`[module-builder] mapped: ${plan.name} → ${plan.targetSystem}`);

  // §Phase-36 short-circuit: "just a CLI command" skips spec/QC/build entirely.
  if (plan.scope === 'cli') {
    console.log(`[module-builder] scope:cli — registering directly, no spec pipeline`);
    return await registerCliCommand(plan, description, { ...opts, requestId });
  }

  if (plan.gaps?.length && !opts.skipGaps) {
    return {
      ok: false,
      needsInfo: true,
      gaps: plan.gaps,
      plan,
      message: `Before building, I need answers to: ${plan.gaps.join('; ')}`,
      requestId,
    };
  }

  // Step 2: Generate spec + QC loop
  let spec    = null;
  let architecture = null;
  let qcResult = null;

  while (iteration < MAX_ITER) {
    iteration++;

    const specResult = await generateSpec(plan, { ...opts, requestId });
    spec = specResult.spec;
    architecture = specResult.architecture || architecture;

    // Step 3: QC
    qcResult = await runQC(spec, plan, { ...opts, requestId });
    console.log(`[module-builder] QC iteration ${iteration}: ${qcResult.passed ? 'PASS' : 'FAIL'} (${qcResult.stage_failed || 'all stages'})`);

    if (qcResult.passed) break;

    if (iteration < MAX_ITER) {
      // Fix the spec based on QC feedback
      const fixPrompt = `Fix this NEXUS spec. QC failure reason: "${qcResult.reason}". Suggestions: ${qcResult.suggestions?.join('; ') || 'none'}.

Original spec:
${spec.slice(0, 1500)}

Return the fixed spec only, starting with "spec:"`;

      const fixResult = await lifeline.route(fixPrompt, { requestId, intent: 'fix-spec', ...opts });
      if (fixResult.ok && fixResult.text?.includes('spec:')) {
        spec = fixResult.text;
      }
    }
  }

  // §FIX 2026-09-06 — PULSE_ALL_2026-09-06 / emerge simplification. James:
  // "its just a compiler thats it, the rest is trash." Traced the full
  // real chain before touching anything: this cq.dispatch() wrote a file
  // to emerge/input/, and emerge/consumer.js was a separate, standalone
  // process (spawned by autopilot.js) that polled that directory every
  // 5s, accepted the contract, wrote the spec back to disk a SECOND time,
  // and only then called the real compiler — compile() itself was always
  // the only real work; everything else was file-drop/poll/accept
  // ceremony around it. idearium/compiler-bridge.js already proves the
  // direct-call pattern works for the exact same compiler. Replaced with
  // exactly that: write the spec once, call compile() directly, await
  // its real result. No queue, no poller, no second process.
  const buildUuid = require('crypto').randomUUID();
  const buildDir  = path.join(__dirname, '..', 'data', 'emerge', 'builds', buildUuid);
  fs.mkdirSync(buildDir, { recursive: true });
  const safeName  = plan.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'module';
  const specPath  = path.join(buildDir, `${safeName}.spec`);

  let buildResult = { ok: false, error: 'build skipped — QC did not pass' };
  if (qcResult?.passed) {
    fs.writeFileSync(specPath, spec, 'utf8');
    // Real, kept sidecar — genuinely useful traceability
    // (idearium spec/rootHash/templateIds behind this build), not queue
    // ceremony. Same real data as before, written once instead of twice.
    if (architecture) {
      fs.writeFileSync(
        path.join(buildDir, 'architecture.json'),
        JSON.stringify({
          ideariumSpecUuid: architecture.ideariumSpecUuid,
          ideariumRootHash: architecture.ideariumRootHash,
          templateIds:      architecture.templateIds,
        }, null, 2), 'utf8'
      );
    }
    const existingDir = plan.existingDir || null;
    if (existingDir) {
      fs.writeFileSync(
        path.join(buildDir, 'replace-target.json'),
        JSON.stringify({ existingComponentId: plan.existingComponentId || null, existingDir }, null, 2),
        'utf8'
      );
    }

    const { compile } = require('../emerge/compiler/pipeline');
    try {
      const result = await compile(specPath, buildDir, { verbose: false });
      buildResult = result.ok
        ? { ok: true, outputDir: buildDir, skipped: !!result.skipped }
        : { ok: false, error: result.error || 'compile pipeline produced no result' };
    } catch (e) {
      buildResult = { ok: false, error: e.message };
    }
    // Real event, kept — genuinely useful observability, same real
    // event_log write consumer.js used to do, one call, no separate
    // process needed to make it.
    try {
      const et = require('../lib/event-types.js');
      require('../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
        type: buildResult.ok ? et.INTENT.BUILD_OUTPUT : et.INTENT.BUILD_OUTPUT,
        blockId: buildUuid, agent: 'copilot', moduleName: plan.name,
        ok: buildResult.ok, error: buildResult.error || null, ts: Date.now(),
      });
    } catch (_) { /* event pipeline unreachable — the real build result is unaffected */ }
    console.log(`[module-builder] ${buildResult.ok ? '✓' : '✗'} build ${buildUuid} (${plan.name}) — ${buildResult.ok ? buildDir : buildResult.error}`);
  }

  return {
    ok:            true,
    passed:        qcResult?.passed || false,
    buildId:       buildUuid,
    buildResult,
    architecture,
    plan,
    qcResult,
    iterations:    iteration,
    message:       qcResult?.passed
      ? (buildResult.ok
          ? `Module "${plan.name}" passed QC and was built — ${buildResult.outputDir}`
          : `Module "${plan.name}" passed QC but the build itself failed: ${buildResult.error}`)
      : `Module "${plan.name}" failed QC after ${iteration} iterations. Needs: ${qcResult?.reason}`,
    requestId,
  };
}

module.exports = { build, map, generateSpec, runQC, registerCliCommand, _resolveExistingTarget, MODULE_ID, VERSION };
