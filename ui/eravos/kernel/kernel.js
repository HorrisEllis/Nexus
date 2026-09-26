/* ═══════════════════════════════════════════════════════════
   ERAVOS KERNEL  v3.0.0
   ═══════════════════════════════════════════════════════════

   Axioms (from ERAVOS.kernel.spec):
   K-1  Nothing exists until registered
   K-2  Nothing silently fails
   K-3  No organism touches another directly
   K-4  Every connection is a wire
   K-5  Wires owned by wire registry
   K-6  Every mutation recorded before it applies
   K-7  Contracts match before wire goes live
   K-8  Permissions enforced, never trusted
   K-9  Everything removable
   K-10 Spec is source of truth

   Exports:  window.KERNEL
   Requires: nothing
   ═══════════════════════════════════════════════════════════ */

window.KERNEL = (() => {
'use strict';

/* ──────────────────────────────────────────────────────────
   BUS  — publish/subscribe event backbone
   No organism talks to another organism directly.
   Everything goes through here.
────────────────────────────────────────────────────────── */
const _subs = {};

const bus = {
  publish(topic, payload = {}) {
    if (!topic) return;
    (_subs[topic] || []).slice().forEach(fn => {
      try { fn(payload); }
      catch(e) { _fault('RUNTIME_003', null, `bus handler error on ${topic}: ${e.message}`); }
    });
  },
  subscribe(topic, fn) {
    (_subs[topic] = _subs[topic] || []).push(fn);
    return () => { _subs[topic] = (_subs[topic] || []).filter(f => f !== fn); };
  },
  once(topic, fn) {
    const unsub = bus.subscribe(topic, payload => { unsub(); fn(payload); });
    return unsub;
  },
};

/* ──────────────────────────────────────────────────────────
   FAULT  — named, loud, traced (K-2)
────────────────────────────────────────────────────────── */
function _fault(code, organismId, message) {
  const entry = { code, organismId, message, timestamp: Date.now() };
  ledger._write({ type: 'fault_raised', ...entry });
  bus.publish('kernel:fault', entry);
  console.error(`[ERAVOS FAULT ${code}]${organismId ? ' organism:'+organismId : ''} ${message}`);
  return entry;
}

/* ──────────────────────────────────────────────────────────
   CAUSAL LEDGER  — append-only, every mutation recorded (K-6)
────────────────────────────────────────────────────────── */
const _ledgerEntries = [];

const ledger = {
  _write(entry) {
    _ledgerEntries.push({ ...entry, ts: Date.now() });
    bus.publish('kernel:ledger-entry', entry);
  },
  entries() { return _ledgerEntries.slice(); },
  since(ts)  { return _ledgerEntries.filter(e => e.ts >= ts); },
};

/* ──────────────────────────────────────────────────────────
   PERMISSION ENFORCER  (K-8)
   Granted permissions stored per organism instance.
   Kernel checks before any privileged operation.
────────────────────────────────────────────────────────── */
const _grants = new Map(); /* instanceId → Set<permission> */

const permissions = {
  grant(instanceId, permList) {
    _grants.set(instanceId, new Set(permList));
    ledger._write({ type: 'permissions_granted', instanceId, permissions: permList });
  },
  check(instanceId, perm) {
    const g = _grants.get(instanceId);
    if (!g || !g.has(perm)) {
      _fault('MOUNT_003', instanceId, `permission denied: ${perm}`);
      return false;
    }
    return true;
  },
  revoke(instanceId) {
    _grants.delete(instanceId);
  },
  list(instanceId) {
    return [...(_grants.get(instanceId) || [])];
  },
};

/* ──────────────────────────────────────────────────────────
   ORGANISM REGISTRY  (K-1, K-9)
   Everything that exists is registered here.
   If it's not here, it doesn't exist.
────────────────────────────────────────────────────────── */
const _organisms = new Map(); /* instanceId → descriptor */

const registry = {
  register(descriptor) {
    const { instanceId, id, label, hooks, permissions: perms, provides, requires } = descriptor;
    if (_organisms.has(instanceId)) {
      _fault('MOUNT_006', instanceId, `duplicate instance id: ${instanceId}`);
      return false;
    }
    _organisms.set(instanceId, {
      ...descriptor,
      mountedAt: Date.now(),
      state: 'mounted',
    });
    permissions.grant(instanceId, perms || []);
    ledger._write({ type: 'organism_mounted', instanceId, id, label });
    bus.publish('kernel:organism-mounted', { instanceId, id, label, provides });
    return true;
  },

  unregister(instanceId) {
    const org = _organisms.get(instanceId);
    if (!org) return false;
    wireRegistry.removeAll(instanceId);
    permissions.revoke(instanceId);
    _organisms.delete(instanceId);
    ledger._write({ type: 'organism_unmounted', instanceId, id: org.id });
    bus.publish('kernel:organism-unmounted', { instanceId, id: org.id });
    return true;
  },

  get(instanceId)   { return _organisms.get(instanceId) || null; },
  getById(id)       { return [..._organisms.values()].filter(o => o.id === id); },
  all()             { return [..._organisms.values()]; },
  has(instanceId)   { return _organisms.has(instanceId); },

  /* Check all required capabilities are satisfied */
  checkRequires(requires = []) {
    const provided = new Set();
    _organisms.forEach(org => (org.provides || []).forEach(c => provided.add(c)));
    const missing = requires.filter(r => !provided.has(r));
    return { ok: missing.length === 0, missing };
  },
};

/* ──────────────────────────────────────────────────────────
   WIRE REGISTRY  (K-4, K-5, K-7)
   Wires connect hooks between organisms.
   Validates contract versions before going live.
   Owned here — never by organisms.
────────────────────────────────────────────────────────── */
const _wires = new Map(); /* wireId → descriptor */

const wireRegistry = {
  register(wire) {
    const { sourceInstanceId, sourceHookId, targetInstanceId, targetHookId, wireType = 'event_bus' } = wire;

    /* Validate both endpoints exist */
    if (!registry.has(sourceInstanceId)) {
      _fault('WIRE_002', sourceInstanceId, `source organism not found: ${sourceInstanceId}`);
      return null;
    }
    if (!registry.has(targetInstanceId)) {
      _fault('WIRE_002', targetInstanceId, `target organism not found: ${targetInstanceId}`);
      return null;
    }

    /* Validate hook contract versions if both declare them */
    const src = registry.get(sourceInstanceId);
    const tgt = registry.get(targetInstanceId);
    const srcHook = (src.hooks || []).find(h => h.hook_id === sourceHookId);
    const tgtHook = (tgt.hooks || []).find(h => h.hook_id === targetHookId);
    if (srcHook && tgtHook && srcHook.contract_version && tgtHook.contract_version) {
      if (srcHook.contract_version !== tgtHook.contract_version) {
        _fault('WIRE_001', sourceInstanceId,
          `contract version mismatch: ${srcHook.contract_version} vs ${tgtHook.contract_version}`);
        return null;
      }
    }

    /* No duplicate */
    const key = `${sourceInstanceId}:${sourceHookId}→${targetInstanceId}:${targetHookId}`;
    if ([..._wires.values()].find(w => w.key === key)) {
      _fault('WIRE_004', sourceInstanceId, `duplicate wire: ${key}`);
      return null;
    }

    const wireId = _uuid();
    _wires.set(wireId, {
      wireId, key, wireType,
      sourceInstanceId, sourceHookId,
      targetInstanceId, targetHookId,
      registeredAt: Date.now(),
    });

    ledger._write({ type: 'wire_registered', wireId, sourceInstanceId, sourceHookId, targetInstanceId, targetHookId });
    bus.publish('kernel:wire-registered', { wireId, sourceInstanceId, targetInstanceId });
    return wireId;
  },

  remove(wireId) {
    const wire = _wires.get(wireId);
    if (!wire) return false;
    _wires.delete(wireId);
    ledger._write({ type: 'wire_removed', wireId });
    bus.publish('kernel:wire-removed', { wireId });
    return true;
  },

  removeAll(instanceId) {
    const toRemove = [..._wires.entries()]
      .filter(([, w]) => w.sourceInstanceId === instanceId || w.targetInstanceId === instanceId)
      .map(([id]) => id);
    toRemove.forEach(id => this.remove(id));
  },

  get(wireId)    { return _wires.get(wireId) || null; },
  all()          { return [..._wires.values()]; },
  forOrganism(instanceId) {
    return [..._wires.values()].filter(
      w => w.sourceInstanceId === instanceId || w.targetInstanceId === instanceId
    );
  },
};

/* ──────────────────────────────────────────────────────────
   AUDIO  — single AudioContext, node factories, master bus
────────────────────────────────────────────────────────── */
let _AC = null;
let _masterGain = null;
let _reverbNode = null;
let _delayNode  = null;
let _compressor = null;

const audio = {
  get AC() { return _AC; },
  get dry() { return _masterGain; },

  boot() {
    if (_AC) return _AC;
    _AC = new (window.AudioContext || window.webkitAudioContext)();
    _compressor  = _AC.createDynamicsCompressor();
    _masterGain  = _AC.createGain(); _masterGain.gain.value = 0.88;
    _reverbNode  = _AC.createConvolver();
    _delayNode   = _AC.createDelay(2.0);
    _masterGain.connect(_compressor);
    _compressor.connect(_AC.destination);
    bus.publish('kernel:audio-ready', { sampleRate: _AC.sampleRate });
    return _AC;
  },

  osc(freq = 440, type = 'sine') {
    if (!_AC) this.boot();
    const o = _AC.createOscillator(); o.type = type; o.frequency.value = freq; return o;
  },
  gain(val = 1) {
    if (!_AC) this.boot();
    const g = _AC.createGain(); g.gain.value = val; return g;
  },
  filter(type = 'lowpass', freq = 1000, Q = 1) {
    if (!_AC) this.boot();
    const f = _AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f;
  },
  noise(dur = 0.1) {
    if (!_AC) this.boot();
    const len = Math.ceil(_AC.sampleRate * dur);
    const buf = _AC.createBuffer(1, len, _AC.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const s = _AC.createBufferSource(); s.buffer = buf; return s;
  },
  send(node, withReverb = false, withDelay = false, withComp = false) {
    if (!_masterGain) this.boot();
    node.connect(withComp ? _compressor : _masterGain);
  },
  analyser() {
    if (!_AC) this.boot();
    const a = _AC.createAnalyser(); a.fftSize = 256;
    _masterGain.connect(a);
    return a;
  },
};

/* ──────────────────────────────────────────────────────────
   CLOCK  — master BPM, step timing
────────────────────────────────────────────────────────── */
let _bpm = 128;

const clock = {
  get BPM()    { return _bpm; },
  set BPM(v)   {
    _bpm = Math.max(40, Math.min(240, Math.round(v)));
    bus.publish('kernel:bpm-change', { BPM: _bpm });
  },
  stepMs(swing = false, stepIdx = 0) {
    const base = (60 / _bpm / 4) * 1000;
    if (!swing) return base;
    return stepIdx % 2 === 0 ? base * 1.12 : base * 0.88;
  },
  beatSec()  { return 60 / _bpm; },
  barSec()   { return (60 / _bpm) * 4; },
};

/* ──────────────────────────────────────────────────────────
   MANIFEST PARSER  — reads pack manifest.json
────────────────────────────────────────────────────────── */
const manifestParser = {
  validate(manifest) {
    const required = ['manifest_version', 'pack_id', 'pack_type', 'permissions', 'contents'];
    const missing  = required.filter(k => !(k in manifest));
    if (missing.length) {
      _fault('MOUNT_005', null, `manifest missing required fields: ${missing.join(', ')}`);
      return false;
    }
    return true;
  },

  parse(jsonText) {
    try {
      const m = JSON.parse(jsonText);
      if (!this.validate(m)) return null;
      return m;
    } catch(e) {
      _fault('MOUNT_005', null, `manifest JSON parse failed: ${e.message}`);
      return null;
    }
  },
};

/* ──────────────────────────────────────────────────────────
   ZIP IMPORTER  — handles drop-in zip install
   Reads manifest.json, validates, checks permissions,
   routes to organism spawner.
────────────────────────────────────────────────────────── */
const zipImporter = {
  async install(arrayBuffer, dropPos, onPermissionRequest) {
    /* Read zip — use JSZip if available, otherwise treat as signal */
    let manifest = null;
    let files    = {};

    if (window.JSZip) {
      try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const mf  = zip.file('manifest.json');
        if (!mf) { _fault('MOUNT_005', null, 'manifest.json not found in zip'); return null; }
        const mfText = await mf.async('string');
        manifest = manifestParser.parse(mfText);
        if (!manifest) return null;
        /* Read all declared files */
        for (const [role, path] of Object.entries(manifest.contents?.ui || {})) {
          const f = zip.file(path);
          if (f) files[path] = await f.async('string');
        }
      } catch(e) {
        _fault('ASSET_001', null, `zip read failed: ${e.message}`);
        return null;
      }
    } else {
      _fault('ASSET_001', null, 'JSZip not available — zip install requires JSZip');
      return null;
    }

    /* Check kernel_target */
    if (manifest.kernel_target && manifest.kernel_target > '3.0.0') {
      _fault('MOUNT_004', null, `requires kernel ${manifest.kernel_target}, running 3.0.0`);
      return null;
    }

    /* Request permissions */
    const perms = manifest.permissions || [];
    if (perms.length > 0 && onPermissionRequest) {
      const granted = await onPermissionRequest(manifest.pack_id, manifest.label, perms);
      if (!granted) {
        _fault('MOUNT_003', null, `user denied permissions for ${manifest.pack_id}`);
        return null;
      }
    }

    /* Check requires */
    const req = manifest.requires || [];
    if (req.length) {
      const { ok, missing } = registry.checkRequires(req);
      if (!ok) {
        _fault('MOUNT_002', null, `missing capabilities: ${missing.join(', ')}`);
        return null;
      }
    }

    ledger._write({ type: 'pack_installed', packId: manifest.pack_id, label: manifest.label });
    bus.publish('kernel:pack-installed', { packId: manifest.pack_id, manifest, files, dropPos });
    return { manifest, files };
  },
};

/* ──────────────────────────────────────────────────────────
   INTERACTION CONTRACT BRIDGE
   Validates event schemas on the UI ↔ organism boundary.
   UI publishes ui:* events. Organism publishes org:* events.
   Both validated here before delivery.
────────────────────────────────────────────────────────── */
const _uiSchemas = new Map(); /* eventType → schema */

const contractBridge = {
  registerSchema(eventType, schema) {
    _uiSchemas.set(eventType, schema);
  },
  validate(eventType, payload) {
    const schema = _uiSchemas.get(eventType);
    if (!schema) return true; /* no schema registered = pass */
    /* Basic required field check */
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in payload)) {
          _fault('RUNTIME_002', null, `${eventType} missing required field: ${key}`);
          return false;
        }
      }
    }
    return true;
  },
  /* Wrap bus.publish with contract validation */
  publish(eventType, payload, instanceId) {
    if (!this.validate(eventType, payload)) return;
    bus.publish(eventType, payload);
  },
};

/* ──────────────────────────────────────────────────────────
   UTIL
────────────────────────────────────────────────────────── */
function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ──────────────────────────────────────────────────────────
   PUBLIC API
────────────────────────────────────────────────────────── */
return {
  /* Core primitives */
  bus,
  audio,
  clock,
  ledger,
  permissions,

  /* Registries */
  registry,
  wireRegistry,

  /* Install */
  zipImporter,
  manifestParser,

  /* Contract */
  contractBridge,

  /* Fault */
  fault: _fault,

  /* Util */
  uuid: _uuid,

  /* Version */
  version: '3.0.0',
};

})();
