'use strict';
// signal.js — core module 0: signaling
// Relays offer/answer/ICE between exactly one host and one viewer per session.
// Later additions (port fallback, tunneling) wrap this file the same way
// session-token.js does — they don't reach in and edit this logic.
//
// Gate: a host's 'join' issues a token (session_token_issuance). A
// viewer's 'join' must present that token; session-token.js verifies it
// and this file trusts that answer and nothing else — it never inspects
// token internals itself. That's the isolation boundary in practice.
//
// Exported as start()/stop() (not just a self-running script) so the
// Electron host app can run this in-process instead of spawning a child —
// same module, two ways to launch it. Direct `node signal.js` still works
// unchanged (see the require.main check at the bottom).

const { WebSocketServer } = require('../lib/nano-ws.js');   // §0.39.261 — in-house RFC 6455 server (lib/nano-ws.js), was ws
const { createSessionAuthority } = require('./session-token');

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

async function start(cfg = {}) {
  const port = cfg.port || Number(process.env.SIGNAL_PORT) || 8080;
  const authority = cfg.authority || createSessionAuthority({ dataDir: cfg.dataDir || process.env.NEXUS_DATA_DIR });
  if (!cfg.authority) await authority.init();

  const onTokenEvent = (evt) => console.log(`  [session-token] ${evt.type}`, evt.sessionId ? `(${evt.sessionId})` : '');
  authority.on('*', onTokenEvent);

  const sessions = new Map(); // sessionId -> { host, viewer }
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    let sessionId = null;
    let role = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'join') {
        sessionId = msg.sessionId;
        role = msg.role; // 'host' | 'viewer'

        if (role === 'host') {
          const record = authority.issueToken(sessionId);
          const session = sessions.get(sessionId) || {};
          session.host = ws;
          sessions.set(sessionId, session);
          return send(ws, { type: 'token:issued', token: record.token, expiresAt: record.expiresAt });
        }

        if (role === 'viewer') {
          if (!authority.verifyToken(msg.token, sessionId)) {
            return send(ws, { type: 'join:rejected', reason: 'invalid_or_expired_token' });
          }
          const session = sessions.get(sessionId) || {};
          session.viewer = ws;
          sessions.set(sessionId, session);
          send(ws, { type: 'join:accepted' });
          // Tell the host a viewer is actually here now — host.html waits
          // for this before capturing/offering. Without it, a host that
          // offers immediately on its own join races an empty session and
          // the offer is silently dropped (no viewer to relay it to yet).
          if (session.host) send(session.host, { type: 'viewer:joined' });
          return;
        }
        return;
      }

      // relay everything else (offer/answer/ice) to the other peer
      const session = sessions.get(sessionId);
      if (!session) return;
      const other = role === 'host' ? session.viewer : session.host;
      if (other && other.readyState === other.OPEN) {
        other.send(raw.toString());
      }
    });

    ws.on('close', () => {
      if (!sessionId) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      if (session[role] === ws) delete session[role];
      if (!session.host && !session.viewer) sessions.delete(sessionId);
    });
  });

  await new Promise((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });

  console.log(`signaling server on ws://0.0.0.0:${port} (session tokens required for viewers)`);

  return {
    port,
    authority,
    sessions,
    stop: () => new Promise((resolve) => {
      authority.off?.('*', onTokenEvent);
      wss.close(() => resolve());
    }),
  };
}

module.exports = { start };

if (require.main === module) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
