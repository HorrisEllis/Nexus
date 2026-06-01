/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  IdeaOS — idearium/core/index.js                                       ║
 * ║  UUID:    idearium-core-v1-0000-4000-0000-000000000001                 ║
 * ║  Version: 2.0.0                                                        ║
 * ║  Layer:   idearium.core                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The Idea OS. Not a notes app. Not a todo list.
 * Every idea is a JAA node with causal ancestry, tension score, and a spec.
 * All state lives here. CLI and API are projections. UI is a projection of API.
 *
 * §8.3  SISO is a load-order prerequisite.
 * §3.1  Foundation before modules. Modules before UI.
 * §1.2  Nothing silently fails.
 * §2.1  Persistence is the golden rule.
 * §5.1  Everything has a UUID.
 * §7.1  Dual ledger — Upgrade Ledger (truth) + Idea Ledger (cognition).
 */

import { Event, Gate, Stream, StreamLog } from '../../siso/core/index.js';
import { createRequire } from 'module';
import { randomUUID }    from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── Constants ────────────────────────────────────────────────────────────────

export const VERSION   = '2.0.0';
export const NAMESPACE = 'idearium';
export const PORT      = 4800;

export const IDEA_PHASES   = ['seed','expanding','tensioned','specced','building','complete','archived'];
export const GAP_STATUSES  = ['open','resolved','ignored','archived'];
export const GAP_SEVERITIES= ['fatal','high','medium','low'];
export const LINK_TYPES    = ['resonance','tension','causal','temporal','semantic'];

// SNR translation table — from interaction-contract spec
export const SNR_WEIGHTS = {
  'idea.created':   0.9,
  'spec.created':   0.95,
  'spec.built':     1.0,
  'gap.resolved':   0.85,
  'ci.run':         0.9,
  'push.complete':  0.95,
  'idea.tensioned': 0.7,
  'spec.updated':   0.6,
  'idea.updated':   0.5,
  'idea.linked':    0.65,
  'snr.update':     0.1,
  'guardian.health':0.15,
  'idea.archived':  0.2,
  'gap.ignored':    0.3,
};
const SNR_WINDOW = 50;

// ─── Storage ──────────────────────────────────────────────────────────────────

const DATA_DIR = join(__dir, '../../data');
const DB_FILE  = join(DATA_DIR, 'idearium.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadDB() {
  ensureDataDir();
  if (!existsSync(DB_FILE)) return freshDB();
  try {
    const raw = readFileSync(DB_FILE, 'utf8');
    const db  = JSON.parse(raw);
    if (db._version !== VERSION) {
      console.warn(`[IdeaOS] DB version mismatch (${db._version} → ${VERSION}). Migrating.`);
      return migrateDB(db);
    }
    return db;
  } catch (err) {
    throw new Error(`[IdeaOS] DB load failed: ${err.message}. File: ${DB_FILE}`);
  }
}

function saveDB(db) {
  ensureDataDir();
  db._savedAt = Date.now();
  db._version = VERSION;
  try {
    writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`[IdeaOS] DB save failed: ${err.message}`);
  }
}

function freshDB() {
  return {
    _version:  VERSION,
    _savedAt:  null,
    ideas:     [],
    specs:     [],
    gaps:      [],
    links:     [],
    snapshots: [],
    events:    [],
    snr:       [],
    tensions:  [],
  };
}

function migrateDB(old) {
  // Non-destructive: fold old data into fresh schema
  const db = freshDB();
  db.ideas     = old.ideas     || [];
  db.specs     = old.specs     || [];
  db.gaps      = old.gaps      || [];
  db.links     = old.links     || [];
  db.snapshots = old.snapshots || [];
  db.events    = old.events    || [];
  db.snr       = old.snr       || [];
  db.tensions  = old.tensions  || [];
  return db;
}

// ─── IdeaOS ───────────────────────────────────────────────────────────────────

