'use strict';
// TB-01..03 (0.60.52): a pin changed in Settings reaches the main window without a restart. Source-level: Electron is not
// available here, so this checks the three ends are wired, not that a window repaints.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', 'clear-glass');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
ok(/options:changed/.test(read('src/ipc/bridge.js')) && /getAllWindows/.test(read('src/ipc/bridge.js')), 'TB-01 options:set broadcasts options:changed to the other windows');
ok(/onChange:[^\n]*options:changed/.test(read('src/preload/index.js')), 'TB-02 preload exposes cg.options.onChange');
ok(/options\.onChange[\s\S]{0,260}pinnedToolbarButtons[\s\S]{0,120}applyToolbarPins/.test(read('renderer/browser.js')), 'TB-03 the main window re-applies pins on change');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
