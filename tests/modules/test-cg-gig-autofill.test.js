'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cg-gig-autofill.test.js — GA1 (0.60.161).
 * James, 2026-10-18: "need help with the autofill for fiverr." (screenshot: co-pilot answered "fill this in for me" with chat.)
 * · 2026-10-19: "yes." — the co-pilot gets one door that runs the gig engine instead of chatting.
 *
 *   GA-01  _gigAutofill with a gig already written: fills the matched fields through the real engine; never drafts
 *   GA-02  no gig and no offer: returns needsGig with a one-line ask (NOT a chat), and does not touch the page
 *   GA-03  no gig but an offer: writes the gig from the Fiverr profile (co-pilot), keeps it as the last gig, then fills
 *   GA-04  wired: the co-pilot tool exists, the hat names it, the bridge dispatches it to /cli/autofill/gig/autofill, REST + IPC doors
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const IpcBridge = require('../../clear-glass/src/ipc/bridge.js');
const G = require('../../clear-glass/src/autofill/gig.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

const GIG = G.parseGig(JSON.stringify({
  title: 'build a custom Node.js automation or web scraping tool',
  tags: ['automation', 'nodejs', 'web scraping', 'bots', 'api'],
  description: 'You get a working Node.js tool. '.repeat(6),
  packages: { basic: { name: 'Script', description: 'one script', deliveryDays: 3, revisions: 1, price: 40 },
    standard: { name: 'Tool', description: 'a tool', deliveryDays: 5, revisions: 2, price: 90 },
    premium: { name: 'System', description: 'a system', deliveryDays: 7, revisions: 3, price: 180 } },
  faq: [], requirements: ['What are you automating?'],
})).gig;

// a fake Fiverr page: a title input and a tags input, plus the dom bridge fillGig/matchGigFields use
function fakeDom({ withTitle = true } = {}) {
  const fields = [];
  if (withTitle) fields.push({ id: 'f1', tag: 'input', type: 'text', attrs: { placeholder: 'do something I\'m really good at' }, label: 'Gig title' });
  fields.push({ id: 'f2', tag: 'input', type: 'text', attrs: {}, label: 'Search tags' });
  const typed = {};
  return {
    typed,
    handleQuery: async () => fields,
    handleMutate: async ({ cgId, mutation }) => { typed[cgId] = mutation.value; return { ok: true }; },
  };
}

function stub({ lastGig = null, dom = fakeDom(), copilot = null, profiles = [{ id: 'fiv', label: 'Fiverr', fields: { headline: 'I build Node.js tools', skills: 'node, scraping, automation' } }] } = {}) {
  let stored = lastGig;
  const s = {
    dom, copilot,
    autofillStore: {
      getLastGig: () => stored, setLastGig: (g) => { stored = g; return true; },
      listProfiles: () => profiles, getProfile: (id) => profiles.find(p => p.id === id) || null,
    },
    postEvent: () => {},
    _seen: () => stored,
  };
  for (const m of ['_gigAutofill', '_gigFill', '_gigDraft', '_fiverrProfileId']) s[m] = IpcBridge.prototype[m].bind(s);
  s._humanCheckGate = async () => ({ pass: true });   // §HC3's gate (0.60.265: the gate has its own tests; here no check is on the page)
  return s;
}

(async () => {
  await test('GA-01', 'a written gig is filled through the real engine; no draft', async () => {
    const s = stub({ lastGig: GIG, copilot: { send: async () => { throw new Error('must not draft'); } } });
    const r = await s._gigAutofill({ agentId: 'a', minConfidence: 'low' });
    assert.ok(r.ok, r.error); assert.strictEqual(r.drafted, false);
    assert.ok(r.filled.length >= 1 && r.filled.some(f => f.key === 'title'), JSON.stringify(r.filled));
    assert.strictEqual(s.dom.typed.f1, GIG.title.replace(/^I will\s+/, ''), 'the title was typed in');
  });

  await test('GA-02', 'no gig, no offer: a one-line ask, not a chat, and the page is untouched', async () => {
    const s = stub({ lastGig: null });
    const r = await s._gigAutofill({ agentId: 'a' });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.needsGig, true);
    assert.match(r.error, /one line what this gig offers|write it in Settings/i);
    assert.deepStrictEqual(s.dom.typed, {}, 'nothing was typed');
  });

  await test('GA-03', 'no gig but an offer: writes from the profile, keeps it, then fills', async () => {
    const reply = '```json\n' + JSON.stringify({ title: 'build a custom Node.js automation or web scraping tool', tags: ['automation', 'nodejs', 'bots', 'api', 'web scraping'], description: 'A working tool, delivered. '.repeat(6), packages: { basic: { name: 'Script', description: 'one', deliveryDays: 3, revisions: 1, price: 40 }, standard: { name: 'Tool', description: 'two', deliveryDays: 5, revisions: 2, price: 90 }, premium: { name: 'System', description: 'three', deliveryDays: 7, revisions: 3, price: 180 } }, faq: [], requirements: ['What?'] }) + '\n```';
    let asked = null;
    const s = stub({ lastGig: null, copilot: { send: async ({ message }) => { asked = message; return { text: reply }; } } });
    const r = await s._gigAutofill({ agentId: 'a', offer: 'Node.js automation and scraping tools', minConfidence: 'low' });
    assert.ok(r.ok, r.error); assert.strictEqual(r.drafted, true, 'it drafted');
    assert.ok(asked && /offer/i.test(asked) || asked, 'the co-pilot was asked to write the gig');
    assert.ok(r.filled.some(f => f.key === 'title'), 'then filled');
    assert.ok(s._seen() && s._seen().title, 'the drafted gig is kept as the last gig');
  });

  await test('GA-04', 'wired: the tool, the hat, the dispatch, the REST + IPC doors', () => {
    const tools = fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/tools.js'), 'utf8');
    assert.ok(/name: 'autofill\.gig'/.test(tools), 'the tool is declared');
    const hat = fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/hat.js'), 'utf8');
    assert.ok(/autofill\.gig/.test(hat) && /manage_gigs|Fiverr gig/i.test(hat), 'the hat names it for Fiverr gigs');
    const cb = fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'), 'utf8');
    assert.ok(/action === 'autofill\.gig'[\s\S]{0,160}\/cli\/autofill\/gig\/autofill/.test(cb), 'the co-pilot bridge dispatches it');
    const ib = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
    assert.ok(ib.includes("'/cli/autofill/gig/autofill'") && /ipcMain\.handle\('autofill:gig:autofill'/.test(ib), 'REST + IPC doors');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
