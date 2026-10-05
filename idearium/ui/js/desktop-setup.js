// idearium/ui/js/desktop-setup.js — §0.39.340 DK2 (docs/2026-10-01-idearium-agent-ready-master-phasemap.spec)
// James: "when clicking on setup desktop, i want to have a popup with the progress. like show me what its doing. like
// when you run setup in the run menu in idearium. like I want a setup screen, asking for the username and password.
// and i want options for the vm".
//
// openDesktopSetup(repo) — a popup in three steps: the account (desktop.user / desktop.password), the VM (desktop.ram_mb
// / cpus / network, the desktop and the languages this repo needs, what this computer has to run it), and the setup's
// own progress (cos/testenv/setup-job.js's log, as provision.js reports it). Nothing new on the server: the settings go
// through POST /api/config, the repo's extras through POST /api/repos/:uuid/environment, the start through
// POST /api/repos/:uuid/environment/setup, the progress from GET /api/cos/testenv. Closing the popup leaves the setup
// running; opening it again while it runs goes straight to the progress.
// Page globals used: api(), escapeHtml(), toast(); openRepoDesktop() when present (the "Open desktop" at the end).

// provision.js's steps, in order, recognised by what it says (cos/testenv/provision.js say() / out())
const DSU_STAGES = [
  { id: 'qemu',     label: 'QEMU on this computer',                                   rx: /\bQEMU\b|winget/i },
  { id: 'download', label: 'Download the Debian image',                               rx: /download|using the downloaded image/i },
  { id: 'disk',     label: 'Prepare the disk',                                        rx: /preparing the disk/i },
  { id: 'boot',     label: 'First boot — packages, the desktop, your account',        rx: /first boot|^guest:|^console:|accelerator/i },
  { id: 'verify',   label: 'Check the image boots the way a run will',                rx: /verifying|verified|guest reported/i },
  { id: 'ready',    label: 'Ready',                                                   rx: /^ready:/i },
];
const DSU_USER_RX = /^[a-z_][a-z0-9_-]{0,31}$/;

let _dsu = null;          // { repo, step, env, config, status, form, error, timer, showLog }

function _dsuEl() { return document.getElementById('dsu-modal'); }
function _dsuClose() {
  if (_dsu && _dsu.timer) clearTimeout(_dsu.timer);
  const el = _dsuEl(); if (el) el.remove();
  _dsu = null;
}

/** dsuStages(log, state) → [{ id, label, mark: 'done'|'now'|'todo'|'failed' }], current line, download pct */
function dsuStages(log = [], state = 'idle') {
  let at = -1, pct = null, line = '';
  for (const e of log) {
    const msg = String((e && e.msg) || '');
    if (!msg) continue;
    line = msg;
    const i = DSU_STAGES.findIndex(s => s.rx.test(msg));
    if (i > at) at = i;
    if (e.phase === 'download' && typeof e.pct === 'number') pct = e.pct;
  }
  if (state === 'done') at = DSU_STAGES.length - 1;
  const stages = DSU_STAGES.map((s, i) => ({ id: s.id, label: s.label,
    mark: state === 'done' ? 'done' : i < at ? 'done' : i === at ? (state === 'failed' ? 'failed' : 'now') : 'todo' }));
  if (at < 0 && state === 'running') stages[0].mark = 'now';
  return { stages, line, pct: at === 1 || (at < 1 && pct != null) ? pct : (at > 1 ? 100 : pct) };
}

