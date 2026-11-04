'use strict';
/**
 * lib/git-pr.js — open a pull request from any Nexus tree, for any agent and the person (UP12, 0.60.357).
 * Map: docs/2026-10-25-nexus-update-phasemap.spec UP12_open_a_pull_request_for_any_agent.
 * James, 2026-11-01: "Open the PR" · "okay but for all agents, as a agent tool".
 *
 * Push the branch with git (his credential helper; Nexus never reads or holds a token), then `gh pr create` when gh is installed and
 * signed in; otherwise GitHub's compare URL with title and body prefilled, said as the fallback (§1.2). Refused on the base branch itself
 * and on a dirty tree (never stashed).
 *   open({ dir, base, title, body, push, run }) → { ok, branch, base, url, via: 'gh'|'compare', pushed, said }
 */
const { execFileSync } = require('child_process');

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

function repoOf(url) { const m = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(String(url).trim()); return m ? m[1] : null; }

function open({ dir = process.cwd(), base = 'main', title = null, body = '', push = true, run = sh } = {}) {
  const git = (...a) => run('git', a, dir);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === base || branch === 'HEAD') return { ok: false, error: `on ${branch}: a PR is opened from a branch, not ${base} itself` };
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  if (dirty) return { ok: false, error: `the tree has uncommitted changes (${dirty.split('\n').length} file(s)): commit them first; nothing is stashed` };
  const repo = repoOf(git('remote', 'get-url', 'origin'));
  if (!repo) return { ok: false, error: 'origin is not a GitHub repository' };
  const t = title || git('log', '-1', '--format=%s');
  let pushed = false;
  if (push) { git('push', '-u', 'origin', branch); pushed = true; }
  try {
    const url = run('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', t, '--body', body || t], dir).split('\n').pop();
    return { ok: true, branch, base, repo, url, via: 'gh', pushed, said: `opened by gh: ${url}` };
  } catch (e) {
    const why = /ENOENT|not recognized/.test(String(e.code || e.message)) ? 'gh is not installed' : `gh did not open it (${String(e.stderr || e.message).split('\n')[0].slice(0, 200)})`;
    const url = `https://github.com/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1&title=${encodeURIComponent(t)}&body=${encodeURIComponent(body || '')}`;
    return { ok: true, branch, base, repo, url, via: 'compare', pushed, said: `${why}: open this link (signed in to GitHub) and click Create pull request` };
  }
}

module.exports = { open, repoOf };
