'use strict';
/**
 * engines/ui/lib/ipc-request.js — request/reply correlation over the NEXUS bus.
 *
 * The previous implementation called ipc.on(type + ':reply', ...) once per
 * request and never removed the handler, so the handler table grew without
 * bound (the dashboard alone polls three endpoints every 30s). It also assumed
 * every engine names its reply `<type>:reply`, which eight engines do not.
 *
 * This version registers a fixed set of listeners once and correlates purely
 * on requestId, which the engine SDK stamps onto every reply.
 */

const pending = new Map(); // requestId -> { resolve, reject, timer }

let installed = false;

function settle(payload) {
  const id = payload && payload.requestId;
  if (!id) return false;
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  clearTimeout(entry.timer);
  entry.resolve(payload);
  return true;
}

function fail(payload) {
  const id = payload && payload.requestId;
  if (!id) return;
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  entry.reject(new Error(payload.error || 'engine error'));
}

/**
 * @param {object} ipc     the SDK ipc object
 * @param {string[]} types every reply type the panel can receive
 */
function install(ipc, types) {
  if (installed) return;
  installed = true;

  for (const t of types) ipc.on(t, settle);

  // Failure paths surfaced by the kernel and the engine SDK.
  ipc.on('route:error', fail);
  ipc.on('route:unhandled', fail);
}

function makeRequester(ipc) {
  let seq = 0;

  return function ipcRequest(engine, type, payload = {}, ms = 4000) {
    const requestId = `ui-${Date.now().toString(36)}-${(++seq).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${type} -> ${engine}: no reply within ${ms}ms`));
      }, ms);
      pending.set(requestId, { resolve, reject, timer });
      ipc.send('route', { type, ...payload, requestId }, engine);
    });
  };
}

function inflight() { return pending.size; }

module.exports = { install, makeRequester, inflight };