export class IdeaOS {
  constructor() {
    this.log    = new StreamLog('DATA');
    this.stream = new Stream({ log: this.log });
    this.db     = loadDB();
    this._sseClients = new Set(); // HTTP SSE subscribers

    this._registerGates();
    this._recalcSNR();
    console.log(`[IdeaOS] v${VERSION} — ${this.db.ideas.length} ideas, ${this.db.gaps.filter(g=>g.status==='open').length} open gaps, SNR ${this.snr.toFixed(3)}`);
  }

  // ─── Gate Registration ──────────────────────────────────────────────────────

  _registerGates() {
    const S = this.stream;
    // Every mutation is a gate. No state change outside the stream. (§5.1, §5.7)
    S.register(new IdeaCreateGate(this));
    S.register(new IdeaUpdateGate(this));
    S.register(new IdeaPhaseGate(this));
    S.register(new IdeaLinkGate(this));
    S.register(new IdeaTensionGate(this));
    S.register(new IdeaArchiveGate(this));
    S.register(new SpecCreateGate(this));
    S.register(new SpecUpdateGate(this));
    S.register(new SpecCheckGate(this));
    S.register(new GapOpenGate(this));
    S.register(new GapResolveGate(this));
    S.register(new GapIgnoreGate(this));
    S.register(new SnapshotGate(this));
    S.register(new SNRSampleGate(this));
    S.register(new ErrorGate(this));
  }

  // ─── Public emit (all mutations go through here) ────────────────────────────

  emit(type, data = {}, causedBy = null) {
    const ev = {
      uuid:     randomUUID(),
      type,
      payload:  data,
      causedBy,
      source:   'idearium.core',
      ts:       Date.now(),
    };
    // Append-only event log (§7.6)
    this.db.events.push(ev);
    if (this.db.events.length > 5000) this.db.events = this.db.events.slice(-5000);

    // Route through SISO stream
    this.stream.emit(new Event(type, { ...data, _ev: ev }));

    // SNR sample
    if (SNR_WEIGHTS[type] !== undefined) {
      this.stream.emit(new Event('idearium.snr.sample', { eventType: type, weight: SNR_WEIGHTS[type] }));
    }

    // Broadcast to SSE clients
    this._broadcast(ev);
    return ev;
  }

  // ─── SSE broadcast ──────────────────────────────────────────────────────────

  addSSEClient(res) {
    this._sseClients.add(res);
    res.on('close', () => this._sseClients.delete(res));
  }

  _broadcast(ev) {
    const data = `data: ${JSON.stringify(ev)}\n\n`;
    for (const client of this._sseClients) {
      try { client.write(data); } catch {}
    }
  }

  // ─── Query API (read-only, no gates needed) ──────────────────────────────────

  ideas(filter = {}) {
    let rows = this.db.ideas;
    if (filter.phase)     rows = rows.filter(i => i.phase === filter.phase);
    if (filter.tag)       rows = rows.filter(i => (i.tags||[]).includes(filter.tag));
    if (filter.search)    { const q = filter.search.toLowerCase(); rows = rows.filter(i => i.text?.toLowerCase().includes(q) || (i.tags||[]).some(t=>t.includes(q))); }
    if (filter.sort === 'tension') rows = [...rows].sort((a,b)=>(b.tension||0)-(a.tension||0));
    else if (filter.sort === 'updated') rows = [...rows].sort((a,b)=>b.updatedAt-a.updatedAt);
    if (filter.limit)     rows = rows.slice(0, parseInt(filter.limit));
    return rows;
  }

