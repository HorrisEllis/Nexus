'use strict';
/**
 * lib/path-guard.js — 0.60.170 RC4: a file name an agent's reply carries is checked before anything is written under it.
 * comp_id: nexus.lib.path-guard
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec RC4
 *
 * James, 2026-10-19: "files names must remain consistent." · "we need to fix the pipeline though. like i said."
 *
 * Seen in his Versionium tab and Code tree for looking-glass-bundle-v0.4: files written as
 *   "Gemini said tests/sp5-title.test.js"   (the page's speaker label carried into the path; a "Gemini said tests" folder appeared)
 *   "tests/sp5-title."  ·  "tests/sp5-title-test."   (a name cut at a dot)
 * beside the real tests/sp5-title.test.js. Every agent write passes lib/repo-inject.js propose(), so the guard sits there.
 *
 *   check(rel, { exists }) → { ok:true, path, changed, why? } | { ok:false, error }
 *     1. a chat speaker label at the front of the path or of a folder ("Gemini said", "ChatGPT said", "You said", …) is removed
 *     2. a name cut at a dot or a dash ("x.", "x-test.") is resolved to the ONE existing file it names; none or several → refused
 *     3. a folder or file name that reads as reply prose ("here is", "said", "wrote", "updated") is refused, with the reason
 *   exists(p) is the repo's own answer (does this file exist); without it, step 2 refuses rather than guesses (§1.2).
 */
const MODULE_ID = 'nexus.lib.path-guard';
const VERSION = '1.0.0';

const SPEAKERS = ['gemini', 'chatgpt', 'claude', 'you', 'deepseek', 'perplexity', 'copilot', 'grok', 'mistral', 'assistant', 'model', 'user'];
const LABEL_RX = new RegExp(`^(?:${SPEAKERS.join('|')})\\s+(?:said|says|wrote)\\s*[:\\-–—]?\\s*`, 'i');
const PROSE_RX = /(^|\s)(said|says|wrote|here is|here's|updated|below|above|the file|this file)(\s|$)/i;
const EXT_GUESSES = ['.test.js', '.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.spec', '.test.ts'];

function _strip(rel) {
  const orig = String(rel || '');
  // only a path that carries a label is rebuilt; every other path goes on exactly as given, so the repo's own safety check
  // (absolute paths, '..') still sees what the agent sent
  if (!orig.split(/[\\/]/).some(seg => LABEL_RX.test(seg.trim().replace(/^['"`]+/, '')))) return { p: orig, stripped: false };
  const p = orig.trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\\/g, '/')
    .split('/').map(seg => seg.replace(LABEL_RX, '')).filter(Boolean).join('/');
  return { p, stripped: true };
}

function _truncatedCandidates(p) {
  const out = [];
  if (/\.$/.test(p)) {
    const stem = p.replace(/\.+$/, '');
    for (const e of EXT_GUESSES) out.push(stem + e);
    if (/-test$/i.test(stem)) out.push(stem.replace(/-test$/i, '.test.js'));
  } else if (/-$/.test(p)) {
    const stem = p.replace(/-+$/, '');
    for (const e of EXT_GUESSES) out.push(stem + e);
  }
  return [...new Set(out)];
}

function check(rel, { exists = null } = {}) {
  const { p, stripped } = _strip(rel);
  if (!p) return { ok: false, error: `no file name left in "${rel}" once the chat label is removed` };
  const cands = _truncatedCandidates(p);
  if (cands.length) {
    if (typeof exists !== 'function') return { ok: false, error: `"${rel}" is a name cut short (it ends in "${p.slice(-1)}") and the repo was not asked which file it means — refused, not guessed` };
    const hits = cands.filter(c => { try { return !!exists(c); } catch (_) { return false; } });
    if (hits.length === 1) return { ok: true, path: hits[0], changed: true, why: `"${rel}" was cut short; it names the existing ${hits[0]}` };
    return { ok: false, error: hits.length ? `"${rel}" is a name cut short and could be any of ${hits.join(', ')} — refused, not guessed` : `"${rel}" is a name cut short and names no existing file — refused (write the full name)` };
  }
  const bad = p.split('/').find(seg => PROSE_RX.test(seg));
  if (bad) return { ok: false, error: `"${rel}" has a folder or file named "${bad}", which reads as reply text, not a file name — refused` };
  return stripped ? { ok: true, path: p, changed: true, why: `the chat label was removed from "${rel}"` } : { ok: true, path: p, changed: false };
}

/**
 * repairTree(root, { now }) — 0.60.171 RC4b: files ALREADY written under a labelled or cut-short name before RC4 (his Phases panel,
 * 2026-10-19: "used by: Gemini said tests/sp5-title.test.js") are moved — never deleted (§0.3) — to
 * <root>/.nexus/archive/path-guard/<stamp>/<the same path>, so they leave the repo's tree and its dependency graph. Only names the
 * guard would refuse or rewrite are touched; .git, node_modules and .nexus are skipped. → { moved: [{ from, to, why }] }
 */
function repairTree(root, { now = Date.now() } = {}) {
  const fs = require('fs'), path = require('path');
  const moved = [];
  if (!root || !fs.existsSync(root)) return { moved };
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const walk = (dir, rel) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (['.git', 'node_modules', '.nexus'].includes(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const bad = LABEL_RX.test(e.name) || (!e.isDirectory() && /[.-]$/.test(e.name));
      if (bad) {
        const to = path.join(root, '.nexus', 'archive', 'path-guard', stamp, r);
        try { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(path.join(dir, e.name), to); moved.push({ from: r, to: path.relative(root, to).split(path.sep).join('/'), why: LABEL_RX.test(e.name) ? 'a chat label in the name' : 'a name cut short' }); } catch (_) {}
        continue;
      }
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
    }
  };
  walk(root, '');
  return { moved };
}

module.exports = { MODULE_ID, VERSION, SPEAKERS, check, repairTree };
