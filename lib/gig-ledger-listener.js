'use strict';
/**
 * lib/gig-ledger-listener.js — agents' finished work becomes a candidate claim, with its evidence (PF0, 0.60.53)
 * comp_id: nexus.lib.gig-ledger-listener
 * James, 2026-10-15: "you can have the agents also have a listener for that? like my agent chats, logging skills, patterns,
 * everything valuable for fiverr?"
 *
 * Listens for run.finished (lib/run-state.js). A finished run is NOT a skill: the listener files only what the run's own
 * record proves — the files it changed — as a `deliverable` claim whose evidence is those files. Whether the work is any
 * good is a test's job: a claim with only `file` evidence says "this exists", and the ledger will not call it more.
 * Skills, patterns and metrics come from release/test records (PF1) or an explicit record(), never from a chat's own words.
 */
const MODULE_ID = 'nexus.lib.gig-ledger-listener';
let _on = false;

function onRunFinished(ev, { ledger = require('./gig-ledger.js'), runState = require('./run-state.js') } = {}) {
  if (!ev || !ev.runId) return null;
  const run = runState.load(ev.runId);
  if (!run || run.status !== 'done' || !(run.filesChanged || []).length) return null;
  const files = run.filesChanged.slice(0, 12);
  const claim = ledger.record({ kind: 'deliverable', claim: `Agent run finished: ${String(run.goal || '').replace(/\s+/g, ' ').slice(0, 200)} (${run.stepCount} steps, ${run.filesChanged.length} files changed)`,
    evidence: files.map(f => ({ type: 'file', ref: f })), source: { via: 'run', run: run.runId, agent: run.provider || null }, tags: [`repo:${run.repoUuid || 'none'}`] });
  ledger.verify(claim.id);
  return claim;
}

function attach(bus = require('./nexus/nexus-bus.js')) {
  if (_on) return false; _on = true;
  bus.on('run.finished', (ev) => { try { onRunFinished(ev && ev.payload ? ev.payload : ev); } catch (e) { console.warn(`[gig-ledger] ${e.message}`); } });
  return true;
}
module.exports = { MODULE_ID, attach, onRunFinished };