async function openDesktopSetup(repo) {
  if (_dsu) _dsuClose();
  _dsu = { repo, step: 1, env: null, config: null, status: null, form: null, error: null, timer: null, showLog: false };
  const el = document.createElement('div');
  el.id = 'dsu-modal'; el.className = 'dsu-overlay';
  el.innerHTML = '<div class="dsu-box" role="dialog" aria-label="Set up the desktop"><div class="dsu-body">Reading what this computer has…</div></div>';
  el.addEventListener('click', (e) => { if (e.target === el) _dsuClose(); });
  document.body.appendChild(el);
  const [env, config, status] = await Promise.all([
    api(`/api/repos/${repo.uuid}/environment`).catch(e => ({ error: e.message })),
    api('/api/config').catch(e => ({ error: e.message })),
    api('/api/cos/testenv').catch(e => ({ error: e.message })),
  ]);
  if (!_dsu) return;
  Object.assign(_dsu, { env, config, status });
  const d = (config && config.desktop) || {};
  const opts = (env && env.options) || {};
  const needs = ((env && env.check && env.check.vm && env.check.vm.extras) || []).filter(x => x !== 'desktop');
  _dsu.form = { user: d.user || 'nexus', password: '', confirm: '', ram: d.ram_mb || 4096, cpus: d.cpus || 2, network: d.network || 'nat',
    desktop: opts.desktop !== false, langs: [...new Set([...needs, ...((opts.extras || []).filter(x => x !== 'desktop'))])], needs };
  if (status && status.state === 'running') { _dsu.step = 3; _dsuPoll(); }
  _dsuPaint();
}

