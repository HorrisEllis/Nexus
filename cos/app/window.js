'use strict';
/**
 * cos/app/window.js — what COS's window shows (MG36, COS 0.3.0). Spec: cos/spec/cos-manager.spec MOD-COSA-COCKPIT-WINDOW ·
 * Map: docs/2026-10-24-cos-manager-phasemap.spec MG36_the_cockpit_is_the_window, docs/2026-11-02-cos-the-application-phasemap.spec CA_D0.
 *
 * James, 2026-11-02: "no i mean cos ui as the app. like a full orchastration application. since it's like vmware. not the old one. but maybe
 * add the old one as an manual update feature."
 *
 * The window is COS's cockpit (cos/ui, served by COS's manager on :7797) whenever it answers; until then a starting page that says what it
 * waits for. The old page (cos/app/desktop/ui) is kept as Versions & manual update. Pure: main.js wires it to Electron.
 *
 *   windowTarget({ cockpitUp, linked, started, error }) → { kind: 'cockpit' | 'starting', url?, why }
 *   cockpitUp({ port, get }) → Promise<boolean>     GET / on 127.0.0.1:<port>
 *   allowedUrl(url, port) → boolean                  the window may only show the cockpit (loopback) or its own files
 */
const http = require('http');

const COCKPIT_PORT = Number(process.env.COS_UI_PORT) || 7797;
const cockpitUrl = (port = COCKPIT_PORT) => `http://127.0.0.1:${port}/`;

function windowTarget({ cockpitUp = false, linked = null, started = null, error = null, port = COCKPIT_PORT, installing = null, installError = null } = {}) {
  if (cockpitUp) return { kind: 'cockpit', url: cockpitUrl(port), why: 'the cockpit answers' };
  // CA5 (0.6.0) — nothing linked: COS installs Nexus from GitHub itself; the step running, or why it stopped (Install Nexus tries again)
  if (!linked && installing) return { kind: 'starting', why: `installing Nexus: ${installing}`, installing: true };
  if (!linked && installError) return { kind: 'starting', why: `Nexus is not installed: ${String(installError).split('\n')[0]} — press Install Nexus to try again`, canInstall: true };
  if (!linked) return { kind: 'starting', why: 'Nexus is not installed yet: press Install Nexus (from GitHub), or link your own folder in Versions & manual update', canInstall: true };
  if (error) return { kind: 'starting', why: `Nexus did not start: ${String(error).split('\n')[0]}` };
  if (started === false) return { kind: 'starting', why: `${linked.version || 'Nexus'} is linked but not started: press Start` };
  return { kind: 'starting', why: `starting Nexus ${linked.version || ''} from ${linked.dir} — the cockpit opens here when COS's manager answers on :${port}`.replace(/\s+/g, ' ') };
}

function cockpitUp({ port = COCKPIT_PORT, timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const q = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (r) => { r.resume(); resolve(r.statusCode >= 200 && r.statusCode < 500); });
    q.on('timeout', () => { q.destroy(); resolve(false); }); q.on('error', () => resolve(false));
  });
}

function allowedUrl(url, port = COCKPIT_PORT) {
  try { const u = new URL(url); if (u.protocol === 'file:') return true; return u.protocol === 'http:' && u.hostname === '127.0.0.1' && Number(u.port) === port; } catch (_) { return false; }
}

// CE7 (docs/2026-11-02-cos-enterprise-phasemap.spec) — James, 2026-11-02: "Also make it borderless." No Windows frame or title bar; Windows still
// draws its own minimize, maximize and close over the top right (titleBarOverlay), so snap layouts and double-click to maximize keep working.
// The page drags by its top bar (cos/ui/shell/page.css, html[data-cos-frame="none"]). frame: 'windows' is the way back (settings.frame).
const OVERLAY_HEIGHT = 40;
function frameOptions(frame = 'none') {
  if (frame === 'windows') return {};
  return { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#e6e8ef', height: OVERLAY_HEIGHT } };
}

module.exports = { windowTarget, cockpitUp, allowedUrl, cockpitUrl, frameOptions, OVERLAY_HEIGHT, COCKPIT_PORT, MODULE_ID: 'cos.app.window', VERSION: '1.0.0' };
