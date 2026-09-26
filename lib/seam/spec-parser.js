'use strict';
/**
 * guardian/lib/spec-parser.js — Spec Compiler
 * UUID: guardian-spec-parser-v1-0000-4000-0000-000000000001
 *
 * §1.1  — Nothing pretends to work. Parse errors are explicit.
 * §3.1  — Bottom-up. This runs before any prompt is built.
 * §4.1  — A system that cannot be tested cannot be trusted.
 *
 * Reads a .spec file (YAML-like format used by NEXUS).
 * Extracts the blocks that reduce input entropy:
 *   meta          — identity, version, intent
 *   axioms        — constitutional laws (non-negotiable)
 *   constraints   — what cannot be done
 *   syntax        — COBALT pattern, module contract
 *   output_format — what the response must look like
 *   seam_contract — what PASS means for each chunk
 *   phases        — chunk boundaries
 *
 * Produces:
 *   prerequisiteBlock  — the INTAKE message sent before any chunk
 *   chunks[]           — each with content + test_contract + axioms
 *   evaluationRules    — what Detector checks against
 *
 * Design note (from ChatGPT's review):
 *   We are not making ChatGPT enter execution states.
 *   We are reducing input entropy so output falls inside a predictable envelope.
 *   The prerequisite block is context injection, not a "standby" state.
 *   Guardian owns state. ChatGPT is a lossy transform function.
 */

const fs   = require('fs');
const path = require('path');

// ── Block extractors ──────────────────────────────────────────────────────────

/**
 * Extract a named block from spec text.
 * Handles YAML-style indented blocks and inline values.
 * Returns the raw text of the block, or null if not found.
 */
function extractBlock(text, key) {
  // Try: "  key:\n    content\n    content" style
  const indent = new RegExp(
    `^([ \\t]*)${key}:\\s*(?:\\|\\s*)?\\n((?:\\1[ \\t]+.*\\n?)+)`,
    'm'
  );
  const m = text.match(indent);
  if (m) return m[2].replace(/^[ \t]{2,}/gm, '').trim();

  // Try: "  key: single line value"
  const inline = new RegExp(`^[ \\t]*${key}:\\s*(.+)$`, 'm');
  const m2 = text.match(inline);
  if (m2) return m2[1].trim();

  return null;
}

/**
 * Extract all key: value pairs from an indented block.
 */
