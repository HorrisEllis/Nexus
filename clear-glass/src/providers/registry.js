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
};

function getProvider(id) {
  const p = NCP_PROVIDERS[id];
  if (!p) throw new Error(`Unknown NCP provider: ${id}`);
  return p;
}

function listProviders() {
  return Object.values(NCP_PROVIDERS);
}

module.exports = { NCP_PROVIDERS, getProvider, listProviders };
