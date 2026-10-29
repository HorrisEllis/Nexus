'use strict';
/**
 * clear-glass/src/automation/nodes.js — workflows and macros as NEXUS node files: .workflow and .macro
 * component_id: cg.automation.nodes
 *
 * §0.39.266 — James: "make the macros and workflow automation, exportable node
 * types. .macro, and maybe .workflow or .framework?"
 *
 * Both go through lib/node-export.js — the one envelope every NEXUS node type
 * shares (YAML, the node type is the file extension, context/intent/summary/
 * system/tags in the header, the thing itself in `payload`). `.macro` was
 * already a registered type (lib/node-schemas/schema.macro); `.workflow` is new
 * (schema.workflow). Not `.framework`: that type already means something else —
 * a generated code skeleton from intelligence/framework-builder.js.
 *
 * A .workflow is self-contained: the macros its macro steps run and the
 * workflows its "Run another workflow" steps call travel inside it
 * (payload.requires), so importing it on another machine gives a workflow that
 * runs. On import:
 *   - a bundled macro that is already here with the same steps is reused; one
 *     whose name is taken by a DIFFERENT macro comes in as "<name> (imported)"
 *     and the steps that run it are pointed at the new name;
 *   - bundled workflows come in first (switched off), and the steps that call
 *     them are pointed at their new ids;
 *   - the workflow itself comes in switched off, with fresh step ids and a fresh
 *     webhook secret (secrets never leave in an export);
 *   - importing the same file twice finds the first copy (same fingerprint and
 *     name) instead of making a second, unless asked to.
 * The older JSON export ({ format: 'nexus-workflow' }) still imports.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NX = require('./node-export.js');

// §0.60.251 AE1 — the automation node files' folder, under the shared data root (state, not owned by any system — AE_D2).
// The one source of this path: the engine (orchestrator) and any consumer (clear-glass bridge, the door) read it from here,
// so nobody reaches into another system for it. Same env var + subpath everywhere, so every system agrees.
const DATA_ROOT = process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', 'data');
const NODES_DIR = path.join(DATA_ROOT, 'brainos', 'automation-nodes');

const SYSTEM = 'clear-glass.automation';
const slug = (s) => String(s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const hash = (v) => crypto.createHash('sha256').update(stable(v)).digest('hex').slice(0, 16);

// ── what a workflow is, without its runtime (ids, counters, secrets, memory) ──
function _portableSteps(steps) {
  return (steps || []).map(s => {
    const c = { ...s, config: { ...(s.config || {}) } };
    if (c.type === 'trigger') delete c.config.token;
    return c;
  });
}
/** fingerprint — what the workflow DOES: its steps' types and settings, not their ids or its name */
function workflowFingerprint(steps) {
  const ids = new Map((steps || []).map((s, i) => [s.id, i]));
  const shape = _portableSteps(steps).map(s => {
    const { id, ...rest } = s;
    const config = { ...rest.config };
    for (const k of ['onTrue', 'onFalse']) if (ids.has(config[k])) config[k] = `#${ids.get(config[k])}`;
    const out = { ...rest, config };
    if (ids.has(out.onError)) out.onError = `#${ids.get(out.onError)}`;
    return out;
  });
  return hash(shape);
}
const macroFingerprint = (m) => hash({ steps: m.steps || [], urlPattern: m.urlPattern || null, params: m.params || [] });

function _triggerKinds(steps) {
  return [...new Set((steps || []).filter(s => s.type === 'trigger' && s.enabled !== false).map(s => {
    const c = s.config || {};
    return c.cron ? 'cron' : c.at ? 'daily' : c.intervalMs ? 'interval' : c.event ? `event:${c.event}` : c.webhook ? 'webhook' : 'manual';
  }))];
}

