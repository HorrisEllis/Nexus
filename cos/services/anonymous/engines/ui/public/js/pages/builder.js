/* NexusPanel — pages/builder.js */
import { $, html, text, api, apiSoft, esc, emptyRow, toast, when, config } from '../core.js';

let current = null;    // active build record
let poller  = null;
let seen    = 0;

export async function init() {
  wireDropZone();
  $('b-confirm')?.addEventListener('click', startBuild, { once: false });
  $('b-discard')?.addEventListener('click', discard);
  $('b-cancel')?.addEventListener('click', cancelBuild);
  await loadHistory();
}

// ── upload ──────────────────────────────────────────────────────────────────

function wireDropZone() {
  const zone  = $('drop-zone');
  const input = $('file-input');
  if (!zone || !input || zone.dataset.wired) return;
  zone.dataset.wired = '1';

  const lift = on => {
    zone.style.borderColor = on ? 'var(--signal)' : 'var(--edge)';
    zone.style.background  = on ? 'rgba(0,229,255,.06)' : 'transparent';
  };

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  ['dragenter', 'dragover'].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); lift(true); }));
  ['dragleave', 'drop'].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); lift(false); }));
  zone.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) upload(f);
  });
  input.addEventListener('change', () => { if (input.files[0]) upload(input.files[0]); });
}

async function upload(file) {
  if (!/\.zip$/i.test(file.name)) { toast('Only .zip archives are accepted', 'err'); return; }
  if (file.size > 268435456)      { toast('That archive is larger than 256 MB', 'err'); return; }

  $('upload-progress').style.display = '';
  $('upload-bar').style.width = '30%';
  text('upload-status', `Uploading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`);

  try {
    const res = await fetch('/ui/builder/upload?filename=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    $('upload-bar').style.width = '75%';
    text('upload-status', 'Inspecting the project…');

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `${res.status} ${res.statusText}`);

    $('upload-bar').style.width = '100%';
    $('upload-bar').classList.add('g');
    text('upload-status', 'Ready — check the detected settings below.');
    showDetection(data);
  } catch (e) {
    $('upload-bar').style.width = '100%';
    text('upload-status', e.message);
    toast('Upload failed — ' + e.message, 'err');
  }
}

// ── detection ───────────────────────────────────────────────────────────────

