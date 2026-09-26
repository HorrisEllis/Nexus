'use strict';
/**
 * lib/agent-tools/tools/rewind-replay.js — copilot's access to Clear Glass's
 * RewindEngine.
 * comp_id: nexus.lib.agent-tools.rewind-replay
 * UUID: nexus-tool-rewind-replay-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P8 of docs/copilot-full-capability-phasemap.spec).
 * clear-glass/src/rewind/engine.js — a complete RewindEngine — is real and
 * complete. Deliberately does NOT go through the gate/bus/SSE round trip
 * (registerAll's rewindSnapshotGate/rewindListGate/rewindRestoreGate/
 * rewindClearGate, signatures 'rewind.snapshot' etc.) the way browser_action
 * does — that path was just found to have a real, live-unverified bug (5 of
 * 6 event-type strings didn't match their gate signatures, session
 * 2026-08-12, commit 910450a). clear-glass/src/ipc/bridge.js's own
 * _addRewindRoutes() already exposes RewindEngine directly over synchronous
 * HTTP — GET/POST/DELETE /rewind/:agentId[...] on the IPC port (7702) — with
 * no gate-signature matching involved at all. Same discipline as
 * query-movement.js/nexus-heal.js: wrap the simplest real path, not the most
 * elaborate one, when both exist.
 *
 * §HONEST LIMIT — traced against real source (ipc/bridge.js's
 * _addRewindRoutes, confirmed called at construction, confirmed listening),
 * not run against a live Electron instance. No Electron runtime in this
 * environment. This path is structurally simpler and lower-risk than the
 * gate path that had the real bug — direct request/response, no signature
 * to typo — but "simpler" is not "verified"; confirm against the real app.
 */
const http = require('http');

const CG_IPC_PORT = process.env.CLEARGL_IPC_PORT || 7702;

function _req(method, path, body) {
  return new Promise(resolve => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: CG_IPC_PORT, path, method, timeout: 10000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ error: `clear-glass returned unparseable body (${res.statusCode})` }); } });
    });
    req.on('error', e => resolve({ error: `clear-glass unreachable on :${CG_IPC_PORT}: ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'clear-glass timed out' }); });
    if (data) req.write(data);
    req.end();
  });
}

const ACTIONS = {
  list: (a) => {
    if (!a.agentId) return { error: 'list needs agentId' };
    return _req('GET', `/rewind/${encodeURIComponent(a.agentId)}${a.limit ? `?limit=${a.limit}` : ''}`);
  },
  snapshot: (a) => {
    if (!a.agentId) return { error: 'snapshot needs agentId' };
    return _req('POST', `/rewind/${encodeURIComponent(a.agentId)}/snapshot`, { label: a.label });
  },
  restore: (a) => {
    if (!a.agentId) return { error: 'restore needs agentId' };
    if (!a.snapshotId) return { error: 'restore needs snapshotId' };
    return _req('POST', `/rewind/${encodeURIComponent(a.agentId)}/restore`, { snapshotId: a.snapshotId });
  },
  clear: (a) => {
    if (!a.agentId) return { error: 'clear needs agentId' };
    return _req('DELETE', `/rewind/${encodeURIComponent(a.agentId)}`);
  },
};

module.exports = {
  name: 'rewind_replay',
  description:
    'Snapshot and restore a Clear Glass agent session\'s state via RewindEngine. Actions: "list" (recent ' +
    'snapshots for an agentId, optional limit), "snapshot" (capture current state now, optional label), ' +
    '"restore" (needs snapshotId — replay session state back to that snapshot), "clear" (delete all ' +
    'snapshots for an agentId). Direct HTTP to Clear Glass\'s own rewind routes — real state, not a preview.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      agentId:    { type: 'string', description: 'which browser agent/session — required for every action' },
      label:      { type: 'string', description: 'optional label for "snapshot"' },
      snapshotId: { type: 'string', description: 'required for "restore"' },
      limit:      { type: 'number', description: 'for "list" — max snapshots to return (default 20)' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `rewind_replay ${args.action} failed: ${e.message}` }; }
  },
};
