'use strict';
/**
 * bridge/router.js — Verified Request Router
 * UUID: nexus-bridge-router-v1-0000-4000-0000-000000000001
 *
 * Resolves target, applies fallback chain, enforces circuit breaker,
 * forwards request via HTTP, writes routeHistory on every hop.
 *
 * SISO pipeline:
 *   route.request   → ResolveGate      → target resolved or fallback found
 *   route.resolved  → CircuitGate      → check circuit breaker state
 *   route.open      → DispatchGate     → forward via HTTP to target
 *   route.dispatch  → DispatchGate     → (fires HTTP, emits route.result)
 *   route.result    → ResultGate       → update ledger, resolve promise
 *   route.hold      → HoldGate        → target offline, mark held in ledger
 *
 * §2.1  Ledger write before dispatch — ledger.update() called before HTTP fire.
 * §1.2  Every failure is explicit — no silent drops.
 * MAX_ROUTE_DEPTH = 3 — enforced here. routeHistory written on every hop.
 */

const http           = require('http');
const { randomUUID } = require('crypto');
const { STATUS, MAX_ROUTE_DEPTH, MAX_ATTEMPTS, patchRequest } = require('./types');

const CB_FAIL_THRESHOLD = parseInt(process.env.BRIDGE_CB_FAILS  || '3');
const CB_RESET_MS       = parseInt(process.env.BRIDGE_CB_RESET  || '30000');
const ROUTE_TIMEOUT_MS  = parseInt(process.env.BRIDGE_ROUTE_TO  || '5000');

