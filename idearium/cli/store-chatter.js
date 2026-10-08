/**
 * idearium/cli/store-chatter.js — §0.39.374: imported FIRST by idearium/cli/index.js (ES modules run their imports in
 * order, before the importing module's own code). The store prints "[jaa] Loaded N rows …" (and IdeaOS, cortex-listeners
 * … their own tagged lines) while the other imports load; those lines go to stderr, as cli/sentinel.js does — stdout carries the command's answer and nothing else, so
 * --json stays parseable for scripts and agents, and a person still sees the chatter.
 */
const _log = console.log;
// a line that opens with a module's tag — [jaa], [IdeaOS], [cortex-listeners] … — is a module talking, not the answer
const TAG = /^\[[\w./:@-]+\]/;
console.log = (...a) => (typeof a[0] === 'string' && TAG.test(a[0]) ? console.error(...a) : _log(...a));
