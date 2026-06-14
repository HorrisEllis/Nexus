'use strict';
/**
 * cortex/harness/index.js — Cortex Self-Adversarial Harness
 * UUID: cortex-harness-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 * component_id: cortex-harness
 *
 * WHAT THIS IS (the pattern, per James's spec):
 *   Not a static test suite. A LIVING one. The harness knows Cortex intimately,
 *   beats it down across every zoom level, and when it finds a failure mode that
 *   failure becomes PERMANENT MEMORY:
 *     1. written to JAA `fault_taxonomy` (truth — §7.6 the table is the source)
 *     2. surfaced to the diagnostic tool's registry (observability — §2.3)
 *     3. re-run on every future pass (regression — §1.1 stays proven)
 *
 *   The loop:  attack → break → record → (fix) → re-test → verify → absorb
 *
 * ZOOM LEVELS (§5.6 fractal — same pattern at every scale):
 *   L1 UNIT        — single jaaDB method, single gate, in isolation
 *   L2 INTEGRATION — module + jaaDB together (insert→query round-trips)
 *   L3 ADVERSARIAL — hostile input: malformed, oversized, injection, race
 *   L4 CROSS-DOMAIN— one subsystem's output is another's input (§4.2 verification)
 *   L5 PERF        — throughput / latency under load, decay storm, memory pressure
 *
 * LAWS HELD:
 *   §1.1 proof not claim — every PASS is a real assertion against real data
 *   §1.2 nothing silent — every FAIL is named: probe, expected, actual, zoom
 *   §2.3 observable — results to fault_taxonomy + event_log + diagnostic registry
 *   §7.4 dead branches are data — a fixed failure stays as a regression probe
 *   §8.2 hostile review executable — L3 is adversarial review as code
 *
 * §M1: init(cfg) + stop().  Run on demand: runAll() / runZoom(level).
 */

const { randomUUID } = require('crypto');

const COMPONENT_ID = 'cortex-harness';
const VERSION      = '1.0.0';
const TAXONOMY_TABLE = 'fault_taxonomy'; // already registered, long-tier

// ── result shapes ─────────────────────────────────────────────────────────────

function makeProbe(id, zoom, name, fn) {
  return { id, zoom, name, fn };
}

// ── the harness ───────────────────────────────────────────────────────────────

class CortexHarness {
  constructor({ jaaDB, adminBase = 'http://127.0.0.1:3748' } = {}) {
    if (!jaaDB) throw new Error('[harness] jaaDB required — harness must run against real storage (§1.1)');
    this.jaaDB     = jaaDB;
    this.adminBase = adminBase;
    this._probes   = [];
    this._diag     = null;     // diagnostic registry sink, wired via registerDiagnostic()
    this._build();
  }

  // diagnostic tool wires itself in so absorbed failures appear in diagnose output
  registerDiagnostic(sink) {
    if (typeof sink?.recordFaultMode === 'function') this._diag = sink;
  }

  // ── absorb: a found failure becomes permanent memory ────────────────────────
  // JAA is the truth (§7.6). The .test projection and diagnostic entry derive from it.
  _absorb(probe, expected, actual, error) {
    const fault = {
      uuid:       randomUUID(),
      system:     'cortex',
      probeId:    probe.id,
      zoom:       probe.zoom,
      name:       probe.name,
      expected:   String(expected).slice(0, 300),
      actual:     String(actual).slice(0, 300),
      error:      error ? String(error.message || error).slice(0, 300) : null,
      firstSeen:  Date.now(),
      lastSeen:   Date.now(),
      occurrences:1,
      status:     'open',          // open → fixed (stays as regression probe)
      ts:         Date.now(),
    };
    // dedupe by probeId — same failure seen again bumps occurrences, not a new row
    let existing = null;
    try { existing = this.jaaDB.query(TAXONOMY_TABLE, r => r.probeId === probe.id && r.status === 'open', 1)[0]; } catch (_) {}
    if (existing) {
      this.jaaDB.update(TAXONOMY_TABLE, existing.uuid, {
        lastSeen: Date.now(), occurrences: (existing.occurrences || 1) + 1, actual: fault.actual,
      });
    } else {
      this.jaaDB.insert(TAXONOMY_TABLE, fault);
      // §2.3 — surface to diagnostics so `diagnose cortex` shows known failure modes
      if (this._diag) { try { this._diag.recordFaultMode(fault); } catch (_) {} }
    }
    // §1.2 — also to event_log, loud and specific
    try {
      this.jaaDB.insert('event_log', {
        uuid: randomUUID(), type: 'harness.fault.found', ts: Date.now(),
        payload: { probe: probe.id, zoom: probe.zoom, expected: fault.expected, actual: fault.actual },
        source: COMPONENT_ID, causedBy: null,
      });
    } catch (_) {}
    return fault;
  }