/** the macros and sub-workflows a workflow needs, followed through sub-workflows (each once) */
async function _requires(engine, wf, getMacro) {
  const macros = new Map(), workflows = new Map(), missing = [];
  const seen = new Set([wf.id]);
  const walk = async (w) => {
    for (const s of w.steps || []) {
      const c = s.config || {};
      if (s.type === 'macro' && c.name && !macros.has(c.name)) {
        const r = getMacro ? await getMacro(c.name) : null;
        if (r && r.ok && r.macro) macros.set(c.name, r.macro); else missing.push(`macro “${c.name}”`);
      }
      if (s.type === 'workflow' && c.workflow) {
        const sub = engine.find(c.workflow);
        if (!sub) { missing.push(`workflow “${c.workflow}”`); continue; }
        if (seen.has(sub.id)) continue;
        seen.add(sub.id);
        workflows.set(sub.id, sub);
        await walk(sub);
      }
    }
  };
  await walk(wf);
  return { macros: [...macros.values()], workflows: [...workflows.values()], missing };
}

function _workflowBody(w) {
  return { name: w.name, description: w.description || '', vars: w.vars || {}, settings: w.settings || {}, steps: _portableSteps(w.steps) };
}
function macroPayload(m) {
  return { uuid: m.uuid, name: m.name, urlPattern: m.urlPattern || null, steps: m.steps || [], params: m.params || [], profile: m.profile || null,
    description: m.description || null, createdAt: m.createdAt || Date.now(), runCount: m.runCount || 0, lastRunAt: m.lastRunAt || null };
}

// ── export ───────────────────────────────────────────────────────────────────
/** workflowNode(engine, id, { getMacro, tags }) -> { ok, envelope, text, filename, missing } */
async function workflowNode(engine, id, { getMacro = null, tags = [] } = {}) {
  const wf = engine.get(id);
  if (!wf) return { ok: false, error: 'no such workflow' };
  const req = await _requires(engine, wf, getMacro);
  const body = _workflowBody(wf);
  const payload = {
    uuid: wf.id, format: 'nexus-workflow', version: 2, ...body,
    requires: {
      macros: req.macros.map(macroPayload),
      workflows: req.workflows.map(w => ({ ref: w.id, ...(_workflowBody(w)) })),
    },
  };
  const steps = (wf.steps || []).filter(s => s.type !== 'trigger');
  const kinds = _triggerKinds(wf.steps);
  const envelope = NX.wrap('workflow', wf.id, payload, {
    context: 'Clear Glass → Settings → Automation',
    intent: wf.description || null,
    summary: `${steps.length} step${steps.length === 1 ? '' : 's'}; runs ${kinds.length ? kinds.join(', ') : 'manually'}${req.macros.length ? `; bundles ${req.macros.length} macro${req.macros.length === 1 ? '' : 's'}` : ''}${req.workflows.length ? `; bundles ${req.workflows.length} workflow${req.workflows.length === 1 ? '' : 's'}` : ''}`,
    system: SYSTEM,
    tags: [...new Set(['workflow', ...kinds.map(k => `trigger:${k}`), ...steps.map(s => `step:${s.type}`), ...(tags || [])])],
    fingerprint: workflowFingerprint(wf.steps),
    source: 'clear-glass/src/automation/nodes.js',
  });
  return { ok: true, envelope, text: NX.toYaml(envelope), filename: `${slug(wf.name)}.workflow`, missing: req.missing };
}

/** macroNode(macro, { tags }) -> { ok, envelope, text, filename } */
function macroNode(macro, { tags = [] } = {}) {
  if (!macro || !macro.name) return { ok: false, error: 'no such macro' };
  const p = macroPayload(macro);
  const envelope = NX.wrap('macro', p.uuid || `macro-${slug(p.name)}`, p, {
    context: 'Clear Glass → Settings → Macros',
    intent: p.description || null,
    summary: `${p.steps.length} browser step${p.steps.length === 1 ? '' : 's'}${p.urlPattern ? ` for ${p.urlPattern}` : ''}${p.params.length ? `; asks for ${p.params.join(', ')}` : ''}`,
    system: SYSTEM,
    tags: [...new Set(['macro', ...p.steps.map(s => `step:${s.engine === 'erosmancer' ? 'erosmancer' : s.action}`), ...(tags || [])])],
    fingerprint: macroFingerprint(p),
    source: 'clear-glass/src/automation/nodes.js',
  });
  return { ok: true, envelope, text: NX.toYaml(envelope), filename: `${slug(p.name)}.macro` };
}

