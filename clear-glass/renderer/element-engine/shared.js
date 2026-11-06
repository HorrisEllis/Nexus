'use strict';
/**
 * renderer/element-engine/shared.js — what every Element Engine area shares (EE3a, 0.60.416). Loaded after settings/core.js and
 * library/api.js, before the areas.
 *   CGE.his(path, body)  POST with person:true: a change to his filters or his ErosmancerOS copy, made by him on this page (the bridge
 *                        refuses it without; an agent's tool never sends it)
 *   CGE.hisRaw(path, body) the same, a refusal returned as data (for import, whose refusal lists the files and why)
 *   CGE.pick(btn)        the browser window comes forward and its Guardian picker starts
 *   CGE.say(r)           a result's note (or error) as a toast
 * And one remap: ErosmancerOS's workbench (settings/sections/eros.js, Settings' own area, reused here unchanged) is filed under this page's
 * ErosmancerOS group as "Workbench" instead of Settings' Agents group. Wrapped before eros.js loads, so nothing in eros.js changes.
 */
(function () {
  const S = window.CGS; const { api } = window.CGL;
  const his = (path, body = {}) => api(path, { method: 'POST', body: { ...body, person: true } });
  // hisRaw: the same, but a refusal comes back as data, not a throw (an import that is refused says why in `refused`, with no `error`)
  const hisRaw = async (path, body = {}) => {
    let res; try { res = await fetch(window.CGL.BRIDGE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, person: true }), signal: AbortSignal.timeout(180000) }); }
    catch (e) { throw new Error(`Clear Glass bridge :7702 unreachable (${e.message})`); }
    try { return await res.json(); } catch (_) { throw new Error(`HTTP ${res.status} on ${path}`); }
  };
  const say = (r, fallback = 'Done') => { if (r && r.note) S.toast(r.note, /does not parse|skipped|not /.test(r.note) ? 'bad' : 'ok', 6000); else S.toast(fallback); return r; };
  const pick = (b) => S.busy(b, async () => say(await api('/cli/element-engine/pick', { method: 'POST', body: {} }), 'Picker on in the browser window'));
  const orig = S.section;
  S.section = (def) => orig(def && def.id === 'eros' && def.group === 'Agents' ? { ...def, group: 'ErosmancerOS', label: 'Workbench', icon: def.icon } : def);
  window.CGE = { his, hisRaw, say, pick };
})();
