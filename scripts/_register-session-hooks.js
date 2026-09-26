'use strict';
// One-shot: register the six endpoints built this session that had no
// hook declaration (§5.1). Inserts at each array head, matching the
// exact existing entry shape. Idempotent — skips if the path is already declared.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const NEW = [
  { file: 'ollama.hooks.js', arr: 'const HOOKS = [', hook: {
      id: 'ollama-hook-jobs-tools-0009', name: 'ollama-jobs-tools',
      intent: 'Run a job through the sovereign agent tool-calling loop (lib/agent-tools)',
      surface: 'ollama', port: 3749, path: '/api/jobs/tools', method: 'POST',
      files: ['lib/agent-tools/index.js', 'lib/agent-tools/tools/query/read-file.js'] } },
  { file: 'cortex.hooks.js', arr: 'const CORTEX_HOOKS = [', hook: {
      id: 'cortex-hook-push-0011', name: 'cortex-push',
      intent: 'Push content into unified memory (tiered, tagged)',
      surface: 'cortex', port: 3748, path: '/api/push', method: 'POST',
      files: ['cortex/push-recall.js'] } },
  { file: 'cortex.hooks.js', arr: 'const CORTEX_HOOKS = [', hook: {
      id: 'cortex-hook-recall-0012', name: 'cortex-recall',
      intent: 'Recall from unified memory (lexical + recency scored)',
      surface: 'cortex', port: 3748, path: '/api/recall', method: 'GET',
      files: ['cortex/push-recall.js'] } },
  { file: 'cortex.hooks.js', arr: 'const CORTEX_HOOKS = [', hook: {
      id: 'cortex-hook-snapshot-rollback-0013', name: 'cortex-snapshot-rollback',
      intent: 'Restore CFR field state from a stored snapshot',
      surface: 'cortex', port: 3748, path: '/api/snapshot/rollback', method: 'POST',
      files: ['cortex/boot.js'] } },
  { file: 'guardian.hooks.js', arr: 'const GUARDIAN_HOOKS = [', hook: {
      id: 'guardian-hook-copilot-prompt-0031', name: 'guardian-copilot-prompt',
      intent: 'Synchronous ask over the real NCP job pipeline (enqueue + poll)',
      surface: 'guardian', port: 7820, path: '/api/copilot/prompt', method: 'POST',
      files: ['guardian/ask.js'] } },
  { file: 'orchestrator.hooks.js', arr: 'const HOOKS = [', hook: {
      id: 'orchestrator-hook-bus-stats-0009', name: 'orchestrator-bus-stats',
      intent: 'Read nexus-bus stats (_sources presence map) — polled by lib/nerve',
      surface: 'orchestrator', port: 9000, path: '/api/bus/stats', method: 'GET',
      files: ['nexus-bus.js', 'lib/nerve/index.js'] } },
];

function render(h) {
  return `  {
    id: "${h.id}",
    name: "${h.name}",
    intent: "${h.intent}",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "${h.surface}", layer: 1, port: ${h.port} },
    config: { path: "${h.path}", method: "${h.method}" },
    contract: { axioms: [], sideEffects: [], idempotent: ${h.method === 'GET'} },
    references: { files: ${JSON.stringify(h.files)} },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
`;
}

let added = 0;
for (const item of NEW) {
  const p = path.join(ROOT, 'hooks', item.file);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes(`"${item.hook.path}"`) || src.includes(`'${item.hook.path}'`)) {
    console.log('skip (already declared):', item.hook.path);
    continue;
  }
  if (!src.includes(item.arr)) { console.log('ARRAY NOT FOUND in', item.file); continue; }
  src = src.replace(item.arr, item.arr + '\n' + render(item.hook).trimEnd());
  fs.writeFileSync(p, src);
  console.log('registered:', item.hook.path, '->', item.file);
  added++;
}
console.log(`\n${added} hook(s) registered.`);
