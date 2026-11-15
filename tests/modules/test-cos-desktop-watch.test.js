'use strict';
// 2026-11-14 DW1 — under the Windows service, Clear Glass (windowed) is left to his session; COS shows it up when its health answers
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
(async () => {
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dw1-'));
  const decls = [{ name: 'clear-glass', process: { cmd: 'electron', args: ['.'] }, cmd: 'electron', args: ['.'], cwd: tmp, phase: 3, healthUrl: 'http://127.0.0.1:7704/health' }];
  let healthy = false;
  const prev = process.env.COS_SERVICE; process.env.COS_SERVICE = '1';
  const sup = createSupervisor({ root: tmp, declarations: decls, ledgerFile: path.join(tmp, 'l.jsonl'), spawnFn: () => { throw new Error('must not spawn'); }, freeMemPct: () => 0.9, checkHealth: async () => healthy, log: () => {} });
  sup.start('clear-glass');
  assert.strictEqual(sup.get('clear-glass').state, 'desktop', 'not answering: shown as left to his session');
  healthy = true; await sup.watchDesktop();
  assert.strictEqual(sup.get('clear-glass').state, 'up', 'answering in his session: shown up');
  assert.strictEqual(sup.get('clear-glass').inYourSession, true);
  assert.match(JSON.stringify(sup.ledger({ system: 'clear-glass' })), /desktop-up/);
  healthy = false; await sup.watchDesktop();
  assert.strictEqual(sup.get('clear-glass').state, 'desktop', 'closed: back to desktop');
  if (prev === undefined) delete process.env.COS_SERVICE; else process.env.COS_SERVICE = prev;
  sup.shutdown();
  console.log('cos desktop watch: ok');
})().catch(e => { console.error(e); process.exit(1); });
