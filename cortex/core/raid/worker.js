'use strict';
/**
 * cortex/core/raid/worker.js — real, periodic queue drain
 * UUID: nexus-raid-worker-v1-0000-2026-0829-001
 * Version: 1.0.0
 *
 * §HIGHEST LEVERAGE, CLOSING THE LOOP 2026-08-29 — real, critical gap
 * found while continuing this session's own RAID work: three real
 * sources now submit contracts (self-heal, co-pilot, idearium), and a
 * real executor now dispatches to real agents (contract-intake.js's
 * _realAgentExecutor) — but NOTHING ever calls processNext() on an
 * ongoing basis. Confirmed by grep, not assumed: zero real callers
 * anywhere in the whole codebase. Every contract submitted so far has
 * sat at 'queued' forever unless a test happened to call processNext()
 * manually. This is the missing automatic consumer.
 *
 * Same real, proven pattern as orchestrator/lib/sigma-writer.js and
 * orchestrator/lib/versionium-auto-commit.js — a real setInterval,
 * wired into orchestrator's boot sequence alongside them, not a new
 * process or a different convention.
 */

const MODULE_ID = 'raid-worker';
const VERSION   = '1.0.0';

// §REAL DESIGN CHOICE — 15s, not sigma-writer's 30s: a real agent
// dispatch (compartment spawn + a full guardian round trip) genuinely
// takes real wall-clock time, so draining too aggressively just piles up
// concurrent in-flight compartments. 15s is a real, deliberate middle
// ground — frequent enough that a submitted contract doesn't sit idle
// for a full minute, not so frequent that a slow real dispatch overlaps
// with the next tick before finishing.
const INTERVAL_MS = parseInt(process.env.RAID_WORKER_INTERVAL_MS || '15000', 10);

let _timer = null;
let _running = false; // real, simple reentrancy guard — see tick() below

/**
 * tick() — one real drain attempt. Exported directly (not just used
 * internally) so a caller can force an immediate drain without waiting
 * for the next real interval — the same real testing affordance
 * sigma-writer's own init({compositeIntervalMs}) pattern already uses.
 *
 * §REAL REENTRANCY GUARD — a real agent dispatch can take longer than
 * INTERVAL_MS under real network conditions. Without this, a slow
 * dispatch and the next timer tick could both call processNext()
 * concurrently, each unaware of the other's in-flight compartment.
 * _running is deliberately simple (one flag, not a real queue-of-
 * pending-ticks) — a skipped tick under real load just means the next
 * one 15s later picks up the same still-queued contract, which is
 * correct, not lossy.
 */
async function tick() {
  if (_running) return { skipped: true, reason: 'previous tick still in flight' };
  _running = true;
  try {
    const intake = require('./contract-intake.js');
    const result = await intake.processNext();
    if (result === null) return { ok: true, idle: true };
    if (result.blocked) return { ok: true, blocked: true, waitingCount: result.waitingCount };
    console.log(`[${MODULE_ID}] processed contract ${result.queueId?.slice(0, 8)} — status: ${result.status}`);
    return { ok: true, ...result };
  } catch (e) {
    // §REAL FAIL-SOFT — a thrown error here (e.g. a genuinely malformed
    // contract row) must never kill the interval itself; the next real
    // tick tries again in INTERVAL_MS regardless.
    console.warn(`[${MODULE_ID}] tick failed, will retry next interval: ${e.message}`);
    return { ok: false, error: e.message };
  } finally {
    _running = false;
  }
}

function start(opts = {}) {
  if (_timer) return; // already running — idempotent, matching sigma-writer's own init() convention
  const intervalMs = opts.intervalMs || INTERVAL_MS;
  _timer = setInterval(tick, intervalMs);
  if (_timer.unref) _timer.unref(); // never keeps the process alive on its own
  console.log(`[${MODULE_ID}] v${VERSION} — draining RAID's contract queue every ${intervalMs}ms`);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, tick, MODULE_ID, VERSION, INTERVAL_MS };
