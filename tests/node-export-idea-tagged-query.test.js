'use strict';
// Real test for lib/node-export.js's tagged-query support and the new
// .idea node type (lib/node-schemas/idea.js). James: "make that node
// type. we need to use those tagged and querable."
//
// Writes real .idea files to a real temp directory via the real
// exportToFile(), then queries them back via the real queryDir() — not
// mocking either function, exercising the actual code.

const fs = require('fs');
const os = require('os');
const path = require('path');

const nodeExport = require('../lib/node-export.js');
const nodeSchemas = require('../lib/node-schemas.js');

function main() {
  // ── .idea is a real, checkable type now ──────────────────────────────
  const ideaSchema = nodeSchemas.get('idea');
  if (!ideaSchema) throw new Error('idea schema not registered in node-schemas.js');
  if (ideaSchema.status !== 'REAL') throw new Error(`expected status REAL, got ${ideaSchema.status}`);
  console.log('PASS: .idea is a real, registered node-schemas.js type');

  const check = nodeSchemas.checkPayload('idea', {
    uuid: 'idea-1', slug: 'test-idea', text: 'a real idea', phase: 'seed',
    tension: 0, source: 'cli', createdAt: Date.now(), updatedAt: Date.now(),
  });
  if (!check.ok) throw new Error(`expected a real, complete idea payload to pass checkPayload, got ${JSON.stringify(check)}`);
  console.log('PASS: a real, complete idea payload passes checkPayload()');

  // ── real export/query round trip ─────────────────────────────────────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-export-test-'));

  const ideaA = { uuid: 'idea-a', slug: 'first-idea', text: 'the first real idea', phase: 'seed', tension: 0, source: 'cli', createdAt: Date.now(), updatedAt: Date.now() };
  const ideaB = { uuid: 'idea-b', slug: 'second-idea', text: 'the second real idea', phase: 'seed', tension: 0, source: 'cli', createdAt: Date.now(), updatedAt: Date.now() };
  const ideaC = { uuid: 'idea-c', slug: 'third-idea', text: 'the third real idea', phase: 'seed', tension: 0, source: 'cli', createdAt: Date.now(), updatedAt: Date.now() };

  nodeExport.exportToFile('idea', 'idea-a', ideaA, { tags: ['compression', 'synthesis'] }, dir);
  nodeExport.exportToFile('idea', 'idea-b', ideaB, { tags: ['compression'] }, dir);
  nodeExport.exportToFile('idea', 'idea-c', ideaC, { tags: ['agent-mesh'] }, dir);
  // a non-idea export in the same dir, to prove type filtering is real
  nodeExport.exportToFile('gap', 'gap-1', { title: 'a real gap', severity: 'medium' }, { tags: ['compression'] }, dir);

  const allIdeas = nodeExport.queryDir(dir, { type: 'idea' });
  if (allIdeas.length !== 3) throw new Error(`expected 3 idea exports (gap excluded), got ${allIdeas.length}`);
  console.log('PASS: queryDir(type:idea) returns exactly the 3 real idea exports, gap excluded');

  const compressionTagged = nodeExport.queryDir(dir, { type: 'idea', tags: ['compression'] });
  if (compressionTagged.length !== 2) throw new Error(`expected 2 ideas tagged compression, got ${compressionTagged.length}`);
  console.log('PASS: queryDir(tags:[compression]) returns exactly ideaA and ideaB');

  const bothTagsAnd = nodeExport.queryDir(dir, { type: 'idea', tags: ['compression', 'synthesis'] });
  if (bothTagsAnd.length !== 1 || bothTagsAnd[0].id !== 'idea-a') throw new Error(`expected only idea-a to match AND(compression,synthesis), got ${JSON.stringify(bothTagsAnd.map(d => d.id))}`);
  console.log('PASS: default AND tag-match returns only idea-a (has both tags)');

  const bothTagsOr = nodeExport.queryDir(dir, { type: 'idea', tags: ['synthesis', 'agent-mesh'], tagMode: 'any' });
  const orIds = bothTagsOr.map(d => d.id).sort();
  if (orIds.length !== 2 || orIds[0] !== 'idea-a' || orIds[1] !== 'idea-c') throw new Error(`expected idea-a and idea-c to match OR(synthesis,agent-mesh), got ${JSON.stringify(orIds)}`);
  console.log('PASS: tagMode:any returns idea-a and idea-c (OR match)');

  const noDir = nodeExport.queryDir(path.join(dir, 'does-not-exist'), { type: 'idea' });
  if (!Array.isArray(noDir) || noDir.length !== 0) throw new Error('expected a nonexistent directory to return [] honestly, not throw');
  console.log('PASS: querying a directory that does not exist returns [] instead of throwing');

  fs.rmSync(dir, { recursive: true, force: true });
}

try { main(); console.log('ALL PASS'); process.exit(0); }
catch (e) { console.error('FAIL:', e.message); process.exit(1); }
