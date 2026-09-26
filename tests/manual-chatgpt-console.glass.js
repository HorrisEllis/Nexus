// 0.39.262 — manual probe of the :9000 console, driven by Clear Glass's own engine (was playwright-core
// pointed at a puppeteer Chrome under /home/claude). Usage: node tests/manual-chatgpt-console.glass.js
const { chromium } = require(require('path').join(__dirname, '..', 'clear-glass', 'src', 'driver', 'glass.js'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

  console.log('--- loading home shell ---');
  await page.goto('http://127.0.0.1:9000/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(800);

  console.log('--- opening mode selector ---');
  await page.evaluate(() => openModeSelector());
  await page.waitForTimeout(300);
  const cardCount = await page.locator('.mode-card').count();
  console.log('mode-card count:', cardCount);

  console.log('--- clicking ChatGPT card ---');
  await page.click('.mode-card.m-chatgpt');
  await page.waitForTimeout(800);

  const debugState = await page.evaluate(() => ({
    activeMode: typeof _activeMode !== 'undefined' ? _activeMode : 'UNDEFINED',
    curCh: typeof curCh !== 'undefined' ? curCh : 'UNDEFINED',
    chMetaLen: typeof CH_META !== 'undefined' ? CH_META.length : 'UNDEFINED',
    chMeta13: typeof CH_META !== 'undefined' ? CH_META[13] : 'UNDEFINED',
  }));
  console.log('debug state after click:', JSON.stringify(debugState));

  console.log('--- calling tune(13) directly ---');
  await page.evaluate(() => tune(13));
  await page.waitForTimeout(500);
  const afterDirectTune = await page.evaluate(() => document.querySelector('.ch.active')?.id);
  console.log('active channel after direct tune(13):', afterDirectTune);

  const activeChannel = await page.evaluate(() => {
    const active = document.querySelector('.ch.active');
    return active ? active.id : null;
  });
  console.log('active channel after clicking ChatGPT:', activeChannel);

  const iframeSrc = await page.evaluate(() => document.getElementById('chatgpt-agent-iframe')?.src || null);
  console.log('iframe src:', iframeSrc);

  // Give the iframe a moment to actually load its own document
  await page.waitForTimeout(1000);
  const frame = page.frames().find(f => f.url().includes('agents/chatgpt'));
  if (frame) {
    const title = await frame.title().catch(() => null);
    const hasLadder = await frame.locator('#ladder').count().catch(() => 0);
    const hasSubmit = await frame.locator('#submit-btn').count().catch(() => 0);
    console.log('iframe document title:', title);
    console.log('iframe has #ladder:', hasLadder, ' has #submit-btn:', hasSubmit);
  } else {
    console.log('iframe document NOT FOUND among page.frames() — likely still about:blank or failed to load');
    console.log('all frame urls:', page.frames().map(f => f.url()));
  }

  await page.screenshot({ path: '/tmp/chatgpt-console-screenshot.png', fullPage: false });
  console.log('--- screenshot saved ---');

  console.log('--- full DOM channel audit ---');
  const channelAudit = await page.evaluate(() => {
    return [...document.querySelectorAll('.ch')].map(el => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        id: el.id,
        hasActiveClass: el.classList.contains('active'),
        display: cs.display,
        visible: rect.width > 0 && rect.height > 0 && cs.display !== 'none',
        text: el.innerText?.slice(0, 40) || '',
      };
    });
  });
  console.log(JSON.stringify(channelAudit, null, 2));

  console.log('--- element at screenshot center ---');
  const centerEl = await page.evaluate(() => {
    const el = document.elementFromPoint(700, 400);
    const path = [];
    let cur = el;
    while (cur && path.length < 6) { path.push(cur.id ? `#${cur.id}` : cur.className ? `.${String(cur.className).split(' ')[0]}` : cur.tagName); cur = cur.parentElement; }
    return path.join(' < ');
  });
  console.log('element at (700,400):', centerEl);

  console.log('--- console errors captured ---');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');

  await browser.close();
})().catch(e => { console.error('TEST SCRIPT FAILED:', e); process.exit(1); });
