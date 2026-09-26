'use strict';
// copilot/lib/inject-config.js — real, editable configuration for
// copilot's five real context-injection sites, as real .inject_rule
// node files.
// UUID: nexus-copilot-inject-config-v1-0000-2026-0919-jamesbrooks-001
//
// §BUILT 2026-09-19 — James: "make it into the node type. Not close,
// actually make it a node type and add it to the taxonomy. This needs
// to be configurable, editable." Follows intelligence/lib/domain-nodes.js's
// exact proven pattern from earlier this session (real exportToFile +
// nodeIndex.indexNode), applied here to copilot's own five real
// injection sites in copilot/server.js: _injectUserModel,
// _injectSessionHistory, _injectRecallContext, the inline CORTEX
// MASTERMIND append, and tool-guide.js's toolGuide().
//
// §NOT `.injection` — checked first, not assumed available: a real
// `.injection` node type already exists (118 real files on disk,
// already in KNOWN_TYPES), and it means something different — a
// per-call AUDIT RECORD of whether priming/tool-guide injection
// happened for one outbound NCP dispatch (copilot/tool-runtime.js's
// makeNcpCallModel). This module's own type is `inject_rule` — real,
// editable CONFIGURATION for what a site injects and whether it fires
// at all. See schema.inject_rule's own header for the full reasoning.
//
// §CAPABILITY PRESERVED, NOT REMOVED — DEFAULT_RULES below is not new
// behavior; it is every one of the five sites' current real, hardcoded
// values, copied out verbatim so a missing or unreadable node degrades
// to EXACTLY today's behavior, never to disabled-by-default or
// unbounded. seedDefaultInjectRules() never overwrites a real,
// already-existing node — a person's edit survives every future boot.

const path = require('path');
const nodeExport = require('../../lib/node-export.js');
const nodeIndex = require('../../lib/node-index.js');
const nodeSchemas = require('../../lib/node-schemas.js');
const { JaaStore } = require('../../guardian/jaa-store.js');

const MODULE_ID = 'copilot-inject-config';
const NODES_DIR = path.join(__dirname, '..', 'data', 'nodes', 'inject_rule');
const NODE_INDEX_DIR = path.join(__dirname, '..', 'data', 'node-index');

// §BUGFIX PRECEDENT REUSED — raw JaaStore has all(table, where, opts),
// not query(table, predicate); lib/node-index.js's indexNode() calls
// jaa.query(...) directly. Same adapter shape intelligence/lib/
// domain-nodes.js and versionium/lib/store.js already needed for this
// same real mismatch.
let _indexJaa = null;
function _indexStore() {
  if (_indexJaa) return _indexJaa;
  const store = new JaaStore(NODE_INDEX_DIR);
  _indexJaa = {
    insert:  (table, row)         => store.insert(table, row),
    upsert:  (table, row, key)    => store.upsert(table, row, key),
    get:     (table, where)       => store.get(table, where),
    query:   (table, predicate)   => store.all(table, predicate),
    update:  (table, where, vals) => store.update(table, where, vals),
    delete:  (table, where)       => store.delete(table, where),
    count:   (table, where)       => store.count(table, where),
  };
  return _indexJaa;
}

// §REAL DEFAULTS — one entry per real site, values copied exactly from
// copilot/server.js as it stood before this file existed (checked
// directly against that file, not estimated).
const DEFAULT_RULES = {
  'user-model': {
    id: 'user-model', label: 'User Model', enabled: true, position: 'prepend',
    template: '{model}\n\n{contextText}',
    limits: {},
    source: 'copilot/server.js:_injectUserModel',
  },
  'session-history': {
    id: 'session-history', label: 'Session History', enabled: true, position: 'append',
    template: '\n\n=== SESSION HISTORY (last {count} exchanges) ===\n{history}',
    // real, exact prior behavior: fetch up to 8 rows, use only the last 5
    limits: { fetchN: 8, useLastN: 5, promptMaxChars: 80, responseMaxChars: 120 },
    source: 'copilot/server.js:_injectSessionHistory',
  },
  'recall-context': {
    id: 'recall-context', label: 'Associative Recall', enabled: true, position: 'append',
    template: '', // real site builds its own results block inline; limits below are what's actually editable
    limits: { minPromptLength: 8 }, // scoreThreshold/topK stay config.RECALL_CONTEXT_* — real, already-configurable elsewhere, not duplicated here
    source: 'copilot/server.js:_injectRecallContext',
  },
  'mastermind': {
    id: 'mastermind', label: 'Cortex Mastermind', enabled: true, position: 'append',
    template: '\n\n=== CORTEX MASTERMIND ===\n{analysis}',
    limits: { analysisMaxChars: 400 },
    source: 'copilot/server.js (inline, after _queryCortexMastermind)',
  },
  'tool-guide': {
    id: 'tool-guide', label: 'Tool Guide', enabled: true, position: 'prepend',
    template: 'YOUR TOOLS (how and when to use them):\n{guide}',
    limits: {},
    source: 'copilot/lib/agent-tools/tool-guide.js:toolGuide',
  },
};

