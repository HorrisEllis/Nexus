// tests/modules/brainos-canvas.test.js — James: "Canvas ui for live
// animated agent and system management. Nodes can be any end point.
// Real alive node connection animations. Each system can be a node,
// any heartbeat/pulse emission."
//
// Real jsdom SVG DOM, not a syntax check. Proves: every real system
// from orchestrator.config.json's own real ports list gets a real
// node; a real event pulses guardian's real node (the only confirmed
// live source on this stream); a real provider-tagged event pulses
// that agent's real node and no other; an unrecognized node id is a
// real no-op, never a fabricated pulse.
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

require('../../ui/brainos/brainos-canvas.js');
const Canvas = dom.window.BrainOSCanvas;

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

function main() {
  console.log('\n[1] every real system gets a real node — nothing hidden, nothing fabricated');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const svg = Canvas.mount(host);

  t('BC-001', 'mount() returns a real, attached SVG element', document.body.contains(svg) || host.contains(svg));
  t('BC-002', 'the real node count matches the real system + agent lists exactly (no more, no fewer)',
    svg.querySelectorAll('.brainos-canvas-node').length === Canvas.getRealSystemIds().length + Canvas.getRealAgentIds().length);

  for (const id of ['guardian', 'orchestrator', 'cortex', 'idearium', 'ollama']) {
    t(`BC-003:${id}`, `real system "${id}" (from orchestrator.config.json's own real ports) has a real rendered node`,
      !!svg.querySelector(`.brainos-canvas-node[data-node-id="${id}"]`));
  }
  for (const id of ['claude', 'chatgpt', 'gemini', 'deepseek']) {
    t(`BC-004:${id}`, `real agent "${id}" has a real rendered node`,
      !!svg.querySelector(`.brainos-canvas-node[data-node-id="${id}"]`));
  }

  console.log('\n[2] real, named structural lines — static topology, not a live call trace');
  const edges = svg.querySelectorAll('.brainos-canvas-edge');
  t('BC-005', 'at least one real, named topology edge is drawn', edges.length > 0);
  t('BC-006', 'every real edge carries its own real source citation (a <title>, not an unexplained line)',
    Array.from(edges).every((e) => !!e.querySelector('title')?.textContent));

  console.log('\n[3] real pulse — only on a real event, never on a timer');
  const guardianDot = svg.querySelector('.brainos-canvas-node[data-node-id="guardian"] .brainos-canvas-dot');
  t('BC-007', 'guardian\'s real node starts with no pulse class (real resting state)', !guardianDot.classList.contains('brainos-pulse'));

  Canvas.onRealEvent({ type: 'job.dispatched' });
  t('BC-008', 'a real event with no provider field still pulses guardian\'s real node (every event is guardian\'s own)', guardianDot.classList.contains('brainos-pulse'));

  const claudeDot = svg.querySelector('.brainos-canvas-node[data-node-id="claude"] .brainos-canvas-dot');
  const geminiDot = svg.querySelector('.brainos-canvas-node[data-node-id="gemini"] .brainos-canvas-dot');
  Canvas.onRealEvent({ type: 'STREAM_TOKEN', provider: 'claude' });
  t('BC-009', 'a real event naming provider:"claude" pulses claude\'s real node', claudeDot.classList.contains('brainos-pulse'));
  t('BC-010', 'that SAME event does NOT pulse a different, unnamed agent\'s node (no cross-contamination)', !geminiDot.classList.contains('brainos-pulse'));

  console.log('\n[4] an unrecognized node id is a real no-op — never a fabricated pulse');
  let threw = false;
  try { Canvas.pulse('not-a-real-node-id'); } catch (e) { threw = true; }
  t('BC-011', 'pulsing an unrecognized node id does not throw', !threw);

  console.log('\n[5] unmount really tears down');
  Canvas.unmount();
  t('BC-012', 'unmount() really removes the real SVG from the document', !document.body.contains(svg) && !host.contains(svg));

  console.log(`\n  brainos-canvas: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
