#!/usr/bin/env node
'use strict';
/**
 * scripts/release.js — one command for a release: version, changelog, phase graphs, tests, commit, push.
 * Map: docs/2026-10-31-fixes-phasemap.spec FX2_one_release_command.
 *
 * James, 2026-10-31: "also make any tools that help you speed any of this up." Every release repeated the same steps by hand, and twice that
 * day the regenerated .graph files were left out of the commit. This does them in order and stops at the first that fails (§1.2).
 *
 *   node scripts/release.js --version 0.60.325 --line "<his words, then what was built and the proof>" --changelog <file.md>
 *        [--maps docs/a-phasemap.spec,docs/b-phasemap.spec] [--tests tests/modules/x.test.js,...] [--message <commit-message-file>]
 *        [--no-push] [--dry-run] [--resume]
 * test-release-version reads the committed tree: run it after the release, not in --tests.
 *
 * Steps: 1 bump (scripts/bump-version.py + VERSION) · 2 the changelog copied to versionium/changelogs/CHANGELOG-<v>.md · 3 each map's
 * .phase/.graph regenerated (lib/emerge/compiler/phase-specs.js) · 4 each test run, a red one stops the release before anything is
 * committed · 5 everything changed or new staged, except data/** (never committed) · 6 one commit with the session's trailers · 7 push
 * with tracking set (the shallow-clone refspec). --dry-run says each step and changes nothing.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TRAILERS = ['Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', 'Claude-Session: https://claude.ai/code/session_01KyrX6ZvcWgEP8HMmKUvdyk'];

function parseArgs(argv) {
  const a = { maps: [], tests: [], push: true, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--version') a.version = v();
    else if (k === '--line') a.line = v();
    else if (k === '--changelog') a.changelog = v();
    else if (k === '--maps') a.maps = v().split(',').filter(Boolean);
    else if (k === '--tests') a.tests = v().split(',').filter(Boolean);
    else if (k === '--message') a.message = v();
    else if (k === '--no-push') a.push = false;
    else if (k === '--dry-run') a.dry = true;
    else if (k === '--resume') a.resume = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(a.version || '')) throw new Error('--version x.y.z is required');
  if (!a.line) throw new Error('--line is required (his words first, then what was built and the proof)');
  if (!a.changelog) throw new Error('--changelog <file.md> is required');
  return a;
}

/** the files a release stages: everything git sees as changed or new, never under data/ (his rule) */
function stageable(statusLines) {
  return statusLines.map(l => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop())
    .filter(p => p && !/(^|\/)data\//.test(p));
}

function plan(a) {
  const steps = [];
  // --resume: a release stopped by a red test is run again without bumping twice (bump, VERSION and the changelog are already done)
  if (!a.resume) steps.push({ name: 'bump', cmd: ['python3', [path.join('scripts', 'bump-version.py'), a.version, a.line]] });
  if (!a.resume) steps.push({ name: 'VERSION', write: ['VERSION', `${a.version}\n`] });
  if (!a.resume) steps.push({ name: 'changelog', copy: [a.changelog, path.join('versionium', 'changelogs', `CHANGELOG-${a.version}.md`)] });
  for (const m of a.maps) steps.push({ name: `graphs ${path.basename(m)}`, cmd: [process.execPath, [path.join('lib', 'emerge', 'compiler', 'phase-specs.js'), m]] });
  for (const t of a.tests) steps.push({ name: `test ${path.basename(t)}`, cmd: [process.execPath, [t]], test: true });
  steps.push({ name: 'stage (not data/)', stage: true });
  steps.push({ name: 'commit', commit: true });
  if (a.push) steps.push({ name: 'push', push: true });
  return steps;
}

function git(args, opts = {}) { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }); }

function run(a, { log = (s) => console.log(s), steps = plan(a) } = {}) {
  for (const s of steps) {
    if (a.dry) { log(`· ${s.name}${s.cmd ? `: ${s.cmd[0]} ${s.cmd[1].join(' ').slice(0, 120)}` : ''}`); continue; }
    if (s.cmd) {
      try { cp.execFileSync(s.cmd[0], s.cmd[1], { cwd: ROOT, stdio: s.test ? 'pipe' : 'inherit', encoding: 'utf8', timeout: 600000 }); log(`✓ ${s.name}`); }
      catch (e) {
        const out = `${e.stdout || ''}${e.stderr || ''}`.split('\n').filter(l => /✗|failed|Error/.test(l)).slice(0, 6).join('\n');
        throw new Error(`${s.name} failed — the release stops here, nothing committed${out ? `\n${out}` : ''}`);
      }
    } else if (s.write) { fs.writeFileSync(path.join(ROOT, s.write[0]), s.write[1]); log(`✓ ${s.name}`); }
    else if (s.copy) { fs.copyFileSync(path.resolve(ROOT, s.copy[0]), path.join(ROOT, s.copy[1])); log(`✓ ${s.name} → ${s.copy[1]}`); }
    else if (s.stage) {
      const files = stageable(git(['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean));
      if (!files.length) throw new Error('nothing to stage');
      for (let i = 0; i < files.length; i += 200) git(['add', '-A', '--', ...files.slice(i, i + 200)]);
      log(`✓ staged ${files.length} file(s), data/ left out`);
    } else if (s.commit) {
      const body = a.message ? fs.readFileSync(path.resolve(ROOT, a.message), 'utf8').trim() : `${a.version} — ${a.line.split(/[.—]/)[0].slice(0, 100)}`;
      git(['commit', '-q', '-F', '-'], { input: `${body}\n\n${TRAILERS.join('\n')}\n` });
      log(`✓ committed ${git(['rev-parse', '--short', 'HEAD']).trim()}`);
    } else if (s.push) {
      const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
      if (branch === 'main') throw new Error('on main: releases go to a branch first, merged on his word');
      git(['push', '-q', '-u', 'origin', branch], { stdio: 'pipe' });
      try { git(['config', '--add', 'remote.origin.fetch', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]); git(['fetch', '-q', 'origin', branch]); git(['branch', '-q', '-u', `origin/${branch}`]); } catch (_) {}
      log(`✓ pushed ${branch}`);
    }
  }
  return steps;
}

if (require.main === module) {
  try { run(parseArgs(process.argv.slice(2))); }
  catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}

module.exports = { parseArgs, plan, stageable, run, TRAILERS };