function extractMap(text, key) {
  const block = extractBlock(text, key);
  if (!block) return {};
  const result = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^[ \t]*["']?([^"':]+)["']?\s*:\s*["']?(.+?)["']?$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

/**
 * Extract an array from an indented block.
 * Handles "- item" and '"key": "value"' formats.
 */
function extractList(text, key) {
  const block = extractBlock(text, key);
  if (!block) return [];
  return block.split('\n')
    .map(l => l.replace(/^[ \t]*[-*•]?\s*["']?/, '').replace(/["']$/, '').trim())
    .filter(Boolean);
}

// ── Spec parser ───────────────────────────────────────────────────────────────

/**
 * Parse a .spec file into an execution plan.
 *
 * @param {string} specText  Raw .spec file content
 * @param {object} opts
 * @param {number} opts.maxChunkSize  Max chars per chunk (default 3000)
 * @param {string} opts.splitOn       'heading' | 'phase' | 'divider' | 'size'
 * @returns {SpecExecutionPlan}
 */
function parseSpec(specText, opts = {}) {
  if (!specText || specText.length < 10) {
    throw new Error('spec-parser: empty spec text');
  }

  // §BR5 2026-08-28 — James: "chatgpt would use the chunking. contract
  // for the smallest executable code, WITH THE file name." Real gap,
  // located exactly: lib/agent-router.js's AGENT_CONSTRAINTS already
  // carries each agent's real budget (chatgpt: 900, chunk:true;
  // perplexity: 4000; claude: 200000; gemini: 1000000) — this module's
  // own header already describes exactly this philosophy ("ChatGPT is a
  // lossy transform function... reducing input entropy so output falls
  // inside a predictable envelope"), it just never received the real
  // number. opts.forAgent, when given AND that agent's own constraints
  // declare chunk:true (only chatgpt does today — an agent with a real
  // 200k+ budget doesn't need this), converts maxTokens into a real
  // maxChunkSize using the SAME token estimate context-builder.js's
  // estimateTokens()/truncate() already use (WORDS_PER_TOKEN=0.75), not
  // a second, disagreeing guess — chars/token derived honestly from that
  // (tokens = words/0.75, chars ≈ words*6 for average English word+space,
  // so chars ≈ tokens*4.5), with a 20% safety margin held back for the
  // seam-contract wrapper _buildChunkPrompt adds around the raw content.
  // opts.maxChunkSize, if explicitly given, always wins — this only fills
  // in a real default instead of the old hardcoded 3000.
  const CHARS_PER_TOKEN = 4.5; // derived from context-builder.js's own WORDS_PER_TOKEN, not a second estimate
  const SEAM_WRAPPER_MARGIN = 0.8; // leave 20% of budget for _buildChunkPrompt's own added text
  let agentDefaultChunkSize = null;
  if (opts.forAgent && !opts.maxChunkSize) {
    try {
      const { AGENT_CONSTRAINTS } = require('../agent-router');
      const c = AGENT_CONSTRAINTS[opts.forAgent];
      if (c && c.chunk && c.maxTokens) {
        agentDefaultChunkSize = Math.floor(c.maxTokens * CHARS_PER_TOKEN * SEAM_WRAPPER_MARGIN);
      }
    } catch (_) { /* agent-router unreachable — real parsing proceeds with the old default */ }
  }

  const maxChunkSize = opts.maxChunkSize || agentDefaultChunkSize || 3000;
  const splitOn      = opts.splitOn      || 'heading';

  // ── Extract all semantic blocks ──────────────────────────────────────────

  // Meta
  const meta = {
    name:    extractBlock(specText, 'name')    || 'unnamed',
    version: extractBlock(specText, 'version') || '0.0.0',
    uuid:    extractBlock(specText, 'uuid')    || null,
    intent:  extractBlock(specText, 'intent')  || extractBlock(specText, 'description') || '',
    status:  extractBlock(specText, 'status')  || 'living',
  };

  // Axioms — §1.1-§5.5 — the non-negotiable constraints
  const axiomMap    = extractMap(specText, 'axioms');
  const axiomList   = Object.entries(axiomMap).map(([k, v]) => `${k}: ${v}`);

  // Constitutional laws (if present as named blocks)
  const lawBlock = extractBlock(specText, 'constitutional_laws');
  const laws     = lawBlock
    ? lawBlock.split('\n').filter(l => l.match(/LAW_[IVX]+:/)).map(l => l.trim())
    : [];

  // Constraints — what cannot be done
  const constraints = extractList(specText, 'constraints');

  // Syntax — COBALT pattern, module contract
  const syntax = extractBlock(specText, 'syntax') ||
                 extractBlock(specText, 'module_contract') || '';

  // Output format — what the response must look like
  const outputFormat = extractBlock(specText, 'output_format') ||
                       extractBlock(specText, 'response_format') || '';

  // Seam contract — what PASS means
  const seamContract = extractBlock(specText, 'seam_contract') ||
                       extractBlock(specText, 'contract') || '';

  // Evaluation rules — for Detector delta axis
  const evaluationRules = {
    requiredKeywords: extractList(specText, 'required_keywords'),
    forbiddenPatterns: extractList(specText, 'forbidden_patterns'),
    axioms: axiomList,
  };

  // ── Build the prerequisite block ─────────────────────────────────────────
  // This is sent ONCE before any chunks.
  // It reduces input entropy — not a "standby" state.
  // It sets the envelope that makes ChatGPT's probabilistic output predictable.

  const prereqParts = [
    `INTAKE — do not implement yet. Read and acknowledge only.`,
    ``,
    `━━ SPEC: ${meta.name} v${meta.version} ━━`,
    meta.intent ? `INTENT: ${meta.intent}` : '',
    ``,
  ];

  if (axiomList.length) {
    prereqParts.push(`━━ AXIOMS (non-negotiable) ━━`);
    prereqParts.push(...axiomList);
    prereqParts.push(``);
  }

  if (laws.length) {
    prereqParts.push(`━━ CONSTITUTIONAL LAWS ━━`);
    prereqParts.push(...laws);
    prereqParts.push(``);
  }

  if (constraints.length) {
    prereqParts.push(`━━ CONSTRAINTS ━━`);
    prereqParts.push(...constraints.map(c => `  • ${c}`));
    prereqParts.push(``);
  }

  if (syntax) {
    prereqParts.push(`━━ SYNTAX / MODULE CONTRACT ━━`);
    prereqParts.push(syntax.slice(0, 800));  // cap at 800 chars
    prereqParts.push(``);
  }

  if (outputFormat) {
    prereqParts.push(`━━ OUTPUT FORMAT ━━`);
    prereqParts.push(outputFormat);
    prereqParts.push(``);
  }

  if (seamContract) {
    prereqParts.push(`━━ SEAM CONTRACT (what PASS looks like) ━━`);
    prereqParts.push(seamContract);
    prereqParts.push(``);
  }

  // Always end with the chunk sequence announcement
  // This will be filled in after chunks are parsed
  prereqParts.push(`__CHUNK_SEQUENCE_PLACEHOLDER__`);

  const prerequisiteTemplate = prereqParts.filter(Boolean).join('\n');

  // ── Split spec into chunks ────────────────────────────────────────────────

  // Strip the meta/axioms/constraints header — chunk the body
  // Find where the main content starts (after the meta block)
  let bodyText = specText;

  // Remove YAML front-matter style header if present
  const specBodyStart = specText.search(/\n##\s|\n---\n|\nphases:\s*\n|\nPHASE /i);
  if (specBodyStart > 200) {
    bodyText = specText.slice(specBodyStart);
  }

  const rawChunks = _splitIntoChunks(bodyText, splitOn, maxChunkSize);

  // ── Build chunk execution plans ───────────────────────────────────────────

  const chunks = rawChunks.map((content, idx) => {
    const titleMatch = content.match(/^#{1,4}\s+(.+)|^(PHASE|Phase|Step)\s+\d+[:\s]+(.+)?/);
    const title = titleMatch
      ? (titleMatch[1] || titleMatch[3] || `Section ${idx + 1}`).trim().slice(0, 60)
      : `Chunk ${idx + 1}`;

    // Auto-generate test contract from content
    const testContract = _buildTestContract(content, idx, rawChunks.length, seamContract);

    // Build the full prompt for this chunk
    const builtPrompt = _buildChunkPrompt(content, idx, rawChunks.length, title, testContract);

    return {
      idx,
      title,
      content,
      testContract,
      builtPrompt,
      axioms: axiomList,
      chars:  content.length,
      // §BR5 2026-08-28 — "WITH THE file name." parseSpecFile already knew
      // the real absolute path (specFile, threaded through its own
      // event-log writes below) but never attached it to the chunk objects
      // themselves — the one real, actionable piece of context an agent
      // working 900 tokens at a time actually needs to not lose track of
      // which file it's editing. null when parsed from a raw string
      // (parseSpec called directly, no real file behind it) rather than a
      // fabricated placeholder.
      file: opts.file || null,
      forAgent: opts.forAgent || null,
    };
  });

  // Finalize prerequisite with chunk count
  const chunkAnnouncement = [
    `SEAM SEQUENCE: ${chunks.length} chunks incoming.`,
    `Each chunk ends with: SEAM END — EXECUTE SEAM N`,
    `Respond to each chunk with test results in this format:`,
    `  [PASS/FAIL] Test 1: <description>`,
    `  ...`,
    `  SEAM VERDICT: PASS | FAIL`,
    `Do not produce implementation output until EXECUTE SEAM.`,
  ].join('\n');

  const prerequisiteBlock = prerequisiteTemplate.replace(
    '__CHUNK_SEQUENCE_PLACEHOLDER__',
    chunkAnnouncement
  );

  return {
    meta,
    prerequisiteBlock,
    chunks,
    evaluationRules,
    axioms:        axiomList,
    constraints,
    outputFormat,
    seamContract,
    totalChunks:   chunks.length,
    specLength:    specText.length,
    parsedAt:      Date.now(),
  };
}

// ── Chunk splitter ────────────────────────────────────────────────────────────

function _splitIntoChunks(text, splitOn, maxSize) {
  let sections = [];

  if (splitOn === 'heading') {
    sections = text.split(/\n(?=#{1,3}\s)/);
  } else if (splitOn === 'phase') {
    sections = text.split(/\n(?=(?:Phase|PHASE|Step|STEP)\s+\d)/);
  } else if (splitOn === 'divider') {
    sections = text.split(/\n---+\n/);
  } else {
    // Size-based split
    for (let i = 0; i < text.length; i += maxSize) {
      const slice = text.slice(i, i + maxSize);
      const lb    = slice.lastIndexOf('\n');
      sections.push(lb > maxSize * 0.7 ? slice.slice(0, lb) : slice);
    }
  }

  // Filter empty, then split oversized sections
  const result = [];
  for (const s of sections.filter(x => x.trim())) {
    if (s.length <= maxSize) {
      result.push(s.trim());
    } else {
      // Split at paragraph boundaries
      const paras = s.split('\n\n');
      let buf = '';
      for (const p of paras) {
        if ((buf + p).length > maxSize && buf) {
          result.push(buf.trim());
          buf = p + '\n\n';
        } else {
          buf += p + '\n\n';
        }
      }
      if (buf.trim()) result.push(buf.trim());
    }
  }

  return result.length ? result : [text.trim()];
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function _buildTestContract(content, idx, total, seamContract) {
  const tests = [];

  // Auto-detect what needs testing based on content
  if (/^\|.+\|/m.test(content))
    tests.push(`All table entries acknowledged`);
  if (/```/.test(content))
    tests.push(`All code blocks acknowledged and queued for implementation`);
  const musts = (content.match(/\b(MUST|REQUIRED|SHALL|CRITICAL)\b/g) || []).length;
  if (musts > 0)
    tests.push(`${musts} mandatory requirement(s) confirmed understood`);
  const jaaTables = (content.match(/`[a-z_]+`/g) || [])
    .filter(t => /sessions|messages|records|nodes|edges|patterns|crystals|gaps|failures/.test(t)).length;
  if (jaaTables > 0)
    tests.push(`${jaaTables} JAA table(s) identified and noted`);
  if (tests.length === 0)
    tests.push(`Chunk contents acknowledged and understood`);
  tests.push(`No questions or blockers before proceeding`);

  const contractLines = tests.map((t, i) => `[PASS/FAIL] Test ${i + 1}: ${t}`).join('\n');

  return [
    ``,
    `━━ SEAM CONTRACT ━━`,
    contractLines,
    seamContract ? `\n${seamContract}` : '',
    `SEAM VERDICT: PASS | FAIL`,
  ].filter(Boolean).join('\n');
}

function _buildChunkPrompt(content, idx, total, title, testContract) {
  const prevVerified = idx; // simplified — actual tracker is in QueueCompartment
  return [
    `━━ SEAM CHUNK ${idx + 1}/${total} — ${title} ━━`,
    ``,
    content,
    testContract,
    ``,
    `SEAM END — EXECUTE SEAM ${idx + 1}`,
  ].join('\n');
}

// ── File loader ───────────────────────────────────────────────────────────────

/**
 * Load and parse a .spec file from disk.
 * §1.1 — explicit errors, nothing pretends to work.
 */
function parseSpecFile(filePath, opts = {}) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`spec-parser: file not found: ${abs}`);
  }
  // §WIRED 2026-08-22 — James: "wire it all." Real spec_input/spec_output
  // on the canonical spec-parsing entry.
  let et = null, blockId = null;
  try {
    et = require('../event-types.js');
    blockId = require('crypto').randomUUID();
    require('../../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
      type: et.INTENT.SPEC_INPUT, blockId, specFile: abs, ts: Date.now(),
    });
  } catch (_) { /* event pipeline unreachable — real parsing proceeds regardless */ }

  const text = fs.readFileSync(abs, 'utf8');
  const result = parseSpec(text, { ...opts, file: abs });

  try {
    if (et && blockId) {
      require('../../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
        type: et.INTENT.SPEC_OUTPUT, blockId, specFile: abs,
        chunkCount: Array.isArray(result?.chunks) ? result.chunks.length : null, ts: Date.now(),
      });
    }
  } catch (_) { /* §1.2 — the real result is unaffected either way */ }
  return result;
}

/**
 * Quick extraction — just get the prerequisite block from a spec.
 * Used by /command endpoint before building full plan.
 */
function extractPrerequisite(specText) {
  const plan = parseSpec(specText, { splitOn: 'size', maxChunkSize: 99999 });
  return plan.prerequisiteBlock;
}

module.exports = { parseSpec, parseSpecFile, extractPrerequisite, extractBlock, extractMap };
