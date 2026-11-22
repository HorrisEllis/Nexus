/* cos/ui/storage/page.js — Settings › Storage and data (SC19 slice a, docs/2026-11-02-cos-console-phasemap.spec).
   James, 2026-11-22: "first give cos ui a tab for storage and data, like location of nexus, reinstall tools, verifify integrity tools, manage nexus,
   in the cos ui settings." · shown the preview: "Yes, build it". Holds no logic of its own: what a file count means is Emerge's (cos/sovereign/storage.eg),
   each act is a COS route, the service is the exe's door. UI code in JavaScript: COS's pages are JavaScript today (said, §17.13). */
(async function () {
  'use strict';
  const { h, esc } = COS; const $ = (id) => document.getElementById(id);
  const gb = (n) => n >= 1e12 ? (n / 1e12).toFixed(1) + ' TB' : n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.round((n || 0) / 1e3) + ' KB';
  const door = (() => { try { return window.top.cosStart && window.top.cosStart.startup ? window.top.cosStart : null; } catch (_) { return null; } })();
  const S = { st: null, job: null };
  try { await COS.page('storage'); } catch (e) { return e.down ? COS.down($('loc'), e.message) : COS.say($('loc'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }

  const kv = (rows) => rows.flatMap(([k, v, c]) => [h('span', {}, k), h('b', { class: c || '' }, v)]);
  const check = (t, v, c) => h('div', { class: 'st-check' }, h('span', {}, t), h('em', { class: c || '' }, v));
  const tool = (t, d, label, fn, held) => h('div', { class: 'st-tool', 'data-tool': label }, h('div', {}, h('b', {}, t), h('small', {}, d)), h('button', { class: 'btn', disabled: !!held || undefined, title: held || '', onclick: fn }, label));
  function drawJob() { const j = S.job, el = $('job'); if (!j || (j.state !== 'running' && Date.now() - (j.finishedAt || j.at) > 3600000)) { el.hidden = true; return; } el.hidden = false; el.className = 'st-job ' + j.state; el.textContent = j.state === 'running' ? `${j.tool} is running…` : j.says || `${j.tool}: ${j.state}`; }
  const act = (tool2, title, body, danger) => async () => {
    if (!await COS.confirm({ title, body, act: 'Go', danger: !!danger })) return;
    try { const r = await COS.call('POST', `/api/cos/storage/${tool2}`, { by: 'person', confirm: true }); S.job = r.job; drawJob(); }
    catch (e) { if (!e.refused) COS.notice('err', e.message); }
  };
  const reinstallService = async () => {
    if (!door) return COS.notice('err', 'Open this page in the COS app: the service belongs to the app.');
    if (!await COS.confirm({ title: 'Reinstall the COS service?', body: 'Removes and sets up the Windows service again on this same folder. Windows may ask for permission, and Nexus restarts.', act: 'Reinstall', danger: true })) return;
    const o = await door.startup(), s = o && (o.options || []).find(x => x.key === 'runAsService');
    if (!s) return COS.notice('err', 'COS did not offer its service setting.');
    const r = await door.setStartup('runAsService', s.value === true); r && r.ok ? COS.notice('ok', 'The service was set up again.') : COS.notice('err', (r && r.error) || 'refused');
  };
  const rollBack = async () => {
    if (!await COS.confirm({ title: 'Roll back the last update?', body: 'Returns the code to the commit before the last update. Git refuses if your local edits are in the way.', act: 'Roll back', danger: true })) return;
    try { const r = await COS.call('POST', '/api/cos/update/rollback', { by: 'person', confirm: true }); COS.notice('ok', `Rolled back${r.to && r.to.version ? ' to ' + r.to.version : ''}.`); load(); } catch (e) { if (!e.refused) COS.notice('err', e.message); }
  };
  $('tools').replaceChildren(
    tool('Repair missing files', 'Restores only tracked code files that are missing. Changed files and data are left alone.', 'Repair…', act('repair', 'Repair missing files?', 'Restores only the code files git says are missing. Changed files and data are left alone.')),
    tool('Reinstall dependencies', 'Installs node modules from the lockfile. Systems restart after.', 'Reinstall…', act('dependencies', 'Reinstall dependencies?', 'Runs npm install from the lockfile, then restarts every running system. A build in progress is interrupted.', true)),
    tool('Reinstall the COS service', 'Removes and sets up the Windows service again on this same folder.', 'Reinstall…', reinstallService, door ? null : 'Only in the COS app'),
    tool('Roll back the last update', 'Returns to the code from before the last update.', 'Roll back…', rollBack));
  $('manage').replaceChildren(
    tool('Restart Nexus', 'Restarts every running system, in boot order.', 'Restart…', act('restart', 'Restart Nexus?', 'Restarts every running system, in boot order. A build in progress is interrupted.', true)),
    tool('Move Nexus', 'Held: switching COS to a new folder needs the next COS app update.', 'Move…', null, 'The COS app has no way to switch folders yet (phase CA7, slice b)'),
    tool('Back up now', 'A git backup of the code with your edits, and an archive of the data beside Nexus.', 'Back up', act('backup', 'Back up now?', 'Makes a git backup branch with your uncommitted edits, and archives every data folder into nexus-backups beside Nexus. It can take a few minutes.')));

  async function load() {
    $('verify').disabled = true;
    const [st, up, hist, sys, self] = await Promise.all([COS.call('GET', '/api/cos/storage'), COS.call('GET', '/api/cos/update').catch(() => ({})), COS.call('GET', '/api/cos/update/history').catch(() => ({})), COS.call('GET', '/api/cos/systems').catch(() => ({})), door ? door.startup().catch(() => null) : null]).catch((e) => { COS.notice('err', e.message); return []; });
    $('verify').disabled = false; if (!st) return; S.st = st; S.job = st.job; drawJob();
    const i = st.integrity, opt = (k) => self && (self.options || []).find(o => o.key === k), svc = opt('runAsService'), win = opt('startWithWindows');
    $('loc').replaceChildren(...kv([['Nexus', st.root, 'st-path'], ...(st.cosRoot ? [['COS', st.cosRoot, 'st-path']] : []), ['Version', `${up.current || '?'}${up.branch ? ' on ' + up.branch : ''}${up.head ? ' · ' + up.head.slice(0, 9) : ''}`],
      ['GitHub', up.ahead == null ? 'not read' : `${up.ahead} commits not pushed, ${up.behind} behind`], ['Service', self ? `${svc && svc.value ? 'on' : 'off'}${win && win.value ? ' · starts with Windows' : ''}` : 'shown in the COS app']]));
    $('drives').replaceChildren(...st.drives.map(d => { const low = st.low && st.low.at === d.at; return h('div', { class: 'st-drive' + (low ? ' low' : ''), 'data-drive': d.at }, h('header', {}, h('span', {}, `${d.at} ${st.root.startsWith(d.at) ? 'Nexus' : st.cosRoot && st.cosRoot.startsWith(d.at) ? 'COS' : 'Windows'}`), h('b', {}, `${gb(d.free)} free of ${gb(d.total)}`)), h('div', { class: 'st-bar' }, h('i', { style: `width:${((d.total - d.free) / d.total * 100).toFixed(1)}%` }))); }));
    const count = (n, t) => h('div', { class: 'st-count' }, h('b', {}, n.toLocaleString()), h('small', {}, t));
    $('counts').replaceChildren(count(i.missing, 'code files missing'), count(i.changed, 'code files changed'), count(i.added, 'code files not tracked'));
    const b = (hist.history || []).find(x => x.backup);
    $('checks').replaceChildren(check('Emerge matches its lock', st.lock.ok ? 'yes' : 'no', st.lock.ok ? 'good' : 'off'), check('Data files changed, missing or new', `${(i.dataChanged + i.dataMissing + i.dataAdded).toLocaleString()} (normal)`), check('Last backup before an update', b ? `${new Date(b.at).toLocaleDateString()}${b.backup.files ? ' · ' + b.backup.files.toLocaleString() + ' files' : ''}` : 'none'));
    const says = st.low ? `${st.low.at} has only ${gb(st.low.free)} free` : st.headline.says;
    $('state').className = 'st-state ' + st.headline.level; $('state').lastElementChild.textContent = says;
    drawSystems(sys.systems || []);
  }
  function drawSystems(list) { const up = list.filter(s => s.state === 'up'); $('up').textContent = `${up.length} of ${list.length} up`; $('sys').replaceChildren(...list.map(s => h('span', { class: s.state === 'up' ? 'up' : '' }, s.name))); }
  let sizeT = null;
  async function sizes(again) { clearTimeout(sizeT); try { const s = await COS.call('GET', `/api/cos/storage/sizes${again ? '?again=1' : ''}`), m = Math.max(1, ...s.folders.map(x => x.bytes)), t = s.folders.reduce((a, x) => a + x.bytes, 0);
    $('sizes').replaceChildren(...s.folders.slice(0, 16).map(x => h('div', { class: 'st-size' }, h('span', {}, x.name), h('div', { class: 'st-bar' }, h('i', { style: `width:${x.bytes / m * 100}%` })), h('small', {}, gb(x.bytes)))));
    $('sz').textContent = s.measuring ? (s.folders.length ? `${gb(t)} · measuring again…` : 'measuring…') : gb(t); if (s.measuring) sizeT = setTimeout(sizes, 4000); } catch (e) { $('sz').textContent = 'not read'; } }
  $('verify').onclick = () => { load(); sizes(true); };
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText(S.st.root); COS.notice('ok', 'Folder path copied.'); } catch (_) { COS.notice('err', S.st ? S.st.root : 'not read yet'); } };
  COS.on('cos.storage', (j) => { S.job = j; drawJob(); if (j.state !== 'running') load(); });
  COS.on('cos.system.state', () => { COS.call('GET', '/api/cos/systems').then(r => drawSystems(r.systems || [])).catch(() => {}); });
  load(); sizes();
})();
