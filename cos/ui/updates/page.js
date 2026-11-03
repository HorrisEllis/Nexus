/**
 * cos/ui/updates/page.js — Nexus's updates in COS, the settings behind the gear (MOD-MG-UI-UPDATES). SC7, 0.60.380.
 * James, 2026-11-02: "A gear, with update settings and Build that update section in cos. With a gear"
 * Reads COS's routes only: GET /api/cos/update (?fetch=1 asks GitHub), the settings, the history; acts through POST …/apply and …/rollback with
 * by = person, each confirmed in the shell first. The gear (here, and in the shell's top bar: #/updates/settings) opens the settings.
 */
(async function () {
  'use strict';
  const { h, esc, icon } = COS; const $ = (id) => document.getElementById(id);
  const S = { u: null, set: null, edits: {}, hist: [] };
  try { await COS.page('updates'); } catch (e) { return e.down ? COS.down($('state'), e.message) : COS.say($('state'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }
  $('gear').innerHTML = icon('gear');
  const open = (on) => { $('settings').hidden = !on; $('gear').setAttribute('aria-expanded', String(on)); if (on) $('settings').scrollIntoView({ block: 'nearest' }); };
  $('gear').onclick = () => open($('settings').hidden);
  const fromHash = () => { try { if (/^#\/updates\/settings/.test(window.parent.location.hash)) open(true); } catch (_) {} };
  fromHash(); try { window.parent.addEventListener('hashchange', fromHash); } catch (_) {}

  // ── the gear's settings ──
  const LABEL = { auto: 'Auto', notify: 'Notify', off: 'Off', ask: 'Ask' };
  function seg(id, opts) {
    const cur = id in S.edits ? S.edits[id] : S.set.settings[id];
    $(id).replaceChildren(...opts.map(v => h('button', { type: 'button', role: 'radio', 'aria-checked': String(cur === v), 'data-v': v, onclick: () => edit(id, v) }, LABEL[v] || v)));
  }
  function renderSettings() {
    seg('policy', S.set.options.policy); seg('keepLocal', S.set.options.keepLocal);
    if (!('everyHours' in S.edits)) $('everyHours').value = S.set.settings.everyHours;
    $('set-at').textContent = S.set.settings.setAt ? `set ${COS.ago(Date.parse(S.set.settings.setAt))}` : 'the defaults';
    $('save').disabled = !Object.keys(S.edits).length;
  }
  function edit(k, v) { if (String(v) === String(S.set.settings[k])) delete S.edits[k]; else S.edits[k] = v; $('set-msg').textContent = ''; renderSettings(); }
  $('everyHours').oninput = (e) => edit('everyHours', Number(e.target.value));
  $('set-form').onsubmit = async (e) => {
    e.preventDefault(); const patch = { ...S.edits };
    if (!await COS.confirm({ title: 'Save the update settings?', body: Object.entries(patch).map(([k, v]) => `<code>${esc(k)}</code> → ${esc(v)}`).join('<br>') + '<br><br>Written as your act, on COS\'s ledger and in Versionium.', act: 'Save' })) return;
    try { S.set = await COS.call('PATCH', '/api/cos/update/settings', { patch, by: 'person' }); S.edits = {}; renderSettings(); $('set-msg').textContent = 'saved'; COS.notice('ok', 'Update settings saved'); }
    catch (err) { if (!err.refused) { $('set-msg').textContent = err.message; $('set-msg').classList.add('err'); } }
  };

  // ── this Nexus against GitHub ──
  function renderState() {
    const u = S.u, st = $('state');
    if (!u || u.ok === false) { st.replaceChildren(h('p', { class: 'state-line warn' }, (u && (u.error || u.why)) || 'No answer from the update check.')); return; }
    const behind = u.behind || 0;
    $('checked').textContent = S.set && S.set.last && S.set.last.at ? `checked ${COS.ago(Date.parse(S.set.last.at) || S.set.last.at)}` : '';
    const lines = [h('div', { class: 'big' }, u.current || '?', behind ? h('span', { class: 'arrow' }, '→') : null, behind ? (u.latest || '?') : null, h('small', {}, behind ? `${behind} commit${behind > 1 ? 's' : ''} behind` : 'up to date'))];
    if (u.can) lines.push(h('p', { class: 'state-line warn' }, u.can));
    if (u.local && u.local.count) lines.push(h('p', { class: 'state-line' }, `${u.local.count} commit${u.local.count > 1 ? 's' : ''} here GitHub lacks; ${u.local.onGitHub} already on GitHub by content.`));
    if (u.busy) lines.push(h('p', { class: 'state-line warn' }, `An update is running (${u.busy.mode}).`));
    const acts = h('div', { class: 'acts' });
    if (behind && !u.busy) {
      if (u.local && u.local.count) acts.append(h('button', { class: 'btn primary', id: 'keep', onclick: () => apply('keep-local') }, 'Keep mine and update'));
      else acts.append(h('button', { class: 'btn primary', id: 'update', onclick: () => apply('update') }, 'Update now'));
    }
    lines.push(acts); st.replaceChildren(...lines);
    const ps = u.perSystem || {}; const rows = [];
    for (const n of ps.restart || []) rows.push(h('li', {}, h('span', {}, n), h('span', {}, 'restarts by itself')));
    for (const n of ps.waitForHim || []) rows.push(h('li', { class: 'wait' }, h('span', {}, n), h('span', {}, 'waits for you')));
    if (ps.kernelChanged || ps.cosChanged) rows.push(h('li', { class: 'wait' }, h('span', {}, ps.cosChanged ? 'cos' : 'lib'), h('span', {}, 'loads at COS\'s next start')));
    $('files').textContent = behind ? `${u.files || 0} files · ${(u.systems || []).join(', ')}` : '';
    $('systems').replaceChildren(rows.length ? h('ul', { class: 'sys' }, ...rows) : h('p', { class: 'faint', style: 'margin:0' }, behind ? 'No supervised system changes.' : 'Nothing to change.'));
    const rel = (u.releases || []); $('releases-panel').hidden = !rel.length;
    $('releases').replaceChildren(...rel.map(r => h('li', {}, h('b', {}, r.version || ''), r.quote || r.line || r.text || '')));
  }
  async function apply(mode) {
    const u = S.u, ps = u.perSystem || {};
    const body = `${esc(u.current)} → ${esc(u.latest)}. A backup first${mode === 'keep-local' ? `, your ${u.local.count} commit(s) kept on a local/&lt;date&gt; branch` : ''}; then ${ps.restart && ps.restart.length ? `${esc(ps.restart.join(', '))} restart by themselves` : 'no restart'}${ps.waitForHim && ps.waitForHim.length ? `; ${esc(ps.waitForHim.join(', '))} waits for you` : ''}.`;
    if (!await COS.confirm({ title: mode === 'keep-local' ? 'Keep mine and update?' : 'Update Nexus now?', body, act: mode === 'keep-local' ? 'Keep mine and update' : 'Update now' })) return;
    try { const r = await COS.call('POST', '/api/cos/update/apply', { by: 'person', mode }); COS.notice('ok', `Updated to ${(r.to && r.to.version) || u.latest}${r.restarted && r.restarted.length ? `; restarted ${r.restarted.map(x => x.name).join(', ')}` : ''}`); }
    catch (err) { if (!err.refused) COS.notice('err', err.message); }
    load();
  }

  // ── history and roll back ──
  function renderHistory() {
    const hs = S.hist; $('hist-n').textContent = hs.length ? `${hs.length}` : '';
    const lastUpdate = hs.find(r => r.kind === 'update');
    $('history').replaceChildren(...(hs.length ? hs.map(r => h('li', {},
      h('span', { class: 'kind' }, r.kind),
      h('span', {}, `${(r.from && r.from.version) || '?'} → ${(r.to && r.to.version) || '?'} · ${r.by || ''}${r.at ? ` · ${COS.ago(Date.parse(r.at) || r.at)}` : ''}${r.keptOn ? ` · kept on ${r.keptOn}` : ''}`),
      r === lastUpdate && hs[0] === r ? h('button', { class: 'btn sm danger', id: 'rollback', onclick: () => rollback(r) }, 'Roll back') : h('span'))) : [h('li', { class: 'empty' }, 'Nothing updated through this tool yet.')]));
  }
  async function rollback(r) {
    if (!await COS.confirm({ title: `Roll back to ${r.from && r.from.version}?`, body: `The folder goes back to the commit before this update; each changed system restarts. Your data is not touched.`, act: 'Roll back', danger: true })) return;
    try { await COS.call('POST', '/api/cos/update/rollback', { by: 'person' }); COS.notice('ok', `Rolled back to ${r.from && r.from.version}`); } catch (err) { if (!err.refused) COS.notice('err', err.message); }
    load();
  }

  async function load(fetch = false) {
    const [u, set, hist] = await Promise.all([COS.call('GET', `/api/cos/update${fetch ? '?fetch=1' : ''}`).catch(e => ({ ok: false, error: e.message })), COS.call('GET', '/api/cos/update/settings').catch(() => null), COS.call('GET', '/api/cos/update/history').catch(() => ({ history: [] }))]);
    S.u = u; if (set) { S.set = set; renderSettings(); } S.hist = hist.history || []; renderState(); renderHistory();
  }
  $('check').onclick = async () => { $('check').disabled = true; $('check').textContent = 'Asking GitHub…'; try { await load(true); } finally { $('check').disabled = false; $('check').textContent = 'Check GitHub now'; } };
  COS.on('cos.update', (d) => { if (d && (d.phase === 'updated' || d.phase === 'refused')) load(); });
  load();
})();