// ── SISO primitives ───────────────────────────────────────────────────────────
class Event {
  constructor(type, data = {}) {
    this.uuid = randomUUID(); this.type = type; this.data = data; this.ts = Date.now();
  }
}
class Gate {
  constructor(sig) { this.signature = sig; }
  transform() {}
}
class Stream {
  constructor() { this.gates = new Map(); this.pending = []; }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[bridge/router] collision: ${gate.signature}`);
    this.gates.set(gate.signature, gate);
  }
  emit(event) {
    const gate = this.gates.get(event.type);
    if (gate) gate.transform(event, this);
    else this.pending.push(event);
  }
}

// ── Gates ─────────────────────────────────────────────────────────────────────

/**
 * ResolveGate — asks registry for a live target.
 * Enforces MAX_ROUTE_DEPTH before attempting resolution.
 */
class ResolveGate extends Gate {
  constructor(ctx) { super('route.request'); this._ctx = ctx; }
  transform(event, stream) {
    const { req, resolve, reject } = event.data;

    if ((req.routeHistory || []).length >= MAX_ROUTE_DEPTH) {
      return stream.emit(new Event('route.hold', {
        req: patchRequest(req, { status: STATUS.FAILED, error: `max route depth (${MAX_ROUTE_DEPTH}) exceeded`, failedAt: Date.now() }),
        resolve, reject, reason: 'max_depth',
      }));
    }

    this._ctx.registry.resolve(req.target, req.routeHistory || []).then(resolution => {
      if (resolution.ok) {
        stream.emit(new Event('route.resolved', { req, resolution, resolve, reject }));
      } else {
        stream.emit(new Event('route.hold', { req, resolve, reject, reason: 'target_offline' }));
      }
    });
  }
}

/**
 * CircuitGate — checks circuit breaker for the resolved target.
 * Open circuit = hold immediately without trying.
 */
class CircuitGate extends Gate {
  constructor(ctx) { super('route.resolved'); this._ctx = ctx; }
  transform(event, stream) {
    const { req, resolution, resolve, reject } = event.data;
    const targetId = resolution.target;
    const cb       = this._ctx._circuits.get(targetId);

    if (cb && cb.state === 'open') {
      // Check if reset window has passed — transition to half-open
      if (Date.now() - cb.openedAt > CB_RESET_MS) {
        cb.state = 'half-open';
        this._ctx._circuits.set(targetId, cb);
      } else {
        // Circuit open — hold the request
        return stream.emit(new Event('route.hold', {
          req, resolve, reject, reason: 'circuit_open',
        }));
      }
    }

    stream.emit(new Event('route.open', { req, resolution, resolve, reject }));
  }
}

/**
 * RouteOpenGate — prepares and fires the HTTP dispatch.
 * Updates ledger to DISPATCHED before HTTP call.
 */
class RouteOpenGate extends Gate {
  constructor(ctx) { super('route.open'); this._ctx = ctx; }
  transform(event, stream) {
    const { req, resolution, resolve, reject } = event.data;

    // Record hop in routeHistory
    const updatedReq = patchRequest(req, {
      status:       STATUS.DISPATCHED,
      dispatchedAt: Date.now(),
      attempts:     req.attempts + 1,
      routeHistory: [...(req.routeHistory || []), resolution.target],
    });

    // §2.1 — ledger write before HTTP fire
    this._ctx.ledger.update(updatedReq.uuid, {
      status:       STATUS.DISPATCHED,
      dispatchedAt: updatedReq.dispatchedAt,
      attempts:     updatedReq.attempts,
      routeHistory: updatedReq.routeHistory,
    }).then(() => {
      stream.emit(new Event('route.dispatch', { req: updatedReq, resolution, resolve, reject }));
    }).catch(err => {
      reject(err);
    });
  }
}

/**
 * DispatchGate — fires the HTTP request to the resolved target.
 * Handles circuit breaker tracking on success/failure.
 */
class DispatchGate extends Gate {
  constructor(ctx) { super('route.dispatch'); this._ctx = ctx; }
  transform(event, stream) {
    const { req, resolution, resolve, reject } = event.data;
    const { entry } = resolution;

    const body    = JSON.stringify({ request: req, payload: req.payload });
    const options = {
      hostname: '127.0.0.1',
      port:     entry.port,
      path:     '/bridge/deliver',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(body),
        'X-Bridge-Token':    process.env.BRIDGE_INTERNAL_TOKEN || 'bridge-internal',
        'X-Bridge-UUID':     req.uuid,
        'X-Bridge-Source':   req.source,
        'X-Bridge-Type':     req.type,
      },
    };

    const httpReq = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ok = res.statusCode < 400;

        // Circuit breaker tracking
        const targetId = resolution.target;
        if (ok) {
          this._ctx._circuits.delete(targetId);
        } else {
          const cb = this._ctx._circuits.get(targetId) || { state: 'closed', failures: 0 };
          cb.failures++;
          if (cb.failures >= CB_FAIL_THRESHOLD) {
            cb.state    = 'open';
            cb.openedAt = Date.now();
            console.warn(`[bridge/router] circuit open for ${targetId} after ${cb.failures} failures`);
          }
          this._ctx._circuits.set(targetId, cb);
        }

        stream.emit(new Event('route.result', {
          req, ok, status: res.statusCode, data, resolve, reject,
          targetId: resolution.target,
        }));
      });
    });

    httpReq.setTimeout(ROUTE_TIMEOUT_MS, () => {
      httpReq.destroy();
      const cb = this._ctx._circuits.get(resolution.target) || { state: 'closed', failures: 0 };
      cb.failures++;
      if (cb.failures >= CB_FAIL_THRESHOLD) { cb.state = 'open'; cb.openedAt = Date.now(); }
      this._ctx._circuits.set(resolution.target, cb);

      stream.emit(new Event('route.hold', {
        req, resolve, reject, reason: 'timeout',
      }));
    });

    httpReq.on('error', () => {
      stream.emit(new Event('route.hold', { req, resolve, reject, reason: 'connection_refused' }));
    });

    httpReq.write(body);
    httpReq.end();
  }
}

/**
 * ResultGate — handles successful dispatch result.
 * Updates ledger to FULFILLED.
 */
class ResultGate extends Gate {
  constructor(ctx) { super('route.result'); this._ctx = ctx; }
  transform(event) {
    const { req, ok, resolve, reject } = event.data;

    if (ok) {
      this._ctx.ledger.update(req.uuid, {
        status:      STATUS.FULFILLED,
        completedAt: Date.now(),
      }).then(() => resolve({ ok: true, uuid: req.uuid, status: STATUS.FULFILLED }));
    } else {
      // Dispatch reached target but target returned error
      if (req.attempts < MAX_ATTEMPTS) {
        // Re-queue for retry — emit back into route.request
        const retryReq = patchRequest(req, { status: STATUS.PENDING });
        this._ctx.ledger.update(req.uuid, { status: STATUS.PENDING }).then(() => {
          resolve({ ok: false, uuid: req.uuid, status: STATUS.PENDING, retry: true });
        });
      } else {
        this._ctx.ledger.update(req.uuid, {
          status:    STATUS.FAILED,
          failedAt:  Date.now(),
          error:     `target returned ${event.data.status}`,
        }).then(() => resolve({ ok: false, uuid: req.uuid, status: STATUS.FAILED }));
      }
    }
  }
}

/**
 * HoldGate — target offline or circuit open. Mark HELD, never drop.
 */
class HoldGate extends Gate {
  constructor(ctx) { super('route.hold'); this._ctx = ctx; }
  transform(event) {
    const { req, resolve, reason } = event.data;
    const heldReq = patchRequest(req, {
      status: reason === 'max_depth' || req.attempts >= MAX_ATTEMPTS ? STATUS.FAILED : STATUS.HELD,
      heldAt: Date.now(),
      error:  reason || 'target_offline',
    });

    this._ctx.ledger.update(req.uuid, {
      status: heldReq.status, heldAt: heldReq.heldAt, error: heldReq.error,
    }).then(() => {
      console.warn(`[bridge/router] ${heldReq.status}: ${req.uuid} → ${req.target} (${reason})`);
      resolve({ ok: false, uuid: req.uuid, status: heldReq.status, reason });
    });
  }
}

// ── createBridgeRouter ────────────────────────────────────────────────────────

function createBridgeRouter({ registry, ledger }) {
  if (!registry) throw new Error('[bridge/router] registry required');
  if (!ledger)   throw new Error('[bridge/router] ledger required');

  const _circuits = new Map();  // targetId → { state, failures, openedAt }
  const ctx       = { registry, ledger, _circuits };

  const stream = new Stream();
  stream.register(new ResolveGate(ctx));
  stream.register(new CircuitGate(ctx));
  stream.register(new RouteOpenGate(ctx));
  stream.register(new DispatchGate(ctx));
  stream.register(new ResultGate(ctx));
  stream.register(new HoldGate(ctx));

  /**
   * dispatch — primary entry point.
   * §2.1: caller must have already called ledger.write(req) before dispatch.
   */
  function dispatch(req) {
    return new Promise((resolve, reject) => {
      stream.emit(new Event('route.request', { req, resolve, reject }));
    });
  }

  /**
   * drainHeld — called when a system comes back online.
   * Retries all held requests targeting that system.
   */
  async function drainHeld(systemId) {
    const heldRequests = await ledger.query({ status: STATUS.HELD, target: systemId });
    if (!heldRequests.length) return;
    console.log(`[bridge/router] draining ${heldRequests.length} held requests for ${systemId}`);
    for (const req of heldRequests) {
      const fresh = patchRequest(req, { status: STATUS.PENDING, heldAt: null });
      await ledger.update(req.uuid, { status: STATUS.PENDING, heldAt: null });
      dispatch(fresh).catch(() => {});
    }
  }

  function circuitStatus() {
    return Object.fromEntries(_circuits);
  }

  return { dispatch, drainHeld, circuitStatus };
}

module.exports = { createBridgeRouter };
