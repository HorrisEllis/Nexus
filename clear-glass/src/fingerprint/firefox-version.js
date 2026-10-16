'use strict';
/**
 * src/fingerprint/firefox-version.js — the Firefox version Clear Glass claims, computed from Mozilla's release calendar,
 * so it never goes stale. UUID: cg-firefox-version-v1-0000-2026-1016-jamesbrooks-001
 *
 * James, 2026-10-16: "for the google login, can you do everything you can to prevent that?" An outdated browser is one of
 * the reasons Google's sign-in says "This browser or app may not be secure". The fingerprint pool claimed Firefox 121/122
 * (end of 2023), and a hard-coded version is outdated the month after it is written.
 *
 * Firefox ships a release every four weeks: 140 on 2025-06-24. versionNow() counts four-week steps from there, one
 * behind (a version claimed before Mozilla ships it would be a lie a detector can catch; one behind is what many people
 * run). CG_FIREFOX_VERSION overrides it.
 */
const ANCHOR = { version: 140, date: Date.UTC(2025, 5, 24) };
const STEP_MS = 28 * 24 * 3600 * 1000;

function versionNow(now = Date.now()) {
  const env = parseInt(process.env.CG_FIREFOX_VERSION || '', 10);
  if (env > 0) return env;
  const steps = Math.floor((now - ANCHOR.date) / STEP_MS);
  return Math.max(ANCHOR.version, ANCHOR.version + steps - 1);
}

/** ua(platform, version) — Firefox's own UA for this OS. Windows 11 reports "Windows NT 10.0", as Firefox does. */
function ua(platform = process.platform, version = versionNow()) {
  if (platform === 'darwin') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
  if (platform === 'win32') return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
  return `Mozilla/5.0 (X11; Linux x86_64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
}

/** isFirefox(ua) / versionOf(ua) — read a UA string */
function isFirefox(s) { return /\bFirefox\/\d+/.test(String(s || '')); }
function versionOf(s) { const m = /\bFirefox\/(\d+)/.exec(String(s || '')); return m ? parseInt(m[1], 10) : null; }
/** stale(ua) — a Firefox UA Google would read as outdated (more than three releases behind), or one no Firefox sends */
function stale(s, now = Date.now()) { const v = versionOf(s); return v != null && (v < versionNow(now) - 3 || /Windows NT 11\.0/.test(s)); }

module.exports = { versionNow, ua, isFirefox, versionOf, stale, ANCHOR };
