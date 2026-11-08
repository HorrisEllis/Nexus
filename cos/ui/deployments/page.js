/* cos/ui/deployments/page.js — the Deployments page (OC4a, 0.60.445; docs/orchestration-console.spec MOD-OC-DEPLOY-PAGE).
   James, 2026-11-08: "Also the automation is to deploy agents to systems." Deploy (his act, taken at once), every deployment with its state and
   result, Recall. Reads and writes only COS's own routes. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (v != null) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c) e.appendChild(c); return e; };
  const say = (cls, t) => { const m = $('dp-msg'); m.className = 'dp-msg ' + cls; m.textContent = t; };
  const api = async (method, p, body) => { const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.error || `refused (${r.status})`); return d; };
  async function systems() { try { const d = await api('GET', '/api/cos/systems'); $('dp-system').replaceChildren(...d.systems.map(s => el('option', { value: s.name, text: `${s.name} · ${s.state}` }))); } catch (e) { say('bad', `COS's manager did not answer: ${e.message}`); } }
  async function list() {
    try {
      const d = await api('GET', '/api/cos/deployments');
      $('dp-list').replaceChildren(...(d.deployments.length ? d.deployments.map(x => el('div', { class: 'dp-row', 'data-id': x.id }, [
        el('span', { class: 'dp-state ' + x.state, text: x.state }), el('b', { text: x.system }),
        el('span', { text: `${x.what.kind} · ${x.what.ref}` }),
        ['taken', 'running'].includes(x.state) ? (() => { const b = el('button', { 'data-act': 'recall', text: 'Recall' }); b.onclick = async () => { try { await api('POST', `/api/cos/deployments/${encodeURIComponent(x.id)}/recall`, { by: 'person' }); list(); } catch (e) { say('bad', e.message); } }; return b; })() : el('span'),
        el('div', { class: 'dp-detail', text: [x.result && x.result.status != null ? `→ ${x.result.status} ${x.result.reply || ''}` : '', x.error ? `error: ${x.error}` : '', x.note || '', `proposal ${x.proposal} · by ${x.by}`].filter(Boolean).join(' · ') })])) : [el('p', { text: 'Nothing deployed yet.' })]));
    } catch (e) { $('dp-list').textContent = e.message; }
  }
  $('dp-kind').onchange = () => { const t = $('dp-kind').value === 'task'; $('dp-m-l').hidden = !t; $('dp-ref').placeholder = t ? '/health' : ($('dp-kind').value === 'agent' ? 'a hat, e.g. the_builder' : 'a pipeline id'); };
  $('dp-form').onsubmit = async (e) => {
    e.preventDefault(); const kind = $('dp-kind').value, ref = $('dp-ref').value.trim(), system = $('dp-system').value;
    const what = kind === 'task' ? { kind, task: { do: { kind: 'command', ref: `${$('dp-method').value} ${ref}` } } } : { kind, ref };
    try { const d = await api('POST', '/api/cos/deploy', { what, system, by: 'person', why: 'deployed from the Deployments page' }); say('ok', `Deployed to ${system} (${d.deployment ? d.deployment.id : d.proposal.id})`); list(); setTimeout(list, 800); }
    catch (err) { say('bad', err.message); }
  };
  systems(); list(); setInterval(() => { if (!document.hidden) list(); }, 4000);
  window.DEPLOYMENTS = { list };
})();
