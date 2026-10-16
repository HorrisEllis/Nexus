#!/usr/bin/env node
'use strict';
/**
 * scripts/build-cos-app.js — stage and build the COS Windows application (COSA6, 0.60.68)
 * James, 2026-10-16: "cos app for windows"
 *
 *   node scripts/build-cos-app.js [--stage dir] [--stage-only]
 * Stages a self-contained folder (the app's own files, lib/zip.js, a package.json with exactly the one runtime dependency and the pinned electron/electron-builder),
 * then, unless --stage-only, runs `npm install` and `electron-builder --win` inside it (portable .exe and an installer). The staged folder keeps the repo's relative
 * layout (cos/app/*.js require ../../lib/zip.js), so nothing is rewritten. asar is OFF: the project is started with ELECTRON_RUN_AS_NODE and reads js-yaml from node_modules by NODE_PATH.
 * Build it on Windows (the CI job does): building a Windows exe from Linux under wine is fragile and is not done here. Prints one JSON line: { stage, version, files }.
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const FILES = ['cos/app/store.js', 'cos/app/runtime.js', 'cos/app/switch.js', 'cos/app/controller.js', 'cos/app/version.js', 'cos/app/desktop/main.js', 'cos/app/desktop/preload.js', 'cos/app/desktop/icon.png',
  'cos/app/desktop/ui/index.html', 'cos/app/desktop/ui/app.js', 'cos/app/desktop/ui/style.css', 'lib/zip.js'];

function stage({ out = path.join(ROOT, 'dist', 'cos-app-stage'), root = ROOT } = {}) {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); const { version } = require(path.join(root, 'cos/app/version.js'));
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) { const dst = path.join(out, f); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(root, f), dst); }
  const pkg = {
    name: 'cos-app', productName: 'COS', version, description: 'COS: runs and manages your projects (Nexus first). Drop a release zip, switch versions, roll back.', author: 'James Brooks', license: 'UNLICENSED',
    main: 'cos/app/desktop/main.js', private: true, dependencies: { 'js-yaml': rootPkg.dependencies['js-yaml'] },
    devDependencies: { electron: rootPkg.devDependencies.electron, 'electron-builder': rootPkg.devDependencies['electron-builder'] },
    build: { appId: 'com.horrisellis.cos', productName: 'COS', asar: false, directories: { output: 'out' }, files: ['cos/**', 'lib/**', 'package.json', 'node_modules/js-yaml/**', '!**/*.map'],
      win: { icon: 'cos/app/desktop/icon.png', target: ['portable', 'nsis'] }, portable: { artifactName: 'COS-${version}-portable.exe' }, nsis: { artifactName: 'COS-${version}-setup.exe', oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true } },
  };
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  return { stage: out, version, files: FILES.length + 1, pkg };
}
function build(out) {
  for (const [cmd, args] of [['npm', ['install', '--no-audit', '--no-fund']], ['npx', ['electron-builder', '--win', '--publish', 'never']]]) {
    const r = spawnSync(cmd, args, { cwd: out, stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed (exit ${r.status})`);
  }
}
if (require.main === module) {
  const a = process.argv.slice(2); const i = a.indexOf('--stage'); const s = stage({ out: i >= 0 ? path.resolve(a[i + 1]) : undefined });
  console.log(JSON.stringify({ stage: s.stage, version: s.version, files: s.files }));
  if (!a.includes('--stage-only')) { if (process.platform !== 'win32' && !process.env.COS_BUILD_ANYWHERE) { console.error('Not building the exe here: build on Windows (CI does). Set COS_BUILD_ANYWHERE=1 to try anyway.'); process.exit(2); } build(s.stage); }
}
module.exports = { stage, FILES };
