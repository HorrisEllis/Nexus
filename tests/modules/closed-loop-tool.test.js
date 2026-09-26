'use strict';
const assert = require('assert');
const http = require('http');
let passed=0,failed=0;
async function test(id,d,fn){try{await fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

const { getToolSchemas, executeTool } = require('../../lib/agent-tools/index.js');

(async () => {
  await test('T-001','run_closed_loop registered',()=>{
    assert.ok(getToolSchemas().map(s=>s.function?.name||s.name).includes('run_closed_loop'));
  });
  await test('T-002','requires name — honest error',async()=>{
    const r = await executeTool('run_closed_loop',{});
    assert.ok(r.error && r.error.includes('name'));
  });
  await test('T-003','idearium unreachable → honest stage-1 error, no fabricated success',async()=>{
    const r = await executeTool('run_closed_loop',{name:'X',description:'y'});
    assert.ok(r.error && r.stage==='create', 'must fail at create stage honestly');
    assert.ok(!r.ok, 'must not claim success when idearium is down');
  });
  await test('T-004','drives all real stages against a fake idearium (create→populate→repo)',async()=>{
    // fake idearium: 3 build calls then done
    let builds=0;
    const srv = http.createServer((req,res)=>{
      let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
        res.setHeader('Content-Type','application/json');
        if(req.url==='/api/spec-engine/specs'){ res.end(JSON.stringify({manifest:{uuid:'spec-1'}})); }
        else if(req.url==='/api/spec-engine/specs/spec-1/build'){ builds++; res.end(JSON.stringify(builds>=3?{done:true}:{done:false,chunk:builds})); }
        else if(req.url==='/api/repos'){ res.end(JSON.stringify({repo:{uuid:'repo-1'}})); }
        else res.end('{}');
      });
    });
    await new Promise(r=>srv.listen(4800,'127.0.0.1',r));
    try {
      const r = await executeTool('run_closed_loop',{name:'RealTest',description:'build a thing'});
      assert.strictEqual(r.ok,true, JSON.stringify(r));
      assert.strictEqual(r.specUuid,'spec-1');
      assert.strictEqual(r.repoId,'repo-1');
      assert.ok(r.chunksPopulated>=3);
      assert.ok(r.trace.find(t=>t.stage==='populate' && t.ok));
    } finally { srv.close(); }
  });
  console.log(`\n  closed-loop-tool: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
