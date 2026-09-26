// tests/modules/idearium-agent-routing.test.mjs — James: "make sure the ui
// reflects the backend system. like the chunk contracts sent to where?"
//
// Tracing the real dispatch path to answer that question found a real,
// previously-undocumented bug: idearium/agent-suite/index.js's
// buildChunkWithAgent() silently sent EVERY non-ollama/mistral/claude
// request to ChatGPT, hardcoded, ignoring the actual requested `preferAgent`
// entirely. A caller (or a future agent-selector UI) trusting that value
// would have been lied to about where its own chunk contract really went.
//
// Real mock guardian HTTP server on a scratch port (never the real :7820)
// so the whole real dispatch path — buildChunkWithAgent() -> a real
// http.request -> a real server receiving the real POST body — is
// exercised, not just the routing logic read in isolation.
import http from 'http';
import assert from 'assert';

const PORT = 18821; // scratch — never the real guardian :7820
process.env.GUARDIAN_PORT = String(PORT);

function mockGuardian(port) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      received.push(parsed);
      // §REAL SHAPE — matches guardian/server.js's own real POST /command
      // response exactly: pRes(res, 200, {ok:true, jobId, status, provider})
      // — flat, never nested under a `data` key. An earlier draft of this
      // test wrapped jobId one level too deep and every single dispatch
      // silently failed as a result — caught by actually running this
      // against the shape guardian's own code really returns, not assumed.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jobId: `job-${received.length}`, status: 'pending', provider: parsed.provider }));
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, received })));
}

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

async function main() {
  const { server, received } = await mockGuardian(PORT);
  const { buildChunkWithAgent } = await import('../../idearium/agent-suite/index.js');

  console.log('\n[1] every real guardian provider is dispatched to itself, not substituted');

  received.length = 0;
  const gemini = await buildChunkWithAgent('write the purpose section', { preferAgent: 'gemini' });
  t('AR-001', 'requesting gemini really sends provider:"gemini" to guardian', received[0]?.provider === 'gemini');
  t('AR-002', 'the real response reports agent:"gemini", not a substituted one', gemini.ok === true && gemini.agent === 'gemini');

  received.length = 0;
  const deepseek = await buildChunkWithAgent('write the schema section', { preferAgent: 'deepseek' });
  t('AR-003', 'requesting deepseek really sends provider:"deepseek" to guardian (this exact request used to silently become chatgpt)', received[0]?.provider === 'deepseek');
  t('AR-004', 'the real response reports agent:"deepseek"', deepseek.ok === true && deepseek.agent === 'deepseek');

  received.length = 0;
  const perplexity = await buildChunkWithAgent('write the api section', { preferAgent: 'perplexity' });
  t('AR-005', 'requesting perplexity really sends provider:"perplexity"', received[0]?.provider === 'perplexity' && perplexity.ok === true);

  received.length = 0;
  const chatgpt = await buildChunkWithAgent('write the events section', { preferAgent: 'chatgpt' });
  t('AR-006', 'requesting chatgpt explicitly still really sends provider:"chatgpt"', received[0]?.provider === 'chatgpt' && chatgpt.ok === true);

  received.length = 0;
  const claude = await buildChunkWithAgent('write the build_order section', { preferAgent: 'claude' });
  t('AR-007', 'requesting claude explicitly still really sends provider:"claude"', received[0]?.provider === 'claude' && claude.ok === true);

  console.log('\n[2] an unrecognized agent is a real, named error — never a silent substitution');

  received.length = 0;
  const bogus = await buildChunkWithAgent('write something', { preferAgent: 'not-a-real-agent' });
  t('AR-008', 'an unknown agent produces ok:false', bogus.ok === false);
  t('AR-009', 'the error names the real unrecognized agent, not a generic message', bogus.error.includes('not-a-real-agent'));
  t('AR-010', 'an unrecognized agent never reaches guardian at all', received.length === 0);

  server.close();

  console.log(`\n  idearium-agent-routing: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
