/**
 * siso/index.js
 * COMPARTMENT OS — SISO Core barrel export (CJS)
 *
 * §SWITCHED TO WARP 2026-07-11 — "NEXUS imports WARP, never reverse" is
 * already a stated design law; this file forking its own copy of
 * Event/Stream/StreamLog violated it from the start. Checked before
 * switching, not assumed safe: cos's Stream/StreamLog had real,
 * load-bearing extensions (tail/since/deregister/subscribeSSE/sampleHere,
 * level-based logging) that warp's didn't — cos/host/event-bus.js,
 * cos/test.js, and two real CLI commands (events.js, vault.js) all
 * depend on them. Ported those extensions into warp/core/Stream.js and
 * warp/core/StreamLog.js additively (warp's own 43-test suite verified
 * green before and after), then pointed this file at warp instead of
 * cos's own copies.
 *
 * Gate.js is the one exception, kept as cos's own: cos's 30+ real gates
 * (cos/host/gates/*.js) subclass it directly (constructor(signature) +
 * override transform(event, stream)) — a completely different
 * construction pattern from warp's Gate (constructor-injected
 * transform/matches/schema). Rewriting 30+ real gates to a different
 * construction pattern is a separate, much larger piece of work than
 * "stop forking the primitives" — not attempted here. Warp's Stream.emit()
 * was changed to call gate.transform(event, this) — passing the stream as
 * a second argument is a no-op for any of warp's own gates (they only
 * declare one parameter) and is what cos's gates need to call
 * stream.emit(...) imperatively from inside their own transform.
 *
 * The four primitives. No dependencies beyond COS foundation/constants.js
 * (Gate.js only — Event/Stream/StreamLog now depend on warp/core instead).
 * Everything in COS that processes events is built from these.
 *
 * →E→E→
 */

'use strict';

const { Event }     = require('../../warp/core/Event.js');
const { Gate }      = require('./Gate.js');
const { Stream }    = require('../../warp/core/Stream.js');
const { StreamLog } = require('../../warp/core/StreamLog.js');

module.exports = { Event, Gate, Stream, StreamLog };
