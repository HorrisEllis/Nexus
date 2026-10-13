'use strict';
/**
 * tests/modules/test-project-decompose.test.js — 0.60.5
 *
 * James (2026-10-13): "i want to be able to copy projects and decompose them into components for the component store
 * with the dependancies zipped together in a organized structured way. like make a tool for it, as well as a way to drag
 * and drop zips to do it automatically." · "can you build the renderer.html as a compartment os ui".
 *
 *   PD-0x  lib/project-decompose.js: a zip and a folder decomposed, requires resolved whatever the order, the bundle
 *   WR-0x  routes, commands, the drop zone, the COS theme in Clear Glass
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\ntest-project-decompose\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-pd-'));
  process.env.NEXUS_COMPONENTS_DIR = path.join(tmp, 'store');
  try {
    const PD = require(path.join(ROOT, 'lib/project-decompose.js'));
    const Zip = require(path.join(ROOT, 'lib/zip.js'));
    const { createZip } = require(path.join(ROOT, 'lib/zip-writer.js'));
    // a project zipped the usual way: one top folder; app.js listed before the helper it requires
    const project = [
      { path: 'shop/package.json', content: JSON.stringify({ name: 'shop', dependencies: { lodash: '^4.17.21' } }) },
      { path: 'shop/src/app.js', content: "const cart = require('./cart');\nconst _ = require('lodash');\nmodule.exports = () => cart.total([1, 2]);\n" },
      { path: 'shop/src/cart.js', content: "/** sums a cart */\nconst money = require('./lib/money');\nmodule.exports = { total: (xs) => money(xs.reduce((a, b) => a + b, 0)) };\n" },
      { path: 'shop/src/lib/money.js', content: "const fs = require('fs');\nmodule.exports = (n) => `$${n}`;\n" },
      { path: 'shop/node_modules/lodash/index.js', content: 'module.exports = {};\n' },
      { path: 'shop/src/broken.js', content: "require('./nowhere');\n" },
      { path: 'shop/README.md', content: '# shop\n' },
      { path: 'shop/src/rates.js', content: "const table = require('./rates.json');\nimport remote from 'https://cdn.example.com/fx.js';\nmodule.exports = table;\n" },
    ];
    const r = PD.fromZip(createZip(project), 'Shop');
    const byPath = Object.fromEntries(r.components.map(c => [c.path, c]));
    check('PD-01 a zipped project: its top folder stripped, every code file a component, node_modules and non-code left out',
      r.project === 'shop' && Object.keys(byPath).sort().join() === 'src/app.js,src/broken.js,src/cart.js,src/lib/money.js,src/rates.js', JSON.stringify(Object.keys(byPath)));
    check('PD-02 requires resolve whatever order the files came in (app.js before cart.js); builtins are not npm; lodash is',
      byPath['src/app.js'].dependencies === 1 && byPath['src/cart.js'].dependencies === 1 && byPath['src/lib/money.js'].npm.length === 0 && byPath['src/app.js'].npm.join() === 'lodash', JSON.stringify(byPath));
    check('PD-03 a require that points nowhere is reported, not guessed', byPath['src/broken.js'].unresolved.join() === './nowhere' && r.stats.unresolved === 1);
    check('PD-04 the project\'s package.json versions are kept for the bundles', r.npmVersions.lodash === '^4.17.21' && PD.projects().shop.npmVersions.lodash === '^4.17.21');

    const b = PD.bundle(byPath['src/app.js'].id);
    const zip = new Zip(b.buffer);
    const names = zip.getEntries().map(e => e.entryName).sort();
    check('PD-05 a bundle is the component and its whole require closure, at its project paths, with component.json, package.json and README',
      b.filename === 'shop-app-1.0.0.zip' && names.join() === ['shop-app/README.md', 'shop-app/component.json', 'shop-app/package.json', 'shop-app/src/app.js', 'shop-app/src/cart.js', 'shop-app/src/lib/money.js'].sort().join(), names.join());
    const pkg = JSON.parse(zip.readAsText('shop-app/package.json'));
    const man = JSON.parse(zip.readAsText('shop-app/component.json'));
    check('PD-06 package.json names the npm packages the closure needs at the project\'s versions; component.json pins every version',
      pkg.dependencies.lodash === '^4.17.21' && pkg.main === 'src/app.js' && man.closure.length === 3 && man.closure.every(c => c.version), JSON.stringify(pkg));
    const rates = require(path.join(ROOT, 'lib/component-store.js')).manifest(byPath['src/rates.js'].id);
    check('PD-11 a required .json is an asset and an import from a URL is remote — neither an unresolved dependency nor an npm package (found decomposing MASTERMIND)',
      rates.unresolved.length === 0 && rates.npm.length === 0 && rates.assets.join() === 'src/rates.json' && rates.remote.join() === 'https://cdn.example.com/fx.js', JSON.stringify(rates));
    const leaf = PD.bundle(byPath['src/lib/money.js'].id);
    check('PD-07 a leaf component\'s bundle holds only itself', leaf.closure.length === 1 && !new Zip(leaf.buffer).getEntries().some(e => /cart\.js$/.test(e.entryName)));

    const dir = path.join(tmp, 'tools');
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true }); fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.js'), "module.exports = require('./lib/a');\n");
    fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(dir, '.git', 'hook.js'), 'x');
    const d = PD.fromDir(dir);
    check('PD-08 a folder on disk: its name is the project, .git skipped, the same resolution', d.project === 'tools' && d.components.length === 2 && d.components.find(c => c.path === 'index.js').dependencies === 1);
    const again = PD.fromZip(createZip(project), 'Shop');
    check('PD-09 decomposing the same project again stores nothing new (content-addressed)', again.stats.created === 0 && again.stats.components === 5);
    let threw = null; try { PD.bundle('no.such.component'); } catch (e) { threw = e; }
    check('PD-10 a bundle of something not stored is a 404 with why', threw && threw.status === 404);

    const API = src('idearium/api/index.js'), CMD = src('idearium/cli/route-commands.js'), UI = src('idearium/ui/index.html');
    check('WR-01 the routes: decompose (zip or folder) and bundle (download, or ?save=1 for agents)',
      /'components\.decompose'\]/.test(API) && /'components\.bundle'\]/.test(API) && /PD\.fromZip\(buf/.test(API) && /query\.save === '1'/.test(API));
    check('WR-02 every agent has them: components, components.decompose, components.bundle command rows',
      /key: 'components',/.test(CMD) && /key: 'components\.decompose'/.test(CMD) && /key: 'components\.bundle'/.test(CMD));
    check('WR-03 Bring in → Decompose into components: a drop zone that takes several zips, the store searchable, a bundle per component',
      /openComponentsModal\(\)/.test(UI) && /id="cmp-drop"/.test(UI) && /accept="\.zip" multiple/.test(UI) && /js\/components-panel\.js/.test(UI) && /\/bundle"/.test(src('idearium/ui/js/components-panel.js')));
    const B = src('clear-glass/renderer/browser.html');
    check('WR-04 Clear Glass wears the COMPARTMENT OS window: the theme after browser.css, the glyph and kind in the title bar, the window buttons as COS draws them',
      B.indexOf('href="cos-theme.css"') > B.indexOf('href="browser.css"') && /chrome-group cos-ctl/.test(B)
      && /linear-gradient\(180deg, #141827, #0f121c\)/.test(src('clear-glass/renderer/cos-theme.css')) && /cos-theme\.css/.test(src('clear-glass/renderer/settings.html')));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
