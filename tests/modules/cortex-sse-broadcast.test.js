'use strict';
const assert = require('assert');
const http = require('http');
process.env.NEXUS_PORT='0'; process.env.CORTEX_PORT='0';
const boot = require('../../cortex/boot.js');

let passed=0, failed=0;
(async () => {
  const srv = boot.server;
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const port = srv.address().port;

  // T-001: /events endpoint exists and accepts SSE
  await new Promise((resolve) => {
    const req = http.get({hostname:'127.0.0.1',port,path:'/events',headers:{Accept:'text/event-stream'}}, res => {
      const ok = res.statusCode === 200 && /event-stream/.test(res.headers['content-type']||'');
      console.log(ok ? '  ✓ T-001 /events serves text/event-stream' : '  ✗ T-001 /events wrong content-type');
      ok ? passed++ : failed++;
      // T-002: a POSTed event reaches this subscriber
      let received = false;
      res.on('data', chunk => {
        if (chunk.toString().includes('test.broadcast.event') && !received) {
          received = true;
          console.log('  ✓ T-002 POST /api/event reaches SSE subscriber');
          passed++;
          req.destroy(); resolve();
        }
      });
      setTimeout(() => {
        const body = JSON.stringify({type:'test.broadcast.event',payload:{},source:'test'});
        const p = http.request({hostname:'127.0.0.1',port,path:'/api/event',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},()=>{});
        p.end(body);
      }, 200);
      setTimeout(() => { if(!received){ console.log('  ✗ T-002 event not received'); failed++; req.destroy(); resolve(); } }, 3000);
    });
  });

  srv.close();
  console.log(`\n  cortex-sse-broadcast: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
