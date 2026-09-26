'use strict';
/**
 * copilot/axiom-manager.js
 * comp_id: nexus.copilot.axiom-manager
 * uuid: nexus-copilot-axiom-manager-v1-0000-2026-0627-jamesbrooks-001
 * spec: docs/copilot-expansion.spec
 *
 * Add, remove, list, freeze axioms via CLI and co-pilot.
 * AXIOMS-v1.0.md is immutable — never touched.
 * Runtime axioms live in JAA 'axioms' table + docs/AXIOMS-runtime.json.
 *
 * Tiers:
 *   IMMUTABLE — from AXIOMS-v1.0.md. Frozen. Cannot be removed.
 *   RUNTIME   — user-added. Can be removed with confirmation.
 *   PATTERN   — auto-promoted from crystallised patterns (confidence > 0.9)
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT         = path.join(__dirname, '..');
const RUNTIME_FILE = path.join(ROOT, 'docs', 'AXIOMS-runtime.json');
const AXIOMS_V1    = path.join(ROOT, 'docs', 'AXIOMS-v1.0.md');

const MODULE_ID = 'copilot/axiom-manager';
const VERSION   = '1.0.0';

// ── JAA lazy load ─────────────────────────────────────────────────────────────
function _jaa() {
  try { return require('../cortex/memory/jaa-db').jaaDB; } catch(_) { return null; }
}

// ── Parse immutable axioms from AXIOMS-v1.0.md ───────────────────────────────
function _parseImmutable() {
  try {
    const content = fs.readFileSync(AXIOMS_V1, 'utf8');
    const axioms  = [];
    const lines   = content.split('\n');
    for (const line of lines) {
      // Match §X.Y bold headers
      const m = line.match(/\*\*(§[\d.]+)\s+(.+?)\*\*/);
      if (m) {
        axioms.push({
          id:     m[1],
          text:   m[2],
          tier:   'IMMUTABLE',
          frozen: true,
          source: 'AXIOMS-v1.0.md',
        });
      }
    }
    return axioms;
  } catch(_) { return []; }
}

// ── Load runtime axioms from disk ─────────────────────────────────────────────
function _loadRuntime() {
  try {
    if (!fs.existsSync(RUNTIME_FILE)) return [];
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
  } catch(_) { return []; }
}

// ── Save runtime axioms to disk ───────────────────────────────────────────────
function _saveRuntime(axioms) {
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(axioms, null, 2), 'utf8');
}

// ── Load from JAA ─────────────────────────────────────────────────────────────
function _loadFromJAA() {
  const jaa = _jaa();
  if (!jaa) return [];
  try {
    return jaa.query('axioms', () => true, 200);
  } catch(_) { return []; }
}

// ── Write to JAA ─────────────────────────────────────────────────────────────
function _writeToJAA(axiom) {
  const jaa = _jaa();
  if (!jaa) return;
  try { jaa.insert('axioms', axiom); } catch(_) {}
}

// ── List all axioms ──────────────────────────────────────────────────────────
function list({ tier, status } = {}) {
  const immutable = _parseImmutable();
  const runtime   = _loadRuntime();
  const jaaAxioms = _loadFromJAA();

  // Merge: JAA is source of truth for runtime + pattern axioms
  // Immutable come from the markdown file
  let all = [
    ...immutable,
    ...runtime,
    ...jaaAxioms.filter(a => !runtime.find(r => r.id === a.id)),
  ];

  if (tier)   all = all.filter(a => a.tier === tier.toUpperCase());
  if (status) all = all.filter(a => a.status === status);

  return all.sort((a, b) => {
    const tierOrder = { IMMUTABLE: 0, RUNTIME: 1, PATTERN: 2 };
    return (tierOrder[a.tier] || 1) - (tierOrder[b.tier] || 1) || (a.id || '').localeCompare(b.id || '');
  });
}

// ── Add a runtime axiom ───────────────────────────────────────────────────────
function add(id, text, { reason, source = 'user', tier = 'RUNTIME' } = {}) {
  if (!id || !text) throw new Error('id and text required');

  // Check immutables — cannot shadow them
  const immutable = _parseImmutable();
  if (immutable.find(a => a.id === id)) {
    throw new Error(`§${id} is an IMMUTABLE axiom — it cannot be replaced. Use a new id.`);
  }

  // Check for duplicate
  const runtime = _loadRuntime();
  if (runtime.find(a => a.id === id)) {
    throw new Error(`Axiom ${id} already exists in RUNTIME tier. Remove it first.`);
  }

  const axiom = {
    uuid:      crypto.randomUUID(),
    id,
    text,
    tier,
    frozen:    tier === 'IMMUTABLE',
    status:    'active',
    source,
    reason:    reason || null,
    createdAt: Date.now(),
  };

  // §LAW II — disk before behavior
  const newRuntime = [...runtime, axiom];
  _saveRuntime(newRuntime);
  _writeToJAA(axiom);

  console.log(`[axiom-manager] added ${tier} axiom ${id}: "${text.slice(0, 60)}"`);
  return axiom;
}