  // ── the attack batteries ────────────────────────────────────────────────────
  _build() {
    const J = () => this.jaaDB;

    // L1 UNIT — single jaaDB methods, isolated
    this._probes.push(makeProbe('L1-insert-roundtrip', 'L1', 'insert then query returns the row', () => {
      const u = randomUUID();
      J().insert('event_log', { uuid: u, type: 'harness.probe', ts: Date.now(), source: COMPONENT_ID });
      const found = J().query('event_log', r => r.uuid === u, 1);
      return { pass: found.length === 1 && found[0].uuid === u, expected: 'row found by uuid', actual: `found ${found.length}` };
    }));

    this._probes.push(makeProbe('L1-update-missing-id', 'L1', 'update on missing id returns null (not throw)', () => {
      const r = J().update('event_log', 'no-such-uuid-' + randomUUID(), { x: 1 });
      // §1.2 candidate: silent null on missing id. We assert the DOCUMENTED behavior
      // (returns null) but flag that it is silent — a real finding, not a crash.
      return { pass: r === null, expected: 'null (documented)', actual: String(r),
               note: 'returns null silently — §1.2: caller cannot distinguish "no row" from "no change"' };
    }));

    this._probes.push(makeProbe('L1-get-evicted-excluded', 'L1', 'get() excludes _evicted rows', () => {
      const u = randomUUID();
      J().insert('event_log', { uuid: u, type: 'harness.evict', _evicted: true, ts: Date.now(), source: COMPONENT_ID });
      const g = J().get('event_log', u);
      return { pass: g === null, expected: 'null (evicted hidden)', actual: String(g) };
    }));

    // L2 INTEGRATION — round-trips, mutation replay
    this._probes.push(makeProbe('L2-update-mutation-replay', 'L2', 'update writes _mutation patch, query reflects it', () => {
      const u = randomUUID();
      J().insert('gaps', { uuid: u, type: 'harness', status: 'open', severity: 'low', ts: Date.now() });
      J().update('gaps', u, { status: 'resolved' });
      const row = J().query('gaps', r => r.uuid === u, 1)[0];
      return { pass: row && row.status === 'resolved', expected: 'status=resolved after update', actual: row ? row.status : 'no row' };
    }));

    this._probes.push(makeProbe('L2-query-limit-honored', 'L2', 'query respects limit', () => {
      const t = 'harness:limit:' + randomUUID().slice(0, 6);
      for (let i = 0; i < 10; i++) J().insert('event_log', { uuid: randomUUID(), type: t, ts: Date.now(), source: COMPONENT_ID });
      const got = J().query('event_log', r => r.type === t, 5);
      return { pass: got.length === 5, expected: 'exactly 5 (limit)', actual: String(got.length) };
    }));

    // L3 ADVERSARIAL — hostile input
    this._probes.push(makeProbe('L3-undeclared-table', 'L3', 'insert to undeclared table auto-provisions (not crash)', () => {
      const t = 'harness_attack_' + randomUUID().slice(0, 8);
      let threw = false, row = null;
      try { row = J().insert(t, { uuid: randomUUID(), ts: Date.now() }); } catch (e) { threw = true; }
      // documented behavior: provisions with a warning. A throw would be the failure.
      return { pass: !threw && row, expected: 'auto-provision, no throw', actual: threw ? 'threw' : 'provisioned' };
    }));

    this._probes.push(makeProbe('L3-malformed-record', 'L3', 'insert tolerates a record with no uuid', () => {
      // §1.1/§1.3 finding probe: insert does NO schema validation. A row with no
      // uuid is accepted, then get()/update() by uuid can never find it. We assert
      // the failure surface so it is recorded, not hidden.
      let threw = false; let row = null;
      try { row = J().insert('event_log', { type: 'harness.nouuid', ts: Date.now(), source: COMPONENT_ID }); } catch (e) { threw = true; }
      const orphan = row && row.uuid === undefined;
      return { pass: !orphan, expected: 'insert rejects/derives missing uuid', actual: orphan ? 'accepted uuid-less orphan row' : 'ok',
               note: 'jaaDB.insert performs no schema validation — uuid-less rows are unreachable by get/update' };
    }));

    this._probes.push(makeProbe('L3-oversized-payload', 'L3', 'insert survives a large payload', () => {
      const big = 'x'.repeat(200000);
      let threw = false;
      try { J().insert('event_log', { uuid: randomUUID(), type: 'harness.big', payload: big, ts: Date.now(), source: COMPONENT_ID }); }
      catch (e) { threw = true; }
      return { pass: !threw, expected: 'no throw on 200KB payload', actual: threw ? 'threw' : 'ok' };
    }));

    this._probes.push(makeProbe('L3-predicate-throws', 'L3', 'query with a throwing predicate fails loud not silent', () => {
      let threw = false;
      try { J().query('event_log', () => { throw new Error('hostile predicate'); }, 5); } catch (e) { threw = true; }
      // A throwing predicate SHOULD surface (§1.2). If it is swallowed, that's the finding.
      return { pass: threw, expected: 'predicate error propagates (§1.2)', actual: threw ? 'propagated' : 'swallowed silently',
               note: 'if false: query swallows predicate exceptions — silent failure' };
    }));

    // L4 CROSS-DOMAIN — one organ's output is another's input
    this._probes.push(makeProbe('L4-raid-decide-shape', 'L4', 'RAID /api/raid/decide returns {agent,reason,cluster}', async () => {
      const res = await this._http('/api/raid/decide?intent=harness+probe');
      const ok = res && res.ok && res.agent && res.cluster;
      return { pass: !!ok, expected: 'ok+agent+cluster', actual: JSON.stringify(res).slice(0, 120) };
    }));

    this._probes.push(makeProbe('L4-organ-emits-to-log', 'L4', 'heartbeat/raid organs emit into LIVE event_log', async () => {
      // §root-cause: must read the RUNNING system over HTTP, not a local jaaDB
      // instance (which would be empty and produce a false failure). The harness
      // querying its own fresh store was itself a fault mode — fixed here.
      const events = await this._httpEvents(200);
      const types = new Set(events.map(e => e.type));
      const alive = types.has('raid.health') || types.has('heartbeat.tick');
      return { pass: alive, expected: 'organ events present in live log', actual: alive ? 'present' : 'absent',
               note: alive ? null : 'cognition organs not writing to live JAA' };
    }));

    this._probes.push(makeProbe('L4-alk-hydrate-persists', 'L4', 'ALK hydrate event in LIVE log', async () => {
      const events = await this._httpEvents(200);
      const h = events.filter(e => e.type === 'alk.hydrated');
      return { pass: h.length >= 1, expected: 'alk.hydrated in live log', actual: `${h.length} found`,
               note: h.length ? null : '§7.6: decision graph not reconstructed from ledger' };
    }));

    // L5 PERF — throughput / pressure
    this._probes.push(makeProbe('L5-insert-throughput', 'L5', '1000 inserts under 1s', () => {
      const t0 = Date.now();
      const t = 'harness:perf:' + randomUUID().slice(0, 6);
      for (let i = 0; i < 1000; i++) J().insert('event_log', { uuid: randomUUID(), type: t, i, ts: Date.now(), source: COMPONENT_ID });
      const ms = Date.now() - t0;
      return { pass: ms < 1000, expected: '<1000ms for 1000 inserts', actual: `${ms}ms`,
               note: ms >= 1000 ? 'insert path slow — synchronous _persist may be the bottleneck (§2.1 cost)' : null };
    }));

    this._probes.push(makeProbe('L5-query-scan-cost', 'L5', 'full-table query on 1000+ rows under 50ms', () => {
      const t0 = Date.now();
      J().query('event_log', () => true, 500);
      const ms = Date.now() - t0;
      return { pass: ms < 50, expected: '<50ms', actual: `${ms}ms` };
    }));
  }