function _nodePath(id) {
  return path.join(NODES_DIR, `${id}.inject_rule`);
}

/**
 * seedDefaultInjectRules() — idempotent. Writes a real .inject_rule node
 * for every entry in DEFAULT_RULES that doesn't already have one on
 * disk. Never overwrites an existing file — a real edit made after the
 * first seed survives every later call/boot, forever, by design.
 */
function seedDefaultInjectRules() {
  const fs = require('fs');
  let seeded = 0;
  for (const [id, rule] of Object.entries(DEFAULT_RULES)) {
    if (fs.existsSync(_nodePath(id))) continue;
    try {
      const filePath = nodeExport.exportToFile('inject_rule', id, rule, {
        context: `copilot context-injection rule: ${rule.label}`,
        system: 'copilot',
        summary: rule.source,
        tags: ['inject_rule', id],
        source: MODULE_ID,
      }, NODES_DIR);
      try {
        const doc = nodeExport.importFromFile(filePath);
        nodeIndex.indexNode('inject_rule', doc, filePath, _indexStore());
      } catch (e) {
        console.warn(`[${MODULE_ID}] ${id} node-index write failed (non-fatal, file already saved): ${e.message}`);
      }
      seeded++;
    } catch (e) {
      console.warn(`[${MODULE_ID}] failed to seed default rule '${id}' (non-fatal, hardcoded default still used at read time): ${e.message}`);
    }
  }
  if (seeded) console.log(`[${MODULE_ID}] seeded ${seeded} default .inject_rule node(s)`);
  return { seeded };
}

const _lastWarning = {};

/**
 * getInjectRule(id) — real, editable config for one injection site.
 * Reads the real node file when present and valid; falls back to
 * DEFAULT_RULES[id] — never null, never a half-populated object a
 * caller has to null-check field by field. A schema mismatch or read
 * failure is logged once (not every call) and degrades to the exact
 * real default, never to disabled or unbounded.
 */
function getInjectRule(id) {
  const fallback = DEFAULT_RULES[id];
  if (!fallback) throw new Error(`getInjectRule: '${id}' is not a real injection site — known ids: ${Object.keys(DEFAULT_RULES).join(', ')}`);
  try {
    const fs = require('fs');
    const p = _nodePath(id);
    if (!fs.existsSync(p)) return fallback;
    const doc = nodeExport.importFromFile(p);
    const check = nodeSchemas.checkPayload('inject_rule', doc.payload);
    if (!check.ok) {
      const sig = check.missing.join(',');
      if (_lastWarning[id] !== sig) {
        console.warn(`[${MODULE_ID}] ${id}.inject_rule does not match schema.inject_rule — missing: [${check.missing.join(', ')}]. Using real hardcoded default instead of a partial rule.`);
        _lastWarning[id] = sig;
      }
      return fallback;
    }
    _lastWarning[id] = null;
    // Merge over fallback so an edited node that only changes `enabled`
    // or `template` doesn't have to also re-specify every `limits` key —
    // a real, partial edit still resolves to a complete, usable rule.
    return { ...fallback, ...doc.payload, limits: { ...fallback.limits, ...(doc.payload.limits || {}) } };
  } catch (e) {
    if (_lastWarning[id] !== e.message) {
      console.warn(`[${MODULE_ID}] ${id}.inject_rule unreadable (non-fatal): ${e.message}. Using real hardcoded default.`);
      _lastWarning[id] = e.message;
    }
    return fallback;
  }
}

module.exports = { seedDefaultInjectRules, getInjectRule, DEFAULT_RULES, NODES_DIR, MODULE_ID };
