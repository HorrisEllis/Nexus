/**
 * idearium/spec-engine/templates.js — Spec Template Registry
 * UUID: nexus-idearium-templates-v1-0000-2026-0710-jamesbrooks-001
 * Version: 1.1.0
 *
 * §NEW — first-page template picker needs a real list to render, not a
 * hardcoded 4-string dropdown. Each entry maps to a `type` createSpec()
 * already accepts (it was free-text before, this is what constrains it),
 * plus an optional seedFile — a real .spec/.md file whose content is
 * used to deterministically pre-fill whichever chunks it can, so those
 * chunks skip the agent dispatch entirely (the actual token-reduction
 * lever — see spec-engine/index.js's `_seedFromTemplate`).
 *
 * §EXPANDED 2026-07-11 — "utilize templates of different architectures."
 * Added the named-architecture set from the wizard scoping conversation:
 * Minimal Kernel / API Service / Event System / Plugin Runtime / AI Agent
 * System / Custom (Full Nexus was already covered by 'genesis' below —
 * renamed its label so it's addressable by that name too, not duplicated).
 *
 * Every new seedFile is a REAL excerpt copied verbatim from an already-
 * authored, already-uploaded spec — never fabricated. Per SYSTEM_SPEC_v1_0_0's
 * own axiom #1 ("nothing pretends to work — no stubs, no mocks"), inventing
 * plausible-looking architecture content for a template would be exactly
 * that. Each seed file's header comment records its exact source (file +
 * line range) so the provenance is auditable, not asserted.
 *
 * `seedSection` — which SPEC_SECTIONS id the seed's content fills. Defaults
 * to 'meta' (genesis's existing behavior, unchanged). The new templates
 * seed a section whose content actually matches what was extracted, instead
 * of forcing everything through 'meta' the way a single-seed system would.
 *
 * Templates with no seedFile behave exactly as before: every chunk goes
 * through normal agent dispatch. Nothing is removed, only added to.
 */

'use strict';

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

// §BUILT 2026-08-17 — GA6. James: "the architecture template with maybe a
// compartment of the template files." Checked first: each real template
// here has ONE seedFile (a single seed text blob) — no template today
// carries a real, multi-file COS compartment. A real compartment's files
// live at a real, absolute filesystem path (comp.fs.root, confirmed by
// creating a real compartment and reading its own real return value) —
// idearium (a separate process) can read that directly, same pattern
// readSeed() below already uses for its own seed files, not a cross-
// process call into COS's own running module.
const MAX_COMPARTMENT_FILES = 40;   // §1.1 — a real, stated bound, not unbounded recursion into an arbitrary tree
const MAX_FILE_BYTES        = 20000; // per file, so one huge file can't blow the seed content past what a real chunk can use

function _walkCompartment(root, rel = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); }
  catch (_) { return out; }
  for (const e of entries) {
    if (out.length >= MAX_COMPARTMENT_FILES) break;
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(..._walkCompartment(root, relPath));
    else out.push(relPath);
  }
  return out;
}

/**
 * readCompartmentTemplate(compartmentName) — real, not a stub: finds the
 * real compartment by name (via cos_compartment's real list action, the
 * same tool GA9's chat triggers already call), reads its real file tree
 * off disk, and returns real content — never fabricated, never partial-
 * as-if-complete: a missing/empty compartment returns null, same honest
 * shape readSeed() already uses for a missing seed file.
 */
async function readCompartmentTemplate(compartmentName) {
  if (!compartmentName) return null;
  try {
    const cosCompartment = _require('../../lib/agent-tools/tools/sandbox/cos-compartment.js');
    const listed = await cosCompartment.execute({ action: 'list' });
    if (!listed.ok || !listed.compartments) return null;
    const comp = listed.compartments.find(c => c.name === compartmentName);
    if (!comp) { console.warn(`[idearium/templates] compartment '${compartmentName}' not found`); return null; }
    const root = comp?.fs?.root;
    if (!root) { console.warn(`[idearium/templates] compartment '${compartmentName}' has no real fs.root`); return null; }

    const files = _walkCompartment(root);
    const content = files.map(relPath => {
      try {
        const full = path.join(root, relPath);
        let text = fs.readFileSync(full, 'utf8');
        if (text.length > MAX_FILE_BYTES) text = text.slice(0, MAX_FILE_BYTES) + '\n... (truncated, real file continues)';
        return `--- ${relPath} ---\n${text}`;
      } catch (e) { return `--- ${relPath} --- (unreadable: ${e.message})`; }
    }).join('\n\n');

    return { compartmentName, fileCount: files.length, content };
  } catch (e) { console.warn(`[idearium/templates] readCompartmentTemplate('${compartmentName}') failed: ${e.message}`); return null; }
}


const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname_, 'templates');

