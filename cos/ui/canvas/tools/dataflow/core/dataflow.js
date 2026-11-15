/* ERAVOS dataflow domain — core/data.js (spec tools/dataflow/domain.spec)
 * One dataflow plane for every domain. A tool declares typed ports; a wire of type "dataflow" carries the latest value
 * from an out port to every in port wired to it — point-to-point, never a broadcast.
 * Built-in types: text · json · number · trigger · image ({ width, height, bitmap }).
 *   K.data.defineType(name, { label, color?, validate(v) → error|null, size?(v) })   a domain adds a value type
 *   K.data.send(instanceId, portId, value, meta?)  → number of receivers           (validated against the port's type)
 *   K.data.last(instanceId, portId)                 the last value sent on an out port (a new wire delivers it at once)
 * Tool side (OrganismSDK extension "dataflow"):
 *   ctx.dataOut(portId, { type, label })  → send(value, meta)         STD.data_out(hook_id, port, type, intent)
 *   ctx.dataIn(portId, { accepts, label }, fn(value, meta))           STD.data_in(hook_id, port, accepts, intent)
 * Guarantees: values are validated on send (a wrong type is a plain fault, never delivered); each delivery runs in
 * its own microtask (one receiver failing never stops the others); a value that goes round a loop more than 32 hops
 * in one burst is stopped and said (feedback guard); unwiring stops delivery at once. */