// ── Remove a runtime axiom ───────────────────────────────────────────────────
function remove(id, { confirm = false } = {}) {
  if (!id) throw new Error('id required');

  // Block immutable removal
  const immutable = _parseImmutable();
  if (immutable.find(a => a.id === id)) {
    throw new Error(`§${id} is IMMUTABLE and cannot be removed. It is a founding law.`);
  }

  const runtime = _loadRuntime();
  const axiom   = runtime.find(a => a.id === id);

  if (!axiom) throw new Error(`Axiom ${id} not found in RUNTIME tier.`);
  if (axiom.frozen && !confirm) {
    throw new Error(`Axiom ${id} is frozen. Pass { confirm: true } to remove.`);
  }

  const updated = runtime.filter(a => a.id !== id);
  _saveRuntime(updated);

  // Archive in JAA (never delete — append-only)
  const jaa = _jaa();
  if (jaa) {
    try {
      jaa.insert('axioms', { ...axiom, status: 'removed', removedAt: Date.now() });
    } catch(_) {}
  }

  console.log(`[axiom-manager] removed RUNTIME axiom ${id}`);
  return { removed: true, id, text: axiom.text };
}

// ── Freeze — promote RUNTIME → IMMUTABLE-equivalent ──────────────────────────
function freeze(id) {
  const runtime = _loadRuntime();
  const idx     = runtime.findIndex(a => a.id === id);
  if (idx < 0) throw new Error(`Axiom ${id} not found in RUNTIME tier.`);

  runtime[idx].frozen    = true;
  runtime[idx].frozenAt  = Date.now();
  _saveRuntime(runtime);

  const jaa = _jaa();
  if (jaa) {
    try { jaa.insert('axioms', { ...runtime[idx], status: 'frozen' }); } catch(_) {}
  }

  return { frozen: true, id, text: runtime[idx].text };
}

// ── Auto-promote from pattern engine ─────────────────────────────────────────
function promoteFromPattern(pattern) {
  if ((pattern.confidence || 0) < 0.9) return null;

  const id   = `§P.${pattern.uuid?.slice(0, 6) || Date.now()}`;
  const text = `PATTERN: "${pattern.signature || ''}" precedes "${pattern.outcome || ''}" with ${Math.round((pattern.confidence || 0) * 100)}% confidence (${pattern.count || 1}×).`;

  try {
    return add(id, text, { source: 'pattern-engine', tier: 'PATTERN', reason: 'Auto-promoted from crystallised pattern' });
  } catch(_) { return null; }
}

// ── Check if a prompt violates any active axiom ───────────────────────────────
function check(promptOrSpec) {
  const text   = (promptOrSpec || '').toLowerCase();
  const axioms = list({ status: 'active' });
  const violations = [];

  // Heuristic checks — real constitutional-ai does the heavy lifting
  // These are fast pre-screens before calling constitutional-ai
  if (text.includes('mock') || text.includes('stub') || text.includes('placeholder')) {
    const ax = axioms.find(a => a.id === '§1.3');
    if (ax) violations.push({ axiom: ax.id, text: ax.text, reason: 'Contains mock/stub/placeholder' });
  }
  if (text.includes('silent') || text.includes('swallow') || text.includes('catch (_)')) {
    const ax = axioms.find(a => a.id === '§1.2');
    if (ax) violations.push({ axiom: ax.id, text: ax.text, reason: 'May silently fail' });
  }
  if (text.includes('delete') || text.includes('truncate')) {
    const ax = axioms.find(a => a.id === '§2.1');
    if (ax) violations.push({ axiom: ax.id, text: ax.text, reason: 'Data deletion against persistence law' });
  }

  return {
    passed:     violations.length === 0,
    violations,
    axiomCount: axioms.length,
    checked:    Date.now(),
  };
}

// ── CLI summary ───────────────────────────────────────────────────────────────
function summary() {
  const all = list();
  return {
    total:     all.length,
    immutable: all.filter(a => a.tier === 'IMMUTABLE').length,
    runtime:   all.filter(a => a.tier === 'RUNTIME').length,
    pattern:   all.filter(a => a.tier === 'PATTERN').length,
    frozen:    all.filter(a => a.frozen).length,
  };
}

module.exports = { list, add, remove, freeze, check, summary, promoteFromPattern, MODULE_ID, VERSION };
