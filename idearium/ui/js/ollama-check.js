// ════════════════════════════════════════════════════════════════════════════
// §OLLAMA CHECK — idearium/ui/js/ollama-check.js (0.39.350 CT4)
// UUID: nexus-idearium-ui-ollama-check-v1-0000-2026-1005-jamesbrooks-001
// Map: docs/2026-10-05-code-tab-and-one-router-phasemap.spec (CT4_ollama_checked_on_his_machine)
//
// James: "make sure ollama is all wired into idearium."
// Settings → Models. GET /api/ollama/check: the bridge, the installed models, and every caller's route as copilot's
// door gives it (who answers first, whether Ollama is in it, whether its model is installed). "ask every model" asks
// each installed model a one-line question through copilot (POST /api/ollama/check/ask), one at a time — Ollama loads
// one model at a time, and each answer shows as it lands. What is not wired says so; nothing here is a guess.
// ════════════════════════════════════════════════════════════════════════════

const OCHK = { data: null, error: null, loading: false, asked: {}, running: false };

async function renderOllamaCheck(el) {
  el = el || document.getElementById('ollama-check'); if (!el) return;
  OCHK.loading = true; _ocPaint(el);
  try { OCHK.data = await api('/api/ollama/check', {}, 60000); OCHK.error = null; }
  catch (e) { OCHK.error = e.message; }
  OCHK.loading = false; _ocPaint(el);
}

function _ocPaint(el) {
  el = el || document.getElementById('ollama-check'); if (!el) return;
  const d = OCHK.data;
  if (!d) { el.innerHTML = `<div class="ds-mono">${OCHK.error ? `<span class="oc-bad">the check could not run: ${escapeHtml(OCHK.error)}</span>` : 'checking…'}</div>`; return; }
  const answered = d.models.filter(m => OCHK.asked[m] && OCHK.asked[m].ok).length, askedN = d.models.filter(m => OCHK.asked[m] && !OCHK.asked[m].busy).length;
  const bridge = d.bridge.ok ? `<span class="oc-ok">reached</span> — ${d.models.length} model${d.models.length === 1 ? '' : 's'} installed${d.bridge.active ? `, the bridge's default ${escapeHtml(d.bridge.active)}` : ''}`
    : `<span class="oc-bad">not reached</span> — ${escapeHtml(d.bridge.error || 'no answer')}`;
  const copilot = d.copilot && d.copilot.ok ? '<span class="oc-ok">routing</span>' : `<span class="oc-bad">not routing</span> — ${escapeHtml((d.copilot && d.copilot.error) || 'no answer')}`;
  const modelRow = (m) => {
    const a = OCHK.asked[m];
    const st = !a ? '<span class="oc-dim">not asked</span>' : a.busy ? '<span class="oc-dim">asking…</span>'
      : a.ok ? `<span class="oc-ok">answered</span> in ${(a.ms / 1000).toFixed(1)}s — “${escapeHtml(a.text || '')}”${a.note ? ` <span class="oc-warn">${escapeHtml(a.note)}</span>` : ''}`
      : `<span class="oc-bad">failed</span> — ${escapeHtml(a.error || 'no answer')}`;
    return `<tr data-model="${escapeHtml(m)}"><td class="oc-m">${escapeHtml(m)}${m === d.bridge.active ? ' <span class="oc-dim">default</span>' : ''}</td><td class="oc-st">${st}</td>
      <td><button class="action-btn oc-ask" ${OCHK.running || (a && a.busy) ? 'disabled' : ''} onclick="ollamaAsk('${escapeHtml(m.replace(/'/g, "\\'"))}')">ask</button></td></tr>`;
  };
  const callerRow = (c) => {
    const who = !c.ok ? `<span class="oc-bad">${escapeHtml(c.error || 'no route')}</span>`
      : `${escapeHtml(c.answers.provider)}${c.answers.model && !c.answers.provider.includes(c.answers.model) ? ` (${escapeHtml(c.answers.model)})` : ''}`;
    const oll = c.ollamaHops.length ? c.ollamaHops.map(h => `${escapeHtml(h.model || 'bridge default')}${h.installed === false ? ' <span class="oc-bad">not installed</span>' : ''}`).join(', ') : '<span class="oc-warn">none</span>';
    return `<tr class="${c.problems.length ? 'oc-row-warn' : ''}" data-caller="${escapeHtml(c.id)}"><td>${escapeHtml(c.label)}<div class="oc-dim">${escapeHtml(c.kind)}${c.preferAgent ? ` · prefers ${escapeHtml(c.preferAgent)}` : ''}</div></td>
      <td>${who}${c.ok && c.answers.why ? `<div class="oc-dim">${escapeHtml(c.answers.why)}</div>` : ''}</td><td>${oll}</td>
      <td>${c.problems.length ? c.problems.map(p => `<div class="oc-warn">${escapeHtml(p)}</div>`).join('') : '<span class="oc-ok">wired</span>'}</td></tr>`;
  };
  el.innerHTML = `<div class="ds"><div class="ds-label">reach</div><div class="ds-mono">ollama bridge   ${bridge}\ncopilot's door  ${copilot}</div>
      <div class="action-row"><button class="action-btn" onclick="renderOllamaCheck()" ${OCHK.loading ? 'disabled' : ''}>${OCHK.loading ? 'checking…' : '↻ check again'}</button>
        <button class="action-btn primary" onclick="ollamaAskAll()" ${OCHK.running || !d.models.length ? 'disabled' : ''}>${OCHK.running ? 'asking…' : 'ask every model'}</button>
        ${askedN ? `<span class="oc-dim">${answered} of ${askedN} asked answered</span>` : ''}</div></div>
    <div class="ds"><div class="ds-label">installed models — each asked “${escapeHtml(d.probe || '')}” through copilot</div>
      ${d.models.length ? `<table class="oc-table"><tbody>${d.models.map(modelRow).join('')}</tbody></table>` : `<div class="ds-mono oc-bad">${d.bridge.ok ? 'Ollama has no models installed — ollama pull one' : 'no list: the bridge was not reached'}</div>`}</div>
    <div class="ds"><div class="ds-label">every caller — the route copilot's door gives it</div>
      <table class="oc-table oc-callers"><thead><tr><th>caller</th><th>answers first</th><th>Ollama in its route</th><th></th></tr></thead><tbody>${d.callers.map(callerRow).join('')}</tbody></table>
      <div class="rs-note">The route follows Settings → routing (mode, chain, Ollama models). A probe is not a job: these answers do not teach the door.</div></div>`;
}

async function ollamaAsk(model) {
  OCHK.asked[model] = { busy: true }; _ocPaint();
  try { OCHK.asked[model] = await api('/api/ollama/check/ask', { method: 'POST', body: JSON.stringify({ model }) }, 140000); }
  catch (e) { OCHK.asked[model] = { ok: false, error: e.message }; }
  _ocPaint();
}
async function ollamaAskAll() {
  if (!OCHK.data || OCHK.running) return;
  OCHK.running = true; _ocPaint();
  for (const m of OCHK.data.models) await ollamaAsk(m);   // one at a time: Ollama loads one model at a time
  OCHK.running = false; _ocPaint();
}
