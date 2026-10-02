'use strict';
// tests/modules/test-spatial-void.test.js — 0.39.295, docs/2026-10-02-spatial-void-phasemap.spec.
// James: "Just have the spacial void, with a slider that moves from: normal, creative, outside the box, novel, outlier.
// then moves another switch from the opposit side: stable, shaky, risky, dangerous, unstable. with those linked
// togethe" · "the ideas come from me though not agents".
//
//   VD-01  the dials: linked (one carries the other), held (the other stays), the tension between them
//   VD-02  the voices: every prompt says the idea is his and forbids a new one; the dials pick the voice; ground forces
//          stable; d20 rolls a field; a collision needs two ideas; the reverse chain starts from END
//   VD-03  an idea's void: born-at is kept; work brightens it; untouched ideas fade and drift; a place for every idea
//   VD-04  take: only his words reach an idea, added, never replacing it
//   VD-05  the router, a stand-in agent: an idea into the void → the field → an echo beside it (the idea unchanged) →
//          take → set aside → collide → → spec (grounded) → a spark made an idea; a failed agent stores nothing
//   VD-06  the page and the shell: fonts local (OFL) and served, the page served, the dials in order, Create → The Void
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

async function main() {
  const V = await imp('idearium/lib/void.js');

  await test('VD-01', 'the dials: linked, held, and the tension', () => {
    assert.deepStrictEqual(V.CREATIVITY, ['normal', 'creative', 'outside the box', 'novel', 'outlier']);
    assert.deepStrictEqual(V.STABILITY, ['stable', 'shaky', 'risky', 'dangerous', 'unstable']);
    let s = V.link({ creativity: 0, stability: 0 }, { dial: 'creativity', to: 3 });
    assert.deepStrictEqual([s.creativity, s.stability], [3, 3], 'linked: one carries the other');
    s = V.link({ ...s, held: 'stability' }, { dial: 'creativity', to: 4 });
    assert.deepStrictEqual([s.creativity, s.stability, s.held], [4, 3, 'stability'], 'held: the other stays');
    s = V.link({ creativity: 4, stability: 1, held: 'stability' }, { dial: 'creativity', to: 4 });
    assert.strictEqual(V.tension(s.creativity, s.stability), 3);
    s = V.link(s, { dial: 'stability', to: 0 });
    assert.deepStrictEqual([s.creativity, s.stability, s.held], [4, 0, 'stability'], 'held: each dial moves alone, whichever is moved');
    s = V.link({ ...s, held: null }, { dial: 'stability', to: 2 });
    assert.deepStrictEqual([s.creativity, s.stability], [2, 2], 'released: linked again from the next move');
    assert.strictEqual(V.link({}, { dial: 'creativity', to: 99 }).creativity, 4); assert.strictEqual(V.link({}, { dial: 'nope', to: 2 }).creativity, 0);
    assert.strictEqual(V.tensionLabel(0), 'linked'); assert.match(V.tensionLabel(3), /strained — wild, held steady/); assert.match(V.tensionLabel(-2), /pulling — plain, on unsteady ground/);
  });

  await test('VD-02', 'the voices: his idea, never a new one', () => {
    const idea = { uuid: 'i1', text: 'A garden that plans itself by sunlight.' };
    const p = V.echoPrompt({ idea, creativity: 4, stability: 0, context: { repos: ['orbit-garden'], library: ['RHEON STUDIO'] } });
    assert.match(p.prompt, /James is the idea generator\. The idea below is HIS/);
    assert.match(p.prompt, /Do not write a new idea, do not rename his, do not rewrite it/);
    assert.match(p.prompt, /"A garden that plans itself by sunlight\."/);
    assert.match(p.prompt, /Reverse-engineer from the end-state/, 'outlier → Erosmancer');
    assert.match(p.prompt, /Ground it: what of it can be built today/, 'stable → ground');
    assert.match(p.prompt, /His repos: orbit-garden/); assert.match(p.prompt, /RHEON STUDIO/);
    assert.strictEqual(p.voice, 'EROSMANCER + GROUND'); assert.strictEqual(p.meta.tension, 4);
    assert.match(V.echoPrompt({ idea, creativity: 2, stability: 2 }).voice, /^UNIFIED · INVERSION \+ HOSTILE TRUTH$/);
    assert.match(V.echoPrompt({ idea, creativity: 1, stability: 3 }).prompt, /Map the cascades/, 'dangerous → delta risk');
    const g = V.echoPrompt({ idea, creativity: 4, stability: 4, kind: 'ground' });
    assert.strictEqual(g.meta.stability, 0, 'the exit gate is stable whatever the dials say'); assert.match(g.prompt, /about to leave the void/);
    const d = V.echoPrompt({ idea, creativity: 3, stability: 1, kind: 'd20', roll: { roll: 7, domain: 'cooking', mechanism: 'mise en place — everything prepared' } });
    assert.match(d.prompt, /d20 rolled 7: cooking/); assert.strictEqual(d.meta.domain, 'cooking');
    assert.match(V.echoPrompt({ idea, kind: 'reverse' }).prompt, /First line: "END: "/);
    assert.ok(V.echoPrompt({ idea, kind: 'collide' }).error); assert.ok(V.echoPrompt({ idea: { text: '' } }).error); assert.ok(V.echoPrompt({ idea, kind: 'bogus' }).error);
    assert.match(V.echoPrompt({ idea, kind: 'collide', other: { uuid: 'i2', text: 'Tide clock.' } }).prompt, /Do not invent a third idea/);
    assert.deepStrictEqual(V.echoLines('Here are some thoughts:\n- One?\n2) Two.\n\n```\n'), ['One?', 'Two.']);
  });

  await test('VD-03', 'born-at kept, work brightens, untouched fades and drifts', () => {
    const a = V.shapeVoid(null, { creativity: 4, stability: 1, x: 0.3, y: 2 });
    assert.deepStrictEqual(a.born && [a.born.creativity, a.born.stability, a.born.tension], [4, 1, 3]);
    assert.strictEqual(a.y, 1, 'kept on the field');
    const b = V.shapeVoid(a, { creativity: 0, stability: 0, work: true });
    assert.deepStrictEqual([b.creativity, b.born.creativity, b.worked], [0, 4, 1], 'the dials move, what it was born at does not');
    const now = Date.now();
    const fresh = V.glow({ void: { touchedAt: now, worked: 6 } }, now), old = V.glow({ void: { touchedAt: now - 120 * 864e5, worked: 0 } }, now);
    assert.ok(fresh.glow > old.glow && fresh.drift === 0 && old.drift === 1, JSON.stringify({ fresh, old }));
    assert.ok(V.glow({ createdAt: now }, now).glow >= 0.12);
    const p1 = V.placeFor('abc'), p2 = V.placeFor('abc');
    assert.deepStrictEqual(p1, p2); assert.ok(p1.x > 0 && p1.x < 1 && p1.y > 0 && p1.y < 1);
  });

  await test('VD-04', 'take: his words, added', () => {
    const idea = { uuid: 'i1', text: 'A garden.' };
    assert.ok(V.take(idea, { ideaUuid: 'i1' }, { words: '  ' }).error);
    assert.ok(V.take(idea, { ideaUuid: 'other' }, { words: 'x' }).error);
    assert.strictEqual(V.take(idea, { ideaUuid: 'i1' }, { words: 'It waters by shade.' }).text, 'A garden.\nIt waters by shade.');
  });

  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);

  await test('VD-05', 'the router: into the void, echoes beside it, take, collide, → spec, sparks', async () => {
    const asked = [];
    api._setAgentAsk(async (prompt, o) => { asked.push({ prompt, ...o }); return { ok: true, text: /about to leave/.test(prompt) ? 'Buildable today: a sun-hours table.\nMissing: a sensor.' : /pushed two/.test(prompt) ? 'They share a clock.\nThey clash on power.' : 'What happens at night?\nWho is it for?', by: 'stand-in' }; });
    const c = await R('POST', '/api/void/idea', { text: 'A garden that plans itself by sunlight', creativity: 3, stability: 1, held: 'stability', x: 0.4, y: 0.5 });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const idea = c.json.idea;
    assert.deepStrictEqual([idea.source, idea.tags, idea.void.creativity, idea.void.stability, idea.void.tension, idea.void.born.tension], ['void', ['void'], 3, 1, 2, 2]);
    assert.strictEqual((await R('POST', '/api/void/idea', { text: 'x' })).status, 400, 'an idea needs words');
    const f = await R('GET', '/api/void');
    const mine = f.json.ideas.find(i => i.uuid === idea.uuid);
    assert.ok(mine && mine.glow > 0 && mine.x === 0.4, JSON.stringify(mine));
    const e = await R('POST', `/api/void/idea/${idea.uuid}/echo`, { kind: 'echo', creativity: 4, stability: 0 });
    assert.strictEqual(e.status, 200, JSON.stringify(e.json));
    assert.deepStrictEqual(e.json.echo.lines, ['What happens at night?', 'Who is it for?']);
    assert.strictEqual(e.json.echo.voice, 'EROSMANCER + GROUND'); assert.strictEqual(asked[0].channel, 'idearium-void');
    const show = await R('GET', `/api/void/idea/${idea.uuid}`);
    assert.strictEqual(show.json.idea.text, 'A garden that plans itself by sunlight', 'an echo never touches the idea');
    assert.strictEqual(show.json.echoes.length, 1);
    assert.strictEqual((await R('POST', `/api/void/echo/${e.json.echo.uuid}`, { action: 'take', words: '' })).status, 400, 'words are required');
    const t = await R('POST', `/api/void/echo/${e.json.echo.uuid}`, { action: 'take', words: 'At night it rests — the plan is for daylight.' });
    assert.strictEqual(t.status, 200, JSON.stringify(t.json));
    assert.strictEqual(t.json.idea.text, 'A garden that plans itself by sunlight\nAt night it rests — the plan is for daylight.');
    assert.strictEqual(t.json.idea.void.worked, 1); assert.strictEqual(t.json.echo.status, 'taken');
    const aside = await R('POST', `/api/void/echo/${e.json.echo.uuid}`, { action: 'set-aside' });
    assert.strictEqual(aside.json.echo.status, 'set-aside');
    const mv = await R('POST', `/api/void/idea/${idea.uuid}`, { x: 0.9, y: 0.1, creativity: 0, stability: 0 });
    assert.deepStrictEqual([mv.json.idea.void.x, mv.json.idea.void.creativity, mv.json.idea.void.born.creativity], [0.9, 0, 3]);
    const b = await R('POST', '/api/void/idea', { text: 'A tide clock for the kitchen', creativity: 1, stability: 1 });
    const col = await R('POST', '/api/void/collide', { a: idea.uuid, b: b.json.idea.uuid });
    assert.strictEqual(col.status, 200, JSON.stringify(col.json)); assert.strictEqual(col.json.echo.otherUuid, b.json.idea.uuid);
    assert.match(asked[asked.length - 1].prompt, /A tide clock for the kitchen/);
    assert.strictEqual((await R('POST', '/api/void/collide', { a: idea.uuid, b: idea.uuid })).status, 400);
    const sp = await R('POST', `/api/void/idea/${idea.uuid}/spec`, {});
    assert.strictEqual(sp.status, 200); assert.strictEqual(sp.json.echo.kind, 'ground'); assert.strictEqual(sp.json.echo.stability, 0);
    assert.match(sp.json.next, /^\/workshop\.html\?from=idea%3A/);
    // a brainstorm spark shows in the field, then becomes an idea through brainstorm.promote
    const bs = await R('POST', '/api/brainstorms', { text: 'a lamp that dims with your mood' });
    const sparkUuid = bs.json && bs.json.brainstorm && bs.json.brainstorm.uuid;
    if (sparkUuid) {
      assert.ok((await R('GET', '/api/void')).json.sparks.find(s => s.uuid === sparkUuid), 'the spark is in the field');
      const si = await R('POST', `/api/void/spark/${sparkUuid}/idea`, { creativity: 2, stability: 2 });
      assert.strictEqual(si.status, 200, JSON.stringify(si.json)); assert.strictEqual(si.json.idea.void.creativity, 2);
      assert.ok(!(await R('GET', '/api/void')).json.sparks.find(s => s.uuid === sparkUuid), 'no longer a spark');
    } else assert.fail(`brainstorm route answered ${bs.status} ${JSON.stringify(bs.json).slice(0, 200)}`);
    // a failed agent stores nothing
    const n = show.json.echoes.length;
    api._setAgentAsk(async () => ({ ok: false, error: 'copilot unreachable' }));
    const bad = await R('POST', `/api/void/idea/${b.json.idea.uuid}/echo`, {});
    assert.strictEqual(bad.status, 502); assert.match(bad.json.error, /copilot unreachable/);
    assert.strictEqual((await R('GET', `/api/void/idea/${b.json.idea.uuid}`)).json.echoes.length, 1, 'only the collision echo — nothing from the failure');
    assert.ok(n >= 1);
    api._setAgentAsk(null);
  });

  await test('VD-06', 'the page, the fonts, the shell', () => {
    for (const f of ['bebas-neue-400.woff2', 'dm-mono-400.woff2', 'dm-mono-500.woff2', 'space-grotesk-400.woff2', 'space-grotesk-600.woff2']) assert.ok(fs.statSync(path.join(ROOT, 'idearium/ui/fonts', f)).size > 5000, f);
    for (const l of ['bebas-neue', 'dm-mono', 'space-grotesk']) assert.match(fs.readFileSync(path.join(ROOT, `idearium/ui/fonts/LICENSE-${l}.txt`), 'utf8'), /SIL Open Font License/);
    const A = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(A, /\/\^\\\/fonts\\\/\[a-z0-9-\]\+\\\.\(woff2\|txt\)\$\//, 'fonts served, binary'); assert.match(A, /'font\/woff2'/);
    assert.match(A, /cleanUrl === '\/void\.html'/);
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/void.html'), 'utf8');
    assert.match(page, /url\(fonts\/bebas-neue-400\.woff2\)/); assert.ok(!/fonts\.googleapis/.test(page), 'nothing from the network');
    assert.match(page, /const CREATIVITY = \['normal', 'creative', 'outside the box', 'novel', 'outlier'\]/);
    assert.match(page, /const STABILITY = \['stable', 'shaky', 'risky', 'dangerous', 'unstable'\]/);
    assert.match(page, /--void:#030508/); assert.match(page, /THE VOID/); assert.match(page, /js\/window-chrome\.js/);
    const html = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    assert.match(html, /onclick="openVoid\(\)"[^>]*>.*The Void/);
    assert.ok(!/class="tab-sub" data-view="brainstorm"/.test(html) && !/class="tab-sub" data-view="ideas"/.test(html), 'Ideas and Brainstorm left the nav');
    assert.match(html, /id="view-ideas"/, 'their views stay (§0.3)');
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8'), /function openVoid\(\)/);
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    for (const c of ['list', 'add', 'echo', 'collide', 'take']) assert.match(cli, new RegExp(`async 'void\\.${c}'`));
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/index.js'), 'utf8'), /'linkedSpec','void'\]/, 'ideas carry the void');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
