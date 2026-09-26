'use strict';
// ui/home/areas/mode-selector.js — Mode system: MODE_CONFIG, selectMode, mode overlay.
// Split from ui/home/index.html (inline script, lines 2100-2237 at v0.39.227). Load order is set by index.html; do not reorder.
// ══════════════════════════════════════════════════════════════════════
// MODE SYSTEM
// Five modes: orchestrator · claude · chatgpt · gemini · perplexity
// Stored in localStorage. Affects dispatch, token tracking, SEAM.
// ══════════════════════════════════════════════════════════════════════

const MODE_CONFIG = {
  mistral: {
    name:       'MISTRAL',
    provider:   'mistral',
    sub:        'Ollama Bridge :3749 · Local · Zero token cost · Full JAA access',
    icon:       '⬡',
    color:      '#00e5ff',
    tokenLimit: null,       // unlimited
    chunkSize:  null,       // no chunking
    snrDefault: false,
    seam:       false,
    badge:      'LOCAL',
    constraints:['§3.1 BOTTOM-UP','§2.1 DISK FIRST','§1.3 NO STUBS'],
  },
  claude: {
    name:       'CLAUDE',
    provider:   'claude',
    sub:        'NCP browser tab · 200k context · SEAM chunking · Component injection',
    icon:       '✦',
    color:      '#cc44ff',
    tokenLimit: 200000,
    chunkSize:  8000,       // tokens per SEAM chunk
    snrDefault: true,
    seam:       true,
    badge:      'NCP',
    constraints:['§3.1 BOTTOM-UP','§2.1 DISK FIRST','§1.3 NO STUBS','SEAM CHUNK','SNR FILTER'],
  },
  chatgpt: {
    name:       'CHATGPT',
    provider:   'chatgpt',
    sub:        'NCP browser tab · 128k window · Structured output · Batch dispatch',
    icon:       '◈',
    color:      '#00ff88',
    tokenLimit: 128000,
    chunkSize:  4000,       // aggressive splitting
    snrDefault: true,
    seam:       true,
    structuredOutput: true,  // §AGENT-SUITE-CHATGPT — genuinely distinctive, not a shared flag
    badge:      'NCP',
    constraints:['§3.1 BOTTOM-UP','§2.1 DISK FIRST','SEAM CHUNK','STRUCTURED OUTPUT'],
  },
  gemini: {
    name:       'GEMINI',
    provider:   'gemini',
    sub:        'NCP browser tab · Vision + multimodal · Image generation aware',
    icon:       '◆',
    color:      '#4a9eff',
    // §HONEST-NOTE: not pinning a specific context-window number here the
    // way claude/chatgpt do — haven't verified Gemini's current live figure,
    // and an unverified-but-precise-looking number is worse than an honest gap.
    tokenLimit: null,
    chunkSize:  6000,
    snrDefault: true,
    seam:       true,
    vision:     true,        // §AGENT-SUITE-GEMINI — matches userscript-gemini.js's extractMedia()/hasAttachedMedia()
    badge:      'NCP',
    constraints:['§3.1 BOTTOM-UP','§2.1 DISK FIRST','SEAM CHUNK','VISION'],
  },
  perplexity: {
    name:       'PERPLEXITY',
    provider:   'perplexity',
    sub:        'NCP browser tab · Web-grounded · Citations as first-class artifact',
    icon:       '⌖',
    color:      '#818cf8',
    tokenLimit: null,
    chunkSize:  6000,
    snrDefault: true,
    seam:       true,
    citations:  true,        // §AGENT-SUITE-PERPLEXITY — matches userscript-perplexity.js's extractCitations()/no_citations gap
    badge:      'NCP',
    constraints:['§3.1 BOTTOM-UP','§2.1 DISK FIRST','SEAM CHUNK','CITATIONS'],
  },
};

// Phase map summary for progress dots
const PHASE_SUMMARY = [
  {n:'0-9',status:'done'},{n:'22',status:'done'},{n:'23',status:'done'},
  {n:'24',status:'done'},{n:'45',status:'done'},{n:'46',status:'done'},
  {n:'25',status:'done'},{n:'26',status:'done'},
  {n:'10',status:'next'},
  {n:'14',status:'pend'},{n:'15',status:'pend'},{n:'17',status:'pend'},
  {n:'27',status:'pend'},{n:'31',status:'pend'},{n:'32',status:'pend'},
  {n:'33',status:'pend'},{n:'35',status:'pend'},{n:'36',status:'pend'},
  {n:'40',status:'pend'},{n:'11',status:'pend'},{n:'34',status:'pend'},
  {n:'37',status:'pend'},{n:'40.5',status:'pend'},{n:'41',status:'pend'},
  {n:'12',status:'pend'},{n:'42',status:'pend'},{n:'13',status:'pend'},
  {n:'28',status:'pend'},{n:'38',status:'pend'},{n:'44',status:'pend'},
  {n:'39',status:'pend'},{n:'43',status:'pend'},{n:'29',status:'pend'},
  {n:'30',status:'pend'},
];

let _sessionTokens = 0;
let _sessionChunks = 0;
let _activeMode = null;

function selectMode(mode, goToSuite=true) {
  _activeMode = mode;
  localStorage.setItem('nexus_mode', mode);
  // Close overlay
  const ov = document.getElementById('mode-overlay');
  ov.classList.remove('open');
  // Apply mode to body
  document.body.setAttribute('data-mode', mode);
  // Update menu badge
  const ind = document.getElementById('mode-indicator');
  if (ind) { ind.textContent = MODE_CONFIG[mode].badge; ind.style.display='inline'; }
  // Tile stays as AGENTS — just update the status badge to show active mode
  const agentTile = document.getElementById('tile-agent');
  if (agentTile) {
    const cfg = MODE_CONFIG[mode];
    const statusEl = document.getElementById('ts-agent');
    if (statusEl) { statusEl.textContent = cfg.badge; statusEl.style.color = cfg.color; }
  }
  // Inject rail tab (silent — don't navigate)
  _injectAgentSuiteTab();
  // Only go to suite if user explicitly chose a mode
  if (goToSuite) _bootAgentSuite(mode);
  // Log to cortex (§1.2)
  _logToData('ui.mode.selected', { mode, provider: MODE_CONFIG[mode]?.provider });
}

function openModeSelector() {
  const ov = document.getElementById('mode-overlay');
  ov.classList.add('open');
  _logToData('ui.mode-overlay.opened', { ts: Date.now() });
}

function closeModeSelector() {
  const ov = document.getElementById('mode-overlay');
  ov.classList.remove('open');
}

