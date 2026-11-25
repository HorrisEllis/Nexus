'use strict';
// cos/ui/models/page.js — COS › Settings › Model server (PC18 settings_2026_11_24, SC29), from the approved preview.
// James, 2026-11-24: "lets get this done. i want those settings in cos ui." · "settings are for the dynamic and additive." · "Remeber no coupling".
// Every read and save goes through the system's own door (inference/cli.eg, by COS's /api/cos/systems/inference/eg/*). A control carries its
// setting's path (data-k, a JSON list: model names hold dots); Save sends only what he changed, kept only when it passes; a refusal is said.
(() => {
  const API = '/api/cos/systems/inference/eg';
  const $ = (id) => document.getElementById(id), esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const INTENTS = [['coding', 'Generating / coding'], ['spec', 'Speccing / mapping'], ['reason', 'Complex reasoning'], ['debug', 'Debugger / adversarial'], ['copilot', 'Co-pilot / orchestrator']];
  const GB = (b) => (b / 1e9).toFixed(1) + ' GB', short = (n) => String(n).replace(/^hf\.co\/[^/]+\//, '').replace(/-Instruct-abliterated-i1-GGUF/, '');
  let D = null, U = null, G = 'models', change = {};
  const at = (o, p) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
  const put = (o, p, v) => { let x = o; for (let i = 0; i < p.length - 1; i++) { if (typeof x[p[i]] !== 'object' || x[p[i]] === null || Array.isArray(x[p[i]])) x[p[i]] = {}; x = x[p[i]]; } x[p[p.length - 1]] = v; };
  const cur = (p) => { const c = at(change, p); return c !== undefined ? c : at(D.settings, p); };
  const K = (p) => esc(JSON.stringify(p));
  const row = (label, ctl, help) => `<div class="ms-row"><label>${label}</label><div class="ms-ctl">${ctl}</div>${help ? `<div class="ms-help">${help}</div>` : ''}</div>`;
  const num = (p, unit) => `<input type="number" data-k="${K(p)}" value="${esc(cur(p))}">${unit ? ` <span class="ms-sub">${unit}</span>` : ''}`;
  const txt = (p) => `<input type="text" data-k="${K(p)}" value="${esc(cur(p))}">`;
  const sel = (p, opts) => `<select data-k="${K(p)}">${opts.map((o) => `<option ${o === cur(p) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const chk = (p) => `<input type="checkbox" data-k="${K(p)}" ${cur(p) ? 'checked' : ''}>`;
  const names = () => Object.keys(D.settings.models || {});
  const GROUPS = {
    engines: ['Engines', 'The engine plugins, in the order they are tried. Ours supervises; the engine only runs the model. A new engine is added here, never in code.', () => (D.settings.engines || []).map((e, i) => `
      <div class="ms-card"><h3>${esc(e.id)} <span class="ms-pill ${i === 0 && D.engine ? 'ok' : ''}">plugin ${i + 1}${i === 0 ? (D.engine ? ' · found' : ' · not found') : ''}</span></h3>
        ${e.paths ? row('Path', txt(['engines', i, 'paths', 0]), 'Your own build of the engine goes here.') : ''}${e.address ? row('Address', txt(['engines', i, 'address'])) : ''}
        ${row('Used', sel(['engines', i, 'use'], ['every model', 'models it can run', 'when plugin 1 cannot run the model', 'never']))}</div>`).join('')
      + `<div class="ms-card"><h3>Model store</h3>${row('Read models from', txt(['stores', 0]))}</div>`],
    models: ['Models', 'One card per model found on this PC. Each has its own server and its own settings: what Ollama cannot do per model.', () => D.models.map((m) => { const p = ['models', m.name], loaded = (U && U.loaded || []).includes(m.name);
      return `<div class="ms-card"><h3>${esc(short(m.name))} <span class="ms-pill">${GB(m.bytes)}</span>${loaded ? ' <span class="ms-pill warn">loaded now (Ollama)</span>' : ''}</h3><div class="ms-sub">${esc(m.name)}</div>
        ${row('On', chk([...p, 'on']), 'Off: never started, never asked.')}${row('Port', num([...p, 'port']))}
        ${row('Requests at once (slots)', num([...p, 'slots']), 'The engine\'s -np. Several gates answered together.')}
        ${row('Context', num([...p, 'ctx'], 'tokens'))}${row('GPU layers', num([...p, 'gpu_layers']), 'The engine\'s -ngl: how much of it lives on the graphics card.')}${row('CPU threads', num([...p, 'threads']))}
        ${row('After answering', sel([...p, 'after'], ['stay loaded', 'free its memory']))}
        ${row('Serves', INTENTS.map(([k, l]) => `<label class="ms-pill"><input type="checkbox" data-serve="${K(m.name)}" value="${k}" ${(cur([...p, 'serves']) || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join(' '), 'The intents it may be routed for (RAID routes by this).')}</div>`; }).join('')],
    intents: ['Intent routing', 'For each intent: which model first, which at a wall, and what then. RAID routes by this map.', () => `<div class="ms-card"><table class="ms-table"><tr><th>Intent</th><th>First</th><th>At a wall</th><th>Then</th></tr>${INTENTS.map(([k, l]) => `<tr><td>${l}</td><td>${sel(['intents', k, 'first'], ['', ...names()])}</td><td>${sel(['intents', k, 'wall'], ['', ...names()])}</td><td>${sel(['intents', k, 'then'], ['ask me', 'Guardian', 'Co-pilot', 'nothing'])}</td></tr>`).join('')}</table></div>`],
    modes: ['Modes', 'Which models run, with how many slots, and when it is chosen. RAID picks the mode; COS applies it on its resource manager\'s events.', () => (D.settings.modes || []).map((md, i) => `<div class="ms-card"><h3>${esc(md.name)}</h3>${row('Name', txt(['modes', i, 'name']))}${row('Chosen when', sel(['modes', i, 'when'], ['pieces waiting for the 3b', 'a wall in the queue', 'only when free memory allows', 'I pick it']))}${row('Needs free', num(['modes', i, 'needs_mb'], 'MB'))}</div>`).join('')],
    memory: ['Memory', 'COS\'s resource manager accounts for this system as for every compartment (Resources): no second manager here. What it reads now:', () => { const h = U && U.host; const free = h && typeof h.freeMemPct === 'number' ? h.freeMemPct : null;
      return `<div class="ms-card"><h3>Now ${free != null ? `<span class="ms-pill ${free < 10 ? 'warn' : 'ok'}">${free.toFixed(0)}% free</span>` : ''}</h3>${free != null ? `<div class="ms-mem"><b style="width:${100 - free}%"></b></div>` : '<div class="ms-sub">COS\'s resource manager did not answer.</div>'}
        <div class="ms-sub">loaded: ${esc(((U && U.loaded) || []).map(short).join(', ') || 'nothing')}</div><p class="ms-lede" style="margin-top:12px">Limits, the floor and what happens under pressure are set on COS's <b>Resources</b> page, per compartment.</p></div>`; }],
    queue: ['Queue', 'How jobs wait, time out and are stopped.', () => `<div class="ms-card">${row('First token within', num(['queue', 'first_token_s'], 's'))}${row('Whole answer within', num(['queue', 'answer_s'], 's'))}${row('Retries', num(['queue', 'retries']))}
      ${row('A job whose run is gone', sel(['queue', 'orphan'], ['stop it, free its model', 'let it finish']))}${row('Pieces per call (batch)', num(['queue', 'batch']), 'More than one independent piece in one call.')}</div>`],
    ladder: ['Ladder and walls', 'A bigger model only at a wall; what a wall is, set here.', () => `<div class="ms-card">${row('A wall is', sel(['ladder', 'wall'], ['the breakdown exhausted', 'N refused tries', 'either']))}${row('Breakdown depth', sel(['ladder', 'depth'], ['no limit', '4', '8']))}
      ${row('Each wall', sel(['ladder', 'each_wall'], ['a row and a request to fix it', 'a row only']))}</div>`],
    recorder: ['Recorder and rewind', 'Every call kept, so a run can be replayed or rewound without the model.', () => `<div class="ms-card">${row('Record every call', chk(['recorder', 'record']))}${row('Keep for', num(['recorder', 'keep_days'], 'days'))}${row('Engine slot save (rewind)', chk(['recorder', 'slot_save']))}${row('Replay without a model', chk(['recorder', 'replay']))}
      ${row('Hook into', sel(['recorder', 'hook'], ['Idearium rewind engine and flight recorder', 'off']))}</div>`],
    gates: ['Gates', 'Each kind of gate reads these by reference: its intent, its brief, its tries. A gate is set from here, never from code.', () => `<div class="ms-card"><table class="ms-table"><tr><th>Gate</th><th>Intent</th><th>Brief</th><th>Tries</th></tr>${Object.keys(D.settings.gates || {}).map((g) => `<tr><td>${esc(g)}</td><td>${sel(['gates', g, 'intent'], INTENTS.map((x) => x[0]))}</td><td>${sel(['gates', g, 'brief'], ['small', 'medium', 'large'])}</td><td>${num(['gates', g, 'tries'])}</td></tr>`).join('')}</table></div>`],
  };
  const dirty = () => { const n = JSON.stringify(change) === '{}' ? 0 : 1; $('ms-save').disabled = !n; $('ms-dirty').textContent = n ? 'changed, not saved' : ''; };
  function draw() {
    $('ms-nav').innerHTML = Object.entries(GROUPS).map(([k, [l]]) => `<button class="${k === G ? 'on' : ''}" data-g="${k}">${l}${k === 'models' ? `<i>${D.models.length}</i>` : ''}</button>`).join('');
    $('ms-nav').querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { G = b.dataset.g; draw(); });
    const [t, lede, body] = GROUPS[G];
    $('ms-main').innerHTML = `<h2 style="margin:0 0 6px">${t}</h2><p class="ms-lede">${lede}</p>${(D.problems || []).length ? `<div class="ms-msg bad">${D.problems.map(esc).join('<br>')}</div>` : ''}${body()}`;
    $('ms-main').querySelectorAll('[data-k]').forEach((el) => el.onchange = () => { const p = JSON.parse(el.dataset.k); put(change, p, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value); dirty(); });
    $('ms-main').querySelectorAll('[data-serve]').forEach((el) => el.onchange = () => { const n = JSON.parse(el.dataset.serve), p = ['models', n, 'serves'], set = new Set(cur(p) || []); el.checked ? set.add(el.value) : set.delete(el.value); put(change, p, [...set]); dirty(); });
  }
  async function load() {
    try { const r = await fetch(`${API}/settings`); const d = await r.json(); if (d.ok === false) throw new Error(d.error || 'refused'); D = d; }
    catch (e) { $('ms-main').innerHTML = `<div class="ms-msg bad">The model server's settings could not be read: ${esc(e.message)}</div>`; return; }
    try { const [u, l] = await Promise.all([fetch('/api/cos/usage').then((r) => r.json()), fetch('/api/cos/systems/ollama-bridge').then((r) => r.json()).catch(() => null)]); U = { host: u && u.usage && u.usage.host, loaded: [] }; } catch (_) { U = null; }
    draw(); dirty();
  }
  $('ms-save').onclick = async () => {
    $('ms-save').disabled = true;
    try { const r = await fetch(`${API}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) }); const d = await r.json();
      if (!d.ok) { $('ms-msg').className = 'ms-msg bad'; $('ms-msg').innerHTML = 'Not saved: ' + (d.problems || [d.error]).map(esc).join('; '); dirty(); return; }
      $('ms-msg').className = 'ms-msg ok'; $('ms-msg').textContent = 'Saved.'; change = {}; await load(); }
    catch (e) { $('ms-msg').className = 'ms-msg bad'; $('ms-msg').textContent = 'Not saved: ' + e.message; dirty(); }
  };
  load();
})();
