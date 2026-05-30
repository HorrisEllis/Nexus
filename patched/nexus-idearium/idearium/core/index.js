'use strict';
// ── idearium/core/index.js ────────────────────────────────────────────────────
// UUID: idearium-core-v1-0000-4000-0000-000000000001
// VERSION: 1.0.0 — §5.4
// COBALT: idearium.core | bootPhase: 13 | pollMs: 5000
//
// The Idea OS. Not a notes app. Not a todo list.
// Every idea is a JAA node with causal ancestry, tension score, and a spec.
// The loop: idea → spec → gate → artifact → memory → crystal → idea
//
// LAW II: JAA first, behavior second. No in-memory-only state.
// LAW III: No imports from other modules. All cross-module via JAA.
// LAW V: Every feature has a CLI command. This file exports the raw operations.
// §M1: Nothing is ever deleted. Everything accumulates.
// §I1: Every idea has a rhythm. §I2: Friction is information. §I3: Gap is first-class.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'idearium.core';
const VERSION   = '1.0.0';

// ── Portable utilities (copied per §5.7 — no shared util module) ─────────────
const uid  = () => crypto.randomUUID();
const ts   = () => Date.now();
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 48);

// ── STOPWORDS (for tokenization — copied, not imported) ──────────────────────
const STOPWORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','not','this','that','these','those','it','its','i','you','he','she','we','they']);

function _tokenize(text) {
  return String(text||'').toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(w => w.slice(0,7));
}

// ── JAA Lite (standalone mode — falls back to file-based store) ───────────────
// When running inside NEXUS, jaaDB is injected via setDeps().
// Standalone mode uses JSON files directly.
class JaaLite {
  constructor(dir) {
    this._dir    = dir;
    this._tables = {};
    this._rowId  = 1;
  }

  _file(t) { return path.join(this._dir, `${t}.jsonl`); }

  open() {
    fs.mkdirSync(this._dir, { recursive: true });
    for (const t of IdeaOS.ALL_TABLES) {
      this._tables[t] = [];
      const f = this._file(t);
      if (fs.existsSync(f)) {
        const rows = fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
        for (const r of rows) {
          this._tables[t].push(r);
          if (r._rowId && r._rowId >= this._rowId) this._rowId = r._rowId + 1;
        }
      }
      this._fds = this._fds || {};
      this._fds[t] = fs.createWriteStream(f, { flags: 'a' });
    }
    return this;
  }

  insert(t, r) {
    this._tables[t] = this._tables[t] || [];
    const row = { ...r, _rowId: this._rowId++, _ts: Date.now() };
    this._tables[t].push(row);
    if (this._fds?.[t]) this._fds[t].write(JSON.stringify(row) + '\n');
    return row;
  }

  update(t, id, patch) {
    const arr = this._tables[t] || [];
    const i   = arr.findIndex(r => r.uuid === id);
    if (i < 0) return null;
    const updated = { ...arr[i], ...patch, _updatedAt: Date.now() };
    arr[i] = updated;
    if (this._fds?.[t]) this._fds[t].write(JSON.stringify({ _mutation:true, uuid:id, ...patch }) + '\n');
    return updated;
  }

  get(t, id)               { return (this._tables[t]||[]).find(r=>r.uuid===id)||null; }
  query(t, pred, limit=500){ return (this._tables[t]||[]).filter(r=>!r._mutation&&pred(r)).slice(-limit); }
  tail(t, n=50)            { const r=(this._tables[t]||[]).filter(r=>!r._mutation); return r.slice(Math.max(0,r.length-n)); }
  count(t, pred=()=>true)  { return (this._tables[t]||[]).filter(r=>!r._mutation&&pred(r)).length; }
  scan(t)                  { return (this._tables[t]||[]).filter(r=>!r._mutation); }
}

// ── IdeaOS ────────────────────────────────────────────────────────────────────
class IdeaOS {

