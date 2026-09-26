/**
 * archetype/detector.js
 * COMPARTMENT OS — Archetype Auto-Detector (spec §43/§60, ArchetypeDetectionConfidence)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * COS-8: Auto-detect before prompting — ask only what can't be inferred.
 *
 * Builds a lowercase text corpus from manifest-style files (package.json,
 * requirements.txt, Cargo.toml, go.mod, Makefile) + the entry file content
 * (reusing foundation/cli-detector.js's detectProject() for runtime/entry —
 * no duplicate file-scanning logic), then scores each archetype by how many
 * of its detectionHints appear in that corpus or match a top-level filename.
 *
 * Hints come in two shapes:
 *   - glob-like  ('*.exe', '*.test.js')      → matched against filenames
 *   - substring  ('express', 'app.listen(')  → matched against the corpus
 *
 * Score = matchedHints.length / totalHints — archetypes with zero
 * detectionHints (scratch, blank) can never auto-detect by design; they're
 * the manual fallback choices.
 *
 * Confidence bands (ArchetypeDetectionConfidence, spec §59.1):
 *   score > 0.70           → 'auto'
 *   0.40 <= score <= 0.70  → 'suggested'
 *   score < 0.40           → 'manual'
 *   ('forced' is never returned here — it's set by the caller when the
 *    user explicitly overrides a detection result. See assignArchetype.)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { detectProject } = require('../foundation/cli-detector.js');
const { ARCHETYPES }     = require('./registry.js');

// ─── Corpus building ───────────────────────────────────────────────────────────

const MANIFEST_FILES = ['package.json', 'requirements.txt', 'pyproject.toml', 'setup.py',
                         'Cargo.toml', 'go.mod', 'Makefile', 'Gemfile', 'composer.json'];

function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return ''; }
}

function safeListTopLevel(root) {
  try { return fs.readdirSync(root); }
  catch { return []; }
}

/**
 * @param {string} root  compartment / project root
 * @returns {{ corpus: string, topLevelFiles: string[], detection: object }}
 */
function buildDetectionCorpus(root) {
  const topLevelFiles = safeListTopLevel(root);

  let corpus = '';
  for (const f of MANIFEST_FILES) {
    corpus += '\n' + safeRead(path.join(root, f));
  }

  // Reuse the existing project detector for runtime/entry/compiler signals —
  // no second implementation of "what kind of project is this on disk".
  const detection = detectProject(root);
  if (detection.entryFile) {
    corpus += '\n' + safeRead(detection.entryFile);
  }
  if (detection.signals) {
    corpus += '\n' + detection.signals.join('\n');
  }

  return { corpus: corpus.toLowerCase(), topLevelFiles, detection };
}

// ─── Hint matching ─────────────────────────────────────────────────────────────

/**
 * @param {string} hint
 * @param {string} corpus          lowercase
 * @param {string[]} topLevelFiles
 * @returns {boolean}
 */
function hintMatches(hint, corpus, topLevelFiles) {
  const h = hint.toLowerCase();

  if (h.includes('*')) {
    // Glob-like hint ('*.exe', '*.test.js', 'test_*.py') — match filenames.
    const re = new RegExp('^' + h.split('*').map(escapeRegex).join('.*') + '$');
    return topLevelFiles.some(f => re.test(f.toLowerCase()));
  }

  // Exact filename match also counts (e.g. 'tsconfig.json', 'go.mod').
  if (topLevelFiles.some(f => f.toLowerCase() === h)) return true;

  // Otherwise: substring match against the corpus.
  return corpus.includes(h);
}

function escapeRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

// ─── detectArchetype ───────────────────────────────────────────────────────────

/**
 * Score every built-in archetype against a project root.
 *
 * Scoring note: each archetype's detectionHints list spans several
 * alternate tech stacks on purpose (web-server lists Node AND Python AND
 * Go frameworks, for instance) — a dead-on match for one stack can never
 * cover more than a fraction of that list. matchedHints.length / total
 * therefore under-scores correct detections systematically. Score instead
 * saturates on the ABSOLUTE number of independent matching hints — spec
 * §59.1 defines the confidence bands but not a scoring formula, so this
 * curve is this build's construction: 1 match → manual-band, 2 → just
 * under the auto threshold (suggested), 3+ → auto. `coverage` (the old
 * ratio) is kept alongside for transparency, not used for banding.
 *
 * @param {string} root
 * @returns {{ results: Array<{archetypeId, name, displayName, score, coverage, confidence, matchedHints}>, top: object|null, detection: object }}
 */
function detectArchetype(root) {
  const { corpus, topLevelFiles, detection } = buildDetectionCorpus(root);

  const results = ARCHETYPES.map((a) => {
    const matchedHints = a.detectionHints.filter(h => hintMatches(h, corpus, topLevelFiles));
    const coverage = a.detectionHints.length === 0
      ? 0
      : matchedHints.length / a.detectionHints.length;
    const score = Math.min(1, matchedHints.length / 3);

    return {
      archetypeId: a.id,
      name:        a.name,
      displayName: a.displayName,
      score,
      coverage,
      confidence:  confidenceForScore(score),
      matchedHints,
    };
  }).sort((x, y) => y.score - x.score);

  const top = results[0] && results[0].score > 0 ? results[0] : null;

  return { results, top, detection };
}

/**
 * @param {number} score  0..1
 * @returns {'auto'|'suggested'|'manual'}
 */
function confidenceForScore(score) {
  const pct = score * 100;
  if (pct > 70) return 'auto';
  if (pct >= 40) return 'suggested';
  return 'manual';
}

module.exports = {
  buildDetectionCorpus,
  hintMatches,
  detectArchetype,
  confidenceForScore,
};
