// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * BRIDGE OS — MODULE/MAGNET v2
 * Drop-in replacement for bridge-magnet/index.js.
 *
 * Identical public API to v1 (Magnet.init / Magnet.cascade / Magnet.parse).
 * Zero breaking changes — boot.js Phase 7d call is unchanged.
 *
 * What's new vs the in-tree v1:
 *   • Steps 3–4 (DDNS + GOSSIP sequential) replaced with codec-accelerated
 *     parallel resolution when BridgeCodecRuntime is injected as third arg.
 *   • Proactive pulse-cache warming from AdaptivePulse codec:pulse beats.
 *   • Speculative DHT short-circuit via SpeculativeLookup adjacency graph.
 *   • Full v1 fallback when runtime is absent — zero regression.
 *
 * Cascade labels (unchanged):
 *   DIRECT → LOCAL → LAN → FAST (graph hit) → PARALLEL (DDNS+GOSSIP) → HINT → RELAY
 *
 * Integration (boot.js Phase 7d — see below for the updated call):
 *
 *   const Codec = tryRequire('../bridge-codec-v3');
 *   // runtime is created once, shared with SNRouter:
 *   const codecRuntime = Codec ? new Codec.BridgeCodecRuntime({ bus: busShim }) : null;
 *   if (Magnet?.init) {
 *     Magnet.init(busShim, { peers: [] }, codecRuntime);
 *   }
 *
 * If runtime is null/undefined, Magnet behaves exactly as v1.
 */

