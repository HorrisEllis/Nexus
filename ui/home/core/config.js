'use strict';
// ui/home/core/config.js — Port map P, base URLs B, provider URLs, openClearGlass, CH_META channel registry.
// Split from ui/home/index.html (inline script, lines 700-761 at v0.39.227). Load order is set by index.html; do not reorder.
// ── API ───────────────────────────────────────────────────────────────────────
const P={orch:9000,gd:7820,cx:3748,br:9999,idr:4800,em:4242,arch:3747,dg:7825};
const B={orch:`http://127.0.0.1:${P.orch}`,gd:`http://127.0.0.1:${P.gd}`,cx:`http://127.0.0.1:${P.cx}`,br:`http://127.0.0.1:${P.br}`,idr:`http://127.0.0.1:${P.idr}`,em:`http://127.0.0.1:${P.em}`,arch:`http://127.0.0.1:${P.arch}`,dg:`http://127.0.0.1:${P.dg}`};
// get/post/del now loaded from /ui/lib/api.js — see DECOMP.md's own plan
// ("get/post/del helpers → ui/lib/api.js (shared utility)"), extracted 2026-07-04.

// ── Provider URLs for Clear Glass when no tab connected ───────────────────────
const PROVIDER_URLS={
  claude:      'https://claude.ai/new',
  chatgpt:     'https://chatgpt.com',
  gemini:      'https://gemini.google.com',
  perplexity:  'https://www.perplexity.ai',
  mistral:     'https://chat.mistral.ai',
  ollama:      'http://127.0.0.1:11434',
};

// openClearGlass — opens Clear Glass sovereign browser at the given URL
// Routes through the orchestrator's clear-glass launch endpoint if available,
// falls back to window.open (development mode without Electron)
function openClearGlass(url) {
  // Try orchestrator IPC to launch Clear Glass with URL
  fetch(`http://127.0.0.1:9000/api/clear-glass/open`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ url }),
  }).catch(() => {
    // Clear Glass not running via orchestrator — try direct Electron IPC
    if (window.__CLEAR_GLASS_IPC) {
      window.__CLEAR_GLASS_IPC.openURL(url);
    } else {
      // Dev fallback: open in current browser
      window.open(url, '_blank');
    }
  });
}

// comp_id: nexus.ui.tv-shell.channel-meta
  // ── Channel meta ──────────────────────────────────────────────────────────────
const CH_META=[
  {id:'ch-overview',  name:'NEXUS',      accent:'Overview'},
  {id:'ch-guardian',  name:'GUARDIAN',   accent:':7820 · NCP'},
  {id:'ch-cortex',    name:'CORTEX',     accent:':3748 · Memory'},
  {id:'ch-idearium',  name:'IDEARIUM',   accent:':4800 · Idea Lattice'},
  {id:'ch-bridge',    name:'BRIDGE',     accent:':9999 · P2P Relay'},
  {id:'ch-log',       name:'EVENT LOG',  accent:'Live SSE stream'},
  {id:'ch-diagnose',  name:'DIAGNOSE',   accent:'System checks · CFR · Gaps'},
  {id:'ch-blueprint', name:'BLUEPRINT',  accent:'Descriptor · Phase map · CLI projector'},
  {id:'ch-orch-full', name:'ORCHESTRATOR', accent:':9000 · Full UI'},
  {id:'ch-gd-full',   name:'GUARDIAN',     accent:':7820 · Full UI'},
  {id:'ch-cx-full',   name:'CORTEX',       accent:':3748 · Full UI'},
  {id:'ch-idr-full',  name:'IDEARIUM',     accent:':4800 · Full UI'},
  {id:'ch-br-full',   name:'BRIDGE',       accent:':9999 · Full UI'},
  {id:'ch-chatgpt-agent',   name:'CHATGPT',    accent:'Dispatch console · SEAM · Live queue'},
  {id:'ch-claude-agent',     name:'CLAUDE',      accent:'200k · SNR · SEAM · constitutional · NCP'},
  {id:'ch-mistral-agent',    name:'MISTRAL',     accent:'Local · Ollama · Enterprise · NCP'},
  {id:'ch-gemini-agent',     name:'GEMINI',      accent:'Vision · multimodal · NCP'},
  {id:'ch-perplexity-agent', name:'PERPLEXITY',  accent:'Web-grounded · citations · NCP'},
  {id:'ch-causal',       name:'CAUSAL GRAPH', accent:'Event causality · CFR sigma · Live force graph'},
  {id:'ch-conversations',name:'CONVERSATIONS',accent:'Co-pilot log · Intent · Model · Channel'},
  {id:'ch-canvas',       name:'CANVAS',       accent:'ERAVOS spatial canvas · NEXUS organisms · Wires'},
  {id:'ch-emerge',       name:'EMERGE IDE',   accent:'Phase 28 · Hot-load · Spec-first · Build from inside'},
];
