'use strict';
const assert = require('assert');
let passed=0, failed=0;
async function test(id,d,fn){try{await fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}
(async () => {
  const { getToolSchemas, executeTool } = require('../../lib/agent-tools/index.js');

  await test('T-001','run_pipeline registered in the tool registry',()=>{
    const names = getToolSchemas().map(s=>s.function?.name||s.name);
    assert.ok(names.includes('run_pipeline'));
  });
  await test('T-002','list returns real pipeline records array',async()=>{
    const r = await executeTool('run_pipeline',{action:'list'});
    assert.strictEqual(r.ok,true);
    assert.ok(Array.isArray(r.pipelines));
  });
  await test('T-003','run without specPath errors honestly, does not start a bogus pipeline',async()=>{
    const r = await executeTool('run_pipeline',{action:'run'});
    assert.ok(r.error && r.error.includes('specPath'));
  });
  await test('T-004','status without id errors honestly',async()=>{
    const r = await executeTool('run_pipeline',{action:'status'});
    assert.ok(r.error && r.error.includes('id'));
  });
  await test('T-005','status for a nonexistent id reports not-found, not a fake record',async()=>{
    const r = await executeTool('run_pipeline',{action:'status',id:'nope-123'});
    assert.ok(r.error && r.error.includes('nope-123'));
  });
  console.log(`\n  run-pipeline-tool: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