const Magnet = {
  bus:         null,
  _node:       null,
  _runtime:    null,       // BridgeCodecRuntime — injected at init, optional
  _pulseCache: new Map(),  // uuid → { addr, ts, latencyMs, grade }

  // ── init ────────────────────────────────────────────────────────────────────

  /**
   * @param {object} bus       — Bridge OS event bus ({ emit, on })
   * @param {object} node      — nodeState with .peers array
   * @param {object} [runtime] — BridgeCodecRuntime instance (optional)
   */
  init(bus, node, runtime = null) {
    Magnet.bus      = bus;
    Magnet._node    = node || null;
    Magnet._runtime = runtime || null;

    // ── Passive pulse-cache population (v1 sources, unchanged) ───────────────

    bus.on('peer:seen', ({ uuid, address, port }) => {
      if (uuid && address) {
        Magnet._cacheSet(uuid, `${address}:${port || 3747}`);
      }
    });

    bus.on('mesh:incoming_pulse', (packet, rinfo) => {
      if (packet.type === 'PULSE' && packet.uuid && rinfo) {
        Magnet._cacheSet(packet.uuid, `${rinfo.address}:${packet.port || rinfo.port || 3747}`);
      }
    });

    // ── Proactive pulse-cache warming (v2 — noop when no runtime) ────────────
    // AdaptivePulse emits codec:pulse on every beat. Successful beats enrich
    // existing cache entries with fresh latency data, giving the LAN step
    // a hit even when no explicit peer:seen event has fired.

    if (runtime) {
      bus.on('codec:pulse', ({ nodeId, ok, latencyMs, latencyGrade: grade }) => {
        if (!ok || !nodeId) return;
        const existing = Magnet._pulseCache.get(nodeId);
        if (existing) {
          Magnet._pulseCache.set(nodeId, {
            ...existing,
            ts:        Date.now(),
            latencyMs: latencyMs ?? existing.latencyMs,
            grade:     grade     ?? existing.grade,
          });
        }
        // Node is alive but addr unknown — a later LOCAL/DDNS hit will set it.
      });

      // When SpeculativeLookup produces a high-confidence address, cache it
      // so the LAN step can return it on the next resolve without going to DHT.
      bus.on('codec:lookup:speculative', ({ targetUuid, address, confidence }) => {
        if (address && confidence > 0.7 && address.includes(':')) {
          const existing = Magnet._pulseCache.get(targetUuid);
          if (!existing?.addr) Magnet._cacheSet(targetUuid, address);
        }
      });

      // Feed every real transport outcome into the oracle for adapter pre-selection.
      bus.on('transport:sent', ({ peerId, transport, latencyMs }) => {
        if (transport && latencyMs != null) {
          runtime.recordTransport(transport, 'ok', latencyMs);
        }
      });
    }

    // ── Bus interface (unchanged from v1) ─────────────────────────────────────

    bus.on('mesh:peer:get', (uuidOrShort, cb) => {
      if (typeof cb !== 'function') return;
      const peers = (Magnet._node && Magnet._node.peers) || [];
      const peer  = peers.find(p =>
        p.uuid === uuidOrShort ||
        (p.uuid && p.uuid.startsWith(uuidOrShort))
      );
      cb(peer ? { addr: `${peer.address}:${peer.port || 3747}` } : null);
    });

    bus.on('mesh:pulse:lookup', (uuidOrShort, cb) => {
      if (typeof cb !== 'function') return;
      cb(Magnet._cacheGet(uuidOrShort));
    });

    bus.on('mesh:gossip:query', (uuid, cb) => {
      if (typeof cb === 'function') cb(null); // stub — unchanged
    });

    bus.on('magnet:resolve', async (uri, callback) => {
      if (typeof callback !== 'function') return;
      try {
        const params     = Magnet.parse(uri);
        const resolution = await Magnet.cascade(params);
        callback({ success: true, resolution });
      } catch (e) {
        callback({ success: false, error: e.message });
      }
    });
  },

  // ── cascade ──────────────────────────────────────────────────────────────────
  // Steps 0–2 and 5–6 identical to v1.
  // Steps 3–4 replaced with codec-accelerated resolution when runtime present.

  async cascade(params) {
    const { uuid } = params;

    // 0. DIRECT — @ip:port in URI
    if (params.ip) {
      return { ...params, route: 'DIRECT', addr: `${params.ip}:${params.port || 3747}` };
    }

    // 1. LOCAL — already a connected peer
    const local = await Magnet.request('mesh:peer:get', uuid);
    if (local) return { ...params, route: 'LOCAL', addr: local.addr };

    // 2. LAN — pulse cache (now proactively warmed by AdaptivePulse beats)
    const lan = await Magnet.request('mesh:pulse:lookup', uuid);
    if (lan) return { ...params, route: 'LAN', addr: lan.addr, latencyMs: lan.latencyMs };

    // 3–4. FAST + PARALLEL — codec-accelerated or v1 sequential fallback
    const resolved = Magnet._runtime
      ? await Magnet._resolveAccelerated(params)
      : await Magnet._resolveSequential(params);
    if (resolved) return resolved;

    // 5. HINT
    if (params.hint)  return { ...params, route: 'HINT',  addr: params.hint };

    // 6. RELAY
    if (params.relay) return { ...params, route: 'RELAY', via: params.relay };

    throw new Error(`NODE_UNREACHABLE: ${uuid.slice(0, 8)}`);
  },

  // ── _resolveAccelerated ───────────────────────────────────────────────────────
  // Step 3: check SpeculativeLookup adjacency graph (0 ms if warm).
  // Step 4: fire DDNS + GOSSIP probes in parallel; exit early when
  //         ConfidencePropagator joint confidence > DHT_CONFIDENCE_STOP (0.85).
  //
  // Worst-case latency: 2 000 ms (one parallel probe window, not two sequential).
  // Warm node latency:  0–150 ms.

  async _resolveAccelerated(params) {
    const { uuid } = params;
    const runtime  = Magnet._runtime;

    // Step 3: FAST — adjacency graph short-circuit
    const specResult = runtime.lookup.speculate(uuid);
    if (specResult?.skip && specResult.directPeer) {
      const cached = Magnet._cacheGet(specResult.directPeer);
      if (cached) {
        return {
          ...params,
          route:      'FAST',
          addr:       cached.addr,
          confidence: specResult.confidence,
          via:        specResult.directPeer,
        };
      }
    }

    // Step 4: PARALLEL — DDNS + GOSSIP race
    const result = await runtime.speculateDHT(uuid, async (target) => {
      // Probe A: DDNS
      const ddns = await Magnet.request('dns:resolve', `${target.slice(0, 8)}.nexus.mesh`);
      if (ddns) { Magnet._cacheSet(target, ddns); return [target]; }
      // Probe B: GOSSIP
      const gossip = await Magnet.request('mesh:gossip:query', target);
      if (gossip) { Magnet._cacheSet(target, gossip); return [target]; }
      return [];
    });

    if (result.address) {
      const cached = Magnet._cacheGet(result.address);
      return {
        ...params,
        route:      result.speculated ? 'FAST' : 'PARALLEL',
        addr:       cached?.addr ?? result.address,
        confidence: result.confidence,
        hops:       result.hops,
      };
    }

    return null;
  },

  // ── _resolveSequential ────────────────────────────────────────────────────────
  // v1 exact behavior — used when no runtime is injected.

  async _resolveSequential(params) {
    const { uuid } = params;
    const ddns = await Magnet.request('dns:resolve', `${uuid.slice(0, 8)}.nexus.mesh`);
    if (ddns) return { ...params, route: 'DDNS', addr: ddns };
    const gossip = await Magnet.request('mesh:gossip:query', uuid);
    if (gossip) return { ...params, route: 'GOSSIP', addr: gossip };
    return null;
  },

  // ── parse ─────────────────────────────────────────────────────────────────────
  // Unchanged from v1.

  parse(uri) {
    const match = uri.match(/^nexus:\/\/([a-f0-9-]{8,})(?:@([^?]+))?(?:\?(.*))?$/i);
    if (!match) throw new Error(`MALFORMED_URI: ${uri}`);
    const [, uuid, host, qs] = match;
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const [ip, portStr] = (host || '').split(':');
    return {
      uuid,
      ip:    ip      || null,
      port:  portStr ? parseInt(portStr, 10) : 3747,
      pk:    params.pk    || null,
      relay: params.relay || null,
      hint:  params.hint  || null,
      sig:   params.sig   || null,
    };
  },

  // ── request ───────────────────────────────────────────────────────────────────
  // Unchanged from v1. 2 000 ms timeout per call.

  request(event, data) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(null); }
      }, 2000);
      Magnet.bus.emit(event, data, (res) => {
        if (!done) { done = true; clearTimeout(timer); resolve(res); }
      });
    });
  },

  // ── pulse-cache helpers ───────────────────────────────────────────────────────

  _cacheSet(uuid, addr, extra = {}) {
    Magnet._pulseCache.set(uuid, { addr, ts: Date.now(), ...extra });
    const short = uuid.replace(/-/g, '').slice(0, 8);
    if (short !== uuid) Magnet._pulseCache.set(short, { addr, ts: Date.now(), ...extra });
  },

  _cacheGet(uuidOrShort) {
    let hit = Magnet._pulseCache.get(uuidOrShort);
    if (!hit) {
      for (const [key, val] of Magnet._pulseCache) {
        if (key.startsWith(uuidOrShort)) { hit = val; break; }
      }
    }
    return hit && (Date.now() - hit.ts < 60_000) ? hit : null;
  },

  // ── diagnostics ───────────────────────────────────────────────────────────────

  cacheSize()     { return Magnet._pulseCache.size; },
  cacheSnapshot() {
    const out = {};
    for (const [k, v] of Magnet._pulseCache) {
      if (Date.now() - v.ts < 60_000) out[k] = v;
    }
    return out;
  },
};

module.exports = Magnet;
