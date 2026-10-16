/* ERAVOS test harness — minimal describe/it with async, run in Chromium (tests/run.html) */
(function (global) {
  'use strict';
  const suites = [];
  let cur = null;
  global.describe = function (name, fn) { const s = { name, tests: [], phase: global.__phase || '' }; suites.push(s); const prev = cur; cur = s; fn(); cur = prev; };
  global.it = function (name, fn, opts) { cur.tests.push({ name, fn, opts: opts || {} }); };
  function AssertionError(msg) { const e = new Error(msg); e.name = 'AssertionError'; return e; }
  global.assert = {
    ok(v, msg) { if (!v) throw AssertionError(msg || 'expected truthy'); },
    equal(a, b, msg) { if (a !== b) throw AssertionError((msg ? msg + ': ' : '') + `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); },
    deepEqual(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw AssertionError((msg ? msg + ': ' : '') + `${A} ≠ ${B}`); },
    near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw AssertionError((msg ? msg + ': ' : '') + `${a} not within ${tol} of ${b}`); },
    lt(a, b, msg) { if (!(a < b)) throw AssertionError((msg ? msg + ': ' : '') + `${a} !< ${b}`); },
    gt(a, b, msg) { if (!(a > b)) throw AssertionError((msg ? msg + ': ' : '') + `${a} !> ${b}`); },
    fault(K, cls, fn, msg) { const n0 = K.faults.list(cls).length; const r = fn(); const n1 = K.faults.list(cls).length; if (n1 <= n0) throw AssertionError((msg ? msg + ': ' : '') + `expected fault ${cls}`); return r; },
    noFault(K, fn, msg) { const n0 = K.faults.list().length; const r = fn(); const n1 = K.faults.list().length; if (n1 > n0) throw AssertionError((msg ? msg + ': ' : '') + `unexpected fault ${JSON.stringify(K.faults.list().slice(n0).map(f => f.fault_class + ' ' + f.message))}`); return r; },
  };

  // ---- helpers
  const SR = 48000;
  global.TH = {
    SR,
    // new offline universe with transport, quiet faults
    universe(seconds, o) {
      o = o || {};
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * (seconds || 2)), SR);
      const K = Kernel.create({ ctx, quiet: true, syncIR: true, permissions: o.permissions });
      const T = MasterTransport.create(K, { offline: true, bpm: o.bpm || 120 });
      T.boot();
      return { K, T, ctx };
    },
    spawn(U, id, o) { const inst = OrganismFactory.spawn(id, Object.assign({ K: U.K, headless: true }, o || {})); if (!inst) throw new Error('spawn failed ' + id + ' ' + JSON.stringify(U.K.faults.list().slice(-1))); return inst; },
    async render(U) { return await U.ctx.startRendering(); },
    rms(buf, from, to, ch) {
      const d = buf.getChannelData(ch || 0); const s = Math.floor((from || 0) * buf.sampleRate), e = Math.min(d.length, Math.floor((to === undefined ? buf.duration : to) * buf.sampleRate));
      let q = 0; for (let i = s; i < e; i++) q += d[i] * d[i]; return Math.sqrt(q / Math.max(1, e - s));
    },
    peak(buf, from, to, ch) { const d = buf.getChannelData(ch || 0); const s = Math.floor((from || 0) * buf.sampleRate), e = Math.min(d.length, Math.floor((to === undefined ? buf.duration : to) * buf.sampleRate)); let p = 0; for (let i = s; i < e; i++) p = Math.max(p, Math.abs(d[i])); return p; },
    db: (x) => 20 * Math.log10(Math.max(1e-12, x)),
    note(U, target, note, time, o) { U.K.bus.publish('note:trigger', Object.assign({ target, note, velocity: 0.9, time, duration: 0.3 }, o || {})); },
    firstAbove(buf, thr, ch) { const d = buf.getChannelData(ch || 0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) return i; return -1; },
    // dominant frequency by zero crossings in window
    zcFreq(buf, from, to, ch) { const d = buf.getChannelData(ch || 0); const s = Math.floor(from * buf.sampleRate), e = Math.floor(to * buf.sampleRate); let c = 0, first = -1, last = -1; for (let i = s + 1; i < e; i++) if (d[i - 1] < 0 && d[i] >= 0) { const fr = i - 1 + (-d[i - 1]) / (d[i] - d[i - 1]); if (first < 0) first = fr; last = fr; c++; } return c > 1 ? (c - 1) * buf.sampleRate / (last - first) : 0; },
    acFreq(buf, from, to, lo, hi, ch) { // autocorrelation pitch
      const d = buf.getChannelData(ch || 0), sr = buf.sampleRate, s = Math.floor(from * sr), n = Math.floor((to - from) * sr);
      const minL = Math.floor(sr / (hi || 2000)), maxL = Math.floor(sr / (lo || 40)); let best = 0, bl = minL;
      for (let L = minL; L <= maxL; L++) { let c = 0, e1 = 0, e2 = 0; for (let i = 0; i < n - L; i++) { c += d[s + i] * d[s + i + L]; e1 += d[s + i] * d[s + i]; e2 += d[s + i + L] * d[s + i + L]; } const r = c / Math.sqrt(e1 * e2 + 1e-12); if (r > best + 1e-9) { best = r; bl = L; } }
      return sr / bl;
    },
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    // the contract every tool keeps — called from the tool's own <tool>.test.js (in its folder)
    toolContract(id) {
      const was = global.__phase; global.__phase = 'T';
      const d = OrganismFactory.def(id), label = d ? d.label : id;
      const newFaults = (K, n0) => K.faults.list().slice(n0).map(f => f.fault_class + ' ' + f.message).join(' | ');
      const strip = (st, id) => { const o = JSON.parse(JSON.stringify(st).split(id).join('#')); delete o.userPresets; return o; };   // your own presets are a per-tool store (arrives from storage), not this window's state
      describe('tool · ' + label + ' (' + id + ')', () => {
        it('is defined and spawns clean (no faults)', () => {
          if (!d) throw new Error(id + ' is not defined — engine missing from the tool folder?');
          const U = TH.universe(0.2), n0 = U.K.faults.list().length; TH.spawn(U, id);
          assert.equal(newFaults(U.K, n0), '', 'faults on spawn');
        });
        it('every shipped preset loads, and leaves every param inside its range', () => {
          const U = TH.universe(0.2), inst = TH.spawn(U, id), ctx = OrganismFactory.handle(inst).ctx, n0 = U.K.faults.list().length;
          const cfg = Object.fromEntries((d.config || []).map(c => [c.key, c])), bad = [];
          Object.keys(d.presets || {}).forEach(n => { ctx.presets.load(n); const all = ctx.params.all();
            Object.keys(all).forEach(k => { const c = cfg[k], v = all[k]; if (!c) return; if ((c.type === 'number' || c.type === 'integer') && ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max))) bad.push(n + ': ' + k + '=' + v); if (c.type === 'enum' && !(c.options || []).includes(v)) bad.push(n + ': ' + k + '=' + v); }); });
          assert.equal(newFaults(U.K, n0), '', 'faults while loading presets'); assert.equal(bad.join(' · '), '', 'out of range');
        });
        it('save → load gives back exactly the same state', () => {
          const U = TH.universe(0.2), a = TH.spawn(U, id), A = OrganismFactory.handle(a).ctx;
          const names = Object.keys(d.presets || {}); if (names.length) A.presets.load(names[names.length - 1]);
          const s1 = A.serialize(), b = TH.spawn(d.singleton ? TH.universe(0.2) : U, id), B = OrganismFactory.handle(b).ctx; B.deserialize(JSON.parse(JSON.stringify(s1)));
          assert.equal(JSON.stringify(strip(B.serialize(), b)), JSON.stringify(strip(s1, a)));
        });
        it('closing leaves nothing behind; Stop all is obeyed', () => {
          const U = TH.universe(0.2), inst = TH.spawn(U, id), n0 = U.K.faults.list().length;
          U.K.silence({ hard: true, reason: 'contract' });
          OrganismFactory.close(inst, 'contract');
          assert.ok(!U.K.registry.get(inst), 'still registered'); assert.ok(!OrganismFactory.handle(inst), 'handle kept');
          assert.equal(U.K.wires.list().filter(w => w.src.instanceId === inst || w.dst.instanceId === inst).length, 0, 'wires left');
          assert.equal(newFaults(U.K, n0), '', 'faults on stop/close');
        });
      });
      global.__phase = was;
    },
  };

  global.listSuites = () => suites.map((s, i) => ({ i, name: s.name, phase: s.phase, tests: s.tests.length }));
  // only: optional list of suite indices (the runner splits the run into batches, each in a fresh page — see run.mjs)
  global.runAll = async function (filter, only) {
    const results = [];
    const out = document.getElementById('out');
    for (const [si, s] of suites.entries()) {
      if (only && !only.includes(si)) continue;
      if (filter && !s.name.includes(filter) && !(s.phase || '').includes(filter)) continue;
      const sEl = document.createElement('div'); sEl.className = 'suite'; sEl.innerHTML = `<h3>${s.phase ? '[' + s.phase + '] ' : ''}${s.name}</h3>`; out && out.appendChild(sEl);
      for (const t of s.tests) {
        const t0 = performance.now();
        let ok = true, err = null;
        try {
          await Promise.race([Promise.resolve().then(() => t.fn()), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), t.opts.timeout || 20000))]);
        } catch (e) { ok = false; err = (e && (e.message || String(e))) || 'error'; }
        const r = { suite: s.name, phase: s.phase, test: t.name, ok, err, ms: Math.round(performance.now() - t0) };
        results.push(r);
        if (global.__onResult) try { global.__onResult(r); } catch (e) {} // runner streams progress (a stuck test shows by name)
        const li = document.createElement('div'); li.className = ok ? 'pass' : 'fail'; li.textContent = (ok ? '✓ ' : '✗ ') + t.name + (err ? ' — ' + err : '');
        sEl.appendChild(li);
      }
    }
    const pass = results.filter(r => r.ok).length;
    global.__results = { pass, fail: results.length - pass, total: results.length, results };
    document.title = `ERAVOS tests ${pass}/${results.length}`;
    return global.__results;
  };
})(window);
