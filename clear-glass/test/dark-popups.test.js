'use strict';
// DP-01..04 (0.60.58): the dark look reaches native controls and the one prompt Electron cannot show. Static checks (no Electron here, so the real look is unverified).
const fs = require('fs'), path = require('path');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let pass = 0, fail = 0; const t = (n, ok, d) => { if (ok) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + (d || '')); } };
t('DP-01 the shared theme sets color-scheme: dark (native lists, scrollbars, date pickers)', /:root\s*\{\s*color-scheme:\s*dark/.test(R('renderer', 'cos-theme.css')));
t('DP-02 browser, library and settings all load that theme', ['browser', 'library', 'settings'].every(n => /href="cos-theme\.css"/.test(R('renderer', n + '.html'))));
const idx = R('src', 'main', 'index.js');
function optionsOf(src) {   // the argument of every `new BrowserWindow(` call, by matching brackets
  const out = []; let i = -1;
  while ((i = src.indexOf('new BrowserWindow(', i + 1)) !== -1) {
    let d = 0, j = i + 'new BrowserWindow'.length;
    for (; j < src.length; j++) { if (src[j] === '(') d++; else if (src[j] === ')' && --d === 0) break; }
    out.push(src.slice(i + 18, j));
  }
  return out.filter(b => b.trim() !== '{...}');
}
const wins = optionsOf(idx);
t('DP-03 every window main creates is dark: withDark(...), the #08080d background, or the dark popup options', wins.length > 0 && wins.every(b => /withDark|popupOptions|#08080d|BG\b/.test(b)), wins.filter(b => !/withDark|popupOptions|#08080d|BG\b/.test(b)).map(b => b.slice(0, 60)).join(' | '));
const jsFiles = fs.readdirSync(path.join(__dirname, '..', 'renderer')).filter(f => f.endsWith('.js'));
t('DP-04 no renderer script calls window.prompt (Electron throws on it)', jsFiles.every(f => !/window\.prompt\(/.test(R('renderer', f))), jsFiles.filter(f => /window\.prompt\(/.test(R('renderer', f))).join());
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