// ── read ─────────────────────────────────────────────────────────────────────
/** parse(text) -> the envelope; a .workflow/.macro node, or the older JSON workflow export wrapped as one */
function parse(text) {
  const s = String(text || '').trim();
  if (!s) throw new Error('the file is empty');
  if (s.startsWith('{')) {
    let obj; try { obj = JSON.parse(s); } catch (e) { throw new Error(`not a node file and not valid JSON: ${e.message}`); }
    const w = obj.workflow || obj;
    if (!Array.isArray(w.steps)) throw new Error('that JSON is not a workflow (no steps list)');
    return { envelope: 1, type: 'workflow', id: 'legacy-json', payload: { format: 'nexus-workflow', ...w, requires: { macros: [], workflows: [] } } };
  }
  let doc;
  try { doc = NX.fromYaml(s); } catch (e) { throw new Error(`not a NEXUS node file: ${e.message}`); }
  if (doc.type !== 'workflow' && doc.type !== 'macro') throw new Error(`this is a .${doc.type} node — only .workflow and .macro import here`);
  return doc;
}

// ── import ───────────────────────────────────────────────────────────────────
/**
 * importMacro(payload, { getMacro, createMacro }) -> { ok, name, reused, renamed }
 * Same name + same steps: reused. Same name, different steps: "<name> (imported)", "(imported 2)" …
 */
async function importMacro(p, { getMacro, createMacro }) {
  if (!createMacro) return { ok: false, error: 'macros cannot be created here' };
  if (!p || !p.name || !Array.isArray(p.steps)) return { ok: false, error: 'the macro has no name or no steps' };
  const want = macroFingerprint(p);
  let name = p.name;
  for (let n = 1; n < 50; n++) {
    const have = getMacro ? await getMacro(name) : null;
    if (!have || !have.ok || !have.macro) break;
    if (macroFingerprint(have.macro) === want) return { ok: true, name, reused: true, renamed: name !== p.name };
    name = `${p.name} (imported${n > 1 ? ` ${n}` : ''})`;
  }
  const r = await createMacro({ name, steps: p.steps, urlPattern: p.urlPattern || undefined, params: p.params || [], profile: p.profile || undefined, description: p.description || undefined });
  if (!r || r.error || r.ok === false) return { ok: false, error: `macro “${p.name}”: ${(r && r.error) || 'could not be created'}` };
  return { ok: true, name, reused: false, renamed: name !== p.name };
}

function _repoint(steps, macroNames, workflowIds) {
  return (steps || []).map(s => {
    const c = { ...(s.config || {}) };
    if (s.type === 'macro' && c.name && macroNames.has(c.name)) c.name = macroNames.get(c.name);
    if (s.type === 'workflow' && c.workflow && workflowIds.has(c.workflow)) c.workflow = workflowIds.get(c.workflow);
    return { ...s, config: c };
  });
}

/**
 * importNode(engine, textOrEnvelope, { getMacro, createMacro, allowDuplicate, name }) ->
 *   { ok, type, workflow?, macro?, existing?, macros: [...], workflows: [...], warnings }
 */
