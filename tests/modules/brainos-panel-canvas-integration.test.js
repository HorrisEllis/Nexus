// tests/modules/brainos-panel-canvas-integration.test.js — proves the
// real, single-connection wiring: brainos.js's own real /events SSE
// message is the SAME event brainos-canvas.js's node pulses react to,
// not a second connection this test could silently fail to notice.
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

let esInstances = 0;
let lastES = null;
class FakeEventSource {
  constructor(url) { this.url = url; this.onopen = null; this.onmessage = null; this.onerror = null; this.closed = false; esInstances++; lastES = this; }
  close() { this.closed = true; }
}
dom.window.EventSource = FakeEventSource;
global.EventSource = FakeEventSource;
dom.window.fetch = global.fetch = () => Promise.resolve({ json: () => Promise.resolve({ commandCount: 0 }) });

// Load order matters — brainos.js checks `if (global.BrainOSCanvas)` at
// mount time, so the real canvas module must exist first, exactly like
// a real page would <script> tag them in order.
require('../../nexus/ui/brainos/brainos-canvas.js');
require('../../nexus/ui/brainos/brainos.js');
const BrainOS = dom.window.BrainOS;
const Canvas = dom.window.BrainOSCanvas;

function main() {
  const panel = BrainOS.mount({});

  console.log('\n[1] mounting the panel really mounts the canvas inside it, not a separate host');
  t('BPC-001', 'the real canvas SVG is really inside the real panel\'s own DOM subtree', !!panel.querySelector('.brainos-canvas'));

  console.log('\n[2] exactly ONE real EventSource is opened, not two');
  t('BPC-002', 'only one real SSE connection exists — the canvas does not open its own second one', esInstances === 1);

  console.log('\n[3] a single real SSE message reaches both the panel\'s own event list AND the canvas\'s node pulse');
  const guardianDot = panel.querySelector('.brainos-canvas-node[data-node-id="guardian"] .brainos-canvas-dot');
  t('BPC-003', 'guardian\'s canvas node starts unpulsed', !guardianDot.classList.contains('brainos-pulse'));

  lastES.onmessage({ data: JSON.stringify({ type: 'job.dispatched', provider: 'chatgpt' }) });

  t('BPC-004', 'the SAME real message rendered into the panel\'s own real event list', panel.querySelectorAll('.brainos-event-row').length === 1);
  t('BPC-005', 'the SAME real message also pulsed guardian\'s real canvas node (proves the single-stream wiring, not a coincidence)', guardianDot.classList.contains('brainos-pulse'));

  const chatgptDot = panel.querySelector('.brainos-canvas-node[data-node-id="chatgpt"] .brainos-canvas-dot');
  t('BPC-006', 'the SAME real message\'s provider field pulsed chatgpt\'s real canvas node too', chatgptDot.classList.contains('brainos-pulse'));

  console.log('\n[4] unmounting the panel really unmounts the canvas too');
  BrainOS.unmount();
  t('BPC-007', 'the real canvas SVG is gone after the panel unmounts (no orphaned canvas)', !document.body.contains(panel));

  console.log(`\n  brainos-panel-canvas-integration: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
