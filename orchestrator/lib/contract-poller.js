'use strict';
/**
 * lib/contract-poller.js
 * comp_id: nexus.lib.contract-poller
 * uuid: nexus-contract-poller-v1-0000-2026-0627-jamesbrooks-001
 *
 * Meta-system poller. Runs in orchestrator process.
 * Scans all system input/ folders every POLL_INTERVAL_MS.
 * Finds stuck contracts, opens gaps, attempts re-dispatch.
 * §AX-2 — nothing silently lost.
 */
const { findStuck, markStuck, reportStuck, dispatch, STATUS } = require('../../lib/contract-queue');

const POLL_INTERVAL_MS = parseInt(process.env.CONTRACT_POLL_MS || '15000');
const KNOWN_SYSTEMS    = ['guardian','cortex','eravos','ollama','copilot','idearium','architect','emerge','bridge'];

let _timer  = null;
let _counts = { scanned: 0, stuck: 0, retried: 0 };

async function scan() {
  _counts.scanned++;
  const stuck = findStuck(KNOWN_SYSTEMS);
  if (!stuck.length) return;

  for (const contract of stuck) {
    _counts.stuck++;
    console.log(`[contract-poller] STUCK ${contract.uuid} — ${contract.intent} ${contract.fromSystem}→${contract.toSystem} (${Math.round(contract.stuckMs/1000)}s)`);

    // Mark stuck in disk record
    markStuck(contract.systemId, contract.uuid);

    // Report to Cortex as a gap
    await reportStuck(contract);

    // Attempt re-dispatch if retries remain
    if ((contract.retryCount || 0) < 3 && contract.status !== STATUS.STUCK) {
      try {
        dispatch({ ...contract, retryCount: (contract.retryCount || 0) + 1 });
        _counts.retried++;
        console.log(`[contract-poller] re-dispatched ${contract.uuid} (attempt ${contract.retryCount + 1})`);
      } catch(e) {
        console.error(`[contract-poller] re-dispatch failed: ${e.message}`);
      }
    }
  }
}

function start() {
  if (_timer) return;
  _timer = setInterval(scan, POLL_INTERVAL_MS);
  if (_timer.unref) _timer.unref();
  console.log(`[contract-poller] started — scanning ${KNOWN_SYSTEMS.length} systems every ${POLL_INTERVAL_MS}ms`);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function stats() {
  return { ..._counts, running: !!_timer, systems: KNOWN_SYSTEMS, pollMs: POLL_INTERVAL_MS };
}

module.exports = { start, stop, scan, stats };