function _dsuPaint() {
  const el = _dsuEl(); if (!el || !_dsu) return;
  const f = _dsu.form || {};
  const esc = (s) => escapeHtml(String(s == null ? '' : s));
  const steps = ['Account', 'VM', 'Progress'].map((t, i) => `<span class="dsu-step ${_dsu.step === i + 1 ? 'on' : _dsu.step > i + 1 ? 'past' : ''}">${i + 1} · ${t}</span>`).join('');
  const err = _dsu.error ? `<div class="dsu-err">${esc(_dsu.error)}</div>` : '';
  let body = '', foot = '';
  if (_dsu.step === 1) {
    body = `<p class="dsu-note">The account you log in to the desktop with. It is made when the image is built and set again each time a desktop starts.</p>
      <label class="dsu-field">Username<input id="dsu-user" autocomplete="off" value="${esc(f.user)}"></label>
      <label class="dsu-field">Password<input id="dsu-pass" type="password" autocomplete="new-password" placeholder="leave empty to keep the current one" value="${esc(f.password)}"></label>
      <label class="dsu-field">Confirm password<input id="dsu-confirm" type="password" autocomplete="new-password" value="${esc(f.confirm)}"></label>`;
    foot = `<button class="action-btn" onclick="_dsuClose()">Cancel</button><button class="action-btn primary" id="dsu-next" onclick="_dsuNext()">Next</button>`;
  } else if (_dsu.step === 2) {
    const host = (_dsu.status && _dsu.status.host) || {};
    const vm = (_dsu.status && _dsu.status.vm) || {};
    const accel = host.accel ? (host.accel.accel || host.accel.name || host.accel) : null;
    const langs = ['go', 'ruby', 'php', 'rust'].map(x => `<label class="dsu-check"><input type="checkbox" class="dsu-lang" value="${x}" ${f.langs.includes(x) ? 'checked' : ''}> ${x}${f.needs.includes(x) ? ' <em>this repo needs it</em>' : ''}</label>`).join('');
    body = `<div class="dsu-grid">
        <label class="dsu-field">Memory (MB)<input id="dsu-ram" type="number" min="512" max="65536" step="256" value="${esc(f.ram)}"></label>
        <label class="dsu-field">CPUs<input id="dsu-cpus" type="number" min="1" max="32" value="${esc(f.cpus)}"></label>
        <label class="dsu-field">Network<select id="dsu-net"><option value="nat" ${f.network === 'nat' ? 'selected' : ''}>internet (NAT)</option><option value="none" ${f.network === 'none' ? 'selected' : ''}>none</option></select></label>
      </div>
      <label class="dsu-check"><input type="checkbox" id="dsu-desktop" ${f.desktop ? 'checked' : ''}> <b>Desktop</b> — xfce, a browser and an editor (Open desktop needs it)</label>
      <div class="dsu-langs">Languages: ${langs}</div>
      <div class="dsu-engine"><b>Engine:</b> QEMU${accel ? ` · accelerator ${esc(typeof accel === 'string' ? accel : JSON.stringify(accel))}` : ''}${vm.ok ? ' · a base image exists — this rebuilds it' : ` · ${esc(vm.reason || 'no base image yet')}`}</div>
      <p class="dsu-note">The first setup downloads Debian and installs everything inside the VM: 10–40 minutes. You can close this and keep working.</p>`;
    foot = `<button class="action-btn" onclick="_dsuBack()">Back</button><button class="action-btn primary" id="dsu-start" onclick="_dsuStart()">Start setup</button>`;
  } else {
    const st = _dsu.status || {};
    const state = st.state || 'idle';
    const p = dsuStages(st.log || [], state);
    const started = st.startedAt ? Math.round(((st.endedAt || Date.now()) - st.startedAt) / 1000) : 0;
    const mm = `${Math.floor(started / 60)}:${String(started % 60).padStart(2, '0')}`;
    const list = p.stages.map(s => `<li class="dsu-stage ${s.mark}"><span class="dsu-mark">${s.mark === 'done' ? '✓' : s.mark === 'now' ? '●' : s.mark === 'failed' ? '✗' : '○'}</span>${esc(s.label)}${s.id === 'download' && s.mark === 'now' && p.pct != null ? `<span class="dsu-bar"><span style="width:${Math.max(0, Math.min(100, p.pct))}%"></span></span><span class="dsu-pct">${p.pct}%</span>` : ''}</li>`).join('');
    const result = st.result || {};
    const tail = state === 'failed' ? `<div class="dsu-err">Setup failed: ${esc(result.error || 'see the log')}${result.consoleTail ? `<pre class="dsu-pre">${esc(String(result.consoleTail).slice(-1500))}</pre>` : ''}</div>`
      : state === 'done' ? '<div class="dsu-ok">The desktop VM is ready.</div>' : '';
    const log = _dsu.showLog ? `<pre class="dsu-pre dsu-log">${esc((st.log || []).map(e => e.msg).filter(Boolean).slice(-80).join('\n'))}</pre>` : '';
    body = `<div class="dsu-state">${esc(state === 'running' ? 'setting up' : state)} · ${mm}</div><ol class="dsu-stages">${list}</ol>
      ${state === 'running' && p.line ? `<div class="dsu-line">${esc(p.line)}</div>` : ''}${tail}
      <button class="action-btn dsu-logbtn" onclick="_dsu.showLog=!_dsu.showLog;_dsuPaint()">${_dsu.showLog ? 'hide the log' : 'show the log'}</button>${log}`;
    foot = state === 'running' ? '<button class="action-btn" onclick="_dsuClose()">Close — it keeps running</button>'
      : state === 'failed' ? '<button class="action-btn" onclick="_dsuClose()">Close</button><button class="action-btn primary" onclick="_dsu.step=1;_dsu.error=null;_dsuPaint()">Try again</button>'
      : `<button class="action-btn" onclick="_dsuClose()">Close</button>${typeof openRepoDesktop === 'function' ? '<button class="action-btn primary" onclick="const u=_dsu.repo.uuid;_dsuClose();openRepoDesktop(u)">Open desktop</button>' : ''}`;
  }
  // §0.39.343 — James: "the log keeps pulling to the top, can you pull it down to the current outputs of the log". Each
  // repaint rebuilt the log at the top. It now follows the newest line — unless he has scrolled up to read, then it
  // stays where he is until he scrolls back to the bottom.
  const prevLog = el.querySelector('.dsu-log');
  const follow = !prevLog || (prevLog.scrollHeight - prevLog.scrollTop - prevLog.clientHeight) < 24;
  const keepTop = prevLog ? prevLog.scrollTop : 0;
  el.querySelector('.dsu-box').innerHTML = `<div class="dsu-head"><h3>Set up the desktop</h3><button class="dsu-x" aria-label="close" onclick="_dsuClose()">×</button></div>
    <div class="dsu-steps">${steps}</div>${err}<div class="dsu-body">${body}</div><div class="dsu-foot">${foot}</div>`;
  const logEl = el.querySelector('.dsu-log');
  if (logEl) logEl.scrollTop = follow ? logEl.scrollHeight : keepTop;
}

