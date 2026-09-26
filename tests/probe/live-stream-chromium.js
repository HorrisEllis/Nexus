'use strict';
/**
 * tests/probe/live-stream-chromium.js — 0.39.262 (was live-stream-chromium.py, v0.39.256).
 * James: "supposed to stream it live as it happens."
 * Proves the userscripts' §STREAM block in a real page — Clear Glass's own engine — on the
 * ChatGPT-like fixture at a real chat URL, with the real code extracted from
 * guardian/userscript-chatgpt.js (_nexusGetFullChat, _isGenerating and the whole §STREAM
 * block). Only `send` is stubbed — it records the GUARDIAN_CHUNKs that would go to guardian —
 * and `currentJobId` is the page's own variable, as in the userscript.
 * Usage: node tests/probe/live-stream-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const { start, extract } = require('./_glass-probe.js');
const P = start();
const US = P.read('guardian/userscript-chatgpt.js');
const FIXTURE = P.read('tests/fixtures/chatgpt-like.html');

const m = /\/\/ §STREAM 0\.39\.256[\s\S]*?\nfunction _txStreamTick\(\) \{[\s\S]*?\n\}\n/.exec(US);
if (!m) { console.error('could not extract the §STREAM block'); process.exit(1); }
const STREAM = m[0];
if (!STREAM.includes('const _TX_STREAM_MS = 500;')) { console.error('§STREAM no longer streams at 500 ms'); process.exit(1); }

const SCRIPT = `(() => {
  const PROVIDER = 'chatgpt';
  window.__sent = [];
  function send(o) { window.__sent.push(JSON.parse(JSON.stringify(o))); }
  let currentJobId = null;
  ${extract(US, 'chatId')}
  ${extract(US, '_nexusGetFullChat')}
  ${extract(US, '_isGenerating')}
  ${STREAM}
  window.__startJob = (msg) => { currentJobId = msg.jobId; _txJobStart(msg); };
  window.__endJob = () => { currentJobId = null; };
  window.__watchStreams = (id) => { _txWatchStreamed = id; };
  window.__timerLive = () => _txStreamTimer !== null;
})()`;

const PROMPT = 'You are the project agent for ERAVOS v3-17 catalog. You exist for this one project.\n\n───\n\nexplain the kernel';
const ADD = (args) => { const d = document.createElement('div'); d.setAttribute('data-message-author-role', args[0]); d.textContent = args[1];
  if (args[2]) d.id = args[2]; document.querySelector('main').appendChild(d); return true; };

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route('https://chatgpt.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));
  await pg.goto('https://chatgpt.com/c/WEB:b4b1d92a-9efa');
  await pg.evaluate(SCRIPT);
  const sent = () => pg.evaluate(() => window.__sent);
  const wait = (ms) => pg.waitForTimeout(ms);

  await pg.evaluate((p) => window.__startJob({ jobId: 'job-1', prompt: p }), PROMPT);
  await wait(1300);
  let s = await sent();
  P.case("an earlier answer on the page is never streamed as this job's", s.length === 0, { n: s.length });

  await pg.evaluate(ADD, ['user', 'a question James typed himself']);
  await pg.evaluate(ADD, ['assistant', 'an answer to James, not to the job']);
  await wait(1100);
  s = await sent();
  P.case("a turn without the job's prompt is not this job's", s.length === 0, { n: s.length });

  const typed = 'You have real tools available. [[TOOL: …]]\n\n' + PROMPT + '\n\n(agent hint)';
  await pg.evaluate(ADD, ['user', typed]);
  await pg.evaluate(ADD, ['assistant', '', 'reply']);
  await pg.evaluate(() => { const d = document.getElementById('reply'); let n = 0;
    window.__grow = setInterval(() => { d.textContent += 'word' + (++n) + ' '; if (n >= 16) clearInterval(window.__grow); }, 100); });
  await wait(2600);
  s = await sent();
  const final = await pg.evaluate(() => document.getElementById('reply').innerText.trim());
  const joined = s.map(x => x.text).join('');
  P.case('streams at the 500 ms cadence (16 changes → a handful of chunks) and the deltas add up to the reply',
    s.length >= 2 && s.length <= 6 && joined === final && s.every(x => x.type === 'GUARDIAN_CHUNK' && x.jobId === 'job-1' && x.source === 'transcript' && x.reset === false) && s[s.length - 1].full === final,
    { chunks: s.length, joined_len: joined.length, final_len: final.length });

  await pg.evaluate(() => { document.getElementById('reply').textContent = 'Rewritten: the kernel owns the bus.'; });
  await wait(800);
  const last = (await sent()).slice(-1)[0];
  P.case('a rewrite that is not a continuation is sent whole, with reset', last.reset === true && last.text === 'Rewritten: the kernel owns the bus.' && last.full === last.text, { last });

  const n0 = (await sent()).length;
  await pg.evaluate(() => window.__watchStreams('job-1'));
  await pg.evaluate(() => { document.getElementById('reply').textContent += ' More text.'; });
  await wait(900);
  const n1 = (await sent()).length;
  P.case('when the reply watch streams this job itself, the streamer yields (one stream per job)', n1 === n0, { n: n1 - n0 });

  await pg.evaluate(() => window.__endJob());
  await wait(700);
  P.case('a finished job stops the timer', (await pg.evaluate(() => window.__timerLive())) === false);

  await pg.evaluate((p) => window.__startJob({ jobId: 'job-2', prompt: p }), 'second prompt about the organism factory');
  await pg.evaluate(ADD, ['user', 'second prompt about the organism factory']);
  await pg.evaluate(ADD, ['assistant', 'The factory spawns organisms.']);
  await wait(900);
  const s2 = (await sent()).filter(x => x.jobId === 'job-2');
  P.case("the next job streams its own reply, not the previous one's", s2.length === 1 && s2[0].text === 'The factory spawns organisms.', { got: s2 });

  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
