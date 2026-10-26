'use strict';
// FQ1 (0.60.262): test/field-query.electron.js in real Electron under xvfb. James, 2026-10-26: "fill this in for me" →
// "Did not fill: matchGigFields: domFields must be the dom_query array". No Playwright (AXIOMS §4.1).
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const G = require('../src/autofill/gig.js');
// the pure part: a page that answers nothing is an error said, never a thrown type error
(async () => {
  const silent = { handleQuery: async () => undefined };
  assert.deepStrictEqual(await G.detectGig(silent, { title: 'I will x' }), { error: 'the page did not list its fields' });
  const bin = [path.join(root, '..', 'node_modules/electron/dist/electron'), path.join(root, 'node_modules/electron/dist/electron')].find(f => fs.existsSync(f));
  const xvfb = process.platform === 'linux' ? ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run'].find(f => fs.existsSync(f)) : null;
  if (!bin || (process.platform === 'linux' && !xvfb)) { console.log('field-query.test.js: pure part ok; Electron part SKIPPED (no Electron or xvfb)'); return; }
  const args = [bin, '--no-sandbox', path.join(__dirname, 'field-query.electron.js')];
  const r = xvfb ? spawnSync(xvfb, ['-a', ...args], { encoding: 'utf8', timeout: 90000 }) : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 90000 });
  const line = String(r.stdout || '').split('\n').find(l => l.startsWith('FQRESULT '));
  assert.ok(line, `no result: ${String(r.stderr || '').slice(-600)}`);
  const o = JSON.parse(line.slice(9));
  assert.ok(!o.error, o.error);
  assert.deepStrictEqual([o.before, o.isArray, o.count, o.after], ['undefined', true, 3, 'object'], 'no mesh at first; injected once; the fields answered');
  assert.strictEqual(o.detect, '3 fields, 3 matched');
  assert.match(o.noTab, /no tab for "nope"/);
  console.log('field-query.test.js: ok — ' + JSON.stringify(o));
})().catch(e => { console.error(e); process.exit(1); });
