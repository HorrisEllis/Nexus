'use strict';
/**
 * tests/modules/test-ncp-half-open.test.js — 0.60.46: a tab whose NCP stream died half-open reconnects within one beat.
 * guardian/lib/ncp.js handleHeartbeat · guardian/userscript-{chatgpt,claude,deepseek,gemini,perplexity}.js _hbPost ·
 * clear-glass/src/providers/attention.js checkPick.
 * From James's run (2026-10-15, his log): "NCP disconnected: provider=chatgpt" at 13:00:31, the tab kept working and
 * heartbeating, and never reconnected — "cancelled — no chatgpt tab connected for 120 s".
 *
 *   NH-01  the heartbeat ACK says whether Guardian still holds the tab's channel (registered true / false)
 *   NH-02  every provider userscript: a heartbeat answered registered:false reconnects at once; registered:true, or a
 *          reconnect already under way, does not
 *   NH-03  a "send" pick that is not something you press (the input's placeholder <p>) is refused; a button is not
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e.message}`); failed++; }
}
const fakeRes = () => { const r = { headersSent: false, body: null, writeHead() { this.headersSent = true; }, write() {}, end(b) { this.body = b; this.ended = true; }, setHeader() {}, flushHeaders() {} }; return r; };

(async () => {
  console.log('\ntest-ncp-half-open — a half-open tab reconnects within one beat (0.60.46)');

  await test('NH-01', 'the heartbeat ACK says whether the channel is still registered', async () => {
    const { createNCPServer } = require(path.join(ROOT, 'guardian/lib/ncp.js'));
    const ncp = createNCPServer({});
    const req = new EventEmitter(); req.headers = {};
    ncp.handleChannel(req, fakeRes(), new URL('http://x/channel?provider=chatgpt&tabId=t1'));
    const beat = async (tabId) => { const res = fakeRes(); ncp.handleHeartbeat({}, res, async () => ({ provider: 'chatgpt', tabId, ts: Date.now() })); await new Promise(r => setTimeout(r, 10)); return JSON.parse(res.body); };
    assert.strictEqual((await beat('t1')).registered, true);
    req.emit('close');   // the stream went away — the tab does not know
    const ack = await beat('t1');
    assert.strictEqual(ack.type, 'NCP_HEARTBEAT_ACK'); assert.strictEqual(ack.registered, false, 'it says so');
  });

  await test('NH-02', 'every provider userscript reconnects on registered:false, and only then', async () => {
    for (const p of ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']) {
      const src = fs.readFileSync(path.join(ROOT, `guardian/userscript-${p}.js`), 'utf8');
      assert.ok(/_hb = setInterval\(\(\) => _hbPost\(\{ type:'GUARDIAN_HEARTBEAT'/.test(src), `${p}: the heartbeat goes through _hbPost`);
      const fn = src.match(/function _hbPost\(data\) \{[\s\S]*?\n\}\n/)[0];
      for (const [answer, state, want] of [[{ registered: false }, 'connected', 1], [{ registered: true }, 'connected', 0], [{ registered: false }, 'connecting', 0], [null, 'connected', 0], [{ ok: true }, 'connected', 0]]) {
        const ctx = { calls: 0, connState: state, NCP_HB: '/heartbeat', _log() {}, ncpPost: async () => answer };
        ctx.connect = () => { ctx.calls++; };
        vm.runInNewContext(`${fn}; this.run = () => _hbPost({});`, ctx);
        await ctx.run();
        assert.strictEqual(ctx.calls, want, `${p}: ${JSON.stringify(answer)} while ${state} → ${want} reconnect(s)`);
      }
      const hv = (src.match(/\/\/ @version\s+([\d.]+)/) || [])[1], cv = (src.match(/const VERSION\s*=\s*'([\d.]+)'/) || [])[1];
      assert.strictEqual(hv, cv, `${p}: header and VERSION agree`);
    }
  });

  await test('NH-03', 'a send pick that is not a button is refused; a button is kept', async () => {
    const CA = require(path.join(ROOT, 'clear-glass/src/providers/attention.js'));
    assert.ok(typeof CA.checkPick === 'function', 'checkPick is exported');
    const no = await CA.checkPick(null, { tag: 'p', selector: 'p.placeholder', matched: 1, anchor: { role: null } }, 'send', null);
    assert.ok(!no.selector && /not a button/.test(no.why), JSON.stringify(no));
    const yes = await CA.checkPick(null, { tag: 'button', selector: '[data-testid="send-button"]', matched: 1, anchor: {} }, 'send', null);
    assert.strictEqual(yes.selector, '[data-testid="send-button"]');
    const role = await CA.checkPick(null, { tag: 'div', selector: 'div.send', matched: 1, anchor: { role: 'button' } }, 'send', null);
    assert.strictEqual(role.selector, 'div.send', 'a role=button counts');
    const input = await CA.checkPick(null, { tag: 'p', selector: 'p.x', matched: 1, anchor: {} }, 'input', null);
    assert.strictEqual(input.selector, 'p.x', 'only the send pick is held to this');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
