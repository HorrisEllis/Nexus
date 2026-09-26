'use strict';
/**
 * src/providers/registry.js — NCP Provider Registry
 * UUID: cg-provider-registry-v1-0000-0000-000000000012
 *
 * Mirrors nexus/docs/guardian.spec ncp_providers exactly (minus ollama,
 * which is local/direct-HTTP and needs no browser tab per that spec).
 *
 * This is the single source of truth for "which provider, which URL,
 * which userscript file, which hostnames count as that provider" — both
 * the auto-host system (src/providers/host.js) and the Options panel
 * read from here, so adding a fifth provider later is a one-entry change.
 */

const NCP_PROVIDERS = {
  claude: {
    id:             'claude',
    name:           'Claude',
    url:            'https://claude.ai',
    hosts:          ['claude.ai'],
    userscriptFile: 'userscript-claude.js',
    color:          '#cc785c',
  },
  chatgpt: {
    id:             'chatgpt',
    name:           'ChatGPT',
    url:            'https://chatgpt.com',
    hosts:          ['chatgpt.com', 'chat.openai.com'],
    userscriptFile: 'userscript-chatgpt.js',
    color:          '#19c37d',
  },
  gemini: {
    id:             'gemini',
    name:           'Gemini',
    url:            'https://gemini.google.com',
    hosts:          ['gemini.google.com', 'aistudio.google.com'],
    userscriptFile: 'userscript-gemini.js',
    color:          '#4285f4',
  },
  perplexity: {
    id:             'perplexity',
    name:           'Perplexity',
    url:            'https://www.perplexity.ai',
    hosts:          ['www.perplexity.ai', 'perplexity.ai'],
    userscriptFile: 'userscript-perplexity.js',
    color:          '#20b2aa',
  },
  // §0.39.265 — James: "should we get deep seek working". guardian/userscript-
  // deepseek.js (NCP v10, same protocol as Perplexity's) and guardian's own
  // routing (provider-routing.js, dispatcher.js) were already there; this
  // registry was the one place that did not know it, so no provider tab could
  // ever host it and every deepseek job fell through to the local-Ollama path.
  deepseek: {
    id:             'deepseek',
    name:           'DeepSeek',
    url:            'https://chat.deepseek.com',
    hosts:          ['chat.deepseek.com'],
    userscriptFile: 'userscript-deepseek.js',
    color:          '#4d6bfe',
  },
};

// §0.39.265 — which provider tabs open when Clear Glass starts. ChatGPT and
// DeepSeek; the others open on their first real dispatch (guardian asks for
// them — James: "only have chatgpt open. the other 3 event driven", and
// DeepSeek "open in the background in clearglass").
const DEFAULT_AUTOSTART = Object.freeze({ claude: false, chatgpt: true, gemini: false, perplexity: false, deepseek: true });

/**
 * autoBootList(envValue, autoStartOnBoot) -> 'none' | 'all' | 'a,b,…'
 * CG_AUTOBOOT_PROVIDERS, when set at all (even to ''), wins outright. Otherwise
 * the Provider tabs page's "Start … with Clear Glass" toggles (NexusOptions
 * autoStartOnBoot), with DEFAULT_AUTOSTART for any provider never toggled.
 * Before this, main/index.js read only the env var, so those toggles did nothing.
 */
function autoBootList(envValue, autoStartOnBoot = {}) {
  if (envValue !== undefined && envValue !== null) return String(envValue).trim();
  const auto = autoStartOnBoot || {};
  const on = listProviders().filter(p => (auto[p.id] === undefined ? !!DEFAULT_AUTOSTART[p.id] : auto[p.id] === true)).map(p => p.id);
  return on.length ? on.join(',') : 'none';
}

function getProvider(id) {
  const p = NCP_PROVIDERS[id];
  if (!p) throw new Error(`Unknown NCP provider: ${id}`);
  return p;
}

function listProviders() {
  return Object.values(NCP_PROVIDERS);
}

module.exports = { NCP_PROVIDERS, getProvider, listProviders, DEFAULT_AUTOSTART, autoBootList };
