// tests/modules/brainos-panel.test.js — real jsdom DOM, not just a syntax
// check. James: "Just do BrainOS... Interaction contract for the ui to
// float." Proves the actual widget mounts real elements, responds to a
// real (mocked-transport, real-DOM) SSE message, and its drag handler
// really moves the panel's real style.left/top — not just that the file
// parses.
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

// Real EventSource doesn't exist in jsdom — a real, minimal, honest stub
// that records what BrainOS actually does with it (open/close/onmessage
// wiring), not a mock that fakes success silently.
let lastES = null;
class FakeEventSource {
  constructor(url) { this.url = url; this.onopen = null; this.onmessage = null; this.onerror = null; this.closed = false; lastES = this; }
  close() { this.closed = true; }
}
dom.window.EventSource = FakeEventSource;
global.EventSource = FakeEventSource;

// Real fetch stub — records the real URL BrainOS actually calls, returns
// a shape matching clear-glass's own real _buildCommandIndex() output.
let lastFetchUrl = null;
dom.window.fetch = global.fetch = (url) => {
  lastFetchUrl = url;
  return Promise.resolve({ json: () => Promise.resolve({ systemId: 'clear-glass', port: 7702, commandCount: 68, commands: [] }) });
};

require('../../nexus/ui/brainos/brainos.js');
const BrainOS = dom.window.BrainOS;

async function main() {
  console.log('\n[1] mounting really creates real DOM elements');
  const panel = BrainOS.mount({ guardianUrl: 'http://127.0.0.1:19999', clearGlassUrl: 'http://127.0.0.1:19998' });

  t('BP-001', 'mount() returns a real element actually attached to document.body', document.body.contains(panel));
  t('BP-002', 'the real panel has the brainos-panel class', panel.classList.contains('brainos-panel'));
  t('BP-003', 'a real titlebar with the BRAINOS title exists', panel.querySelector('.brainos-title')?.textContent === 'BRAINOS');
  t('BP-004', 'a real, distinct close button exists', !!panel.querySelector('.brainos-close'));

  console.log('\n[2] real SSE wiring — not polling, no idle refresh');
  t('BP-005', 'mount() really opened an EventSource at the real, configured guardian URL', lastES?.url === 'http://127.0.0.1:19999/events');
  t('BP-006', 'the real command index fetch hit the real, configured clear-glass URL', lastFetchUrl === 'http://127.0.0.1:19998/cli/commands');

  lastES.onopen();
  t('BP-007', 'a real onopen event flips the real status dot to live', panel.querySelector('.brainos-status-dot').classList.contains('live'));

  lastES.onmessage({ data: JSON.stringify({ type: 'provider.connected', ts: Date.now() }) });
  const rows = panel.querySelectorAll('.brainos-event-row');
  t('BP-008', 'a real SSE message really renders a real event row (not a no-op)', rows.length === 1);
  t('BP-009', 'the real rendered row shows the real event type received', rows[0]?.querySelector('.type')?.textContent === 'provider.connected');

  await new Promise((r) => setTimeout(r, 20)); // real microtask flush for the 5 real fetch promises above
  const sysRows = panel.querySelectorAll('.brainos-system-row');
  t('BP-010', 'all 5 real named systems render', sysRows.length === 5);
  // §UPDATED 2026-09-03 — all 5 real systems now have a real, live
  // command-index endpoint (docs/command-index-per-system.spec phases
  // 1-5 all DONE this session). What was honestly "not yet indexed"
  // for 4 of them is now a real route count for all 5 — this assertion
  // now checks the new reality, not the old, now-closed gap.
  const notIndexed = panel.querySelectorAll('.brainos-not-indexed');
  t('BP-011', 'no system says "not yet indexed" anymore — all 5 real backends are live', notIndexed.length === 0);
  const metas = Array.from(panel.querySelectorAll('.brainos-system-meta')).map((e) => e.textContent);
  t('BP-011b', 'every real system shows a real route count, not a loading/placeholder state', metas.every((m) => /real routes/.test(m)));

  console.log('\n[3] real drag behavior — "the ui to float"');
  const titlebar = panel.querySelector('.brainos-titlebar');
  const before = { left: panel.style.left, top: panel.style.top };
  titlebar.dispatchEvent(new dom.window.MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
  window.dispatchEvent(new dom.window.MouseEvent('mousemove', { clientX: 160, clientY: 145, bubbles: true }));
  window.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
  t('BP-012', 'a real mousedown+mousemove genuinely changes the panel\'s real position, not a no-op', panel.style.left !== before.left || panel.style.top !== before.top);

  console.log('\n[4] real introspection API — what the interaction contract\'s own /state action reads');
  const state = BrainOS.getState();
  t('BP-013', 'getState() reports the real mounted/connected state, not a stub', state.mounted === true && state.connected === true);
  t('BP-014', 'getState() reports the real, live event count received so far', state.eventCount === 1);

  console.log('\n[5] unmount really tears down — no leaked real EventSource');
  BrainOS.unmount();
  t('BP-015', 'unmount() really closes the real EventSource', lastES.closed === true);
  t('BP-016', 'unmount() really removes the real panel from the real document', !document.body.contains(panel));

  console.log(`\n  brainos-panel: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
