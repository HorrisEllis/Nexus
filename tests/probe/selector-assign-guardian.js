'use strict';
/**
 * tests/probe/selector-assign-guardian.js — v0.39.251
 * Helper for tests/probe/selector-assign-ui-chromium.py. Runs guardian's REAL
 * selector map (guardian/lib/selector-map.js + agent-registry.js, temp dir —
 * never data/) behind the same route guardian/server.js serves, and answers
 * line-delimited JSON on stdin with Clear Glass's REAL assign module
 * (clear-glass/src/providers/selector-assign.js):
 *   {op:'providerFor', arg:url} | {op:'assign', arg:payload} | {op:'map', arg:provider}
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), readline = require('readline');
const ROOT = path.resolve(__dirname, '..', '..');
const SA = require(path.join(ROOT, 'clear-glass/src/providers/selector-assign.js'));
const selectorMap = require(path.join(ROOT, 'guardian/lib/selector-map.js'));
const { createAgentRegistry } = require(path.join(ROOT, 'guardian/lib/agent-registry.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-selassign-ui-'));
const registry = createAgentRegistry({ dir });
const ncp = { push: () => 2, pushTab: () => true };
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/api\/agents\/([a-z0-9-]+)\/selectors$/);
  if (!m || req.method !== 'POST') { res.writeHead(404); res.end('{}'); return; }
  let buf = ''; req.on('data', c => buf += c); req.on('end', () => {
    const body = JSON.parse(buf);
    const r = selectorMap.assign(registry, ncp, m[1], body.selectors, { source: body.source, evidence: body.evidence });
    res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r));
  });
});
const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} process.exit(0); };
process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup); process.stdin.on('end', cleanup);

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  readline.createInterface({ input: process.stdin }).on('line', async (line) => {
    const { op, arg } = JSON.parse(line);
    let out;
    if (op === 'providerFor') out = SA.providerForUrl(arg);
    else if (op === 'assign') out = await SA.assign(arg, { port });
    else if (op === 'map') out = selectorMap.mapFor(registry, arg);
    process.stdout.write(JSON.stringify(out) + '\n');
  });
});
