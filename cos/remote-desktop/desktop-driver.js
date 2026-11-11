'use strict';
/**
 * cos/remote-desktop/desktop-driver.js — the desktop driven the way ClearDriver drives a page (Nexus phase PC9, his PC_D14).
 * James, 2026-11-11: "I’m saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom."
 *
 *   screen()                     → { ok, width, height, file }        a PNG of the whole screen
 *   move({x,y}) · click({x,y,button,double}) · type({text}) · key({keys}) · scroll({x,y,dy})
 *   arm({ minutes, mode: 'act'|'view', by: 'person' }) · disarm({ by }) · state()
 *
 * Off until he arms it, each time, for a set time (at most 60 minutes). 'view' allows the screen only. An agent cannot arm it (his consent:
 * USER_AUTONOMY). A kill switch (disarm) ends it at once. Every act is logged (who, what, where, why) and emitted; typed text is logged as
 * its length, never its content. Click and key go through the remote desktop's injector (its rate limit and view-only lock).
 *
 * Backends: on Windows, PowerShell (user32 and System.Drawing, nothing to install), started hidden; on Linux, xdotool and ImageMagick's
 * import when present; otherwise every verb is refused, naming what is missing (§1.2). JavaScript, said: COS's manager is JavaScript and
 * Emerge cannot start a process until CIE13 (docs/2026-11-06-cie-eg-build-phasemap.spec).
 */
const fs = require('fs'), path = require('path');
const { execFile, execFileSync } = require('child_process');
const { createInputInjector } = require('./input-injector.js');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout: 20000, maxBuffer: 64 << 20, windowsHide: true, ...opts }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim().split('\n').pop())) : resolve(String(out)))));

// ── Windows: PowerShell, user32 and System.Drawing ─────────────────────────────────────────────────────────────────
const PS_HEAD = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class NxU { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[NxU]::SetProcessDPIAware() | Out-Null
`;
const ps = (body) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_HEAD + body]);
const n = (v) => Math.round(Number(v));
// SendKeys: + ^ % ~ ( ) { } [ ] are special; each is wrapped in braces to be typed as itself
const sendKeysText = (t) => String(t).replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`).replace(/'/g, "''");
const KEYS = { enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}', up: '{UP}', down: '{DOWN}',
  left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ', f5: '{F5}' };
function sendKeysCombo(keys) {   // "ctrl+shift+s" → "^+s"
  const parts = String(keys).toLowerCase().split('+').map(s => s.trim()).filter(Boolean);
  const mod = { ctrl: '^', control: '^', shift: '+', alt: '%' }; let pre = '', main = '';
  for (const p of parts) { if (mod[p]) pre += mod[p]; else main = KEYS[p] || (p.length === 1 ? sendKeysText(p) : `{${p.toUpperCase()}}`); }
  return pre + main;
}
function windowsBackend() {
  return {
    name: 'windows (PowerShell, user32)',
    async mousemove(x, y) { await ps(`[NxU]::SetCursorPos(${n(x)}, ${n(y)}) | Out-Null`); },
    async click(x, y, button = 'left', double = false) {
      const [d, u] = button === 'right' ? [0x08, 0x10] : [0x02, 0x04];
      const one = `[NxU]::mouse_event(${d},0,0,0,[UIntPtr]::Zero); [NxU]::mouse_event(${u},0,0,0,[UIntPtr]::Zero)`;
      await ps(`[NxU]::SetCursorPos(${n(x)}, ${n(y)}) | Out-Null; ${one}${double ? '; Start-Sleep -Milliseconds 60; ' + one : ''}`);
    },
    async keydown(keys) { await ps(`[System.Windows.Forms.SendKeys]::SendWait('${sendKeysCombo(keys)}')`); },
    async type(text) { await ps(`[System.Windows.Forms.SendKeys]::SendWait('${sendKeysText(text)}')`); },
    async scroll(x, y, dy) { await ps(`[NxU]::SetCursorPos(${n(x)}, ${n(y)}) | Out-Null; [NxU]::mouse_event(0x0800,0,0,${-n(dy)},[UIntPtr]::Zero)`); },
    async screen(file) {
      const out = await ps(`$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${String(file).replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png); "$($b.Width) $($b.Height)"`);
      const [w, h] = out.trim().split(/\s+/).map(Number); return { width: w, height: h };
    },
  };
}

// ── Linux: xdotool and import ──────────────────────────────────────────────────────────────────────────────────────
const has = (bin) => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch (_) { return false; } };
function linuxBackend() {
  return {
    name: 'linux (xdotool, import)',
    async mousemove(x, y) { await run('xdotool', ['mousemove', String(n(x)), String(n(y))]); },
    async click(x, y, button = 'left', double = false) { await run('xdotool', ['mousemove', String(n(x)), String(n(y)), 'click', ...(double ? ['--repeat', '2'] : []), button === 'right' ? '3' : '1']); },
    async keydown(keys) { await run('xdotool', ['key', String(keys)]); },
    async type(text) { await run('xdotool', ['type', '--delay', '0', String(text)]); },
    async scroll(x, y, dy) { await run('xdotool', ['mousemove', String(n(x)), String(n(y)), 'click', '--repeat', String(Math.max(1, Math.abs(Math.round(dy / 120)) || 1)), dy > 0 ? '5' : '4']); },
    async screen(file) { await run('import', ['-window', 'root', file]); const out = await run('identify', ['-format', '%w %h', file]); const [w, h] = out.trim().split(/\s+/).map(Number); return { width: w, height: h }; },
  };
}

