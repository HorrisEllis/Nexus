/**
 * Event — a datum flowing through the stream.
 * Source: SISO Core v1.0.0 — siso-core-f0und4t10n-layer-0000-000000000001
 * Copied verbatim. §8.3 — SISO is a load-order prerequisite.
 */
export class Event {
  constructor(type, data = {}) {
    this.type = type;
    this.data = data;
  }
}
