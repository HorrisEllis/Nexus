'use strict';
const { createInputInjector } = require('../input-injector');

function log(ok, label) {
  console.log(`  ${ok ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m'}  ${label}`);
  if (!ok) process.exitCode = 1;
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const applied = [];
  const backend = {
    name: 'test-backend',
    async mousemove(x, y) { applied.push({ kind: 'mousemove', x, y }); },
    async click(x, y) { applied.push({ kind: 'click', x, y }); },
    async keydown(key) { applied.push({ kind: 'keydown', key }); },
  };

  const injector = createInputInjector({ backend, coalesceMouseMoveMs: 20, rateLimit: { maxPerSecond: 5 } });
  const events = [];
  injector.on('input:injected', (e) => events.push(e));
  injector.on('input:rejected', (e) => events.push(e));
  injector.on('input:rate_limited', (e) => events.push(e));

  log(injector.backendName() === 'test-backend', 'uses the injected backend, not the native/logging fallback');

  // valid click applies immediately (not coalesced)
  const r1 = await injector.inject({ kind: 'click', x: 5, y: 5, ts: Date.now() });
  log(r1.ok === true, 'valid click is accepted');
  log(applied.some((a) => a.kind === 'click' && a.x === 5), 'valid click actually reaches the backend');

  // malformed shape
  const r2 = await injector.inject({ notAKind: true });
  log(r2.ok === false && r2.reason === 'malformed', 'malformed event (no kind/ts) is rejected, not thrown');

  // unknown kind
  const r3 = await injector.inject({ kind: 'launch_nukes', ts: Date.now() });
  log(r3.ok === false && r3.reason === 'unknown_kind', 'unknown kind is rejected');

  // bad coordinates
  const r4 = await injector.inject({ kind: 'click', x: 'not-a-number', y: 5, ts: Date.now() });
  log(r4.ok === false && r4.reason === 'malformed_coordinates', 'non-numeric coordinates are rejected');

  // mousemove coalescing — fire 5 rapid moves, only the LAST position should reach the backend, once
  applied.length = 0;
  for (let i = 0; i < 5; i++) {
    await injector.inject({ kind: 'mousemove', x: i, y: i, ts: Date.now() });
  }
  await wait(60); // longer than coalesceMouseMoveMs
  const moveApplications = applied.filter((a) => a.kind === 'mousemove');
  log(moveApplications.length === 1, `5 rapid mousemoves coalesce to 1 backend call (got ${moveApplications.length})`);
  log(moveApplications[0]?.x === 4, 'the coalesced mousemove keeps the LAST position, not the first');

  // view-only lock
  injector.setLocked(true);
  log(injector.isLocked() === true, 'setLocked(true) actually locks');
  const r5 = await injector.inject({ kind: 'click', x: 1, y: 1, ts: Date.now() });
  log(r5.ok === false && r5.reason === 'view_only_locked', 'click is rejected while locked');
  injector.setLocked(false);
  const r6 = await injector.inject({ kind: 'click', x: 1, y: 1, ts: Date.now() });
  log(r6.ok === true, 'click succeeds again after unlocking');

  // rate limiting — maxPerSecond: 5, already used a few above in this same window
  const rateResults = [];
  for (let i = 0; i < 10; i++) {
    rateResults.push(await injector.inject({ kind: 'keydown', key: 'a', ts: Date.now() }));
  }
  log(rateResults.some((r) => r.ok === false && r.reason === 'rate_limited'), 'burst of input eventually hits the rate limiter');

  console.log(process.exitCode ? '\nFAILED' : '\nall passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
