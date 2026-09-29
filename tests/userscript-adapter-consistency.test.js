'use strict';
// ── tests/userscript-adapter-consistency.test.js ─────────────────────────────
// UUID: test-userscript-adapter-consistency-v1-0000-4000-0000-000000000001
//
// §FIX: caught a real bug — userscript-chatgpt.js v10.0.0 claimed "full feature
// parity with Claude v10" but still contained literal Claude selectors
// (.font-claude-message, data-testid="human-turn-content") and a mislabeled
// telemetry source ('userscript-claude'), copy-pasted from claude.js and never
// adapted. _nexusGetMessages() matched zero elements on chatgpt.com — silent
// adapter decay, no crash, no log, just dead.
//
// This is NOT a build pipeline. It's a grep-based fingerprint check that runs
// in seconds and requires no change to how these files are edited or deployed —
// edit-and-paste-into-Tampermonkey still works exactly the same way. It just
// stops a provider file from silently carrying another provider's fingerprints.
//
// Run: node tests/userscript-adapter-consistency.test.js

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Each provider's own giveaway tokens — things that should ONLY appear in
// that provider's file. If file A contains file B's fingerprint, A was
// copy-pasted from B and not fully adapted.
const FINGERPRINTS = {
  claude:     ['font-claude-message', 'human-turn-content', 'assistant-turn-content', 'userscript-claude', 'gd_tab_id', 'guardian_claimed_tab_claude'],
  chatgpt:    ['data-message-author-role', 'prompt-textarea', 'userscript-chatgpt', 'gd_cgpt_id', 'guardian_claimed_tab_chatgpt'],
  gemini:     ['ql-editor', 'model-response-text', 'userscript-gemini', 'gd_gemini_id', 'guardian_claimed_tab_gemini', 'ms-chunk'],
  perplexity: ['source-link', 'answer-text', 'userscript-perplexity', 'gd_perp_id', 'guardian_claimed_tab_perplexity', 'ask-input'],
};

const FILES = {
  claude:     'guardian/userscript-claude.js',
  chatgpt:    'guardian/userscript-chatgpt.js',
  gemini:     'guardian/userscript-gemini.js',
  perplexity: 'guardian/userscript-perplexity.js',
};

// Shared, provider-neutral code that legitimately names another provider's token. Each allowance is the exact text
// it excuses, with its reason — not a blanket skip of the fingerprint.
const ANCHOR_ATTRS = { text: "['data-message-id', 'data-message-author-role', 'data-testid', 'data-is-streaming', 'id']",
  reason: '_nexusAnchor describes any DOM anchor with one generic attribute list, the same in every adapter (§ANCHOR 0.39.244)' };
const ALLOW = { claude: [ANCHOR_ATTRS], gemini: [ANCHOR_ATTRS], perplexity: [ANCHOR_ATTRS] };

function run() {
  let failed = false;
  const providers = Object.keys(FILES);

  for (const owner of providers) {
    const filePath = path.join(ROOT, FILES[owner]);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠  SKIP — ${FILES[owner]} not found`);
      continue;
    }
    // §0.39.282 — fingerprints are checked against CODE: comments are stripped first. The provider files cross-reference
    // each other in their fix notes ("same fix as userscript-chatgpt.js"), which is provenance, not contamination.
    // Line comments go first: a header line like "// @match https://gemini.google.com/*" would otherwise open a block
    // comment that swallows the whole adapter. Then block comments, then the shared-code allowances (ALLOW, below).
    let content = fs.readFileSync(filePath, 'utf8').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const a of (ALLOW[owner] || [])) content = content.split(a.text).join('');

    for (const other of providers) {
      if (other === owner) continue;
      for (const token of FINGERPRINTS[other]) {
        if (content.includes(token)) {
          failed = true;
          console.error(`✗ ${FILES[owner]} contains ${other}'s fingerprint: "${token}"`);
        }
      }
    }
    // Sanity check the other direction too — the file should contain ITS OWN
    // fingerprints. A file with none of its own provider's real tokens is
    // suspicious in the opposite way (might be an empty/stub adaptation).
    const ownTokensFound = FINGERPRINTS[owner].filter(t => content.includes(t)).length;
    if (ownTokensFound === 0) {
      failed = true;
      console.error(`✗ ${FILES[owner]} contains NONE of its own provider's fingerprints — adapter may be a stub`);
    }
  }

  if (failed) {
    console.error('\n✗ FAIL — cross-provider contamination or stub adapter detected');
    process.exit(1);
  }
  console.log(`✓ PASS — all ${providers.length} provider userscripts clean of cross-contamination`);
}

run();