  idea(uuid)     { return this.db.ideas.find(i=>i.uuid===uuid) || null; }
  spec(uuid)     { return this.db.specs.find(s=>s.uuid===uuid) || null; }
  specs(filter={}) {
    let rows = this.db.specs;
    if (filter.phase) rows = rows.filter(s=>s.phase===filter.phase);
    return rows;
  }
  gap(uuid)      { return this.db.gaps.find(g=>g.uuid===uuid)  || null; }
  gaps(filter={}) {
    let rows = this.db.gaps;
    if (filter.status)   rows = rows.filter(g=>g.status===filter.status);
    if (filter.severity) rows = rows.filter(g=>g.severity===filter.severity);
    if (filter.type)     rows = rows.filter(g=>g.type===filter.type);
    return rows;
  }
  snapshots()    { return this.db.snapshots; }
  snapshot(uuid) { return this.db.snapshots.find(s=>s.uuid===uuid) || null; }
  eventLog(n=100){ return this.db.events.slice(-n); }
  snrHistory(n=50){ return this.db.snr.slice(-n); }

  // ─── SNR ────────────────────────────────────────────────────────────────────

  _recalcSNR() {
    const window = this.db.snr.slice(-SNR_WINDOW);
    if (!window.length) { this.snr = 0.5; return; }
    const avg = window.reduce((s,r) => s + r.snrValue, 0) / window.length;
    this.snr = Math.round(avg * 1000) / 1000;
  }

  // ─── Tension ────────────────────────────────────────────────────────────────

  computeTension(idea) {
    const openGaps = this.db.gaps.filter(g => g.status==='open' && (g.ideaUuid===idea.uuid || (g.between||[]).includes(idea.uuid)));
    const gapDensity = Math.min(openGaps.length * 0.15, 0.30);

    const active = new Set(this.db.ideas.filter(i=>i.phase!=='archived').map(i=>i.uuid));
    const contra = (idea.tensionWith||[]).filter(u=>active.has(u));
    const contradiction = Math.min(contra.length * 0.10, 0.25);

    const staleDays = (Date.now() - idea.updatedAt) / 86400000;
    let novelty = 0;
    if (staleDays > 7  && idea.phase === 'seed')      novelty += 0.10;
    if (staleDays > 21 && idea.phase === 'seed')      novelty += 0.10;
    if (staleDays > 7  && idea.phase === 'expanding') novelty += 0.05;

    const depLinks = this.db.links.filter(l => l.fromUuid===idea.uuid || l.toUuid===idea.uuid);
    const resourceCost = Math.min(depLinks.length * 0.03, 0.15);

    const score = Math.round(Math.min(gapDensity + contradiction + novelty + resourceCost, 1.0) * 1000) / 1000;
    return {
      score,
      components: { gap_density: gapDensity, contradiction, novelty, resource_cost: resourceCost, dependency_depth: 0 },
    };
  }

  // ─── Snapshot diff ──────────────────────────────────────────────────────────

  diffSnapshots(uuidA, uuidB) {
    const a = this.snapshot(uuidA);
    const b = this.snapshot(uuidB);
    if (!a || !b) return null;
    return {
      a: uuidA, b: uuidB,
      gapDelta:   (b.gapCount || 0) - (a.gapCount || 0),
      ideaDelta:  (b.ideasCount || 0) - (a.ideasCount || 0),
      snrDelta:   Math.round(((b.snr||0) - (a.snr||0)) * 1000) / 1000,
    };
  }

  // ─── Contract ───────────────────────────────────────────────────────────────

