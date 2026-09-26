'use strict';
/**
 * renderer/library/sections/responses.js — Library → Responses  (styles: responses.css)
 * v0.39.239 (as ui/library/areas/responses.js) → 0.39.241 on the Settings runtime.
 *
 * James: "the download manager should be routing the response to the agent or
 * compartment id" and "needs a ui so i can actually see this visually".
 * Every agent reply guardian completes is a .response in Clear Glass's downloads
 * index (clear-glass/src/downloads/artifact-chat-index.js, COS compartment
 * 'clearglass-downloads-index'), filed under the agent it belongs to (repo-<uuid>
 * for an idearium repo agent). Read-only, through GET /cli/downloads/responses[/:id].
 * The idearium Agent tab reads the same index for replies copilot stopped waiting
 * for (0.39.241, lib/repo-agent.js findLate/adoptLate).
 */
(function () {
  const { h, modal, pane, row, btn, chip, empty, ago, section } = window.CGS;
  const { api, fmtBytes, matches } = window.CGL;
  let agentFilter = '';   // survives re-renders (search, refresh) while the window is open

  function kv(pairs) {
    return h('div', { class: 'resp-kv' }, pairs.filter(([, v]) => v).map(([k, v]) => [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: String(v) })]));
  }

  // 0.39.254 — a chat transcript: the conversation itself, and every earlier version of it.
  async function viewTranscript(it) {
    const raw = it.raw || {};
    const vr = await api(`/cli/downloads/responses?chatKey=${encodeURIComponent(it.chat_key)}&versions=all&limit=1000`);
    const versions = (vr.items || []).slice().sort((a, b) => (b.version || 0) - (a.version || 0));
    const body = [kv([
      ['agent', it.agent_id || '(your chat)'], ['provider', it.provider], ['chat', raw.url || it.chat_id],
      ['version', `v${it.version} of ${versions.length}${raw.partial ? ' · partial (last reply only)' : ''}`],
      ['captured', it.captured_at ? new Date(it.captured_at).toLocaleString() : ''], ['source', raw.source], ['hash', it.transcript_hash],
    ])];
    if (versions.length > 1) {
      const pick = h('select', { class: 'resp-ver', 'aria-label': 'Open another version' },
        versions.map(v => h('option', { value: v.id, text: `v${v.version} · ${v.message_count} messages · ${ago(v.captured_at)}`, selected: v.id === it.id ? 'selected' : null })));
      // Close this modal through its own Escape handler (resolves it, removes its listener), then open the version picked.
      pick.addEventListener('change', () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); view(pick.value).catch(e => window.CGS.fail(e)); });
      body.push(pick);
    }
    body.push(h('div', { class: 'resp-h', text: `Conversation · ${(raw.messages || []).length} messages` }),
      h('div', { class: 'resp-convo' }, (raw.messages || []).map(m =>
        h('div', { class: `resp-msg resp-${m.role}` }, h('span', { class: 'who', text: m.role === 'user' ? 'prompt' : 'reply' }), h('pre', { class: 'out', text: m.text })))));
    await modal({ title: `Chat — ${it.agent_id || it.provider} · ${it.chat_id}`, body, wide: true });
  }

  async function view(id) {
    const r = await api(`/cli/downloads/responses/${encodeURIComponent(id)}`);
    const it = r.item, raw = it.raw || {};
    if (it.kind === 'transcript') return viewTranscript(it);
    const body = [kv([
      ['agent', it.agent_id || '(none)'], ['provider', it.provider], ['job', it.job_id], ['chat', it.chat_id || raw.chatUrl],
      ['captured', it.captured_at ? new Date(it.captured_at).toLocaleString() : ''], ['hash', it.content_hash],
    ])];
    if (it.kind === 'artifact') {
      body.push(kv([['file', `${raw.filename || ''}${raw.bytes ? ` · ${fmtBytes(raw.bytes)}` : ''}`], ['saved at', raw.savePath],
        ['in index', raw.copied ? 'copied' : 'by path only (over 10 MB, or unreadable at capture)']]));
    } else {
      if (raw.prompt) body.push(h('details', { class: 'resp-fold' }, h('summary', { text: `Prompt · ${raw.prompt.length} chars` }), h('pre', { class: 'out', text: raw.prompt })));
      body.push(h('div', { class: 'resp-h', text: 'Response' }), h('pre', { class: 'out resp-text', text: raw.response || '' }));
      const blocks = raw.codeBlocks || [];
      if (blocks.length) body.push(h('div', { class: 'resp-h', text: `Code blocks · ${blocks.length}` }), blocks.map(b =>
        h('details', { class: 'resp-fold' }, h('summary', { text: `${b.syntax || 'text'}${b.ext ? ` ${String(b.ext).startsWith('.') ? b.ext : '.' + b.ext}` : ''} · ${fmtBytes(b.bytes)}` }), h('pre', { class: 'out', text: b.code || '' }))));
    }
    await modal({ title: `${it.kind === 'artifact' ? 'Download' : 'Response'} — ${it.agent_id || it.provider || id}`, body, wide: true });
  }

  section({
    id: 'responses', group: 'Library', icon: '❝', label: 'Responses',
    blurb: 'Every agent chat, agent reply and provider-tab download, filed under the agent it belongs to.',
    async render({ tools, rerender, query }) {
      const r = await api(`/cli/downloads/responses${agentFilter ? `?agentId=${encodeURIComponent(agentFilter)}` : ''}`);
      const agents = r.agents || {};
      const names = Object.keys(agents).sort();
      const total = names.reduce((n, a) => n + agents[a], 0);
      const pick = h('select', { class: 'resp-agent', 'aria-label': 'Show one agent’s responses' },
        h('option', { value: '', text: `All agents (${total})` }),
        names.map(a => h('option', { value: a === '(no agent)' ? '' : a, text: `${a} (${agents[a]})`, selected: a === agentFilter ? 'selected' : null })));
      pick.addEventListener('change', () => { agentFilter = pick.value; rerender(); });
      tools.append(pick, btn('Refresh', rerender, 'sm'));

      const items = (r.items || []).filter(it => matches(query, it.agent_id, it.provider, it.job_id, it.chat_id, it.kind));
      if (!items.length) return pane({ flush: true, body: empty(query ? `Nothing matches “${query}”.` : agentFilter ? `No responses for ${agentFilter} yet.` : 'No chats or agent responses captured yet.') });
      return pane({
        title: `${items.length} item${items.length === 1 ? '' : 's'}`, flush: true,
        body: items.map(it => {
          const rw = row(it.agent_id || '(no agent)',
            (it.kind === 'transcript'
              ? ['chat', `v${it.version}${it.versions > 1 ? ` (${it.versions} versions)` : ''}`, `${it.message_count} messages`, ago(it.captured_at), it.chat_id]
              : [it.kind === 'artifact' ? 'download' : 'reply', it.job_id ? `job ${String(it.job_id).slice(0, 8)}` : null, ago(it.captured_at), it.chat_id]).filter(Boolean).join(' · '),
            it.provider ? chip(it.provider, 'plain') : null,
            it.status === 'unreadable' ? chip('unreadable', 'bad') : null,
            btn('View', () => view(it.id).catch(e => window.CGS.fail(e)), 'sm'));
          rw.classList.add('resp-row', `resp-${it.kind || 'x'}`);
          rw.prepend(h('span', { class: 'resp-kind', 'aria-hidden': 'true', text: it.kind === 'artifact' ? '⤓' : it.kind === 'transcript' ? '☰' : '❝' }));
          return rw;
        }),
      });
    },
  });
})();