  // ── tiny HTTP for L4 cross-domain probes ────────────────────────────────────
  async _httpEvents(limit = 200) {
    const res = await this._http(`/api/events?limit=${limit}`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.rows)) return res.rows;
    if (res && Array.isArray(res.events)) return res.events;
    if (res && Array.isArray(res.entries)) return res.entries;
    return [];
  }

  _http(pathQ) {
    return new Promise((resolve) => {
      try {
        const http = require('http');
        const u = new URL(pathQ, this.adminBase);
        const req = http.get(u, { timeout: 2000 }, res => {
          let raw = ''; res.on('data', d => raw += d);
          res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (_) { resolve(null); } });
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
      } catch (_) { resolve(null); }
    });
  }

  // ── run ─────────────────────────────────────────────────────────────────────
  async runAll() { return this._run(this._probes); }
  async runZoom(level) { return this._run(this._probes.filter(p => p.zoom === level)); }

  async _run(probes) {
    const started = Date.now();
    const results = { pass: 0, fail: 0, faults: [], byZoom: {}, probes: [] };

    for (const probe of probes) {
      results.byZoom[probe.zoom] = results.byZoom[probe.zoom] || { pass: 0, fail: 0 };
      let outcome;
      try {
        outcome = await probe.fn();
      } catch (e) {
        // probe itself threw — that IS a failure mode, record it
        outcome = { pass: false, expected: 'probe completes', actual: 'threw: ' + e.message, error: e };
      }
      const rec = { id: probe.id, zoom: probe.zoom, name: probe.name, pass: !!outcome.pass, note: outcome.note || null };
      results.probes.push(rec);

      if (outcome.pass) {
        results.pass++; results.byZoom[probe.zoom].pass++;
      } else {
        results.fail++; results.byZoom[probe.zoom].fail++;
        const fault = this._absorb(probe, outcome.expected, outcome.actual, outcome.error);
        results.faults.push({ probe: probe.id, zoom: probe.zoom, expected: fault.expected, actual: fault.actual, note: outcome.note });
      }
    }

    results.ms = Date.now() - started;
    results.total = probes.length;
    // §2.3 — the run itself is observable
    try {
      this.jaaDB.insert('event_log', {
        uuid: randomUUID(), type: 'harness.run.complete', ts: Date.now(),
        payload: { system: 'cortex', pass: results.pass, fail: results.fail, total: results.total, ms: results.ms },
        source: COMPONENT_ID, causedBy: null,
      });
    } catch (_) {}
    return results;
  }

  // ── known failure modes (for diagnostic tool) ───────────────────────────────
  knownFaults() {
    try { return this.jaaDB.query(TAXONOMY_TABLE, r => r.system === 'cortex', 200); }
    catch (_) { return []; }
  }

  init(cfg = {}) { Object.assign(this, cfg); }
  stop() {}
}

module.exports = { CortexHarness, COMPONENT_ID, VERSION, TAXONOMY_TABLE };
