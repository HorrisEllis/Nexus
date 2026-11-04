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
// CE1 — what closing and minimizing the window do: his choice (close: hide to the tray or quit COS; minimize: the taskbar or the tray)
const CLOSE = Object.freeze(['tray', 'quit']), MINIMIZE = Object.freeze(['taskbar', 'tray']);
const FRAME = Object.freeze(['none', 'windows']);   // CE7 — "Also make it borderless.": none (the default) or Windows' own frame, the way back
const DEFAULTS = Object.freeze({ update: { policy: 'ask' }, startOnLaunch: null, startWithWindows: true, startElevated: true, startHidden: true, runAsService: false, serviceApplied: null, autoInstall: true, onClose: 'tray', onMinimize: 'taskbar', frame: 'none', logonApplied: null, window: { width: 1000, height: 720, x: null, y: null, maximized: false } });   // MG35 startOnLaunch: the project COS starts when it opens (his choice), or null
const file = (root) => path.join(root, 'settings.json');
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v, d, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);

/** normalize(raw) → a complete, valid settings object (unknown or invalid values fall back to the default, and are listed in `dropped`) */
function normalize(raw) {
  const s = clone(DEFAULTS), dropped = []; raw = raw && typeof raw === 'object' ? raw : {};
  if (raw.update && raw.update.policy !== undefined) { if (POLICIES.includes(raw.update.policy)) s.update.policy = raw.update.policy; else dropped.push(`update.policy "${raw.update.policy}"`); }
  if (raw.startOnLaunch !== undefined && raw.startOnLaunch !== null) { if (/^[a-z0-9][a-z0-9_-]{0,40}$/.test(String(raw.startOnLaunch))) s.startOnLaunch = String(raw.startOnLaunch); else dropped.push(`startOnLaunch "${raw.startOnLaunch}"`); }
  if (raw.serviceApplied && typeof raw.serviceApplied === 'object') s.serviceApplied = raw.serviceApplied;   // CA4
  for (const k of ['startWithWindows', 'startElevated', 'startHidden', 'runAsService', 'autoInstall']) if (raw[k] !== undefined) { if (typeof raw[k] === 'boolean') s[k] = raw[k]; else dropped.push(`${k} "${raw[k]}"`); }   // MG37
  if (raw.logonApplied && typeof raw.logonApplied === 'object') s.logonApplied = raw.logonApplied;
  // CE1 (docs/2026-11-02-cos-enterprise-phasemap.spec) — James, 2026-11-02: "option to close or minimize to tray"
  for (const [k, ok] of [['onClose', CLOSE], ['onMinimize', MINIMIZE], ['frame', FRAME]]) if (raw[k] !== undefined) { if (ok.includes(raw[k])) s[k] = raw[k]; else dropped.push(`${k} "${raw[k]}"`); }
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
  if (key === 'startOnLaunch') {   // MG35 — the exe is how Nexus starts: the project to start when COS opens, or null for none
    if (value !== null && value !== '' && !/^[a-z0-9][a-z0-9_-]{0,40}$/.test(String(value))) return { ok: false, error: `startOnLaunch is a project name or none, not "${value}"` };
    const cur = load(root).settings; cur.startOnLaunch = value ? String(value) : null; save(root, cur); return { ok: true, settings: cur };
  }
  if (key === 'serviceApplied') { const cur = load(root).settings; cur.serviceApplied = value && typeof value === 'object' ? value : null; save(root, cur); return { ok: true, settings: cur }; }   // CA4
  if (['startWithWindows', 'startElevated', 'startHidden', 'runAsService', 'autoInstall'].includes(key)) {   // autoInstall: CA5   // runAsService: CA4, his switch   // MG37 — "cos starts up with windows, minimizes to tray unless disabled"
    const v = value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;
    if (v === null) return { ok: false, error: `${key} is true or false, not "${value}"` };
    const cur = load(root).settings; cur[key] = v; save(root, cur); return { ok: true, settings: cur };
  }
  if (key === 'onClose' || key === 'onMinimize' || key === 'frame') {   // CE1, CE7
    const allowed = key === 'onClose' ? CLOSE : key === 'frame' ? FRAME : MINIMIZE;
    if (!allowed.includes(value)) return { ok: false, error: `${key} is ${allowed.join(' or ')}, not "${value}"` };
    const cur = load(root).settings; cur[key] = value; save(root, cur); return { ok: true, settings: cur };
  }
  if (key === 'logonApplied') { const cur = load(root).settings; cur.logonApplied = value && typeof value === 'object' ? value : null; save(root, cur); return { ok: true, settings: cur }; }
  if (key !== 'update.policy') return { ok: false, error: `unknown setting "${key}" (update.policy, startOnLaunch, startWithWindows, startElevated, startHidden, runAsService, autoInstall, onClose, onMinimize, frame)` };
  if (!POLICIES.includes(value)) return { ok: false, error: `update.policy must be one of ${POLICIES.join(', ')}, not "${value}"` };
  const cur = load(root).settings; cur.update.policy = value; save(root, cur); return { ok: true, settings: cur };
}
function saveWindow(root, bounds) { const cur = load(root).settings; cur.window = normalize({ window: { ...cur.window, ...bounds } }).settings.window; save(root, cur); return cur.window; }
module.exports = { POLICIES, CLOSE, MINIMIZE, FRAME, DEFAULTS, normalize, load, save, set, saveWindow };
