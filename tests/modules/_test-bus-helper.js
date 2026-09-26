'use strict';
// tests/modules/_test-bus-helper.js — shared mock bus for organ tests
// UUID: nexus-test-bus-helper-v1-0000-2026-0720-001
//
// §17.7 — this is the second-occurrence fix flagged in Phase 2's phase map.
// Two separate organs (liminal-space's drift-signal listener, escalation's
// anomaly listener) shipped with the same class of bug — a handler reading
// straight off the event instead of event.payload — and it slipped through
// unit tests both times because each test file hand-rolled its own flat
// mock bus that didn't replicate nexus-bus.js's real envelope. This is the
// shared fix: every organ test from here on requires this instead of
// rolling its own, so a payload-shape bug fails the unit test, not just an
// ad-hoc integration check written after the fact.
//
// Matches nexus-bus.js's real emit(type, payload, meta) contract exactly:
// listeners receive { type, payload, source, causedBy, ts, id }.

function makeTestBus() {
  const handlers = {};
  let seq = 0;
  const bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return bus; },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter(h => h !== fn); return bus; },
    emit(type, payload = {}, meta = {}) {
      const event = {
        type, payload,
        source: meta.source ?? 'test',
        causedBy: meta.causedBy ?? null,
        ts: Date.now(),
        id: `test-${++seq}`,
      };
      (handlers[type] || []).forEach(h => h(event));
      (handlers['*'] || []).forEach(h => h(event));
      return event;
    },
    listenerCount(ev) { return (handlers[ev] || []).length; },
    _handlers: handlers,
  };
  return bus;
}

module.exports = { makeTestBus };