  static get ALL_TABLES() {
    return ['ideas','specs','gaps','snapshots','links','tension_records','ci_runs','snr_samples','event_log'];
  }

  static get IDEA_LIFECYCLE() {
    return ['seed','expanding','tensioned','specced','building','complete','archived'];
  }

  constructor({ dataDir, jaaDB: externalJaa } = {}) {
    this._dir    = dataDir || path.join(process.cwd(), '.idearium');
    this._jaa    = externalJaa || new JaaLite(this._dir);
    this._ready  = false;
    this._snrWindow = []; // last N events for SNR computation
  }

  async open() {
    if (!this._ready) {
      if (this._jaa.open) this._jaa.open();
      this._ready = true;
      this._emit('system.boot', { module: MODULE_ID, version: VERSION });
    }
    return this;
  }

  // ── Internal event log ────────────────────────────────────────────────────
  _emit(type, payload = {}) {
    const row = this._jaa.insert('event_log', {
      uuid: uid(), type, payload,
      source: MODULE_ID, causedBy: payload.causedBy || null, ts: ts(),
    });
    this._trackSNR(type);
    return row;
  }

  _toast(type, message, extra = {}) {
    // Write to toasts table if available (NEXUS integration)
    try {
      this._jaa.insert('toasts', {
        uuid: uid(), type, module: MODULE_ID,
        message, ts: ts(), actions: extra.actions || [],
        autoClose: type === 'toast.error' ? 0 : 5000,
        causedBy: extra.causedBy || null,
      });
    } catch (e) {
      // Standalone mode — toasts table may not exist
      console.error(`[${MODULE_ID}] toast (${type}): ${message}`);
    }
  }

  _fail(err, causedBy = null) {
    console.error(`[${MODULE_ID}] §1.2 FAILURE:`, err.message);
    try {
      this._jaa.insert('failures', {
        uuid: uid(), source: MODULE_ID,
        error: err.message, stack: err.stack,
        causedBy, ts: ts(),
      });
    } catch (innerErr) {
      console.error(`[${MODULE_ID}] failures insert failed:`, innerErr.message);
    }
    this._toast('toast.error', `${MODULE_ID}: ${err.message}`, { causedBy });
  }

  // ── SNR tracking ──────────────────────────────────────────────────────────
  _trackSNR(eventType) {
    const contract = this._loadContract();
    const signalMap = contract?.snr_translation?.signal_events || {};
    const noiseMap  = contract?.snr_translation?.noise_events  || {};
    const score = signalMap[eventType] ?? noiseMap[eventType] ?? 0.4;
    this._snrWindow.push({ type: eventType, score, ts: ts() });
    if (this._snrWindow.length > 50) this._snrWindow.shift();
  }

  getSNR() {
    if (!this._snrWindow.length) return { signal: 0, noise: 0, ratio: 0, events: 0 };
    const avg = this._snrWindow.reduce((s,e) => s + e.score, 0) / this._snrWindow.length;
    const signal = this._snrWindow.filter(e => e.score >= 0.5).length;
    const noise  = this._snrWindow.filter(e => e.score <  0.3).length;
    this._jaa.insert('snr_samples', { uuid: uid(), ratio: avg, signal, noise, total: this._snrWindow.length, ts: ts(), source: MODULE_ID });
    this._emit('snr.update', { ratio: avg, signal, noise });
    return { signal, noise, ratio: avg, events: this._snrWindow.length };
  }