async function importNode(engine, input, { getMacro = null, createMacro = null, allowDuplicate = false, name = null } = {}) {
  let doc;
  try { doc = typeof input === 'string' ? parse(input) : input; } catch (e) { return { ok: false, error: e.message }; }
  const warnings = [];

  if (doc.type === 'macro') {
    const r = await importMacro({ ...doc.payload, ...(name ? { name } : {}) }, { getMacro, createMacro });
    return r.ok ? { ok: true, type: 'macro', macro: { name: r.name, reused: r.reused, renamed: r.renamed }, macros: [r], workflows: [], warnings } : r;
  }

  const p = doc.payload || {};
  if (!Array.isArray(p.steps)) return { ok: false, error: 'the workflow has no steps' };
  const fp = workflowFingerprint(p.steps);
  if (!allowDuplicate) {
    // the copy an earlier import of this same file made (its steps were re-pointed, so compare the origin), or an identical workflow
    const same = engine.list().find(w => (w.origin && w.origin.fingerprint === fp && w.origin.nodeId === doc.id) || (w.name === (name || p.name) && workflowFingerprint(w.steps) === fp));
    if (same) return { ok: true, type: 'workflow', existing: true, workflow: same, macros: [], workflows: [], warnings: [`“${same.name}” is already here — nothing imported`] };
  }
  const req = p.requires || {};
  // 1. macros
  const macroNames = new Map(), macros = [];
  for (const m of req.macros || []) {
    const r = await importMacro(m, { getMacro, createMacro });
    if (!r.ok) { warnings.push(r.error); continue; }
    macros.push({ from: m.name, name: r.name, reused: r.reused });
    if (r.name !== m.name) macroNames.set(m.name, r.name);
  }
  const usedMacros = new Set((p.steps || []).concat(...(req.workflows || []).map(w => w.steps || [])).filter(s => s.type === 'macro' && s.config && s.config.name).map(s => s.config.name));
  for (const m of usedMacros) {
    if ((req.macros || []).some(x => x.name === m)) continue;
    const have = getMacro ? await getMacro(m) : null;
    if (!have || !have.ok) warnings.push(`the macro “${m}” is not in the file and not on this machine — its step will fail until you record it`);
  }
  // 2. bundled workflows: create first, then point every reference (by old id or name) at the new ids
  const workflowIds = new Map(), workflows = [];
  const created = [];
  for (const w of req.workflows || []) {
    const taken = engine.list().some(x => x.name === w.name);
    const r = engine.create({ name: taken ? `${w.name} (imported)` : w.name, description: w.description || '', status: 'paused', vars: w.vars, settings: w.settings, steps: w.steps || [] });
    if (!r.ok) { warnings.push(`workflow “${w.name}”: ${r.error}`); continue; }
    created.push(r.workflow);
    if (w.ref) workflowIds.set(w.ref, r.workflow.id);
    workflowIds.set(w.name, r.workflow.id);
    workflows.push({ from: w.name, id: r.workflow.id, name: r.workflow.name });
  }
  for (const w of created) engine.update(w.id, { steps: _repoint(w.steps, macroNames, workflowIds) });
  // 3. the workflow itself
  const r = engine.create({ name: name || p.name || 'Imported workflow', description: p.description || '', status: 'paused', vars: p.vars, settings: p.settings, steps: _repoint(p.steps, macroNames, workflowIds), origin: { fingerprint: fp, nodeId: doc.id, importedAt: Date.now() } });
  if (!r.ok) return { ok: false, error: r.error, warnings };
  const problems = engine.validate(r.workflow.id).problems || [];
  if (problems.length) warnings.push(...problems.map(x => x.problem));
  return { ok: true, type: 'workflow', workflow: r.workflow, macros, workflows, warnings };
}

