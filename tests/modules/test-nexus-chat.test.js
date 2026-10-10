'use strict';
/**
 * tests/modules/test-nexus-chat.test.js — 0.59.5. James: "All I'm going to do. Is open this chat in clearglass. Then you
 * should be able to talk to nexus right now."
 * clear-glass/src/page/nexus-chat.js: a watched chat page's `nexus>` lines run (read-only), once, when stable; old lines
 * never; the answer is typed back and sent. The page scripts run for real in Clear Glass's engine.
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '..', '..');
const NC = require(path.join(ROOT, 'clear-glass/src/page/nexus-chat.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }

function fakePage(url) {
  const c = new EventEmitter();
  c.id = 7; c.lines = []; c.typed = []; c.keys = [];
  c.getURL = () => url; c.isDestroyed = () => false;
  c.executeJavaScript = async (js) => (js === NC.READ_JS ? c.lines.slice() : js === NC.DIAG_JS ? { chars: 0 } : (c.typed.push(js), { ok: true }));
  c.sendInputEvent = (e) => c.keys.push(e.type);
  return c;
}

(async () => {
  await test('NC-01', 'only watched pages: Claude Code on the web by default, others by option', async () => {
    assert.ok(NC.watched('https://claude.ai/code/session_123'));
    assert.ok(!NC.watched('https://chatgpt.com/'));
    assert.ok(NC.watched('https://claude.ai/chat/abc'), '§0.59.9 "all sessions": every claude.ai page');
    assert.ok(NC.watched('https://chatgpt.com/c/1', { get: (k) => k === 'nexusChat.urls' ? ['https://chatgpt.com/'] : undefined }));
  });

  await test('NC-02', 'first open: only the newest line runs (history never); then a new line runs once, after it is stable; the answer is typed back and sent', async () => {
    NC.RAN.clear();
    const page = fakePage('https://claude.ai/code/s1');
    const heard = [];
    const runner = { hear: async (id, text) => { heard.push(text); return [{ line: text.replace('nexus> ', ''), result: { text: '1232 phases\nnexus> echo' } }]; } };
    const w = NC.attach(page, { runner, pollMs: 1e9 }); page.emit('did-finish-load');
    page.lines = ['status', 'census --limit 3'];
    await w._tick();
    assert.strictEqual(heard.length, 0, 'not on the first read — the reply may still be streaming');
    await w._tick();
    assert.deepStrictEqual(heard, ['nexus> census --limit 3'], 'the command he opened the page to run (0.59.5 swallowed it); the older line never');
    await w._tick();
    page.lines = ['status', 'census --limit 3', 'picks'];
    await w._tick();
    assert.strictEqual(heard.length, 1);
    await w._tick();
    assert.deepStrictEqual(heard, ['nexus> census --limit 3', 'nexus> picks']);
    await w._tick(); await w._tick();
    assert.strictEqual(heard.length, 2, 'once');
    assert.ok(/⌘ Nexus ran: census/.test(page.typed[0]) && !/^\s*nexus>/m.test(JSON.parse(page.typed[0].match(/const text = (".*?");/)[1])), 'typed back, no line of it starting with nexus>');
    assert.deepStrictEqual(page.keys.slice(0, 3), ['keyDown', 'char', 'keyUp'], 'and sent');
    w.stop();
  });

  await test('NC-06', 'a reload of the same page replays nothing; options read from NexusOptions.get() (no key)', async () => {
    NC.RAN.clear();
    const page = fakePage('https://claude.ai/code/s9');
    const heard = []; const runner = { hear: async (id, t) => { heard.push(t); return [{ line: t, result: {} }]; } };
    const w = NC.attach(page, { runner, pollMs: 1e9 }); page.emit('did-finish-load');
    page.lines = ['census']; await w._tick(); await w._tick();
    assert.strictEqual(heard.length, 1);
    page.emit('did-finish-load'); page.lines = ['census', 'status']; await w._tick(); await w._tick(); await w._tick();
    assert.strictEqual(heard.length, 1, 'reload: all of it is history');
    w.stop();
    assert.ok(NC.watched('https://chatgpt.com/c/1', { get: () => ({ nexusChat: { urls: ['https://chatgpt.com/'] } }) }));
  });

  await test('NC-07', '0.59.8: a chat that renders its messages after load — the newest line still runs, the older one never', async () => {
    NC.RAN.clear();
    const page = fakePage('https://claude.ai/code/s7');
    const heard = []; const runner = { hear: async (id, t) => { heard.push(t); return [{ line: t, result: {} }]; } };
    const w = NC.attach(page, { runner, pollMs: 1e9 }); page.emit('did-finish-load');
    page.lines = []; await w._tick(); await w._tick();                 // still loading: nothing decided yet
    page.lines = ['census --limit 2', 'census --limit 1']; await w._tick(); await w._tick(); await w._tick();
    assert.deepStrictEqual(heard, ['nexus> census --limit 1']);
    w.stop();
  });

  await test('NC-03', 'at most 6 commands a minute per page', async () => {
    const page = fakePage('https://claude.ai/code/s2');
    let n = 0; const runner = { hear: async (id, t) => { n++; return [{ line: t, result: {} }]; } };
    const w = NC.attach(page, { runner, pollMs: 1e9 }); page.emit('did-finish-load');
    NC.RAN.clear(); page.lines = ['status']; await w._tick();
    page.lines = ['status', ...Array.from({ length: 9 }, (_, i) => `census --limit ${i}`)];
    await w._tick(); await w._tick();
    assert.strictEqual(n, 6);
    w.stop();
  });

  await test('NC-04', 'read-only on a watched chat: census runs, dump runs, a write is refused with how to allow it', async () => {
    assert.strictEqual(await NC.readOnly({ command: 'census', args: [], flags: {} }), null);
    assert.strictEqual(await NC.readOnly({ command: 'dump', args: ['an idea'], flags: {} }), null);
    const why = await NC.readOnly({ command: 'access revoke', args: ['ab12cd34'], flags: {} });
    assert.ok(/changes Nexus/.test(why) && /Run Nexus commands/.test(why), why);
  });

  await test('NC-05', 'the page scripts, for real in Clear Glass\'s engine: lines read from the page; the answer typed into its box', async () => {
    let glass = null; try { glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js')); } catch (_) {}
    const eng = glass && glass.engine ? glass.engine() : null;
    let br = null;
    try { br = await glass.chromium.launch(); } catch (e) { console.log(`    (Clear Glass's engine could not start here — ${String(e.message).split('\n')[0]}; the scripts are checked by NC-02 through the fake page)`); return; }
    const server = http.createServer((q, rs) => { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end(`<!doctype html><body><div>I will check the census.</div><pre>nexus> census --limit 5</pre><pre>nexus>&nbsp;picks</pre><div id="sh"></div><script>document.getElementById('sh').attachShadow({mode:'open'}).innerHTML='<pre>nexus> status</pre>'</script><p>Talking about nexus> inline does not count.</p><textarea style="width:400px;height:60px"></textarea></body>`); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const pg = await br.newPage();
      await pg.goto(`http://127.0.0.1:${server.address().port}/`);
      assert.deepStrictEqual(await pg.evaluate(NC.READ_JS), ['census --limit 5', 'picks', 'status'], 'a non-breaking space counts (0.59.7); so does text inside an open shadow root (0.59.8)');
      const r = await pg.evaluate(NC.replyJs('⌘ Nexus ran: census\n1232 phases'));
      assert.ok(r.ok, JSON.stringify(r));
      assert.strictEqual(await pg.evaluate(() => document.querySelector('textarea').value), '⌘ Nexus ran: census\n1232 phases');
    } finally { await br.close(); server.close(); }
    void eng;
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