  _loadContract() {
    try {
      const p = path.join(__dirname, '../schemas/interaction-contract.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {}
    return null;
  }

  // ── IDEA OPERATIONS ───────────────────────────────────────────────────────

  createIdea({ text, tags = [], parentIdea = null, causedBy = null } = {}) {
    if (!text) throw new Error('§1.2 idea.create: text required');
    const idea = {
      uuid:        uid(),
      slug:        slug(text),
      text,
      tags:        Array.isArray(tags) ? tags : [],
      phase:       'seed',
      tension:     0,
      parentIdea,
      linkedSpec:  null,
      resonanceWith: [],
      tensionWith:   [],
      openGaps:    [],
      stability:   { execution:1, runtime:1, effectiveness:1, rigidity:1, persistence:1 },
      causedBy,
      source:      MODULE_ID,
      createdAt:   ts(),
      updatedAt:   ts(),
    };
    const row = this._jaa.insert('ideas', idea);
    this._emit('idea.created', { uuid: row.uuid, text, tags, causedBy });
    this._toast('toast.success', `Idea created: ${text.slice(0,50)}`);
    return row;
  }

  getIdea(uuid) {
    const idea = this._jaa.get('ideas', uuid);
    if (!idea) throw new Error(`§1.2 idea not found: ${uuid}`);
    return idea;
  }

  listIdeas({ phase, tag, sort = 'tension', limit = 50 } = {}) {
    let ideas = this._jaa.query('ideas', r => {
      if (phase && r.phase !== phase) return false;
      if (tag && !r.tags.includes(tag))    return false;
      return true;
    }, limit);
    if (sort === 'tension')   ideas.sort((a,b) => (b.tension||0) - (a.tension||0));
    if (sort === 'createdAt') ideas.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    if (sort === 'phase')     ideas.sort((a,b) => IdeaOS.IDEA_LIFECYCLE.indexOf(a.phase) - IdeaOS.IDEA_LIFECYCLE.indexOf(b.phase));
    return ideas;
  }

  updateIdea(uuid, patch) {
    const existing = this.getIdea(uuid);
    const allowed  = ['text','tags','phase','tension','linkedSpec','stability','openGaps'];
    const safe     = {};
    for (const k of allowed) if (patch[k] !== undefined) safe[k] = patch[k];
    safe.updatedAt = ts();
    const updated = this._jaa.update('ideas', uuid, safe);
    this._emit('idea.updated', { uuid, changes: Object.keys(safe), causedBy: patch.causedBy || null });
    return updated;
  }

  linkIdeas(uuidA, uuidB, linkType = 'resonance') {
    const a = this.getIdea(uuidA);
    const b = this.getIdea(uuidB);
    if (!['resonance','tension','causal','semantic'].includes(linkType)) {
      throw new Error(`§1.2 unknown link type: ${linkType}`);
    }
    const link = {
      uuid: uid(), from: uuidA, to: uuidB, type: linkType,
      source: MODULE_ID, causedBy: null, ts: ts(),
    };
    this._jaa.insert('links', link);
    // Update both ideas' resonanceWith or tensionWith
    const field = linkType === 'tension' ? 'tensionWith' : 'resonanceWith';
    const aField = [...(a[field] || [])];
    const bField = [...(b[field] || [])];
    if (!aField.includes(uuidB)) aField.push(uuidB);
    if (!bField.includes(uuidA)) bField.push(uuidA);
    this._jaa.update('ideas', uuidA, { [field]: aField });
    this._jaa.update('ideas', uuidB, { [field]: bField });
    this._emit('idea.linked', { from: uuidA, to: uuidB, type: linkType });
    return link;
  }

  archiveIdea(uuid, reason = '') {
    // §M1 — never delete, only archive
    const idea = this.getIdea(uuid);
    this._jaa.update('ideas', uuid, { phase: 'archived', archiveReason: reason, archivedAt: ts() });
    this._emit('idea.archived', { uuid, reason });
    this._toast('toast.info', `Idea archived: ${idea.text.slice(0,50)}`);
    return { ok: true };
  }

  // ── TENSION SCORING ───────────────────────────────────────────────────────
  computeTension(uuid) {
    const idea = this.getIdea(uuid);

    // Component scores (0.0–1.0 each)
    const openGaps       = this._jaa.query('gaps', r => r.status === 'open' && r.ideaUuid === uuid, 999).length;
    const allGaps        = this._jaa.query('gaps', r => r.ideaUuid === uuid, 999).length;
    const gapDensity     = allGaps > 0 ? openGaps / allGaps : 0;

    const tensionLinks   = (idea.tensionWith || []).length;
    const resonanceLinks = (idea.resonanceWith || []).length;
    const contradiction  = Math.min(1, tensionLinks / Math.max(1, tensionLinks + resonanceLinks));

    const snrSamples     = this._jaa.tail('snr_samples', 10);
    const avgSNR         = snrSamples.length
      ? snrSamples.reduce((s,r) => s + (r.ratio||0), 0) / snrSamples.length
      : 0.5;
    const novelty        = 1 - avgSNR; // low SNR = noisy system = high novelty pressure

    const ageMs          = ts() - (idea.createdAt || 0);
    const agedays        = ageMs / 86400000;
    const phasIdx        = IdeaOS.IDEA_LIFECYCLE.indexOf(idea.phase);
    const phaseStuck     = phasIdx <= 1 && agedays > 3 ? Math.min(1, agedays / 14) : 0;

    const score = (
      gapDensity   * 0.30 +
      contradiction * 0.25 +
      novelty       * 0.20 +
      phaseStuck    * 0.15 +
      (tensionLinks > 0 ? 0.10 : 0)
    );
    const tension = Math.min(1, Math.max(0, score));

    this._jaa.update('ideas', uuid, { tension, tensionUpdatedAt: ts() });
    this._jaa.insert('tension_records', {
      uuid: uid(), ideaUuid: uuid, tension,
      components: { gapDensity, contradiction, novelty, phaseStuck },
      ts: ts(), source: MODULE_ID, causedBy: uuid,
    });
    this._emit('idea.tensioned', { uuid, tension });
    return { uuid, tension, components: { gapDensity, contradiction, novelty, phaseStuck } };
  }

  // ── SPEC OPERATIONS ───────────────────────────────────────────────────────
  createSpec(ideaUuid) {
    const idea = this.getIdea(ideaUuid);

    // Default spec sections from the spec model
    const sections = [
      { id:'intent',        title:'Intent & Purpose',       complete:false, required:true,  content:'',
        checklist:[{id:'has_uuid',label:'UUID declared',done:false},{id:'has_intent',label:'Intent statement',done:false},{id:'has_not_this',label:'What this is NOT',done:false}]},
      { id:'api_callto',    title:'API Calls & Calltos',     complete:false, required:true,  content:'',
        checklist:[{id:'endpoints',label:'All endpoints declared',done:false},{id:'guardian_calltos',label:'Guardian calltos declared',done:false},{id:'jaa_reads',label:'JAA reads declared',done:false},{id:'jaa_writes',label:'JAA writes declared',done:false}]},
      { id:'module_hooks',  title:'Module Hooks & Bridge',   complete:false, required:true,  content:'',
        checklist:[{id:'subscribes',label:'All subscribes declared',done:false},{id:'publishes',label:'All publishes declared',done:false},{id:'hook_map',label:'COBALT.hooks complete',done:false}]},
      { id:'cli_spec',      title:'CLI Commands',            complete:false, required:true,  content:'',
        checklist:[{id:'every_feature_has_cli',label:'Every feature has a CLI command',done:false},{id:'all_commands_registered',label:'All commands in COBALT.cli[]',done:false}]},
      { id:'schemas',       title:'Schemas',                 complete:false, required:true,  content:'',
        checklist:[{id:'jaa_tables_schemed',label:'All JAA tables have schemas',done:false},{id:'module_schema',label:'module.schema.json created',done:false}]},
      { id:'gap_contract',  title:'Gap Contract',            complete:false, required:true,  content:'',
        checklist:[{id:'bridges',label:'cobalt.gapContract.bridges filled',done:false},{id:'fills',label:'cobalt.gapContract.fills filled',done:false},{id:'creates',label:'cobalt.gapContract.creates filled',done:false}]},
      { id:'failure_modes', title:'Failure Modes',           complete:false, required:true,  content:'',
        checklist:[{id:'failure_modes_listed',label:'All failure modes listed',done:false},{id:'toast_for_each',label:'Toast for each failure',done:false}]},
      { id:'tests',         title:'Test Suite',              complete:false, required:false, content:'',
        checklist:[{id:'test_file',label:'Test file path declared',done:false},{id:'pass_rate',label:'Required pass rate declared',done:false}]},
    ];

    const spec = {
      uuid:     uid(),
      name:     idea.text.slice(0, 60),
      version:  '1.0.0',
      ideaUuid,
      phase:    'seed',
      sections,
      modules:  [],
      wired:    { eventBus:false, cli:false, jaa:false, toast:false, schemaValidated:false },
      buildOrder: [],
      agentAssignments: {},
      causedBy: ideaUuid,
      source:   MODULE_ID,
      createdAt: ts(),
      updatedAt: ts(),
    };

    const row = this._jaa.insert('specs', spec);
    this._jaa.update('ideas', ideaUuid, { linkedSpec: row.uuid, phase: 'expanding' });
    this._emit('spec.created', { uuid: row.uuid, ideaUuid, name: spec.name });
    this._toast('toast.success', `Spec created: ${spec.name}`);
    return row;
  }

  getSpec(uuid) {
    const spec = this._jaa.get('specs', uuid);
    if (!spec) throw new Error(`§1.2 spec not found: ${uuid}`);
    return spec;
  }

  updateSpec(uuid, patch) {
    const existing = this.getSpec(uuid);
    const updated  = this._jaa.update('specs', uuid, { ...patch, updatedAt: ts() });
    this._emit('spec.updated', { uuid, changes: Object.keys(patch) });
    return updated;
  }

  checkSpec(uuid) {
    const spec = this.getSpec(uuid);
    const results = [];

    for (const section of spec.sections) {
      if (!section.required) continue;
      for (const item of section.checklist) {
        results.push({
          section: section.id,
          sectionTitle: section.title,
          item: item.id,
          label: item.label,
          done: item.done,
        });
      }
    }

    const total    = results.length;
    const done     = results.filter(r => r.done).length;
    const missing  = results.filter(r => !r.done);
    const score    = total > 0 ? done / total : 0;
    const complete = missing.length === 0;

    // Update spec phase
    if (complete && spec.phase !== 'specced') {
      this._jaa.update('specs', uuid, { phase: 'specced', updatedAt: ts() });
      if (spec.ideaUuid) this._jaa.update('ideas', spec.ideaUuid, { phase: 'specced' });
    }

    this._emit('spec.checked', { uuid, score, complete, missingCount: missing.length });
    if (!complete) {
      this._toast('toast.warn', `Spec check: ${done}/${total} items done — ${missing.length} missing`);
    } else {
      this._toast('toast.success', `Spec complete: ${spec.name}`);
    }

    return { uuid, score, complete, done, total, missing, spec };
  }

  // ── GAP OPERATIONS ────────────────────────────────────────────────────────
  createGap({ type = 'unresolved', description, ideaUuid = null, specUuid = null, severity = 'medium', causedBy = null } = {}) {
    if (!description) throw new Error('§1.2 gap.create: description required');
    const gap = {
      uuid: uid(), type, description,
      ideaUuid, specUuid,
      status:   'open',
      severity,
      causedBy, source: MODULE_ID, ts: ts(), createdAt: ts(),
    };
    const row = this._jaa.insert('gaps', gap);
    if (ideaUuid) {
      const idea = this._jaa.get('ideas', ideaUuid);
      if (idea) this._jaa.update('ideas', ideaUuid, { openGaps: [...(idea.openGaps||[]), row.uuid] });
    }
    this._emit('gap.created', { uuid: row.uuid, type, severity, ideaUuid });
    this._toast('toast.gap', `Gap: ${description.slice(0,60)}`);
    return row;
  }

  resolveGap(uuid, resolution = '') {
    const gap = this._jaa.get('gaps', uuid);
    if (!gap) throw new Error(`§1.2 gap not found: ${uuid}`);
    this._jaa.update('gaps', uuid, { status: 'resolved', resolution, resolvedAt: ts() });
    // Remove from idea's openGaps
    if (gap.ideaUuid) {
      const idea = this._jaa.get('ideas', gap.ideaUuid);
      if (idea) {
        const openGaps = (idea.openGaps || []).filter(g => g !== uuid);
        this._jaa.update('ideas', gap.ideaUuid, { openGaps });
      }
    }
    this._emit('gap.resolved', { uuid, resolution });
    this._toast('toast.success', `Gap resolved: ${gap.description.slice(0,50)}`);
    return { ok: true };
  }

  listGaps({ status, severity, ideaUuid } = {}) {
    return this._jaa.query('gaps', r => {
      if (status && r.status !== status) return false;
      if (severity && r.severity !== severity) return false;
      if (ideaUuid && r.ideaUuid !== ideaUuid) return false;
      return true;
    }, 200);
  }

  // ── SNAPSHOT (VORTEX) ─────────────────────────────────────────────────────
  snapshot(message = '', causedBy = null) {
    const ideas    = this._jaa.scan('ideas');
    const specs    = this._jaa.scan('specs');
    const gaps     = this._jaa.query('gaps', r => r.status === 'open', 500);
    const snr      = this.getSNR();

    const content  = { ideas, specs, openGaps: gaps, snr };
    const raw      = JSON.stringify(content);
    const commitHash = hash(raw);

    const snap = {
      uuid:     uid(),
      hash:     commitHash,
      message,
      ideaCount:  ideas.length,
      specCount:  specs.length,
      gapCount:   gaps.length,
      snr:        snr.ratio,
      content:    raw,
      causedBy,
      source:     MODULE_ID,
      ts:         ts(),
    };

    const row = this._jaa.insert('snapshots', snap);
    this._emit('push.complete', { uuid: row.uuid, hash: commitHash, message, ideaCount: ideas.length });
    this._toast('toast.snapshot', `Snapshot: ${message || commitHash.slice(0,8)}`);
    return row;
  }

  diffSnapshots(uuidA, uuidB) {
    const a = this._jaa.get('snapshots', uuidA);
    const b = this._jaa.get('snapshots', uuidB);
    if (!a || !b) throw new Error('§1.2 diff: one or both snapshots not found');

    const contentA = JSON.parse(a.content);
    const contentB = JSON.parse(b.content);

    // Ideas diff
    const aIdeaIds = new Set(contentA.ideas.map(i => i.uuid));
    const bIdeaIds = new Set(contentB.ideas.map(i => i.uuid));
    const added    = contentB.ideas.filter(i => !aIdeaIds.has(i.uuid));
    const removed  = contentA.ideas.filter(i => !bIdeaIds.has(i.uuid));
    const changed  = contentB.ideas.filter(i => {
      if (!aIdeaIds.has(i.uuid)) return false;
      const old = contentA.ideas.find(x => x.uuid === i.uuid);
      return old.phase !== i.phase || Math.abs((old.tension||0) - (i.tension||0)) > 0.05;
    });

    return {
      snapA: { uuid: uuidA, hash: a.hash, ts: a.ts, message: a.message },
      snapB: { uuid: uuidB, hash: b.hash, ts: b.ts, message: b.message },
      ideas: { added: added.length, removed: removed.length, changed: changed.length, addedList: added, removedList: removed, changedList: changed },
      gaps:  { a: contentA.openGaps?.length || 0, b: contentB.openGaps?.length || 0, delta: (contentB.openGaps?.length||0) - (contentA.openGaps?.length||0) },
      snr:   { a: a.snr || 0, b: b.snr || 0, delta: (b.snr||0) - (a.snr||0) },
    };
  }

  // ── CI GATE ───────────────────────────────────────────────────────────────
  runCI(specUuid) {
    const spec = this.getSpec(specUuid);
    const idea = spec.ideaUuid ? this._jaa.get('ideas', spec.ideaUuid) : null;

    const checks = [];
    const check = (id, label, pass, detail = '') => checks.push({ id, label, pass, detail });

    // Check spec completeness
    const result = this.checkSpec(specUuid);
    check('spec.complete', 'Spec checklist complete', result.complete, `${result.done}/${result.total} items`);

    // Check open gaps
    const openGaps = idea ? (idea.openGaps || []).length : 0;
    check('gaps.clean', 'No open gaps on idea', openGaps === 0, `${openGaps} open gaps`);

    // Check wiring
    const wired = spec.wired || {};
    check('wired.cli',   'CLI wired',           wired.cli,   '');
    check('wired.jaa',   'JAA wired',           wired.jaa,   '');
    check('wired.toast', 'Toast wired',         wired.toast, '');

    // Check phase
    const phaseOk = ['specced','building','complete'].includes(spec.phase);
    check('spec.phase', `Spec phase (${spec.phase})`, phaseOk, `Must be specced/building/complete`);

    const passed = checks.filter(c => c.pass).length;
    const total  = checks.length;
    const ok     = passed === total;
    const score  = passed / total;

    const run = {
      uuid: uid(), specUuid, ideaUuid: spec.ideaUuid,
      ok, score, passed, total, checks,
      source: MODULE_ID, causedBy: specUuid, ts: ts(),
    };
    this._jaa.insert('ci_runs', run);
    this._emit('ci.run', { uuid: run.uuid, ok, score, passed, total });
    if (ok)  this._toast('toast.success', `CI PASS: ${spec.name} (${passed}/${total})`);
    else     this._toast('toast.error',   `CI FAIL: ${spec.name} (${passed}/${total} — ${total-passed} failing)`);
    return run;
  }

  // ── STATS ─────────────────────────────────────────────────────────────────
  stats() {
    const ideas     = this._jaa.count('ideas');
    const specs     = this._jaa.count('specs');
    const openGaps  = this._jaa.count('gaps', r => r.status === 'open');
    const snapshots = this._jaa.count('snapshots');
    const snr       = this.getSNR();
    const byPhase   = {};
    for (const p of IdeaOS.IDEA_LIFECYCLE) {
      byPhase[p] = this._jaa.count('ideas', r => r.phase === p);
    }
    return { ideas, specs, openGaps, snapshots, snr, byPhase, version: VERSION };
  }
}

// ── Module exports (NEXUS integration) ────────────────────────────────────────
let _instance = null;
let _interval = null;

function init(cfg = {}) {
  _instance = new IdeaOS({ dataDir: cfg.dataDir });
  _instance.open();
  _interval = setInterval(_tick, cfg.pollMs ?? 5000);
  _interval.unref();
  console.log(`[${MODULE_ID}] initialized — data: ${_instance._dir}`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

function _tick() {
  try {
    if (!_instance) return;
    // Recompute tension for ideas that haven't been scored recently
    const stale = _instance._jaa.query('ideas', r =>
      r.phase !== 'archived' && (!r.tensionUpdatedAt || Date.now() - r.tensionUpdatedAt > 60000), 5
    );
    for (const idea of stale) {
      try { _instance.computeTension(idea.uuid); } catch (e) { /* non-fatal */ }
    }
  } catch (err) {
    console.error(`[${MODULE_ID}] tick error:`, err.message);
  }
}

function getInstance() {
  if (!_instance) throw new Error('§1.2 idearium.core not initialized — call init() first');
  return _instance;
}

module.exports = { IdeaOS, init, stop, getInstance, VERSION, MODULE_ID };
