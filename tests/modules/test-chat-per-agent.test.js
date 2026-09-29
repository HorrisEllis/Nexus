'use strict';
// tests/modules/test-chat-per-agent.test.js — 0.39.266.
// James's log (2026-09-27): the nexus agent and the nexus/core agent both dispatched into chatgpt.com/c/6ab92781…
// An agent with no chat yet had its first job typed into whatever chat the tab showed (another agent's), and
// learnJobChat then filed that chat as its own — every repo agent ended up in one conversation.
//
//   CA-001  an agent with no chat of its own gets the provider's new-chat address, not null (the tab's current chat)
//   CA-002  once its job completes in a chat, that chat is its own and is resumed
//   CA-003  a chat another agent holds is never handed to a second agent — it gets a new one; the first keeps it
//   CA-004  a job with no agent (not a repo agent) is untouched: null, as before
//   CA-005  the new-chat address is recognisable (the dispatcher sets newChat so the tab does not wait for turns)
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CT = require('../../guardian/lib/chat-transcripts.js');

let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }
const quiet = { log() {}, warn() {} };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-test-'));
const index = { defaultRoot: () => root, listChats: () => [], readItem: () => null };
const jobs = new Map();
const tx = CT.createChatTranscripts({ jobs, index, rootFn: () => root, log: quiet });
const A = { id: 'job-a', provider: 'chatgpt', agentId: 'repo-nexus-id-repo-abc5e891' };
const B = { id: 'job-b', provider: 'chatgpt', agentId: 'repo-nexus-id-repo-47cfcec7' };
const CHAT = 'https://chatgpt.com/c/6ab92781-8b90-83e8-92a1-4185b54b67ca';

test('CA-001', 'an agent with no chat of its own gets a new chat', () => {
  assert.strictEqual(tx.chatFor(A), 'https://chatgpt.com/');
  assert.strictEqual(tx.chatFor({ ...A, provider: 'claude' }), 'https://claude.ai/new');
});

test('CA-002', 'once its job completes in a chat, that chat is resumed', () => {
  jobs.set(A.id, A);
  tx.learnJobChat({ jobId: A.id, chatUrl: CHAT });
  assert.strictEqual(tx.chatFor(A), CHAT);
});

test('CA-003', 'a chat another agent holds is not handed to a second agent', () => {
  tx.rememberAgentChat('chatgpt', B.agentId, CHAT);   // what the old behaviour left behind: B filed under A's chat
  assert.strictEqual(tx.chatFor(B), 'https://chatgpt.com/', 'B starts its own');
  assert.strictEqual(tx.chatFor(A), CHAT, 'A keeps its chat');
});

test('CA-004', 'a job with no agent is untouched', () => {
  assert.strictEqual(tx.chatFor({ id: 'x', provider: 'chatgpt' }), null);
  assert.strictEqual(tx.chatFor({ id: 'y', provider: 'gemini', agentId: 'repo-z' }), null, 'a provider guardian cannot resume');
});

test('CA-005', 'the new-chat address is recognisable', () => {
  assert.strictEqual(CT.isNewChatUrl('https://chatgpt.com/'), true);
  assert.strictEqual(CT.isNewChatUrl(CHAT), false);
  const src = fs.readFileSync(path.join(__dirname, '../../guardian/lib/dispatcher.js'), 'utf8');
  assert.match(src, /newChat: !!\(resumeChatUrl && require\('\.\/chat-transcripts\.js'\)\.isNewChatUrl\(resumeChatUrl\)\)/);
  for (const f of ['userscript-chatgpt.js', 'userscript-claude.js']) {
    assert.match(fs.readFileSync(path.join(__dirname, '../../guardian', f), 'utf8'), /landed && !turns && !msg\.newChat/, `${f} skips the turns wait for a new chat`);
  }
});

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n  ${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
