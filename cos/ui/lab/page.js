/* cos/ui/lab/page.js — the Lab (EMB4). James, 2026-11-23: "I have no way to look at any of this" · "i need to see pipeline" · "just need this
   building. not losing the meaning." Read-only: one COS route. UI code in JavaScript: COS's pages are JavaScript today (said, §17.13). */
(async function () {
  'use strict';
  const { esc } = COS; const $ = (id) => document.getElementById(id);
  try { await COS.page('lab'); } catch (e) { return e.down ? COS.down($('main'), e.message) : COS.say($('main'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }
  let D = null, tab = 'overview';
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const tone = (s) => (/^(passed|met|landed|up)/i.test(s) ? 'ok' : /^(held|failed|not met|error)/i.test(s) ? 'bad' : /^(cancelled|declared)/i.test(s) ? 'dim' : 'warn');
  const row = (t, chip, d, extra = '') => `<div class="lab-row"><div class="t">${esc(t)}</div>${chip ? `<span class="lab-chip ${tone(chip)}">${esc(chip)}</span>` : '<span></span>'}${d ? `<div class="d">${d}</div>` : ''}${extra}</div>`;
  const pieces = () => { const seen = new Map(); for (const b of D.builds) for (const p of b.pieces || []) { const k = b.phase + '#' + p.name; if (!seen.has(k)) seen.set(k, { ...p, phase: b.phase }); } return [...seen.values()]; };
  const TABS = [['overview', 'Overview'], ['requests', 'RAID requests'], ['builds', 'Builds and tests'], ['pieces', 'Pieces'], ['issues', 'Issues and proof']];
  const V = {
    overview() { const c = {}; for (const r of D.requests) c[r.phase] = (c[r.phase] || 0) + 1; const ps = pieces(), up = D.systems.filter((s) => s.state === 'up').length;
      return `<div class="lab-cards"><div class="lab-card"><small>Systems up</small><b>${up} of ${D.systems.length}</b></div><div class="lab-card"><small>RAID build requests met</small><b>${c.met || 0} of ${D.requests.length}</b></div><div class="lab-card"><small>Pieces passed</small><b>${ps.filter((p) => p.status === 'passed').length} of ${ps.length}</b></div><div class="lab-card"><small>Builds that passed their test</small><b>${D.builds.filter((b) => b.passed).length} of ${D.builds.length}</b></div></div>`
        + (c.running ? `<div class="lab-note"><b>${c.running} requests say "running"</b>Check each against its model job: one with no job behind it is a dead run.</div>` : '')
        + `<div class="lab-note ok"><b>Where this stands</b>Nexus is a lab for coding with small local models: end state first, pieces that always save, each piece small enough for the smallest model, every piece attacked by the compiler and its examples, every issue logged with its grade.</div>`
        + `<h2 class="lab-h2">Systems</h2><div class="lab-list">${D.systems.map((s) => row(s.name, s.state)).join('')}</div>`; },
    requests() { return `<input class="lab-filter" placeholder="Filter requests" aria-label="Filter requests"><div class="lab-list">${D.requests.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).map((r) => row(r.name, r.phase, `${esc(r.summary || '')} · started ${ago(r.startedAt)}${r.finishedAt ? ' · ended ' + ago(r.finishedAt) : ''}`)).join('')}</div>`; },
    builds() { return D.builds.length ? `<div class="lab-list">${D.builds.map((b) => row(`${b.phase} · ${ago(b.at)}`, b.landed ? 'landed' : b.passed ? 'passed' : b.end === 'examples-failed' ? 'failed' : b.end, `${b.calls} model calls · ${Math.round(b.ms / 1000)} s · ${(b.pieces || []).length} pieces · ${esc(b.steps)}`)).join('')}</div>` : '<p>No builds yet.</p>'; },
    pieces() { const by = {}; for (const p of pieces()) (by[p.phase] = by[p.phase] || []).push(p); const keys = Object.keys(by);
      return keys.length ? `<input class="lab-filter" placeholder="Filter pieces" aria-label="Filter pieces">` + keys.map((k) => `<h2 class="lab-h2">${esc(k)} · ${by[k].filter((x) => x.status === 'passed').length} of ${by[k].length} passed</h2><div class="lab-list">${by[k].sort((a, b) => a.name.localeCompare(b.name)).map((p) => row(p.name, p.status, `${p.tries} tries · ${esc((p.models || []).join(', ') || 'no model')}${p.last ? ' · last: ' + esc(p.last) : ''}`, p.body ? `<details><summary>See the code that passed</summary><pre>${esc(p.body)}</pre></details>` : '')).join('')}</div>`).join('') : '<p>No pieces recorded yet. Each build from now on records its pieces here.</p>'; },
    issues() { return D.issues.length ? `<div class="lab-list">${D.issues.map((i) => row(`${i.id} · ${i.issue}`, /^Failed/.test(i.grade) ? 'Failed' : 'Grade ' + i.grade, `<b>His solution:</b> ${esc(i.his)}<br><b>Before → after:</b> ${esc(i.result)}`)).join('')}</div>` : '<p>No graded issues yet.</p>'; },
  };
  const count = (k) => ({ requests: D.requests.length, builds: D.builds.length, pieces: pieces().length, issues: D.issues.length }[k]);
  function draw() {
    $('tabs').innerHTML = TABS.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-k="${k}">${l}${k === 'overview' ? '' : `<b>${count(k)}</b>`}</button>`).join('');
    $('tabs').querySelectorAll('button').forEach((b) => { b.onclick = () => { tab = b.dataset.k; draw(); }; });
    $('main').innerHTML = V[tab]();
    const f = $('main').querySelector('.lab-filter'); if (f) f.oninput = () => $('main').querySelectorAll('.lab-row').forEach((r) => { r.hidden = !r.textContent.toLowerCase().includes(f.value.toLowerCase()); });
  }
  async function load() { try { D = await COS.call('GET', '/api/cos/lab'); $('sub').textContent = `Live from Nexus · read ${new Date(D.at).toLocaleTimeString()} · ${D.requests.length} requests, ${D.builds.length} builds`; draw(); }
    catch (e) { if (!e.refused) COS.say($('main'), { glyph: 'x', title: 'The lab could not be read', text: esc(e.message) }); } }
  await load(); setInterval(load, 30000);
})();
