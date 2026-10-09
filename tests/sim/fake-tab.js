'use strict';
/**
 * tests/sim/fake-tab.js — a fake provider tab (§HP19 0.55.2, docs/2026-10-09-hardening-pass-phasemap.spec).
 * James: "loop simulations of every deep and drecursive test and debug method you can for idearium and the agents."
 *
 * Speaks guardian's real NCP like a userscript: SSE GET /channel, POST /result (register, claim/ping acks, accepted,
 * delivered, chunk, complete, error), POST /heartbeat. Start guardian, copilot and Idearium from the tree, run this,
 * and drive POST :4800/api/repos/<uuid>/agent/prompt — the whole stack with no browser.
 *   GD=http://127.0.0.1:7820 PROVIDER=chatgpt MODE=<mode> node tests/sim/fake-tab.js
 * MODE: answer | silent (acks pings, never touches a job) | slow (SLOW_MS) | error (input not found) |
 *       pickreply (typed, reply element not found) | dropafterdeliver | partial. SIGUSR2 flips answer ⇄ silent.
 */
const http = require('http');
const GD = process.env.GD || 'http://127.0.0.1:7820';
const PROVIDER = process.env.PROVIDER || 'chatgpt';
const TAB = process.env.TAB || `fake-${PROVIDER}-${process.pid}`;
let MODE = process.env.MODE || 'answer';
const SLOW = +(process.env.SLOW_MS || 20000);
const log = (...a) => console.log(`[tab ${PROVIDER}/${MODE}]`, ...a);

function post(path, obj) {
  const body = JSON.stringify(obj);
  const u = new URL(GD + path);
  return new Promise(res => {
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      rs => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => res(d)); });
    r.on('error', e => res('ERR ' + e.message)); r.end(body);
  });
}
const send = o => post('/result', { provider: PROVIDER, tabId: TAB, ...o });

async function job(msg) {
  const { jobId } = msg;
  log('JOB', String(jobId).slice(0, 8), (msg.prompt || msg.content || msg.text || '').length, 'chars');
  if (MODE === 'silent') return;
  await send({ type: 'GUARDIAN_PROGRESS', jobId, stage: 'accepted', ts: Date.now() });   // as the userscripts do (§HP14)
  if (MODE === 'error') return send({ type: 'GUARDIAN_ERROR', jobId, gate: 'handleJob', error: 'handleJob: Input not found — no contenteditable' });   // the userscripts' real gate name
  await send({ type: 'GUARDIAN_DELIVERED', jobId, chatUrl: `https://chatgpt.com/c/${TAB}`, requestId: jobId });
  if (MODE === 'dropafterdeliver') return;
  if (MODE === 'pickreply') return send({ type: 'GUARDIAN_ERROR', jobId, gate: 'reply', error: 'no reply element found after 180s — findResponseEl() matched nothing' });
  if (MODE === 'slow') await new Promise(r => setTimeout(r, SLOW));
  const text = MODE === 'partial' ? 'Here is the first part of' : `FAKE ANSWER from ${PROVIDER} to job ${String(jobId).slice(0, 8)}: ok.`;
  await send({ type: 'GUARDIAN_CHUNK', jobId, text, delta: text });
  await send({ type: 'GUARDIAN_COMPLETE', jobId, text, chatUrl: `https://chatgpt.com/c/${TAB}`, requestId: jobId });
  log('COMPLETE', String(jobId).slice(0, 8));
}

function handle(msg) {
  switch (msg.type) {
    case 'GUARDIAN_CLAIM': if (msg.tabId === TAB || msg.tabId === 'any') send({ type: 'GUARDIAN_CLAIM_ACK' }); break;
    case 'GUARDIAN_PING': send({ type: 'GUARDIAN_PING_ACK', pingId: msg.pingId }); break;
    case 'GUARDIAN_JOB': job(msg); break;
    default: if (process.env.VERBOSE) log('<-', msg.type);
  }
}

function connect() {
  const u = new URL(`${GD}/channel?tabId=${TAB}&provider=${PROVIDER}`);
  const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Accept: 'text/event-stream' } }, res => {
    log('connected', res.statusCode);
    send({ type: 'GUARDIAN_REGISTER', host: 'chatgpt.com', claimed: true });
    let buf = '';
    res.on('data', c => {
      buf += c; let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = ev.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (data) { try { handle(JSON.parse(data)); } catch (e) { log('parse', e.message); } }
      }
    });
    res.on('end', () => { log('channel closed — reconnect'); setTimeout(connect, 1000); });
  });
  req.on('error', e => { log('connect error', e.message); setTimeout(connect, 2000); });
}
setInterval(() => post('/heartbeat', { type: 'GUARDIAN_HEARTBEAT', provider: PROVIDER, tabId: TAB, ts: Date.now(), claimed: true }), 5000);
process.on('SIGUSR2', () => { MODE = MODE === 'answer' ? 'silent' : 'answer'; log('mode ->', MODE); });
connect();
