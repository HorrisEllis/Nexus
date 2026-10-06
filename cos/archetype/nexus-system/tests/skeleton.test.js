'use strict';
// tests/skeleton.test.js — the skeleton is alive: it boots, indexes its nodes, has the component shape, serves its
// route nodes, runs its command nodes, picks up a node dropped into its folder, and gains a capability from nodes alone.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { boot } = require('../lib/system.js');
const { start } = require('../server.js');
const commands = require('../lib/commands.js');
const env = require('../lib/envelope.js');

const get = (port, p) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: p }, (res) => {
  let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
}).on('error', reject));

(async () => {
  const ctx = boot();
  assert.deepStrictEqual(ctx.index.problems, [], 'every seed node matches its schema');
  assert.deepStrictEqual(ctx.shape(), [], 'every component has a capability, a command and events');
  assert.ok(ctx.index.get('bundle', '{{slug}}.core.observe'), 'the listener wrote the capability bundle');
  const st = await commands.run(ctx, 'status');
  assert.strictEqual(st.system, '{{slug}}');

  const { server, port } = await start({ port: 0 });
  const added = [];
  try {
    assert.strictEqual((await get(port, '/health')).status, 200);
    assert.strictEqual((await get(port, '/status')).json.system, '{{slug}}');
    const c = (await get(port, '/contract')).json;
    assert.ok(c.resources.some(r => r.path === '/status'), 'the contract carries the route nodes');
    env.write(ctx.root, 'route', '{{slug}}.probe', { method: 'GET', path: '/probe', command: '{{slug}}.status' });
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { await new Promise(r => setTimeout(r, 100)); ok = (await get(port, '/probe')).status === 200; }
    assert.ok(ok, 'a route node dropped into its folder is served without a restart');

    // a capability from nodes alone: its capability, command, event and route nodes, and the component node naming it
    const S = '{{slug}}', cap = `${S}.core.count`;
    const comp = env.read(env.nodePath(ctx.root, 'component', `${S}.core`));
    added.push(['component', `${S}.core`, comp]);
    env.write(ctx.root, 'capability', cap, { component: `${S}.core`, summary: 'count nodes of a type', commands: [`${S}.count`] });
    env.write(ctx.root, 'command', `${S}.count`, { capability: cap, cli: 'count', handler: 'nodes', events: [`${S}.count.done`] });
    env.write(ctx.root, 'event', `${S}.count.done`, { command: `${S}.count`, payload: { command: 'string', result: 'object' } });
    env.write(ctx.root, 'route', `${S}.count`, { method: 'GET', path: '/count/:type', command: `${S}.count` });
    env.write(ctx.root, 'component', `${S}.core`, { ...comp.payload, capabilities: [...comp.payload.capabilities, cap] }, { uuid: comp.uuid, system: comp.system, summary: comp.summary });
    added.push(['capability', cap], ['command', `${S}.count`], ['event', `${S}.count.done`], ['route', `${S}.count`]);
    let got = null;
    for (let i = 0; i < 40 && !(got && got.status === 200); i++) { await new Promise(r => setTimeout(r, 100)); got = await get(port, '/count/event'); }
    assert.ok(got.status === 200 && got.json.nodes.some(n => n.id === `${S}.count.done`), 'a capability added as nodes alone is served');
    assert.deepStrictEqual((await get(port, '/status')).json.shape, [], 'and the shape still holds');
  } finally {
    fs.unlinkSync(env.nodePath(ctx.root, 'route', '{{slug}}.probe'));
    for (const [type, id, before] of added) {
      if (before) env.write(ctx.root, type, id, before.payload, { uuid: before.uuid, system: before.system, summary: before.summary });
      else fs.unlinkSync(env.nodePath(ctx.root, type, id));
    }
    server.close();
    ctx.stop();
  }
  console.log('skeleton: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
