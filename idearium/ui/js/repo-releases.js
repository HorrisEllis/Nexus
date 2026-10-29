// idearium/ui/js/repo-releases.js — 0.60.72 RN3. The Versionium tab's Releases: every release, what landed in it.
// James, 2026-10-16: "tell me all the recent changes. i want a changelog for each change or diff. i want it all syncd with
// git, versionium, the zip." · 2026-10-15: "i want idearium to have releases and a changelog for each version."
// Reads Versionium's releases (GET /api/releases for Nexus itself, GET /api/repos/:uuid/releases for a repo). Nexus's
// parent repo shows every release; a Nexus system's repo shows the releases whose commits touched that system. A row
// opens to his words, its changelog file, and every commit with its files (versionium/lib/release-notes.js wrote them from git).
// "Changes since" renders the whole record (GET /api/releases/changes); "save" writes CHANGES.md. A release recorded
// before RN2 has no commits yet: "sync" fills them (POST /api/releases/sync { all: true }).
(function () {
  'use strict';
  const S = { repo: null, data: null, open: null, shown: 25, system: null, nexus: false };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const $ = (id) => document.getElementById(id);
  const day = (t) => t ? new Date(t).toISOString().slice(0, 10) : '';
  const touches = (r, sys) => !sys || (r.files && r.files[sys]) || (r.commits || []).some(c => (c.systems || []).includes(sys));

  async function renderReleases(repo) {
    const el = $('rel-index');
    if (!el || !repo) return;
    const nx = repo.nexusSelf || null;
    Object.assign(S, { repo: repo.uuid, open: null, shown: 25, nexus: !!nx, system: nx && nx.role === 'system' ? nx.system : null });
    el.innerHTML = `<div class="ds"><div class="ds-label">releases</div><div class="ds-mono">reading releases…</div></div>`;
    try {
      S.data = S.nexus ? await api('/api/releases', {}, 20000) : await api(`/api/repos/${repo.uuid}/releases`, {}, 20000);
    } catch (e) {
      el.innerHTML = `<div class="ds"><div class="ds-label">releases</div><div class="ds-mono">could not read releases from Versionium: ${esc(e.message)}</div></div>`;
      return;
    }
    if (S.repo !== repo.uuid) return;
    draw();
  }

  function draw() {
    const el = $('rel-index');
    if (!el || !S.data) return;
    const all = (S.data.releases || []).filter(r => touches(r, S.system));
    const missing = all.filter(r => !Array.isArray(r.commits)).length;
    const head = `<div class="vx-tools">
        <span class="ds-label" style="margin:0">releases (${all.length})${S.system ? ` · touching ${esc(S.system)}` : ''}${S.data.current ? ` · running ${esc(S.data.current)}` : ''}</span>
        <span class="vx-grow"></span>
        ${S.nexus ? `<button class="vx-chip" onclick="releaseChanges()" title="every commit since a release, under the release that shipped it">changes since…</button>
        <button class="vx-chip" onclick="syncReleases()" title="record every release and its commits in Versionium">${missing ? `sync (${missing} without commits)` : 'sync'}</button>` : ''}
      </div>`;
    const row = (r) => {
      const n = Array.isArray(r.commits) ? r.commits.length : null;
      const open = S.open === r.version;
      return `<div class="vx-row${open ? ' open' : ''}" onclick="openRelease('${esc(r.version)}')">
          <span class="vx-k" title="release">⚑</span>
          <span class="vx-id">${esc(r.tag || 'v' + r.version)}</span>
          <span class="vx-when">${esc(day(r.at))}</span>
          <span class="vx-msg">${esc(String(r.quote || r.title || '').slice(0, 140))}</span>
          <span class="vx-when">${n == null ? 'commits not recorded' : `${n} commit${n === 1 ? '' : 's'}`}</span>
        </div>${open ? detail(r) : ''}`;
    };
    el.innerHTML = `<div class="ds">${head}${all.length ? all.slice(0, S.shown).map(row).join('') : '<div class="ds-mono">no releases yet.</div>'}
      ${all.length > S.shown ? `<button class="vx-more" onclick="moreReleases()">${all.length - S.shown} more</button>` : ''}</div>
      <div id="rel-changes"></div>`;
  }

  function detail(r) {
    const commits = (r.commits || []).filter(c => !S.system || (c.systems || []).includes(S.system));
    const files = r.files ? Object.entries(r.files).filter(([k]) => !S.system || k === S.system) : [];
    return `<div class="vx-detail">
        ${r.quote ? `<div class="ds-mono" style="white-space:pre-wrap">${esc(r.quote)}</div>` : ''}
        <div class="ds-mono">${r.changelog ? `changelog: ${esc(r.changelogPath || r.changelog)}${r.title ? ` — ${esc(r.title)}` : ''}` : 'no changelog file'} · ${r.gitCommit ? `commit ${esc(r.gitCommit.slice(0, 8))}` : 'not pinned to a commit'}</div>
        ${r.changelog && S.nexus ? `<details class="rel-cl" data-v="${esc(r.version)}" ontoggle="readChangelog(this)"><summary class="ds-label">the changelog</summary><div class="ds-mono rel-cl-text" style="white-space:pre-wrap">reading…</div></details>` : ''}
        ${Array.isArray(r.commits) ? `<div class="ds-label">what landed (${commits.length}${S.system ? ` touching ${esc(S.system)}` : ''})</div>
          ${commits.map(c => `<div class="ds-mono">${esc(c.sha.slice(0, 8))} ${esc(String(c.at || '').slice(0, 16).replace('T', ' '))} — ${esc(c.subject)}<br>
            <span style="opacity:.7">${c.files} file(s) +${c.added} −${c.removed} · ${esc((c.systems || []).join(', '))}</span></div>`).join('')}
          ${files.length ? `<div class="ds-label">files</div>${files.map(([k, v]) => `<div class="ds-mono"><b>${esc(k)}</b> (${v.length})<br>${v.map(esc).join('<br>')}</div>`).join('')}` : ''}`
          : `<div class="ds-mono">its commits are not recorded in Versionium yet — press sync.</div>`}
        ${r.notes ? `<details><summary class="ds-label">the version line</summary><div class="ds-mono" style="white-space:pre-wrap">${esc(r.notes)}</div></details>` : ''}
      </div>`;
  }

  // 0.60.274 — James, 2026-10-28: "can we move the changelogs to versionium and idearium". The changelog's text, read from Versionium's
  // home for it (GET /api/releases/changelog) the first time it is opened.
  async function readChangelog(d) {
    if (!d.open || d.dataset.read) return;
    const out = d.querySelector('.rel-cl-text');
    try {
      const j = await api(`/api/releases/changelog?version=${encodeURIComponent(d.dataset.v)}`, {}, 15000);
      if (!j || j.error || typeof j.text !== 'string') throw new Error((j && j.error) || 'no text');
      d.dataset.read = '1'; out.textContent = j.text;
    } catch (e) { out.textContent = `could not read it: ${e.message}`; }
  }
  window.readChangelog = readChangelog;

  function openRelease(v) { S.open = S.open === v ? null : v; draw(); }
  function moreReleases() { S.shown += 50; draw(); }

  async function syncReleases() {
    say('recording every release and its commits in Versionium…');
    try {
      const r = await api('/api/releases/sync', { method: 'POST', body: JSON.stringify({ all: true }) }, 180000);
      say(`${r.releases} releases: ${r.recorded} recorded, ${r.already} already, ${r.withCommits} with their commits`, 'ok');
      const repo = (typeof API_REPOS !== 'undefined' ? API_REPOS : []).find(x => x.uuid === S.repo);
      if (repo) renderReleases(repo);
    } catch (e) { say(`not synced: ${e.message}`, 'err'); }
  }

  async function releaseChanges(save) {
    const list = (S.data && S.data.releases) || [];
    const dflt = list[Math.min(list.length - 1, 24)];
    const since = save ? S.since : prompt('every change since which release?', dflt ? dflt.version : '');
    if (!since) return;
    S.since = since;
    const box = $('rel-changes'); if (box) box.innerHTML = `<div class="ds"><div class="ds-mono">reading git…</div></div>`;
    try {
      const d = await api(`/api/releases/changes?${new URLSearchParams({ since, ...(save ? { write: '1' } : {}) })}`, {}, 120000);
      if (save) { say(`${d.out} written (${d.bytes} bytes)`, 'ok'); return; }
      if (box) box.innerHTML = `<div class="ds"><div class="vx-tools"><span class="ds-label" style="margin:0">every change since ${esc(since)}</span><span class="vx-grow"></span>
          <button class="vx-chip" onclick="releaseChanges(true)" title="write it to CHANGES.md in the Nexus folder">save CHANGES.md</button></div>
          <pre class="vx-patch" style="white-space:pre-wrap">${esc(d.markdown)}</pre></div>`;
    } catch (e) { if (box) box.innerHTML = `<div class="ds"><div class="ds-mono">could not read the changes: ${esc(e.message)}</div></div>`; }
  }

  Object.assign(window, { renderReleases, openRelease, moreReleases, syncReleases, releaseChanges });
})();
