'use strict';
// ui/home/areas/conversations.js — Conversations channel: co-pilot exchange log.
// Split from ui/home/index.html (inline script, lines 1897-1965 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Conversation Log ──────────────────────────────────────────────────────────
// Reads chat_log from JAA via orchestrator proxy.
// Shows co-pilot + NCP exchanges with intent, model, channel metadata.

async function convLoad() {
  const filter = document.getElementById('conv-filter')?.value || '';
  const list   = document.getElementById('conv-list');
  if (!list) return;
  list.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:rgba(255,255,255,.2);padding:16px">Loading…</div>';

  try {
    const url = `http://127.0.0.1:${P.orch}/api/memory?table=chat_log&limit=40`;
    const d = await fetch(url).then(r=>r.json()).catch(()=>null);
    const rows = (d?.rows || d?.result || []).filter(r => !filter || r.provider===filter || r.source===filter)
      .sort((a,b)=>(b.ts||0)-(a.ts||0));

    document.getElementById('conv-count').textContent = `${rows.length} exchanges`;

    if (!rows.length) {
      list.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:rgba(255,255,255,.2);padding:16px">No conversations yet. Try asking co-pilot something.</div>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(row => {
      const ago = _convAgo(row.ts);
      const provider = row.provider || row.source || 'unknown';
      const intent   = row.intent || '—';
      const model    = row.modelUsed || row.model || '';
      const channel  = row.channel || '';
      const prompt   = (row.prompt || '').slice(0, 300);
      const response = (row.response || '').slice(0, 400);

      const card = document.createElement('div');
      card.className = 'conv-card';
      const badgeClass = ['copilot','claude','chatgpt','ollama'].includes(provider) ? provider : 'copilot';

      card.innerHTML = `
        <div class="conv-card-head">
          <span class="conv-badge ${badgeClass}">${provider}</span>
          ${intent!=='—'?`<span class="conv-intent">${intent}</span>`:''}
          ${channel?`<span class="conv-intent" style="color:rgba(255,255,255,.18)">${channel}</span>`:''}
          <span class="conv-ts" style="margin-left:auto">${ago}</span>
        </div>
        <div class="conv-prompt">${_escHtml(prompt)}</div>
        ${response?`
          <div class="conv-response" id="cr-${row.uuid}">${_escHtml(response)}${response.length>=400?'…':''}</div>
          ${response.length>100?`<span class="conv-expand" onclick="this.previousElementSibling.classList.toggle('expanded');this.textContent=this.textContent==='▼ expand'?'▲ collapse':'▼ expand'">▼ expand</span>`:''}
        `:''}
        ${model?`<div style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(255,255,255,.18);margin-top:6px">via ${model}${row.fromGrammar?' · grammar-routed':''}</div>`:''}
      `;
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = `<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:var(--err);padding:16px">Error: ${e.message}</div>`;
  }
}

function _convAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now()-ts)/1000);
  if (s<60) return `${s}s ago`;
  if (s<3600) return `${Math.round(s/60)}m ago`;
  return `${Math.round(s/3600)}h ago`;
}
function _escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

