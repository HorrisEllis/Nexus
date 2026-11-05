'use strict';
/**
 * tests/modules/test-cg-webgl.test.js — WG1 (docs/2026-11-05-clear-glass-webgl-phasemap.spec)
 * James, 2026-11-05: "i cant use fiverr at all. clearglass is my main driver"
 *
 *   WG-01  hardware acceleration on by default (WG2); off with CG_GPU=off or after the GPU process died 3 times (a flag file), and then
 *          software WebGL is asked for (WG1)
 *   WG-02  in real Electron: with acceleration off, WebGL is null without the switch and has a renderer with it. Needs xvfb-run and
 *          node_modules/electron; skipped with the reason when either is missing (§1.2)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0, skipped = 0;
function test(id, desc, fn) { try { const r = fn(); if (r === 'skip') return; console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }

console.log('\n⬡  Clear Glass has WebGL (WG1)\n');

test('WG-01', 'acceleration on by default; off with CG_GPU=off or a failed GPU, and then software WebGL', () => {
  const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
  assert.match(src, /const _gpuOff = process\.env\.CG_GPU === 'off' \|\| \(process\.env\.CG_GPU !== 'on' && require\('fs'\)\.existsSync\(_gpuFlag\)\);/);
  assert.match(src, /if \(_gpuOff\) \{ app\.disableHardwareAcceleration\(\); app\.commandLine\.appendSwitch\('enable-unsafe-swiftshader'\);/);
  assert.match(src, /d\.type !== 'GPU'[\s\S]{0,700}\+\+_gpuGone === 3\) \{ try \{ require\('fs'\)\.writeFileSync\(_gpuFlag/, 'three GPU deaths in a run write the flag');
  assert.strictEqual((src.match(/app\.disableHardwareAcceleration\(\)/g) || []).length, 1, 'acceleration is turned off in one place only');
  assert.match(src, /restarting once in software mode[\s\S]{0,120}app\.relaunch\(\); app\.exit\(0\);/, 'WG3: the third GPU death restarts in software mode now, not at the next start');
});

test('WG-02', 'real Electron: WebGL null without the switch, a renderer with it', () => {
  const electron = path.join(ROOT, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  const xvfb = spawnSync('which', ['xvfb-run'], { encoding: 'utf8' }).stdout.trim();
  if (!fs.existsSync(electron) || (process.platform === 'linux' && !xvfb)) { console.log(`  - WG-02 skipped: ${!fs.existsSync(electron) ? 'no node_modules/electron' : 'no xvfb-run on this machine'}`); skipped++; return 'skip'; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-webgl-'));
  const main = path.join(dir, 'main.js');
  fs.writeFileSync(main, `const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
if (process.env.SWS === '1') app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<canvas id=c></canvas>');
  const r = await w.webContents.executeJavaScript("(()=>{const gl=document.getElementById('c').getContext('webgl');if(!gl)return 'null';const e=gl.getExtension('WEBGL_debug_renderer_info');return String(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));})()");
  console.log('WEBGL=' + r); app.quit();
});`);
  const run = (sws) => {
    const args = process.platform === 'linux' ? ['-a', electron, '--no-sandbox', main] : ['--no-sandbox', main];
    const r = spawnSync(process.platform === 'linux' ? xvfb : electron, args, { env: { ...process.env, SWS: sws, ELECTRON_RUN_AS_NODE: '' }, encoding: 'utf8', timeout: 60000 });
    const m = /WEBGL=(.*)/.exec((r.stdout || '') + (r.stderr || '')); if (!m) throw new Error(`no answer from Electron: ${(r.stderr || '').slice(-300)}`); return m[1].trim();
  };
  assert.strictEqual(run('0'), 'null', 'without the switch WebGL is missing (the bug)');
  assert.match(run('1'), /SwiftShader|ANGLE/, 'with it WebGL has a renderer');
});

console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`); process.exitCode = failed ? 1 : 0;