function _dsuRead() {
  const v = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; };
  const f = _dsu.form;
  if (_dsu.step === 1) { f.user = String(v('dsu-user') || '').trim(); f.password = v('dsu-pass') || ''; f.confirm = v('dsu-confirm') || ''; }
  if (_dsu.step === 2) {
    f.ram = parseInt(v('dsu-ram'), 10); f.cpus = parseInt(v('dsu-cpus'), 10); f.network = v('dsu-net') || 'nat';
    const d = document.getElementById('dsu-desktop'); f.desktop = !!(d && d.checked);
    f.langs = [...document.querySelectorAll('.dsu-lang:checked')].map(x => x.value);
  }
}
function _dsuNext() {
  _dsuRead();
  const f = _dsu.form;
  if (!DSU_USER_RX.test(f.user)) _dsu.error = 'The username must start with a letter, lowercase letters, digits, - or _ (Linux account rules).';
  else if (f.password !== f.confirm) _dsu.error = 'The two passwords are not the same.';
  else { _dsu.error = null; _dsu.step = 2; }
  _dsuPaint();
}
function _dsuBack() { _dsuRead(); _dsu.error = null; _dsu.step = 1; _dsuPaint(); }

async function _dsuStart() {
  _dsuRead();
  const f = _dsu.form, repo = _dsu.repo, d = (_dsu.config && _dsu.config.desktop) || {};
  if (!(f.ram >= 512 && f.ram <= 65536)) { _dsu.error = 'Memory must be between 512 and 65536 MB.'; return _dsuPaint(); }
  if (!(f.cpus >= 1 && f.cpus <= 32)) { _dsu.error = 'CPUs must be between 1 and 32.'; return _dsuPaint(); }
  const btn = document.getElementById('dsu-start'); if (btn) btn.disabled = true;
  // actor 'user': the person's own click — desktop.user / desktop.password refuse any other actor (not copilot_writable)
  const set = (key, value) => api('/api/config', { method: 'POST', body: JSON.stringify({ key, value, actor: 'user' }) });
  try {
    // the account and the VM first — the setup reads them when it starts
    if (f.user !== d.user) await set('desktop.user', f.user);
    if (f.password) await set('desktop.password', f.password);
    if (f.ram !== d.ram_mb) await set('desktop.ram_mb', f.ram);
    if (f.cpus !== d.cpus) await set('desktop.cpus', f.cpus);
    if (f.network !== d.network) await set('desktop.network', f.network);
    const options = { ...((_dsu.env && _dsu.env.options) || {}), desktop: f.desktop, extras: f.langs };
    await api(`/api/repos/${repo.uuid}/environment`, { method: 'POST', body: JSON.stringify({ options }) });
    await api(`/api/repos/${repo.uuid}/environment/setup`, { method: 'POST', body: '{}' }, 30000);
  } catch (e) { _dsu.error = `Not started: ${e.message}`; if (btn) btn.disabled = false; return _dsuPaint(); }
  _dsu.error = null; _dsu.step = 3; _dsu.form.password = ''; _dsu.form.confirm = '';
  _dsuPoll();
}

async function _dsuPoll() {
  if (!_dsu) return;
  clearTimeout(_dsu.timer);
  try { _dsu.status = await api('/api/cos/testenv'); } catch (e) { _dsu.error = `progress unreadable: ${e.message}`; }
  if (!_dsu) return;
  _dsuPaint();
  if (_dsu.status && _dsu.status.state === 'running') _dsu.timer = setTimeout(_dsuPoll, 1500);
}
