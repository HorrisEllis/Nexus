'use strict';
// HC1–HC3 (0.60.260) — run INSIDE Electron (test/human-check.test.js starts it under xvfb). Prints one JSON line.
// James, 2026-10-26: "i can't get passed this. can you help? do everything you can, find out why and help. each step of the autofill can be gates."
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
process.env.CG_JAA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hc-'));
process.env.APPDATA = process.env.CG_JAA_DIR;
const { app, BrowserWindow, session } = require('electron');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');
app.whenReady().then(async () => {
  const out = {};
  try {
    // a site that echoes the headers it got, and a page shaped like Fiverr's check (PerimeterX's px-captcha box, "Press & Hold")
    const seen = [];
    const srv = http.createServer((req, res) => {
      seen.push({ url: req.url, ua: req.headers['user-agent'] || '', ch: req.headers['sec-ch-ua'] || null });
      res.setHeader('content-type', 'text/html');
      res.end(req.url.startsWith('/check') ? '<title>Fiverr</title><h1>Before we continue...</h1><p>Press &amp; Hold to confirm you are a human (and not a bot).</p><div id="px-captcha" style="width:300px;height:50px"></div>'
        : '<title>ok</title><p>hello</p><script src="https://client.px-cloud.net/PXabc/main.min.js"></script>');
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    session.defaultSession.setUserAgent(require(path.join(ROOT, 'src/net/compartment.js')).cleanUserAgent(session.defaultSession.getUserAgent()));
    const FP = require(path.join(ROOT, 'src/fingerprint/engine.js'));
    const CM = require(path.join(ROOT, 'src/contexts/manager.js'));
    const HC = require(path.join(ROOT, 'src/contexts/human-check.js'));
    const cm = new CM({ fp: new FP(), vault: { snapshot: async () => {} }, sse: { emit: () => {} } });
    const ctx = await cm.create({ agentId: 'hc-test' });
    out.personaUa = /Firefox\//.test(ctx.profile.ua);
    const win = new BrowserWindow({ show: false, webPreferences: { partition: ctx.partition } });
    await win.loadURL(`${base}/plain`);
    out.plainDetect = HC.isHumanCheck(await win.webContents.executeJavaScript(HC.detectScript)).check;   // a px script alone is no check
    await win.loadURL(`${base}/check`);
    const page = await win.webContents.executeJavaScript(HC.detectScript);
    out.checkDetect = HC.isHumanCheck(page);
    out.gate = HC.humanCheckGate(page);
    out.beforeSwitch = seen[seen.length - 1];
    out.found = cm.contextForSession(win.webContents.session) === ctx;
    out.switch = await cm.useEngineIdentity('hc-test');
    await win.webContents.reload(); await sleep(600);
    out.afterSwitch = seen[seen.length - 1];
    out.navUa = await win.webContents.executeJavaScript('navigator.userAgent');
    out.again = (await cm.useEngineIdentity('hc-test')).already;
    out.hostileRefused = !!(await cm.switchFingerprint({ agentId: 'hc-test', mode: 'firefox', options: { reason: 'hostile:perimeterx' } })).refused;
    srv.close();
  } catch (e) { out.error = e.stack; }
  console.log('HCRESULT ' + JSON.stringify(out));
  app.quit();
});