(function (global) {
  'use strict';
  const DATA = 'dataflow';
  const BUILTIN = {
    text: { label: 'Text', color: '#ffd166', validate: (v) => typeof v === 'string' ? null : 'text expected' , size: (v) => v.length },
    json: { label: 'JSON', color: '#c9a2ff', validate: (v) => { if (v === undefined) return 'a value expected'; try { JSON.stringify(v); return null; } catch (e) { return 'not JSON-safe: ' + e.message; } } },
    number: { label: 'Number', color: '#7cc4ff', validate: (v) => typeof v === 'number' && Number.isFinite(v) ? null : 'a finite number expected' },
    trigger: { label: 'Trigger', color: '#ff7a59', validate: () => null },
    // a picture: { width, height, bitmap: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, at?: seconds } — what image,
    // video and any visual tool hand each other (the receiver draws it; it never needs to know who made it)
    image: { label: 'Image', color: '#6ee7f2', validate: (v) => v && v.width > 0 && v.height > 0 && v.bitmap && typeof v.bitmap === 'object' ? null : 'an image { width, height, bitmap } expected' },
  };
  const MAX_HOPS = 32;

  function install(K) {
    const types = new Map(Object.entries(BUILTIN));
    const routes = new Map(); // wire_id → { sp, dp }
    // causality for the loop guard: a tool that answers LATER (a worker, a network call) still carries the hop count of
    // what it last received — so a loop through asynchronous tools is caught too, not only a synchronous one
    const inHops = new Map(), HOP_WINDOW = 5000;
    const accepts = (dp, t) => { const a = [].concat(dp.accepts || ['*']); return a.includes('*') || a.includes(t); };
    K.ports.defineKind(DATA, {
      permission: () => null,
      validate: (spec, dir) => dir === 'out' ? (spec.type && types.has(spec.type) ? null : `data out needs a known type (${Array.from(types.keys()).join(', ')})`)
        : ([].concat(spec.accepts || ['*']).every(t => t === '*' || types.has(t)) ? null : 'data in: unknown accepted type'),
      onRegister(port) { port.last = undefined; },
      onRemove(port) { routes.forEach((r, id) => { if (r.sp === port || r.dp === port) routes.delete(id); }); },
    });
    function deliver(dp, value, meta) {
      Promise.resolve().then(() => {
        if (typeof dp.onValue !== 'function') return;
        inHops.set(dp.instance_id, { hops: (meta && meta.hops) || 0, at: Date.now() });
        try { dp.onValue(value, meta); } catch (e) { K.fault('RUNTIME_003', { instance_id: dp.instance_id, message: `${dp.label || dp.port_id} could not use what arrived: ${e.message}` }); }
      });
    }
    K.wires.defineType(DATA, {
      color: '#c9a2ff',
      compatible(sh, th) { const t = sh.data_type; return !t || [].concat(th.accepts || ['*']).some(a => a === '*' || a === t); },
      connect(wire_id, sp, dp) {
        if (!accepts(dp, sp.type)) return { ok: false, fault: K.fault('WIRE_005', { message: `${dp.label || dp.port_id} takes ${[].concat(dp.accepts).join(' / ')}, not ${sp.type}` }) };
        routes.set(wire_id, { sp, dp });
        if (sp.last !== undefined) deliver(dp, sp.last, { from: sp.instance_id, port: sp.port_id, type: sp.type, hops: 0, replay: true });
        return { ok: true };
      },
      disconnect(wire_id) { routes.delete(wire_id); },
    });
    K.data = {
      types: () => Array.from(types.entries()).map(([name, t]) => ({ name, label: t.label, color: t.color })),
      defineType(name, t) { if (!/^[a-z][a-z0-9-]*$/.test(name) || types.has(name)) { K.fault('DOMAIN_002', { message: `data type ${name} already exists or is not lower-case` }); return false; } types.set(name, Object.assign({ label: name, validate: () => null }, t)); return true; },
      send(instanceId, portId, value, meta) {
        const sp = K.ports.get(instanceId, portId);
        if (!sp || sp.kind !== DATA || sp.direction !== 'out') { K.fault('PORT_001', { instance_id: instanceId, message: `no data output "${portId}"` }); return 0; }
        const t = types.get(sp.type), err = t && t.validate ? t.validate(value) : null;
        if (err) { K.fault('RUNTIME_002', { instance_id: instanceId, message: `${sp.label || portId}: ${err}` }); return 0; }
        const prev = inHops.get(instanceId), hops = meta && meta.hops !== undefined ? meta.hops : (prev && Date.now() - prev.at < HOP_WINDOW ? prev.hops : 0);
        if (hops > MAX_HOPS) { K.fault('RUNTIME_004', { instance_id: instanceId, message: `values are going round in a loop (more than ${MAX_HOPS} hops) — stopped. Remove one wire of the loop.` }); return 0; }
        sp.last = value; let n = 0;
        routes.forEach(r => { if (r.sp === sp) { n++; deliver(r.dp, value, Object.assign({}, meta || {}, { from: instanceId, port: portId, type: sp.type, hops: hops + 1 })); } });
        return n;
      },
      last: (instanceId, portId) => { const p = K.ports.get(instanceId, portId); return p ? p.last : undefined; },
      routes: () => Array.from(routes.entries()).map(([id, r]) => ({ wire_id: id, from: r.sp.instance_id + '/' + r.sp.port_id, to: r.dp.instance_id + '/' + r.dp.port_id })),
    };
  }

  // tool side
  global.OrganismSDK.extend({
    id: DATA,
    std: {
      data_out: (hook_id, port, type, intent) => ({ hook_id, hook_type: 'emitter', direction: 'out', wire_type: DATA, port: port || 'out', data_type: type, event_type: 'dataflow', contract_version: '1.0.0', schema: {}, failure_mode: 'RUNTIME_002', intent: intent || (type + ' out') }),
      data_in: (hook_id, port, accepts, intent) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: DATA, port: port || 'in', accepts: [].concat(accepts || ['*']), event_type: 'dataflow', contract_version: '1.0.0', schema: {}, failure_mode: 'RUNTIME_002', intent: intent || ([].concat(accepts || ['anything']).join(' / ') + ' in') }),
    },
    ctx(ctx) {
      const K = ctx.K; if (!K.data) return;
      ctx.dataOut = (portId, o) => { ctx.port(portId, Object.assign({ kind: DATA, direction: 'out' }, o)); return (value, meta) => ctx.disposed ? 0 : K.data.send(ctx.id, portId, value, meta); };
      ctx.dataIn = (portId, o, fn) => { const p = ctx.port(portId, Object.assign({ kind: DATA, direction: 'in' }, o)); p.onValue = (v, meta) => { if (!ctx.disposed) fn(v, meta); }; return p; };
    },
  });
  global.Kernel.use({ id: DATA, version: '1.0.0', label: 'Data', install });
})(typeof window !== 'undefined' ? window : globalThis);
