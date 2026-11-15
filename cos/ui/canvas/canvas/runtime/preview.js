/* ERAVOS Preview (3.37) — hear / see a preset before you load it. Domain-agnostic: the canvas only knows
 *   "spawn the tool off-canvas (ephemeral: no window, not saved, not in undo, hidden from tool lists), load the preset,
 *    let whoever knows how to show this tool play it, then close it".
 * HOW a tool is previewed comes from, in order:
 *   1. the tool itself: engine sets ctx.preview = (api) => Promise|void
 *   2. a provider a domain registered: Preview.provide({ id, match(def) → bool, play(ctx, api) → Promise|void })
 * api: { signal (AbortSignal), wait(ms) → Promise (rejects on stop), spawn(defId) → ctx of a helper (cleaned up too),
 *        connect(fromCtx, toCtx, wireType) → bool }
 *   Preview.can(defId) · Preview.play(defId, preset, {K?, tailMs?, maxMs?}) → Promise<{ok, reason?}> · Preview.stop() · Preview.current
 *   Preview.onChange(fn) — fn({ defId, preset } | null)
 * One preview at a time; a new one stops the last. "Stop all" (K.silence, hard) stops it. Hard cap: 12 s. */
(function (global) {
  'use strict';
  const providers = [], listeners = new Set();
  const MAX_MS = 12000, TAIL_MS = 900;
  let cur = null, seq = 0;
  const F = () => global.OrganismFactory, K = () => global.Kernel;
  const emit = () => listeners.forEach(fn => { try { fn(cur ? { defId: cur.defId, preset: cur.preset } : null); } catch (e) {} });
  function providerFor(def) { return providers.find(p => { try { return p.match(def); } catch (e) { return false; } }) || null; }
  function can(defId) { const d = F() && F().def(defId); return !!(d && (d.previewable || providerFor(d))); }
  function cleanup(run) {
    if (run.done) return; run.done = true; clearTimeout(run.cap); try { run.unSilence && run.unSilence(); } catch (e) {}
    run.helpers.concat([run.id]).forEach(id => { if (id && F().handle(id)) { try { run.k.silence({ hard: true, instanceId: id, reason: 'preview' }); } catch (e) {} F().close(id, 'preview'); } });
    if (cur === run) { cur = null; emit(); }
  }
  function stop() { if (cur) { cur.ac.abort(); cleanup(cur); } }
  async function play(defId, preset, o) {
    o = o || {}; stop();
    const k = o.K || K(), d = F().def(defId);
    if (!d) return { ok: false, reason: 'not installed' };
    const run = { k, defId, preset: preset || null, ac: new AbortController(), helpers: [], id: null, done: false, n: ++seq };
    cur = run; emit();
    run.unSilence = k.bus.subscribe('kernel:silence', (p) => { if (p && p.hard && !p.instanceId && !run.done) { run.ac.abort(); cleanup(run); } });
    const spawnE = (id) => { const iid = F().spawn(id, { K: k, ephemeral: true, headless: true }); if (!iid) throw new Error(id + ' could not start'); return iid; };
    try {
      run.id = spawnE(defId);
      const ctx = F().handle(run.id).ctx;
      // your own presets arrive from storage a moment after the tool starts
      if (preset && String(preset).startsWith('user:')) for (let i = 0; i < 25 && !ctx.presets.user[preset.slice(5)]; i++) await new Promise(r => setTimeout(r, 20));
      if (run.done) return { ok: false, reason: 'stopped' };
      if (preset && !ctx.presets.load(preset)) throw new Error('preset “' + preset + '” is not in ' + d.label);
      const signal = run.ac.signal;
      const wait = (ms) => new Promise((res, rej) => { if (signal.aborted) return rej(new Error('stopped')); const t = setTimeout(res, ms); signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('stopped')); }, { once: true }); });
      const api = {
        signal, wait,
        spawn: (id) => { const iid = spawnE(id); run.helpers.push(iid); return F().handle(iid).ctx; },
        connect: (a, b, type) => {
          const out = (a.descriptor.hooks || []).find(h => h.direction === 'out' && h.wire_type === type), inn = (b.descriptor.hooks || []).find(h => h.direction === 'in' && h.wire_type === type);
          if (!out || !inn) return false;
          const r = k.wires.register({ src: { instanceId: a.id, hookId: out.hook_id }, dst: { instanceId: b.id, hookId: inn.hook_id }, wire_type: type });
          return !!(r && r.ok);
        },
      };
      run.cap = setTimeout(() => { run.ac.abort(); cleanup(run); }, o.maxMs || MAX_MS);
      const prov = providerFor(d);
      if (typeof ctx.preview === 'function') await ctx.preview(api);
      else if (prov) await prov.play(ctx, api);
      else throw new Error(d.label + ' has no preview');
      await wait(o.tailMs === undefined ? TAIL_MS : o.tailMs);
      cleanup(run); return { ok: true };
    } catch (e) {
      const stopped = run.ac.signal.aborted || /stopped/.test(e.message);
      cleanup(run);
      if (!stopped) k.fault('RUNTIME_003', { organism_id: defId, message: 'preview: ' + e.message });
      return { ok: false, reason: stopped ? 'stopped' : e.message };
    }
  }
  // ▶ / ■ — one button for any list of presets (Sounds, a tool's preset menu, the pack browser). All buttons follow
  // the one current preview through a single listener (no per-button subscriptions to leak when a list repaints).
  function button(defId, preset, o) {
    if (!can(defId)) return null;
    const doc = global.document, b = doc.createElement('button');
    b.type = 'button'; b.className = 'pv-btn' + (o && o.className ? ' ' + o.className : ''); b.dataset.pvDef = defId; b.dataset.pvPreset = preset || '';
    paintBtn(b); b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const c = cur; if (c && c.defId === defId && c.preset === (preset || null)) stop(); else global.Preview.play(defId, preset); });
    return b;
  }
  function paintBtn(b) { const on = !!(cur && cur.defId === b.dataset.pvDef && (cur.preset || '') === b.dataset.pvPreset); b.textContent = on ? '■' : '▶'; b.classList.toggle('on', on); b.title = on ? 'stop the preview' : 'hear it (nothing is added to your canvas)'; b.setAttribute('aria-label', b.title); }
  listeners.add(() => { if (global.document) global.document.querySelectorAll('.pv-btn').forEach(paintBtn); });
  global.Preview = {
    button,
    provide(p) { if (!p || !p.id || typeof p.match !== 'function' || typeof p.play !== 'function') throw new Error('Preview.provide needs { id, match, play }'); const i = providers.findIndex(x => x.id === p.id); if (i >= 0) providers.splice(i, 1); providers.push(p); },
    can, play, stop,
    get current() { return cur ? { defId: cur.defId, preset: cur.preset } : null; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
