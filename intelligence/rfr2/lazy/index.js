/**
 * meta/rfr2/lazy/index.js — Lazy evaluation utilities stub
 * UUID: nexus-rfr2-lazy-v1-0000-2026-0702-stub
 * 
 * This module was referenced by rfr2/delta/index.js but was not included
 * in the rfr2-nexus upload. Providing the expected export shapes as stubs
 * so rfr2 can be imported — the functions are no-ops until the real
 * implementation is provided.
 */

function eventTsToWindow(event, windowMs) {
  if (!event || !event.ts) return null;
  return Math.floor(event.ts / (windowMs || 1000));
}

function lazy(fn) {
  let computed = false, value;
  return () => {
    if (!computed) { value = fn(); computed = true; }
    return value;
  };
}

module.exports = { eventTsToWindow, lazy };