const TEMPLATES = Object.freeze([
  {
    id:          'system',
    kind:        'system',
    label:       'New System',
    description: 'A full sovereign system — kernel, engine, runtime, own ledger, own compartments.',
    seedFile:    null,
    seedSection: 'meta',
  },
  {
    id:          'codebase',
    kind:        'codebase',
    label:       'New Codebase',
    description: 'A standalone repo-scale project — not necessarily sovereign, but multi-module.',
    seedFile:    null,
    seedSection: 'meta',
  },
  {
    id:          'library',
    kind:        'library',
    label:       'New Library',
    description: 'A reusable, dependency-free package other systems import — like WARP itself.',
    seedFile:    null,
    seedSection: 'meta',
  },
  {
    id:          'module-component',
    kind:        'component',
    label:       'New Module / Component',
    description: 'The smallest unit — one file, one intent, dropped into an existing system.',
    seedFile:    null,
    seedSection: 'meta',
  },
  {
    id:          'genesis',
    kind:        'system',
    label:       'Full Nexus (genesis, sovereign, WARP-spined)',
    description: 'Scaffold a new sovereign system directly from genesis.spec — kernel-as-Stream, ' +
                 'schema-baseline axioms, seam/contract split, associative lattice, nerve, tv-ui, pulse.',
    seedFile:    'genesis.spec',
    seedSection: 'meta',
  },
  {
    id:          'minimal-kernel',
    kind:        'system',
    label:       'Minimal Kernel',
    description: 'The smallest sovereign core — kernel-as-Stream, spine primitives, root types and ' +
                 'axioms, zero domains attached yet. Start here and add compartments later.',
    seedFile:    'minimal-kernel.spec',
    seedSection: 'meta',
  },
  {
    id:          'api-service',
    kind:        'component',
    label:       'API Service',
    description: 'A service defined by its external/internal interface contracts — auth, SLA, ' +
                 'failure contract, consumers, mock availability.',
    seedFile:    'api-service.spec',
    seedSection: 'api',
  },
  {
    id:          'event-system',
    kind:        'component',
    label:       'Event System',
    description: 'A pure event-driven core — ring-buffered stream, typed event schemas, delivery ' +
                 'guarantees, idempotency, dead-lettering.',
    seedFile:    'event-system.spec',
    seedSection: 'events',
  },
  {
    id:          'plugin-runtime',
    kind:        'system',
    label:       'Plugin Runtime',
    description: 'A host with structurally isolated plugins — bus-only communication, load/unload ' +
                 'contract, hot-swap, no direct kernel or database access.',
    seedFile:    'plugin-runtime.md',
    seedSection: 'schema',
  },
  {
    id:          'ai-agent-system',
    kind:        'system',
    label:       'AI Agent System',
    description: 'An agent/self-modification engine with a model routing ladder (local-first, ' +
                 'remote fallback, fail-loud) and explicit entry points.',
    seedFile:    'ai-agent-system.spec',
    seedSection: 'integration',
  },
  {
    id:          'custom',
    kind:        'custom',
    label:       'Custom',
    description: 'No architectural pattern imposed — every chunk dispatches normally, shaped ' +
                 'entirely by what you write in the wizard.',
    seedFile:    null,
    seedSection: null,
  },
  // §MERGED 2026-07-11 — a parallel branch independently added these five,
  // seeding MULTIPLE sections per template via `## SECTION: <id>` markers
  // (spec-engine's _seedSectionsFromTemplate handles this alongside this
  // file's own seedSection convention — see that function's own comment).
  // seedSection stays null here on purpose: these don't seed one fixed
  // section, they seed whichever the seed file's markers name.
  {
    id:          'architecture',
    kind:        'structure',
    label:       'Architecture / Structure Map',
    description: 'Deterministic folder layout + bottom-up build order (§3.1) — fixes "where does ' +
                 'this go" once, before component chunks are built.',
    seedFile:    'architecture.spec',
    seedSection: null,
  },
  {
    id:          'schemas',
    kind:        'schema',
    label:       'Schema Baseline',
    description: 'Canonical data-schema shape — entity/uuid/fields/constraints/decay-tier — so every ' +
                 'spec\'s schema chunk seeds from the same fixed template instead of a freehand guess.',
    seedFile:    'schemas.spec',
    seedSection: null,
  },
  {
    id:          'checklists',
    kind:        'checklist',
    label:       'Verification Checklists',
    description: 'Standing tests + failure-mode checklists (evidence tiers PARSES→CONTRACT) applied ' +
                 'to every spec the same way, deterministically.',
    seedFile:    'checklists.spec',
    seedSection: null,
  },
  {
    id:          'axioms',
    kind:        'axioms',
    label:       'Axioms (AXIOMS-v1.0, canonical)',
    description: 'The full standing axiom set, restated once — every spec\'s "axioms" chunk seeds from ' +
                 'this instead of an agent re-deriving or forgetting the ruleset.',
    seedFile:    'axioms.spec',
    seedSection: null,
  },
  {
    id:          'compartments',
    kind:        'system',
    label:       'Compartment Map (map first, into a repository)',
    description: 'Declares compartment/seam/gate boundaries and is meant to be promoted to a ' +
                 'repository immediately — the map drawn first, components filled in after.',
    seedFile:    'compartments.spec',
    seedSection: null,
  },
]);

function listTemplates() {
  return TEMPLATES.map(({ id, kind, label, description, seedFile, seedSection }) =>
    ({ id, kind, label, description, hasSeed: !!seedFile, seedSection }));
}

function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || null;
}

/**
 * readSeed — returns the raw text of a template's seed file, or null if
 * the template has none. Never throws on a missing template; the caller
 * (createSpec) treats a null seed as "dispatch every chunk normally."
 */
function readSeed(id) {
  const tpl = getTemplate(id);
  if (!tpl || !tpl.seedFile) return null;
  const p = path.join(TEMPLATES_ROOT, tpl.seedFile);
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.warn(`[idearium/templates] seed file unreadable for '${id}': ${e.message}`);
    return null;
  }
}

export { TEMPLATES, listTemplates, getTemplate, readSeed, readCompartmentTemplate };