// ── a folder of node files (the library) ─────────────────────────────────────
function saveNode(dir, { text, filename }) {
  fs.mkdirSync(dir, { recursive: true });
  const base = String(filename).replace(/[\\/]/g, '-');
  const ext = path.extname(base), stem = base.slice(0, -ext.length);
  let fp = path.join(dir, base);
  for (let n = 2; fs.existsSync(fp); n++) {
    if (fs.readFileSync(fp, 'utf8').replace(/exported_at: \d+|firstSeenAt: \d+|lastSeenAt: \d+/g, '') === String(text).replace(/exported_at: \d+|firstSeenAt: \d+|lastSeenAt: \d+/g, '')) return fp;   // the same export already saved
    fp = path.join(dir, `${stem}-${n}${ext}`);
  }
  fs.writeFileSync(fp, text, 'utf8');
  // 0.60.279 VE6 — a node file saved into the library is a change (§17.12): its whole text goes to Versionium (buffered while it is down)
  try { require('./versionium-record.js').record({ kind: 'clear-glass.node.save', system: 'clear-glass', message: `node file ${path.basename(fp)} saved`, change: { file: path.basename(fp), dir, text: String(text) } }).catch(() => {}); } catch (_) {}
  return fp;
}
/** listNodes(dir) -> [{ file, type, name, summary, tags, exportedAt }] newest first */
function listNodes(dir) {
  const out = [];
  for (const type of ['workflow', 'macro']) {
    for (const doc of NX.queryDir(dir, { type })) {
      out.push({ file: null, type, id: doc.id, name: (doc.payload && doc.payload.name) || doc.id, summary: doc.summary, intent: doc.intent, tags: doc.tags || [], exportedAt: doc.exported_at, fingerprint: doc.fingerprint || null });
    }
  }
  // queryDir does not return file names — pair them back up by reading the folder once
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /\.(workflow|macro)$/.test(f)); } catch (_) {}
  for (const f of files) {
    let doc; try { doc = NX.importFromFile(path.join(dir, f)); } catch (_) { continue; }
    const hit = out.find(o => !o.file && o.id === doc.id && o.type === doc.type && o.exportedAt === doc.exported_at);
    if (hit) hit.file = f;
  }
  return out.filter(o => o.file).sort((a, b) => (b.exportedAt || 0) - (a.exportedAt || 0));
}

/**
 * seedBundled(dir, fromDir) — 0.60.269. James, 2026-10-28: "can you move the fiverr automation and macros to actual node files imported in
 * the settings ... I want to be able to edit what you added." A system ships node files of its own (Clear Glass: clear-glass/automation/nodes);
 * each is copied ONCE into the library Settings › Automation lists, where he imports, edits and exports it like any other. A name already
 * seeded is never copied again, so his edit or his delete stands (the record is <dir>/.seeded.json). Returns { seeded: [file], kept: [file] }.
 */
function seedBundled(dir, fromDir) {
  const out = { seeded: [], kept: [] };
  if (!dir || !fromDir || !fs.existsSync(fromDir)) return out;
  fs.mkdirSync(dir, { recursive: true });
  const recFile = path.join(dir, '.seeded.json');
  let rec = {}; try { rec = JSON.parse(fs.readFileSync(recFile, 'utf8')) || {}; } catch (_) { rec = {}; }
  out.upgraded = []; out.offered = [];
  for (const f of fs.readdirSync(fromDir).filter(x => /\.(workflow|macro)$/.test(x)).sort()) {
    const mine = path.join(dir, f);
    if (fs.existsSync(mine)) {
      // 0.60.280 KB6 — James, 2026-10-29: "remember this is the nodes in the settings, not hardcoded". A bundled node lists the fingerprints of
      // the versions it supersedes: his copy with one of them was never edited, so it is upgraded (said); an edited copy stays his and the new
      // one lands beside it as <file>.new (said, once).
      const up = _upgradeFile(mine, path.join(fromDir, f));
      if (up === 'upgraded') { out.upgraded.push(f); rec[f] = { ...(rec[f] || {}), upgradedAt: Date.now() }; }
      else if (up === 'offered') out.offered.push(f + '.new');
      out.kept.push(f); if (!rec[f]) rec[f] = { at: Date.now(), from: 'already there' }; continue;
    }
    if (rec[f]) { out.kept.push(f); continue; }   // seeded before and gone now: he deleted it, and that stands
    fs.copyFileSync(path.join(fromDir, f), path.join(dir, f));
    rec[f] = { at: Date.now(), from: path.basename(path.dirname(fromDir)) + '/' + path.basename(fromDir) };
    out.seeded.push(f);
  }
  try { fs.writeFileSync(recFile, JSON.stringify(rec, null, 2)); } catch (_) {}
  return out;
}

