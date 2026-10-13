'use strict';
/** 0.60.23 — Clear Glass's command index listed 0 commands on his machine (micro-http has no express _router). */
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
console.log('\ntest-cg-command-index\n');
const mk = require(path.join(ROOT, 'lib/micro-http.js'));
const a = mk(); a.use(mk.json()); a.get('/x', () => {}); a.post('/y/:id', () => {}, () => {}); a.get('/x', () => {});
const r = a.routes();
check('CI-01 micro-http lists the routes it serves, once each, middleware left out', r.length === 2 && r.some(x => x.method === 'POST' && x.path === '/y/:id'), JSON.stringify(r));
const b = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
check('CI-02 Clear Glass builds its command index from them when there is no express router', /this\.app\.routes\(\)/.test(b));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
