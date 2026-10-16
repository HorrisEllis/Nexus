#!/usr/bin/env node
'use strict';
/**
 * clear-glass/tls-helper/build.js — builds cg-tls-helper for each platform into bin/<os>-<arch>/, with SHA256SUMS.
 * Map: docs/2026-10-16-tls-layer-phasemap.spec (TLS1). Needs Go (1.24+).
 *
 * windows-amd64 and linux-amd64 are committed prebuilt, so James (Windows, running from the repo zip) needs no Go.
 * `node clear-glass/tls-helper/build.js` rebuilds those; `--all` adds macOS (arm64, amd64) and linux-arm64.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DEFAULT = [['windows', 'amd64'], ['linux', 'amd64']];
const ALL = [...DEFAULT, ['darwin', 'arm64'], ['darwin', 'amd64'], ['linux', 'arm64']];
const targets = process.argv.includes('--all') ? ALL : DEFAULT;

const sums = [];
for (const [goos, goarch] of targets) {
  const out = path.join(DIR, 'bin', `${goos}-${goarch}`, goos === 'windows' ? 'cg-tls-helper.exe' : 'cg-tls-helper');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('go', ['build', '-trimpath', '-ldflags=-s -w -buildid=', '-o', out, '.'], { cwd: DIR, stdio: 'inherit', env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: '0' } });
  const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  sums.push(`${sha}  ${path.relative(path.join(DIR, 'bin'), out).split(path.sep).join('/')}`);
  console.log(`built ${path.relative(DIR, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
}
const sumsPath = path.join(DIR, 'bin', 'SHA256SUMS');
const keep = fs.existsSync(sumsPath) ? fs.readFileSync(sumsPath, 'utf8').split('\n').filter(l => l && !sums.some(s => s.split('  ')[1] === l.split('  ')[1])) : [];
fs.writeFileSync(sumsPath, [...keep, ...sums].sort((a, b) => a.split('  ')[1].localeCompare(b.split('  ')[1])).join('\n') + '\n');