  contract() {
    const contractPath = join(__dir, '../schemas/interaction-contract.json');
    if (!existsSync(contractPath)) throw new Error('interaction-contract.json not found');
    return JSON.parse(readFileSync(contractPath, 'utf8'));
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  stats() {
    const ideas = this.db.ideas;
    const phaseMap = {};
    for (const p of IDEA_PHASES) phaseMap[p] = ideas.filter(i=>i.phase===p).length;
    return {
      version:      VERSION,
      ideasTotal:   ideas.length,
      phaseMap,
      openGaps:     this.db.gaps.filter(g=>g.status==='open').length,
      totalGaps:    this.db.gaps.length,
      snapshots:    this.db.snapshots.length,
      specs:        this.db.specs.length,
      links:        this.db.links.length,
      events:       this.db.events.length,
      snr:          this.snr,
      savedAt:      this.db._savedAt,
    };
  }
}

// ─── Gates ────────────────────────────────────────────────────────────────────

class IdeaCreateGate extends Gate {
  constructor(os) { super('idearium.idea.create'); this.os = os; }
  transform(event, stream) {
    const { text, tags = [], compartment = null, source = 'cli', causedBy = null } = event.data;
    if (!text || text.trim().length < 3) {
      stream.emit(new Event('idearium.error', { op: 'idea.create', reason: 'text must be ≥3 chars' }));
      return;
    }
    const uuid = randomUUID();
    const slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').slice(0,50);
    const idea = {
      uuid, slug, text: text.trim(), tags, phase: 'seed',
      tension: 0, tensionUpdatedAt: null,
      parentIdea: null, linkedSpec: null,
      resonanceWith: [], tensionWith: [], openGaps: [],
      stability: { execution:1.0, runtime:1.0, effectiveness:1.0, rigidity:1.0, persistence:1.0 },
      compartment, archiveReason: null, archivedAt: null,
      causedBy, source, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.os.db.ideas.push(idea);
    saveDB(this.os.db);
    stream.emit(new Event('idearium.idea.created', { idea }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.created', payload: idea, ts: Date.now() });
  }
}

class IdeaUpdateGate extends Gate {
  constructor(os) { super('idearium.idea.update'); this.os = os; }
  transform(event, stream) {
    const { uuid, fields, causedBy = null } = event.data;
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.update', reason:`uuid not found: ${uuid}` })); return; }
    const allowed = ['text','tags','compartment','resonanceWith','tensionWith','stability'];
    for (const k of allowed) { if (fields[k] !== undefined) idea[k] = fields[k]; }
    idea.updatedAt = Date.now();
    idea.causedBy  = causedBy;
    saveDB(this.os.db);
    stream.emit(new Event('idearium.idea.updated', { idea }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.updated', payload: idea, ts: Date.now() });
  }
}

class IdeaPhaseGate extends Gate {
  constructor(os) { super('idearium.idea.phase'); this.os = os; }
  transform(event, stream) {
    const { uuid, phase, causedBy = null } = event.data;
    if (!IDEA_PHASES.includes(phase)) { stream.emit(new Event('idearium.error', { op:'idea.phase', reason:`invalid phase: ${phase}` })); return; }
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.phase', reason:`uuid not found: ${uuid}` })); return; }
    const prev = idea.phase;
    idea.phase = phase; idea.updatedAt = Date.now(); idea.causedBy = causedBy;
    saveDB(this.os.db);
    stream.emit(new Event('idearium.idea.phase.changed', { uuid, from: prev, to: phase }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.updated', payload: idea, ts: Date.now() });
  }
}

class IdeaLinkGate extends Gate {
  constructor(os) { super('idearium.idea.link'); this.os = os; }
  transform(event, stream) {
    const { fromUuid, toUuid, linkType = 'resonance', causedBy = null } = event.data;
    if (!LINK_TYPES.includes(linkType)) { stream.emit(new Event('idearium.error', { op:'idea.link', reason:`invalid linkType: ${linkType}` })); return; }
    const a = this.os.db.ideas.find(i=>i.uuid===fromUuid);
    const b = this.os.db.ideas.find(i=>i.uuid===toUuid);
    if (!a||!b) { stream.emit(new Event('idearium.error', { op:'idea.link', reason:'one or both uuids not found' })); return; }
    // Deduplicate
    const existing = this.os.db.links.find(l=>((l.fromUuid===fromUuid&&l.toUuid===toUuid)||(l.fromUuid===toUuid&&l.toUuid===fromUuid))&&l.linkType===linkType);
    if (existing) { stream.emit(new Event('idearium.error', { op:'idea.link', reason:'link already exists' })); return; }
    const link = { uuid: randomUUID(), fromUuid, toUuid, linkType, causedBy, ts: Date.now() };
    this.os.db.links.push(link);
    // Maintain resonanceWith / tensionWith arrays for quick lookup
    if (linkType==='resonance') { if(!a.resonanceWith.includes(toUuid)) a.resonanceWith.push(toUuid); if(!b.resonanceWith.includes(fromUuid)) b.resonanceWith.push(fromUuid); }
    if (linkType==='tension')   { if(!a.tensionWith.includes(toUuid)) a.tensionWith.push(toUuid); if(!b.tensionWith.includes(fromUuid)) b.tensionWith.push(fromUuid); }
    a.updatedAt = b.updatedAt = Date.now();
    saveDB(this.os.db);
    stream.emit(new Event('idearium.idea.linked', { link }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.linked', payload: link, ts: Date.now() });
  }
}

class IdeaTensionGate extends Gate {
  constructor(os) { super('idearium.idea.tension'); this.os = os; }
  transform(event, stream) {
    const { uuid } = event.data;
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.tension', reason:`uuid not found: ${uuid}` })); return; }
    const result = this.os.computeTension(idea);
    idea.tension = result.score;
    idea.tensionUpdatedAt = Date.now();
    const record = { uuid: randomUUID(), ideaUuid: uuid, score: result.score, components: result.components, ts: Date.now() };
    this.os.db.tensions.push(record);
    saveDB(this.os.db);
    stream.emit(new Event('idearium.idea.tensioned', { uuid, tension: result }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.tensioned', payload: { uuid, tension: result }, ts: Date.now() });
  }
}

class IdeaArchiveGate extends Gate {
  constructor(os) { super('idearium.idea.archive'); this.os = os; }
  transform(event, stream) {
    const { uuid, reason, causedBy = null } = event.data;
    if (!reason) { stream.emit(new Event('idearium.error', { op:'idea.archive', reason:'archiveReason required (§M1 — nothing deleted)' })); return; }
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.archive', reason:`uuid not found: ${uuid}` })); return; }
    idea.phase = 'archived'; idea.archiveReason = reason; idea.archivedAt = Date.now(); idea.causedBy = causedBy;
    saveDB(this.os.db);
    stream.emit(new Event('idearium.idea.archived', { uuid, reason }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.archived', payload: { uuid, reason }, ts: Date.now() });
  }
}

class SpecCreateGate extends Gate {
  constructor(os) { super('idearium.spec.create'); this.os = os; }
  transform(event, stream) {
    const { name, ideaUuid = null, source = 'cli', causedBy = null } = event.data;
    if (!name) { stream.emit(new Event('idearium.error', { op:'spec.create', reason:'name required' })); return; }
    const SECTION_IDS = ['intent','api_callto','module_hooks','cli_spec','schemas','gap_contract','failure_modes','tests','phase_map'];
    const spec = {
      uuid: randomUUID(), name, version: '1.0.0', ideaUuid, phase: 'seed',
      sections: SECTION_IDS.map(id => ({ id, title: id.replace(/_/g,' '), complete: false, required: true, content: '', checklist: [] })),
      modules: [], wired: { eventBus:false, cli:false, jaa:false, toast:false, schemaValidated:false },
      buildOrder: [], agentAssignments: {},
      causedBy, source, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.os.db.specs.push(spec);
    if (ideaUuid) {
      const idea = this.os.db.ideas.find(i=>i.uuid===ideaUuid);
      if (idea) { idea.linkedSpec = spec.uuid; idea.updatedAt = Date.now(); }
    }
    saveDB(this.os.db);
    stream.emit(new Event('idearium.spec.created', { spec }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.created', payload: spec, ts: Date.now() });
  }
}

class SpecUpdateGate extends Gate {
  constructor(os) { super('idearium.spec.update'); this.os = os; }
  transform(event, stream) {
    const { uuid, fields } = event.data;
    const spec = this.os.db.specs.find(s=>s.uuid===uuid);
    if (!spec) { stream.emit(new Event('idearium.error', { op:'spec.update', reason:`spec not found: ${uuid}` })); return; }
    const allowed = ['name','phase','sections','modules','wired','buildOrder','agentAssignments'];
    for (const k of allowed) { if (fields[k] !== undefined) spec[k] = fields[k]; }
    spec.updatedAt = Date.now();
    saveDB(this.os.db);
    stream.emit(new Event('idearium.spec.updated', { spec }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.updated', payload: spec, ts: Date.now() });
  }
}

class SpecCheckGate extends Gate {
  constructor(os) { super('idearium.spec.check'); this.os = os; }
  transform(event, stream) {
    const { uuid } = event.data;
    const spec = this.os.db.specs.find(s=>s.uuid===uuid);
    if (!spec) { stream.emit(new Event('idearium.error', { op:'spec.check', reason:`spec not found: ${uuid}` })); return; }
    const checks = spec.sections.map(s => ({ id: s.id, required: s.required, complete: s.complete, hasContent: s.content.length > 0 }));
    const passCount = checks.filter(c=>!c.required || c.complete).length;
    const failCount = checks.length - passCount;
    const passed = failCount === 0;
    if (passed) spec.phase = 'specced';
    spec.updatedAt = Date.now();
    const ciRun = { uuid: randomUUID(), specUuid: uuid, status: passed?'passed':'failed', checks, passCount, failCount, durationMs: 0, causedBy: null, ts: Date.now() };
    saveDB(this.os.db);
    stream.emit(new Event('idearium.spec.checked', { spec, ciRun }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.checked', payload: { spec, ciRun }, ts: Date.now() });
  }
}

class GapOpenGate extends Gate {
  constructor(os) { super('idearium.gap.open'); this.os = os; }
  transform(event, stream) {
    const { type, description, severity = 'medium', ideaUuid = null, specUuid = null, causedBy = null, source = 'idearium.core' } = event.data;
    if (!description || description.length < 5) { stream.emit(new Event('idearium.error', { op:'gap.open', reason:'description must be ≥5 chars' })); return; }
    const gap = {
      uuid: randomUUID(), type: type||'unresolved', description,
      ideaUuid, specUuid, between: event.data.between || (ideaUuid?[ideaUuid]:[]),
      status: 'open', severity,
      resolution: null, resolvedAt: null, ignoreReason: null,
      causedBy, source, ts: Date.now(), createdAt: Date.now(),
    };
    this.os.db.gaps.push(gap);
    // Tag openGaps on linked idea
    if (ideaUuid) {
      const idea = this.os.db.ideas.find(i=>i.uuid===ideaUuid);
      if (idea && !idea.openGaps.includes(gap.uuid)) idea.openGaps.push(gap.uuid);
    }
    saveDB(this.os.db);
    stream.emit(new Event('idearium.gap.opened', { gap }));
    this.os._broadcast({ uuid: randomUUID(), type: 'gap.created', payload: gap, ts: Date.now() });
  }
}

class GapResolveGate extends Gate {
  constructor(os) { super('idearium.gap.resolve'); this.os = os; }
  transform(event, stream) {
    const { uuid, resolution = '' } = event.data;
    const gap = this.os.db.gaps.find(g=>g.uuid===uuid);
    if (!gap) { stream.emit(new Event('idearium.error', { op:'gap.resolve', reason:`gap not found: ${uuid}` })); return; }
    if (gap.status !== 'open') { stream.emit(new Event('idearium.error', { op:'gap.resolve', reason:`gap ${uuid} is already ${gap.status}` })); return; }
    gap.status = 'resolved'; gap.resolution = resolution; gap.resolvedAt = Date.now();
    // Remove from idea.openGaps
    for (const uuid_ of (gap.between||[])) {
      const idea = this.os.db.ideas.find(i=>i.uuid===uuid_);
      if (idea) idea.openGaps = idea.openGaps.filter(g=>g!==uuid);
    }
    saveDB(this.os.db);
    stream.emit(new Event('idearium.gap.resolved', { gap }));
    this.os._broadcast({ uuid: randomUUID(), type: 'gap.resolved', payload: gap, ts: Date.now() });
  }
}

class GapIgnoreGate extends Gate {
  constructor(os) { super('idearium.gap.ignore'); this.os = os; }
  transform(event, stream) {
    const { uuid, reason = '' } = event.data;
    const gap = this.os.db.gaps.find(g=>g.uuid===uuid);
    if (!gap) { stream.emit(new Event('idearium.error', { op:'gap.ignore', reason:`gap not found: ${uuid}` })); return; }
    gap.status = 'ignored'; gap.ignoreReason = reason;
    saveDB(this.os.db);
    stream.emit(new Event('idearium.gap.ignored', { gap }));
    this.os._broadcast({ uuid: randomUUID(), type: 'gap.ignored', payload: gap, ts: Date.now() });
  }
}

class SnapshotGate extends Gate {
  constructor(os) { super('idearium.snapshot.commit'); this.os = os; }
  transform(event, stream) {
    const { message = 'snapshot', branch = 'main', author = 'cli', causedBy = null } = event.data;
    const os = this.os;
    const tensionMap = {};
    for (const idea of os.db.ideas) {
      const r = os.computeTension(idea);
      idea.tension = r.score; idea.tensionUpdatedAt = Date.now();
      tensionMap[idea.uuid] = r.score;
    }
    const phaseMap = {};
    for (const p of IDEA_PHASES) phaseMap[p] = os.db.ideas.filter(i=>i.phase===p).length;
    const sha = os.db.snapshots.length.toString(16).padStart(12,'0');
    const snap = {
      uuid:        randomUUID(),
      commitId:    `vtm-${sha}`,
      parentId:    os.db.snapshots[0]?.uuid || null,
      branch, message, author,
      ts:          Date.now(),
      ideasCount:  os.db.ideas.length,
      gapCount:    os.db.gaps.filter(g=>g.status==='open').length,
      specCount:   os.db.specs.length,
      snr:         os.snr,
      snrDelta:    0,
      tensionMap,
      phaseMap,
      causedBy,
    };
    // snr delta vs last snapshot
    if (os.db.snapshots.length) snap.snrDelta = Math.round((os.snr - (os.db.snapshots[0].snr||0)) * 1000)/1000;
    os.db.snapshots.unshift(snap);
    saveDB(os.db);
    stream.emit(new Event('idearium.snapshot.committed', { snapshot: snap }));
    os._broadcast({ uuid: randomUUID(), type: 'push.complete', payload: snap, ts: Date.now() });
  }
}

class SNRSampleGate extends Gate {
  constructor(os) { super('idearium.snr.sample'); this.os = os; }
  transform(event, stream) {
    const { eventType, weight } = event.data;
    const sample = { uuid: randomUUID(), eventType, snrValue: weight, ts: Date.now() };
    this.os.db.snr.push(sample);
    if (this.os.db.snr.length > 200) this.os.db.snr = this.os.db.snr.slice(-200);
    this.os._recalcSNR();
    this.os._broadcast({ uuid: randomUUID(), type: 'snr.update', payload: { snr: this.os.snr }, ts: Date.now() });
  }
}

class ErrorGate extends Gate {
  constructor(os) { super('idearium.error'); this.os = os; }
  transform(event, stream) {
    // §1.2 — never silent
    const { op, reason } = event.data;
    console.error(`[IdeaOS][ERROR] op=${op} reason=${reason}`);
    this.os._broadcast({ uuid: randomUUID(), type: 'idearium.error', payload: { op, reason }, ts: Date.now() });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance = null;
export function getIdeaOS() {
  if (!_instance) _instance = new IdeaOS();
  return _instance;
}
