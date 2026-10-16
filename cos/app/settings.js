'use strict';
/**
 * cos/app/settings.js — COS's own settings: the update policy and the window it remembers (COSA12/13, 0.60.90)
 * comp_id: cos.app.settings
 * James, 2026-10-16: "i want this almost like vmware. minimize to taskbar. auto updates from dropping in new zips, downloading it from clearglass."
 *
 * One small file, <root>/settings.json, written atomically. A damaged file is set aside (settings.json.bad-<ts>) and defaults are used, with the reason returned:
 * never a silent reset. update.policy: off (nothing installs or switches by itself) | ask (installs by itself, asks before switching; the default) | auto (installs, and switches only when it is safe).
 */
const fs = require('fs'), path = require('path');
const POLICIES = ['off', 'ask', 'auto'];
const DEFAULTS = Object.freeze({ update: { policy: 'ask' }, window: { width: 1000, height: 720, x: null, y: null, maximized: false } });
const file = (root) => path.join(root, 'settings.json');
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v, d, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);

/** normalize(raw) → a complete, valid settings object (unknown or invalid values fall back to the default, and are listed in `dropped`) */
function normalize(raw) {
  const s = clone(DEFAULTS), dropped = []; raw = raw && typeof raw === 'object' ? raw : {};
  if (raw.update && raw.update.policy !== undefined) { if (POLICIES.includes(raw.update.policy)) s.update.policy = raw.update.policy; else dropped.push(`update.policy "${raw.update.policy}"`); }
  const w = raw.window || {};
  s.window.width = num(w.width, DEFAULTS.window.width, 480, 10000); s.window.height = num(w.height, DEFAULTS.window.height, 320, 10000);
  s.window.x = Number.isFinite(w.x) ? Math.round(w.x) : null; s.window.y = Number.isFinite(w.y) ? Math.round(w.y) : null; s.window.maximized = w.maximized === true;
  return { settings: s, dropped };
}
function load(root) {
  let text; try { text = fs.readFileSync(file(root), 'utf8'); } catch (e) { return { ok: true, ...normalize({}), fresh: true }; }
  try { const r = normalize(JSON.parse(text)); return { ok: true, ...r }; }
  catch (e) { const bad = `${file(root)}.bad-${Date.now()}`; try { fs.renameSync(file(root), bad); } catch (_) {} return { ok: true, ...normalize({}), warning: `settings.json was not valid JSON (${e.message}); kept as ${path.basename(bad)} and defaults are in use` }; }
}
function save(root, settings) {
  fs.mkdirSync(root, { recursive: true }); const tmp = `${file(root)}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n'); fs.renameSync(tmp, file(root)); return { ok: true };
}
/** set(root, 'update.policy', 'auto') → { ok, settings } | { ok:false, error } — only keys a person can choose; the window is remembered through saveWindow */
function set(root, key, value) {
  if (key !== 'update.policy') return { ok: false, error: `unknown setting "${key}" (update.policy)` };
  if (!POLICIES.includes(value)) return { ok: false, error: `update.policy must be one of ${POLICIES.join(', ')}, not "${value}"` };
  const cur = load(root).settings; cur.update.policy = value; save(root, cur); return { ok: true, settings: cur };
}
function saveWindow(root, bounds) { const cur = load(root).settings; cur.window = normalize({ window: { ...cur.window, ...bounds } }).settings.window; save(root, cur); return cur.window; }
module.exports = { POLICIES, DEFAULTS, normalize, load, save, set, saveWindow };
