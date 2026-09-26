'use strict';
/**
 * loom/contracts/index.js — the missing backbone piece from this session's
 * pipeline discussion: "each contract contained within each compartment,
 * chunked by component, registry pieces it back together."
 * comp_id: nexus.loom.contracts
 * UUID: nexus-loom-contracts-v1-0000-2026-0702-jamesbrooks-001
 * Phase: 156
 *
 * Design, stated precisely because it's a real architectural decision,
 * not an obvious one:
 *
 *   A Contract = exactly one COS compartment, scoped to exactly one
 *   component_id. Whatever happens inside that compartment — which
 *   system is working it, what internal state it's in (Idearium's
 *   chunk states, Guardian's job states, COS's own gate states) — is
 *   NEVER represented here. This module has exactly three states of
 *   its own: open, passed, failed. Nothing else. That's deliberate:
 *   the whole point of binding one contract to one sealed compartment
 *   is that nothing outside the compartment needs to know what
 *   happened inside it, only whether it came out INTEGRATED or
 *   RECYCLED. Reconciling three different state vocabularies was the
 *   wrong problem — containment made the problem not exist.
 *
 *   "Tagged and tracked, each handoff" = recordHandoff(). Append-only,
 *   timestamped, opaque payload — LOOM doesn't interpret what a
 *   handoff means, it just refuses to lose one.
 *
 *   "Using the registry to piece it back together" = closeContract()
 *   with outcome 'pass' is the ONLY path that writes hooks into
 *   LOOM's shared component/seam/hook/wire registry (loom/schema).
 *   A failed contract writes nothing there — a component that never
 *   passed its compartment's gates has no business being wireable.
 *   Once two components' contracts have both passed, wiring them is
 *   just calling the existing wire-declare path from Phase 131 — this
 *   module doesn't reimplement that, it's what makes it possible to
 *   call honestly.
 *
 *   Retry = recycle the old contract (status: failed, if not already),
 *   open a fresh one for the SAME component_id, link via parentId.
 *   Mirrors loom/ingest/revisions.js's chain() lineage exactly, and
 *   mirrors COS's own real behavior (checked this session: RECYCLED
 *   is terminal, axioms preserved, no path back to SANDBOX — retry
 *   has to mean a new compartment, not reuse).
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { LoomDriver } = require('../schema/index');

class ContractRegistry {
  constructor({ dataDir = null } = {}) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    this.file = path.join(this.dataDir, 'contracts.json');
    this._state = this._load();
  }

  _load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (_) { return {}; }
  }

  _persist() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this._state, null, 2));
  }

  get(id) { return this._state[id] || null; }
  all() { return { ...this._state }; }

  _put(record) { this._state[record.id] = record; this._persist(); return record; }
}

class LoomContracts {
  constructor({ dataDir = null } = {}) {
    this.registry = new ContractRegistry({ dataDir });
    this.driver = new LoomDriver({ dataDir });
  }

  /**
   * openContract({component_id, compartmentId, expectedHooks, parentId})
   * component_id MUST already exist in LOOM's registry (declare it first,
   * even as a bare stub — a contract can't be opened for a component
   * nobody has named yet; §5.1 everything has an id before it has work).
   */
  openContract({ component_id, compartmentId, expectedHooks = [], parentId = null }) {
    if (!component_id) throw new Error('[loom/contracts] component_id is required');
    if (!compartmentId) throw new Error('[loom/contracts] compartmentId is required');
    if (!this.driver.registry.has('component', component_id)) {
      throw new Error(`[loom/contracts] no such component in the registry: ${component_id} — declare it before opening a contract for it`);
    }
    const id = randomUUID();
    const record = {
      id, component_id, compartmentId, expectedHooks,
      status: 'open',
      parentId,
      openedAt: Date.now(),
      closedAt: null,
      outcome: null,
      handoffs: [],
    };
    return this.registry._put(record);
  }

  /**
   * recordHandoff(contractId, {system, note, meta}) — append-only.
   * Refuses on a closed contract — a handoff after close is either a
   * bug in the caller or evidence the contract shouldn't have closed
   * yet; either way, silently accepting it would hide which.
   */
  recordHandoff(contractId, { system, note = '', meta = {} } = {}) {
    const c = this.registry.get(contractId);
    if (!c) throw new Error(`[loom/contracts] no such contract: ${contractId}`);
    if (c.status !== 'open') throw new Error(`[loom/contracts] cannot record a handoff on a ${c.status} contract`);
    if (!system) throw new Error('[loom/contracts] system is required for a handoff');
    c.handoffs.push({ system, note, meta, ts: Date.now() });
    return this.registry._put(c);
  }

  /**
   * closeContract(contractId, {outcome, producedHooks})
   * outcome: 'pass' | 'fail'
   * On 'pass': producedHooks get declared into LOOM's shared registry
   * via the real Phase-131 driver — this is the actual "registry pieces
   * it back together" step. Each hook must itself pass the same axioms
   * every other declaration does (unique id, uuid present, etc.) — a
   * contract passing does not bypass registry integrity.
   * On 'fail': nothing is written to the shared registry. Ever.
   */
  closeContract(contractId, { outcome, producedHooks = [] } = {}) {
    const c = this.registry.get(contractId);
    if (!c) throw new Error(`[loom/contracts] no such contract: ${contractId}`);
    if (c.status !== 'open') throw new Error(`[loom/contracts] contract ${contractId} is already ${c.status}`);
    if (outcome !== 'pass' && outcome !== 'fail') throw new Error(`[loom/contracts] outcome must be 'pass' or 'fail', got '${outcome}'`);

    if (outcome === 'fail') {
      c.status = 'failed';
      c.closedAt = Date.now();
      c.outcome = { registeredHooks: [] };
      this.registry._put(c);
      return { ok: false, contract: c };
    }

    // outcome === 'pass' — declare each produced hook for real, through
    // the same Gate+Axiom path everything else in LOOM goes through.
    const results = [];
    for (const hook of producedHooks) {
      const r = this.driver.declare('hook', { ...hook, component_id: c.component_id });
      results.push({ id: hook.id, ok: r.ok, detail: r.ok ? undefined : r });
    }
    const anyFailed = results.some(r => !r.ok);
    if (anyFailed) {
      // A contract that "passed" but whose hooks fail registry axioms
      // (e.g. a duplicate id) is NOT a pass — the registry is the
      // source of truth, not the compartment's own self-report.
      c.status = 'failed';
      c.closedAt = Date.now();
      c.outcome = { registeredHooks: results, reason: 'hook registration failed post-pass — see registeredHooks' };
      this.registry._put(c);
      return { ok: false, contract: c };
    }

    c.status = 'passed';
    c.closedAt = Date.now();
    c.outcome = { registeredHooks: results };
    this.registry._put(c);
    return { ok: true, contract: c };
  }

  /**
   * retryContract(contractId, {compartmentId}) -> new Contract
   * Closes the old one as failed (if it isn't already), opens a fresh
   * contract for the SAME component_id with a NEW compartment, linked
   * by parentId. This is the actual shape of "same component, new
   * compartment" per COS's real RECYCLED-is-terminal behavior.
   */
  retryContract(contractId, { compartmentId, expectedHooks = null } = {}) {
    const old = this.registry.get(contractId);
    if (!old) throw new Error(`[loom/contracts] no such contract: ${contractId}`);
    if (old.status === 'open') {
      old.status = 'failed';
      old.closedAt = Date.now();
      old.outcome = { registeredHooks: [], reason: 'superseded by retry' };
      this.registry._put(old);
    }
    return this.openContract({
      component_id: old.component_id,
      compartmentId,
      expectedHooks: expectedHooks || old.expectedHooks,
      parentId: old.id,
    });
  }

  /** chain(contractId) — full retry lineage, oldest first. Same shape as ingest's revisions.chain(). */
  chain(contractId) {
    const out = [];
    let cur = this.registry.get(contractId);
    while (cur) { out.unshift(cur); cur = cur.parentId ? this.registry.get(cur.parentId) : null; }
    return out;
  }
}

module.exports = { LoomContracts, ContractRegistry };
