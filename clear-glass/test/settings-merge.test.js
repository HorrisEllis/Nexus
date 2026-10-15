'use strict';
// SM-01..05 (0.60.54 CS2): Accounts, Provider tabs and Agent mesh are one section; nothing they held was dropped without a stated reason.
const fs = require('fs'), path = require('path'), assert = require('assert');
const R = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', f), 'utf8');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
const prov = R('settings/sections/providers.js'), mesh = R('settings/sections/mesh.js'), acc = R('settings/sections/accounts.js'), core = R('settings/core.js');
t('SM-01 providers.js and mesh.js are parts, not rail sections', () => { assert.ok(!/\bsection\(\{/.test(prov) && !/\bsection\(\{/.test(mesh)); assert.ok(/CGS\.part\('providers'/.test(prov) && /CGS\.part\('mesh'/.test(mesh)); });
t('SM-02 the merged section builds both parts', () => { for (const s of ["parts.providers.controls", "parts.providers.startup", "parts.mesh.panes"]) assert.ok(acc.includes(s), s); assert.ok(/label: 'Providers & accounts'/.test(acc)); });
t('SM-03 every control the old provider page held is still there', () => { for (const s of ['Start with Clear Glass', 'Push userscript', "'Show'", "'Stop'", 'sign-in', 'Skip userscript injection for tabs opened at startup', 'autoStartOnBoot', 'syncAccount']) assert.ok(prov.includes(s), s); });
t('SM-04 every pane the old mesh page held is still there, except the repeated Agents list (said in the header)', () => { for (const s of ['Running now', 'Try a dispatch', "'Routes'", "'Jobs'", "'Network nodes'", '/agent-mesh/spawn']) assert.ok(mesh.includes(s) || acc.includes(s), s); assert.ok(/repeated the provider rows/.test(mesh)); });
t('SM-05 old ids still land: providers and mesh alias to the merged section', () => { assert.ok(/ALIAS = \{ providers: 'accounts', mesh: 'accounts' \}/.test(core) && /ALIAS\[id\] \|\| id/.test(core)); });
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
