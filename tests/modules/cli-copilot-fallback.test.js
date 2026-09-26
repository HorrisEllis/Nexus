'use strict';
const assert = require('assert');
const http = require('http');
const { _copilotAsk } = require('../../cli/nexus-cli.js');
let passed=0,failed=0;
async function test(id,d,fn){try{await fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

(async () => {
  await test('T-001','unresolved input flows to copilot /api/prompt and returns its answer (same copilot everywhere)',async()=>{
    let gotPrompt=null;
    const srv=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{gotPrompt=JSON.parse(b).prompt;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({text:'done via copilot'}));});});
    await new Promise(r=>srv.listen(3750,'127.0.0.1',r));
    try {
      const r = await _copilotAsk('restart guardian please');
      assert.strictEqual(r.ok,true);
      assert.strictEqual(r.text,'done via copilot');
      assert.strictEqual(gotPrompt,'restart guardian please','the CLI must forward the raw input to copilot');
    } finally { srv.close(); }
  });

  await test('T-002','copilot unreachable → ok:false, CLI falls through to suggestions (never hangs)',async()=>{
    // nothing listening on 3750
    const r = await _copilotAsk('some command', 1000);
    assert.strictEqual(r.ok,false);
  });

  await test('T-003','malformed copilot response → ok:false, honest (no fabricated answer)',async()=>{
    const srv=http.createServer((req,res)=>{res.end('not json'); });
    await new Promise(r=>srv.listen(3750,'127.0.0.1',r));
    try { const r = await _copilotAsk('x'); assert.strictEqual(r.ok,false); }
    finally { srv.close(); }
  });

  console.log(`\n  cli-copilot-fallback: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