/** the backend for this machine, or null with why */
function pickBackend(platform = process.platform) {
  if (platform === 'win32') return { backend: windowsBackend() };
  if (platform === 'linux') { const missing = ['xdotool', 'import', 'identify'].filter(b => !has(b)); return missing.length ? { backend: null, why: `needs ${missing.join(', ')} (Linux)` } : { backend: linuxBackend() }; }
  return { backend: null, why: `no desktop backend for ${platform} yet` };
}

function createDesktopDriver({ backend = undefined, dataDir, emit = () => {}, now = () => Date.now(), maxMinutes = 60 } = {}) {
  const picked = backend === undefined ? pickBackend() : { backend, why: backend ? null : 'no backend' };
  const B = picked.backend;
  const injector = B ? createInputInjector({ backend: B }) : null;
  const dir = path.join(dataDir, 'desktop'); fs.mkdirSync(path.join(dir, 'screens'), { recursive: true });
  const logFile = path.join(dir, 'log.jsonl');
  let arm_ = { armed: false, mode: null, until: null, by: null };

  const live = () => { if (arm_.armed && now() >= arm_.until) arm_ = { armed: false, mode: null, until: null, by: null, expired: true }; return arm_; };
  const log = (entry) => { const e = { at: now(), ...entry }; try { fs.appendFileSync(logFile, JSON.stringify(e) + '\n'); } catch (_) {} emit('cos.desktop.act', e); return e; };
  const refuse = (verb, args, by, why, code = 409) => { log({ verb, args, by, why: args && args.why, ok: false, reason: why }); return { ok: false, code, error: why }; };

  function state() { const s = live(); return { ok: true, armed: s.armed, mode: s.mode, until: s.until, by: s.by, leftMs: s.armed ? s.until - now() : 0, backend: B ? B.name : null, why: B ? null : picked.why }; }
  function arm({ minutes = 10, mode = 'act', by } = {}) {
    if (by !== 'person') return refuse('arm', { minutes, mode }, by, 'only he arms the desktop (his consent): by must be "person"; an agent proposes', 403);
    if (!B) return refuse('arm', { minutes, mode }, by, `the desktop cannot be driven here: ${picked.why}`);
    const m = Math.max(1, Math.min(maxMinutes, Number(minutes) || 10));
    arm_ = { armed: true, mode: mode === 'view' ? 'view' : 'act', until: now() + m * 60000, by };
    injector.setLocked && injector.setLocked(arm_.mode === 'view');
    log({ verb: 'arm', args: { minutes: m, mode: arm_.mode }, by, ok: true });
    return state();
  }
  function disarm({ by } = {}) { arm_ = { armed: false, mode: null, until: null, by: null }; log({ verb: 'disarm', by: by || 'unknown', ok: true }); return state(); }

  // a verb runs only when armed (the screen under 'view' too); its result, or why not, is logged either way
  async function act(verb, args, by, fn, { viewOk = false } = {}) {
    const s = live();
    if (!B) return refuse(verb, args, by, `the desktop cannot be driven here: ${picked.why}`);
    if (!s.armed) return refuse(verb, args, by, s.expired ? 'the desktop arm expired: he arms it again in COS' : 'the desktop is not armed: he arms it in COS (Automation › Desktop) for a set time');
    if (s.mode === 'view' && !viewOk) return refuse(verb, args, by, 'armed view-only: the screen only');
    try { const r = await fn(); log({ verb, args, by, why: args && args.why, ok: true }); return { ok: true, ...r }; }
    catch (e) { return refuse(verb, args, by, e.message, 500); }
  }
  const viaInjector = async (evt) => { const r = await injector.inject({ ts: now(), ...evt }); if (!r.ok) throw new Error(`the injector refused: ${r.reason}`); return {}; };

  return {
    state, arm, disarm, logFile,
    screen: ({ by, why } = {}) => act('screen', { why }, by, async () => { const file = path.join(dir, 'screens', `${now()}.png`); const r = await B.screen(file); return { ...r, file }; }, { viewOk: true }),
    // a move goes straight to the backend: the injector coalesces moves and applies them later, so a driver would not know it happened
    move: ({ x, y, by, why } = {}) => act('move', { x, y, why }, by, async () => { await B.mousemove(n(x), n(y)); return {}; }),
    click: ({ x, y, button = 'left', double = false, by, why } = {}) => act('click', { x, y, button, double, why }, by,
      async () => { if (button === 'left' && !double) return viaInjector({ kind: 'click', x: n(x), y: n(y) }); await B.click(n(x), n(y), button, double); return {}; }),
    key: ({ keys, by, why } = {}) => act('key', { keys, why }, by, () => viaInjector({ kind: 'keydown', key: String(keys) })),
    type: ({ text, by, why } = {}) => act('type', { chars: String(text || '').length, why }, by, async () => { await B.type(String(text || '')); return { chars: String(text || '').length }; }),
    scroll: ({ x = 0, y = 0, dy = 120, by, why } = {}) => act('scroll', { x, y, dy, why }, by, async () => { await B.scroll(n(x), n(y), Number(dy)); return {}; }),
  };
}

module.exports = { createDesktopDriver, pickBackend, windowsBackend, linuxBackend, sendKeysCombo, sendKeysText };