function _fpOf(doc) { const p = doc && (doc.payload || doc.macro || doc.workflow); if (!p) return null; return doc.type === 'workflow' ? workflowFingerprint(p.steps || []) : macroFingerprint(p); }
/** _upgradeFile(mine, bundled) → 'upgraded' | 'offered' | 'same' | 'kept' */
function _upgradeFile(mine, bundled) {
  let a, b; try { a = parse(fs.readFileSync(mine, 'utf8')); b = parse(fs.readFileSync(bundled, 'utf8')); } catch (_) { return 'kept'; }
  const fa = _fpOf(a), fb = _fpOf(b);
  if (!fa || !fb || fa === fb) return 'same';
  if ((b.supersedes || []).includes(fa)) { fs.copyFileSync(bundled, mine); return 'upgraded'; }
  if ((b.supersedes || []).length && !fs.existsSync(mine + '.new')) { fs.copyFileSync(bundled, mine + '.new'); return 'offered'; }
  return 'kept';
}

/** bundledNode(fromDir, name) → { payload, supersedes, file } of a shipped macro by its name, or null (0.60.280 KB6) */
function bundledNode(fromDir, name) {
  if (!fromDir || !fs.existsSync(fromDir)) return null;
  for (const f of fs.readdirSync(fromDir).filter(x => x.endsWith('.macro'))) {
    try { const r = parse(fs.readFileSync(path.join(fromDir, f), 'utf8')); const p = r && (r.payload || r.macro); if (p && p.name === name) return { payload: p, supersedes: r.supersedes || [], file: f }; } catch (_) {}
  }
  return null;
}

/**
 * upgradeMacro(node, { getMacro, deleteMacro, createMacro }) → { ok, upgraded?, kept?, imported?, why }   (0.60.280 KB6)
 * The macro in the store: absent → imported; a superseded fingerprint (never edited) → replaced by the node (said); his own edit → kept (said).
 */
async function upgradeMacro(node, { getMacro, deleteMacro, createMacro } = {}) {
  if (!node || !node.payload) return { ok: false, why: 'no node' };
  const p = node.payload;
  const have = getMacro ? await getMacro(p.name) : null;
  if (!have || have.error || !have.macro) { const im = await importMacro(p, { getMacro, createMacro }); return im.ok ? { ok: true, imported: true, why: 'imported from its node file' } : { ok: false, why: im.error }; }
  const fh = macroFingerprint(have.macro), fn = macroFingerprint(p);
  if (fh === fn) return { ok: true, why: 'already the node\'s version' };
  if (!(node.supersedes || []).includes(fh)) return { ok: true, kept: true, why: `“${p.name}” was edited, so it is kept as it is; the node's newer version is in its file` };
  if (!deleteMacro) return { ok: true, kept: true, why: 'macros cannot be replaced here' };
  const d = await deleteMacro(p.name); if (d && d.error) return { ok: false, why: d.error };
  const c = await createMacro({ name: p.name, steps: p.steps, urlPattern: p.urlPattern || undefined, params: p.params || [], profile: p.profile || undefined, description: p.description || undefined });
  if (!c || c.error) return { ok: false, why: (c && c.error) || 'not created' };
  return { ok: true, upgraded: true, why: `“${p.name}” upgraded to its node's version (it was never edited)` };
}

/** bundledMacro(fromDir, name) — a shipped macro's payload by its name, for a caller that needs it imported (the gig fill). null when absent. */
function bundledMacro(fromDir, name) {
  if (!fromDir || !fs.existsSync(fromDir)) return null;
  for (const f of fs.readdirSync(fromDir).filter(x => x.endsWith('.macro'))) {
    try { const r = parse(fs.readFileSync(path.join(fromDir, f), 'utf8')); const p = r && (r.payload || r.macro); if (p && p.name === name) return p; } catch (_) {}
  }
  return null;
}

module.exports = { workflowNode, macroNode, parse, importNode, importMacro, saveNode, listNodes, seedBundled, bundledMacro, bundledNode, upgradeMacro, workflowFingerprint, macroFingerprint, SYSTEM, NODES_DIR, DATA_ROOT };