function showDetection(data) {
  current = data;
  seen = 0;
  const d = data.detection || {};

  $('detect-card').style.display = '';
  html('detect-stats',
    `<div class="stat"><div class="slabel">Stack</div><div class="sval b">${esc(d.label || '—')}</div></div>` +
    `<div class="stat"><div class="slabel">Confidence</div><div class="sval ${d.confidence === 'high' ? 'g' : 'y'}">${esc(d.confidence || '—')}</div></div>` +
    `<div class="stat"><div class="slabel">Runtime</div><div class="sval">${esc(d.runtime || 'static')}</div></div>` +
    `<div class="stat"><div class="slabel">Port</div><div class="sval ${data.port ? 'b' : ''}">${data.port || 'none'}</div></div>`);

  html('detect-signals', 'Matched on: ' + (d.signals || []).map(esc).join(', '));

  html('detect-notes', (d.notes || []).length
    ? (d.notes || []).map(n =>
        `<div style="font-size:13px;color:var(--dim);padding:6px 0;border-left:2px solid var(--pending);padding-left:10px;margin-bottom:6px">${esc(n)}</div>`).join('')
    : '');

  $('b-install').value  = d.install  || '';
  $('b-build').value    = d.build    || '';
  $('b-start').value    = d.start    || '';
  $('b-servedir').value = d.serveDir || '';
  $('b-port').value     = data.port  || '';
  $('b-domain').value   = suggestDomain(data);

  if (d.unsupported) {
    toast(`${d.label} is not deployable yet — you can still deploy it as static files`, 'warn');
  }
  $('detect-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function suggestDomain(data) {
  const base = (data.filename || 'project').replace(/\.zip$/i, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return (base || 'project') + '.' + (config.domain || 'localhost');
}

function discard() {
  current = null;
  stopPolling();
  $('detect-card').style.display = 'none';
  $('build-card').style.display  = 'none';
  $('upload-progress').style.display = 'none';
  $('upload-bar').classList.remove('g');
  $('upload-bar').style.width = '0';
}

// ── build ───────────────────────────────────────────────────────────────────

async function startBuild() {
  if (!current) return;
  const domain = ($('b-domain').value || '').trim();
  if (!domain) { toast('Enter a domain to deploy to', 'err'); return; }

  const body = {
    buildId:  current.buildId,
    domain,
    install:  ($('b-install').value  || '').trim() || null,
    build:    ($('b-build').value    || '').trim() || null,
    start:    ($('b-start').value    || '').trim() || null,
    serveDir: ($('b-servedir').value || '').trim() || null,
    port:     parseInt($('b-port').value, 10) || null,
  };

  try {
    await api('/ui/builder/build', { method: 'POST', body });
    $('build-card').style.display = '';
    $('build-log').innerHTML = '';
    seen = 0;
    setState('building');
    $('build-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    startPolling(current.buildId, domain);
  } catch (e) {
    toast('Could not start the build — ' + e.message, 'err');
  }
}

function setState(state) {
  const el = $('build-state');
  if (!el) return;
  const cls = state === 'live' ? 'up' : state === 'failed' || state === 'cancelled' ? 'down' : 'pending';
  el.className = 'badge ' + cls;
  el.textContent = state;
}

function startPolling(buildId, domain) {
  stopPolling();
  poller = setInterval(async () => {
    const r = await apiSoft(`/ui/builder/status/${encodeURIComponent(buildId)}?since=${seen}`);
    if (!r) return;
    if (r.lines?.length) {
      seen += r.lines.length;
      const box = $('build-log');
      box.innerHTML += r.lines.map(l => {
        const cls = l.stream === 'err' ? 'ERROR' : l.stream === 'cmd' ? 'WARN' : 'INFO';
        return `<div class="${cls}">${esc(l.text)}</div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
    }
    setState(r.state);
    if (['live', 'failed', 'cancelled'].includes(r.state)) {
      stopPolling();
      loadHistory();
      if (r.state === 'live') {
        const a = $('b-visit');
        a.href = 'https://' + domain;
        a.style.display = '';
        toast(domain + ' is live');
      } else if (r.state === 'failed') {
        toast('Build failed — ' + (r.error || 'see the output above'), 'err');
      }
    }
  }, 1200);
}

function stopPolling() { if (poller) { clearInterval(poller); poller = null; } }

async function cancelBuild() {
  if (!current) return;
  await apiSoft('/ui/builder/cancel', { method: 'POST', body: { buildId: current.buildId } });
  stopPolling();
  setState('cancelled');
}

// ── history ─────────────────────────────────────────────────────────────────

async function loadHistory() {
  const r = await apiSoft('/ui/builder/list');
  const rows = r?.builds || [];
  html('build-history', rows.length
    ? rows.map(b => {
        const cls = b.state === 'live' ? 'up' : ['failed','cancelled'].includes(b.state) ? 'down' : 'pending';
        return `<tr><td class="num">${esc(b.filename || '—')}</td>` +
          `<td>${esc(b.stack || '—')}</td>` +
          `<td>${b.domain ? `<a href="https://${esc(b.domain)}" target="_blank" rel="noopener">${esc(b.domain)}</a>` : '—'}</td>` +
          `<td><span class="badge ${cls}">${esc(b.state)}</span></td>` +
          `<td style="color:var(--dim);font-size:12px">${esc(when(b.createdAt))}</td></tr>`;
      }).join('')
    : emptyRow(5, 'Nothing deployed yet', 'Drop a project archive above to deploy your first one.'));
}
