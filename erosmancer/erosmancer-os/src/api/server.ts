// ============================================================
// ErosmancerOS — API Server v2
//
// Owns the single OS instance. All 8 modules wired.
// REST + WebSocket event stream.
// ============================================================

import http                               from "http";
import path                               from "path";
import { fileURLToPath }                  from "url";
import express, {
  type Request, type Response,
  type NextFunction }                      from "express";
import cors                               from "cors";
import WebSocket, { WebSocketServer }     from "ws";
import { randomUUID }                     from "crypto";

import { ErosmancerOS }                   from "../index.ts";
import { BehaviorEngine, BEHAVIOR_PROFILES } from "../behavior/index.ts";
import { RoutingEngine }                  from "../routing/index.ts";
import { DOMObserver, ShadowDOMMapper }   from "../observer/index.ts";
import { ScriptReplayQueue }              from "../replay/index.ts";
import { PatternMemory, StrategyOptimizer } from "../adaptive/index.ts";
import { HostileDetection }               from "../hostile/index.ts";
import { DEFAULT_CONFIG }                 from "../types/index.ts";
import type {
  BehaviorProfileName,
  BehaviorIntent,
  RouteLevel,
}                                         from "../types/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = Number(process.env.PORT ?? 7432);
const DATA_DIR  = process.env.DATA_DIR   ?? "./.erosmancer";

// ─── Express + WS ────────────────────────────────────────────

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: "/api/events" });

app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.resolve(__dirname, "../../ui")));

// ─── Module state ────────────────────────────────────────────

let os:        ErosmancerOS        | null = null;
let behavior:  BehaviorEngine      | null = null;
let routing:   RoutingEngine       | null = null;
let observer:  DOMObserver         | null = null;
let shadow:    ShadowDOMMapper     | null = null;
let replay:    ScriptReplayQueue   | null = null;
let optimizer: StrategyOptimizer   | null = null;
let hostile:   HostileDetection    | null = null;

// PatternMemory survives reconnects — cross-session learning
const memory = new PatternMemory({
  persistPath:      `${DATA_DIR}/patterns.json`,
  maxKeys:          5_000,
  maxSamplesPerKey: 100,
});

// ─── WebSocket ───────────────────────────────────────────────

const wsClients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  wsClients.add(ws);
  if (os) {
    ws.send(JSON.stringify({
      ts:      Date.now(),
      type:    "state:sync",
      status:  os.status(),
      routing: routing?.snapshot() ?? null,
    }));
  }
  ws.on("close", () => wsClients.delete(ws));
  ws.on("error", () => wsClients.delete(ws));
});

function push(msg: Record<string, unknown>): void {
  const payload = JSON.stringify({ ts: Date.now(), ...msg });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// ─── Guards ──────────────────────────────────────────────────

function requireOS(res: Response): boolean {
  if (!os) {
    res.status(503).json({ ok: false, error: "Not connected. POST /api/connect first." });
    return false;
  }
  return true;
}

function getSession(tabId: string): string | undefined {
  return os?.bridge.getSession(tabId);
}

// ─── /api/connect ────────────────────────────────────────────

app.post("/api/connect", async (req: Request, res: Response) => {
  const { target, config: cfgOverride } = req.body ?? {};
  if (!target) { res.status(400).json({ ok: false, error: "target required" }); return; }

  try {
    if (os) await os.shutdown().catch(() => {});

    const cfg = {
      ...DEFAULT_CONFIG,
      ...(cfgOverride ?? {}),
      bridge:    { ...DEFAULT_CONFIG.bridge, target },
      registry:  { ...DEFAULT_CONFIG.registry,  persistPath: `${DATA_DIR}/registry.json` },
      telemetry: { ...DEFAULT_CONFIG.telemetry, persistPath: `${DATA_DIR}/telemetry.jsonl` },
    };

    os        = new ErosmancerOS(cfg);
    behavior  = new BehaviorEngine(DEFAULT_CONFIG.behavior, os.telemetry);
    routing   = new RoutingEngine(DEFAULT_CONFIG.routing,   os.bridge, os.telemetry);
    observer  = new DOMObserver(DEFAULT_CONFIG.observer,    os.bridge, os.registry, os.telemetry);
    shadow    = new ShadowDOMMapper(os.bridge, os.registry, os.telemetry);
    replay    = new ScriptReplayQueue({ persistPath: `${DATA_DIR}/replay.json`, maxFrames: 100 });
    optimizer = new StrategyOptimizer(memory);
    hostile   = new HostileDetection(os.bridge, os.telemetry);

    wireEvents();

    await os.start();
    await os.bridge.send("Target.setDiscoverTargets", { discover: true }).catch(() => {});

    push({ type: "system:connected" });
    res.json({ ok: true, state: os.bridge.getState() });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

app.delete("/api/connect", async (_req, res) => {
  if (os) await os.shutdown().catch(() => {});
  memory.flush();
  os = behavior = routing = observer = shadow = replay = optimizer = hostile = null;
  push({ type: "system:disconnected" });
  res.json({ ok: true });
});

// ─── /api/health ─────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({
    ok:       !!os,
    state:    os?.bridge.getState() ?? "disconnected",
    status:   os?.status()         ?? null,
    routing:  routing?.snapshot()  ?? null,
    replay:   replay?.snapshot()   ?? null,
    adaptive: memory.snapshot(),
  });
});

// ─── /api/tabs ───────────────────────────────────────────────

app.get("/api/tabs", async (_req, res) => {
  if (!requireOS(res)) return;
  try { res.json({ ok: true, tabs: await os!.listTabs() }); }
  catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

app.post("/api/tabs", async (req, res) => {
  if (!requireOS(res)) return;
  try {
    const tab = await os!.openTab(req.body?.url ?? "about:blank");
    push({ type: "tab:opened", tab });
    res.json({ ok: true, tab });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

app.delete("/api/tabs/:tabId", async (req, res) => {
  if (!requireOS(res)) return;
  try {
    await os!.closeTab(req.params.tabId);
    routing?.deregisterSession(req.params.tabId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

app.post("/api/tabs/:tabId/attach", async (req, res) => {
  if (!requireOS(res)) return;
  const { tabId }  = req.params;
  const role       = (req.body?.role ?? "primary") as "primary" | "shadow" | "proxy";
  try {
    const sessionId = await os!.attachTab(tabId);
    routing?.registerSession(tabId, sessionId, role);
    await observer?.watchTab(tabId, sessionId);
    replay?.startFrame(tabId, sessionId, { url: "about:blank", nodeCount: os!.registry.size(), ts: Date.now() });
    res.json({ ok: true, tabId, sessionId, role });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

// ─── /api/nodes ──────────────────────────────────────────────

app.get("/api/nodes", (_req, res) => {
  if (!requireOS(res)) return;
  const nodes = os!.registry.all();
  res.json({ ok: true, nodes, total: nodes.length });
});

app.get("/api/nodes/:uuid", (req, res) => {
  if (!requireOS(res)) return;
  const node = os!.getNode(req.params.uuid);
  if (!node) { res.status(404).json({ ok: false, error: "Node not found" }); return; }
  res.json({ ok: true, node });
});

// ─── /api/execute ────────────────────────────────────────────

app.post("/api/execute", async (req: Request, res: Response) => {
  if (!requireOS(res)) return;

  const { action, uuid, tabId, payload, profile, sandbox = false, routeLevel, elementTag } = req.body ?? {};
  if (!action) { res.status(400).json({ ok: false, error: "action required" }); return; }
  if (!tabId)  { res.status(400).json({ ok: false, error: "tabId required"  }); return; }

  const sessionId = getSession(tabId);
  if (!sessionId) {
    res.status(400).json({ ok: false, error: `No session for ${tabId}. POST /api/tabs/${tabId}/attach first.` });
    return;
  }

  const startMs = Date.now();
  try {
    const threatState = hostile?.getState(tabId);
    const envCtx = {
      detectionRisk:  (threatState?.score ?? 0) / 100,
      latency:        0,
      stabilityScore: 1,
    };

    const rec = optimizer?.recommend({
      action,
      sessionId:      tabId,
      profile:        (profile ?? "precise") as BehaviorProfileName,
      elementTag,
      recentErrors:   behavior?.sessionSnapshot(tabId)?.errorRate ?? 0,
      detectionRisk:  envCtx.detectionRisk,
    });

    const resolvedProfile = (profile ?? rec?.profile ?? "precise") as BehaviorProfileName;
    if (behavior) behavior.overrideProfile(tabId, resolvedProfile);

    const intent: BehaviorIntent = {
      id:      `intent-${randomUUID()}`,
      action,
      target:  { uuid },
      payload: payload ?? null,
    };

    const plan = behavior?.processIntent(
      intent,
      { sessionId: tabId, environment: envCtx },
      { sandbox }
    );

    if (sandbox) { res.json({ ok: true, sandbox: true, plan }); return; }

    if (routeLevel && routing) routing.setLevel(routeLevel as RouteLevel, "api");

    const executeCmd = async (): Promise<unknown> => {
      switch (action) {
        case "click":      return os!.click(uuid, tabId);
        case "type":       return os!.type(uuid, tabId, String(payload ?? ""));
        case "hover":      return os!.cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: 400, y: 300 });
        case "scroll":     return os!.dispatcher.enqueue({ type: "scroll", tabId, payload: { deltaY: 300 }, priority: 5 });
        case "evaluate":   return os!.evaluate(tabId, String(payload ?? "undefined"));
        case "navigate":   return os!.navigate(tabId, String(payload ?? "about:blank"));
        case "screenshot": return os!.screenshot(tabId);
        default: throw new Error(`Unknown action: ${action}`);
      }
    };

    let result: unknown;
    if (routing && routing.level !== "direct") {
      const decision   = routing.decide(tabId, { detectionRisk: envCtx.detectionRisk, errorRate: behavior?.sessionSnapshot(tabId)?.errorRate });
      const routeResult = await routing.execute(decision, async () => executeCmd());
      result = routeResult.primary;
    } else {
      result = await executeCmd();
    }

    const durationMs = Date.now() - startMs;
    behavior?.recordOutcome(tabId, true);

    if (plan) {
      optimizer?.learn({ action, sessionId: tabId, profile: resolvedProfile, variant: plan.variant, elementTag, success: true, durationMs });
      replay?.record(tabId, { type: action, tabId, targetUuid: uuid, priority: 5 }, { commandId: intent.id, success: true, durationMs, attempt: 1 });
    }

    push({ type: "execute:done", action, uuid, tabId, intentId: intent.id, durationMs });
    res.json({ ok: true, intentId: intent.id, planId: plan?.planId, result });

  } catch (err) {
    behavior?.recordOutcome(tabId ?? "unknown", false);
    const msg = (err as Error).message;
    push({ type: "execute:failed", action, error: msg });
    res.status(500).json({ ok: false, error: msg });
  }
});

// ─── /api/evaluate ───────────────────────────────────────────

app.post("/api/evaluate", async (req, res) => {
  if (!requireOS(res)) return;
  const { tabId, expression } = req.body ?? {};
  if (!tabId || !expression) { res.status(400).json({ ok: false, error: "tabId and expression required" }); return; }
  const sid = getSession(tabId);
  if (!sid) { res.status(400).json({ ok: false, error: `No session for ${tabId}` }); return; }
  try {
    const r = await os!.bridge.send<{ result: { value?: unknown } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sid
    );
    res.json({ ok: true, result: r.result?.value });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

// ─── /api/navigate ───────────────────────────────────────────

app.post("/api/navigate", async (req, res) => {
  if (!requireOS(res)) return;
  const { tabId, url } = req.body ?? {};
  if (!tabId || !url) { res.status(400).json({ ok: false, error: "tabId and url required" }); return; }
  try {
    const cmd = os!.navigate(tabId, url);
    replay?.updateCheckpoint(tabId, { url, nodeCount: os!.registry.size(), ts: Date.now() });
    push({ type: "navigate:started", tabId, url });
    res.json({ ok: true, commandId: cmd.id });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

// ─── /api/human-type ─────────────────────────────────────────
// §0.39.265 — James: "hook that in to ErosmancerOS". NEXUS's guardian uses ErosmancerOS as its fallback
// typist: when a provider tab could not take a job (no composer, send never pressed), this types the prompt
// into that provider's OWN tab with human timing and presses send.
//   target   tabId, or host (+ chatUrl preferred): a page OR webview target whose URL is on that host —
//            never "the first tab" (clear-glass's /bridge/driver fell back to tabs[0])
//   input    the first of inputSelectors that is on the page and visible; clicked like a person, cleared
//   typing   the behavior profile's cadence (baseDelayMu/Sigma, occasional pauses) for the first
//            maxKeystrokes characters; the rest in paced line bursts (Input.insertText); every newline is
//            Shift+Enter — a bare Enter would send a half-typed message in a chat composer
//   check    the composer's text is read back and must hold what was typed (whitespace-normalised)
//   send     the first enabled sendSelectors match is clicked; none → Enter; sent = the composer emptied
// -> { ok, typed, ms, url, tabId, input, sent, via } | { ok:false, error, stage }
function gauss(mu: number, sigma: number): number {
  let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

app.post("/api/human-type", async (req, res) => {
  if (!requireOS(res)) return;
  const { tabId: askedTab, host, chatUrl, text, inputSelectors = [], sendSelectors = [], profile = "precise",
          maxKeystrokes = 400, send = true } = req.body ?? {};
  if (typeof text !== "string" || !text.length) { res.status(400).json({ ok: false, error: "text required" }); return; }
  if (!askedTab && !host) { res.status(400).json({ ok: false, error: "tabId or host required" }); return; }
  const started = Date.now();
  let stage = "bridge";
  // a bridge still connecting (ErosmancerOS just started) gets up to 10 s — the caller asked once, on purpose
  while (os!.bridge.getState() === "connecting" && Date.now() - started < 10000) await new Promise(r => setTimeout(r, 200));
  if (os!.bridge.getState() !== "connected") { res.status(503).json({ ok: false, stage, error: `ErosmancerOS is not connected to the browser (state=${os!.bridge.getState()})` }); return; }
  stage = "target";
  try {
    // ── the provider's own tab ──
    let tabId = askedTab as string | undefined, url = "";
    if (!tabId) {
      const all = (await os!.bridge.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>("Target.getTargets")).targetInfos
        .filter(t => (t.type === "page" || t.type === "webview") && (() => { try { return new URL(t.url).hostname.endsWith(String(host)); } catch { return false; } })());
      const exact = chatUrl ? all.find(t => t.url === chatUrl) : undefined;
      const pick = exact || (chatUrl ? all.find(t => { try { return new URL(t.url).pathname === new URL(String(chatUrl)).pathname; } catch { return false; } }) : undefined) || all[0];
      if (!pick) { res.status(404).json({ ok: false, stage, error: `no ${host} tab is open in the browser ErosmancerOS is connected to` }); return; }
      tabId = pick.targetId; url = pick.url;
    }
    let sid = getSession(tabId!);
    if (!sid) sid = await os!.attachTab(tabId!);
    const cdp = <T = any>(method: string, params?: Record<string, unknown>) => os!.bridge.send<T>(method, params, sid);
    const evalJs = async (expr: string) => (await cdp<{ result: { value?: any } }>("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

    // ── the composer ──
    stage = "input";
    const found = await evalJs(`(() => {
      const sels = ${JSON.stringify(inputSelectors)};
      for (const s of sels) { let el; try { el = document.querySelector(s); } catch (_) { continue; }
        if (!el) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        el.scrollIntoView({ block: 'center' }); const q = el.getBoundingClientRect();
        return { sel: s, x: q.left + Math.min(q.width / 2, 120), y: q.top + q.height / 2, editable: el.isContentEditable, tag: el.tagName };
      } return null; })()`);
    if (!found) { res.status(422).json({ ok: false, stage, error: `no composer on ${url || tabId}: none of ${inputSelectors.join(" | ") || "(no selectors)"} is visible` }); return; }
    // the behavior engine's own profile: typing cadence and pause rate
    const P = (BEHAVIOR_PROFILES as Record<string, { baseDelayMu: number; baseDelaySigma: number; correctionRate: number }>)[String(profile)] || BEHAVIOR_PROFILES.precise;
    const prof = [P.baseDelayMu, P.baseDelaySigma, P.correctionRate];
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: found.x - 30 + Math.random() * 20, y: found.y + 8, button: "none" });
    await sleep(Math.max(40, gauss(prof[0] * 0.8, prof[1])));
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1 });
    await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(found.sel)}); el.focus();
      if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('delete'); }
      else { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); set && set.set ? set.set.call(el, '') : (el.value = ''); el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);

    // ── typing ──
    stage = "type";
    const shiftEnter = async () => {
      await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
      await cdp("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
    };
    const chars = Array.from(text.replace(/\r\n?/g, "\n"));
    const head = chars.slice(0, Math.max(0, Number(maxKeystrokes) || 0));
    for (const ch of head) {
      if (ch === "\n") await shiftEnter();
      else await cdp("Input.insertText", { text: ch });
      await sleep(Math.min(450, Math.max(18, gauss(prof[0] * 0.48, prof[1] * 0.75))));
      if (Math.random() < prof[2] * 0.25) await sleep(Math.max(80, gauss(320, 110)));
    }
    const rest = chars.slice(head.length).join("");
    if (rest.length) {
      const lines = rest.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) await cdp("Input.insertText", { text: lines[i] });
        if (i < lines.length - 1) await shiftEnter();
        await sleep(Math.max(30, gauss(90, 30)));
      }
    }

    // ── check what landed ──
    stage = "check";
    const norm = (s: string) => String(s || "").replace(/\s+/g, " ").trim();
    await sleep(250);
    const landed: string = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(found.sel)}); return el ? (el.isContentEditable ? el.innerText : el.value) : ''; })()`);
    if (norm(landed) !== norm(text)) {
      res.status(422).json({ ok: false, stage, error: `the composer holds ${norm(landed).length} chars, expected ${norm(text).length} — not sent`, typed: norm(landed).length });
      return;
    }

    // ── send ──
    let via = "none", sent = false;
    if (send) {
      stage = "send";
      await sleep(Math.max(120, gauss(prof[0] * 2, prof[1] * 2)));
      const btn = await evalJs(`(() => { for (const s of ${JSON.stringify(sendSelectors)}) { let b; try { b = document.querySelector(s); } catch (_) { continue; }
        if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') continue; const r = b.getBoundingClientRect(); if (!r.width) continue;
        return { sel: s, x: r.left + r.width / 2, y: r.top + r.height / 2 }; } return null; })()`);
      if (btn) {
        via = `click ${btn.sel}`;
        await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: btn.x, y: btn.y, button: "none" });
        await sleep(Math.max(30, gauss(90, 25)));
        await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: btn.x, y: btn.y, button: "left", clickCount: 1 });
        await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: btn.x, y: btn.y, button: "left", clickCount: 1 });
      } else {
        via = "Enter";
        await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await cdp("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      }
      for (let i = 0; i < 20 && !sent; i++) {
        await sleep(150);
        const after: string = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(found.sel)}); return el ? (el.isContentEditable ? el.innerText : el.value) : ''; })()`);
        sent = norm(after).length === 0;
      }
      if (!sent) { res.status(422).json({ ok: false, stage, error: `pressed send (${via}) but the composer still holds the text`, typed: chars.length, via }); return; }
    }
    push({ type: "human-type:done", tabId, chars: chars.length, sent, via });
    res.json({ ok: true, typed: chars.length, ms: Date.now() - started, url, tabId, input: found.sel, sent, via });
  } catch (err) {
    res.status(500).json({ ok: false, stage, error: (err as Error).message });
  }
});

// ─── /api/behavior ───────────────────────────────────────────

app.get("/api/behavior/profiles", (_req, res) => {
  res.json({ ok: true, profiles: behavior?.availableProfiles() ?? ["precise","cautious","exploratory","turbo"] });
});

app.post("/api/behavior/profile", (req, res) => {
  if (!behavior) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  const { sessionId, profile } = req.body ?? {};
  if (!profile) { res.status(400).json({ ok: false, error: "profile required" }); return; }
  try {
    behavior.overrideProfile(sessionId ?? "default", profile as BehaviorProfileName);
    push({ type: "behavior:profile", sessionId, profile });
    res.json({ ok: true, profile });
  } catch (err) { res.status(400).json({ ok: false, error: (err as Error).message }); }
});

app.delete("/api/behavior/profile/:sessionId", (req, res) => {
  behavior?.clearOverride(req.params.sessionId);
  res.json({ ok: true });
});

app.get("/api/behavior/session/:id", (req, res) => {
  if (!behavior) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  const snap = behavior.sessionSnapshot(req.params.id);
  if (!snap) { res.status(404).json({ ok: false, error: "Session not found" }); return; }
  res.json({ ok: true, session: snap });
});

// ─── /api/hostile ────────────────────────────────────────────

app.post("/api/hostile/probe", async (req, res) => {
  if (!requireOS(res) || !hostile) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  const { tabId } = req.body ?? {};
  const sid = getSession(tabId);
  if (!sid) { res.status(400).json({ ok: false, error: `No session for ${tabId}` }); return; }
  try { res.json({ ok: true, state: await hostile.probe(tabId, sid) }); }
  catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

app.get("/api/hostile/state", (_req, res) => {
  if (!hostile) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  res.json({ ok: true, states: hostile.allStates() });
});

app.delete("/api/hostile/clear/:tabId", (req, res) => {
  hostile?.clear(req.params.tabId);
  res.json({ ok: true });
});

// ─── /api/shadow ─────────────────────────────────────────────

app.post("/api/shadow/map", async (req, res) => {
  if (!requireOS(res) || !shadow) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  const { tabId } = req.body ?? {};
  const sid = getSession(tabId);
  if (!sid) { res.status(400).json({ ok: false, error: `No session for ${tabId}` }); return; }
  try {
    const discovered = await shadow.mapTab(tabId, sid);
    res.json({ ok: true, discovered, totalNodes: os!.registry.size() });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

// ─── /api/replay ─────────────────────────────────────────────

app.get("/api/replay/frames", (_req, res) => {
  if (!replay) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  res.json({ ok: true, snapshot: replay.snapshot() });
});

app.post("/api/replay/:frameId", async (req, res) => {
  if (!requireOS(res) || !replay) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  const { delayMs = 50 } = req.body ?? {};
  try {
    const result = await replay.replay(
      req.params.frameId,
      async (cmd) => {
        switch (cmd.type) {
          case "click":    return os!.click(cmd.targetUuid!, cmd.tabId);
          case "type":     return os!.type(cmd.targetUuid!, cmd.tabId, String(cmd.payload?.text ?? ""));
          case "evaluate": return os!.evaluate(cmd.tabId, String(cmd.payload?.expression ?? "undefined"));
          default:         return null;
        }
      },
      undefined,
      delayMs
    );
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

// ─── /api/routing ────────────────────────────────────────────

app.post("/api/routing/level", (req, res) => {
  if (!routing) { res.status(503).json({ ok: false, error: "Not connected" }); return; }
  const { level, reason } = req.body ?? {};
  if (!level) { res.status(400).json({ ok: false, error: "level required" }); return; }
  routing.setLevel(level as RouteLevel, reason ?? "api");
  res.json({ ok: true, level: routing.level });
});

// ─── /api/adaptive ───────────────────────────────────────────

app.get("/api/adaptive/patterns", (req, res) => {
  const profile = (req.query.profile as BehaviorProfileName) ?? "precise";
  res.json({ ok: true, patterns: memory.topPatterns(profile, 20), snapshot: memory.snapshot() });
});

// ─── Root ─────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.sendFile(path.join(path.resolve(__dirname, "../../ui"), "dashboard.html"));
});

// ─── Error handler ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  process.stderr.write(`[API] ${err.message}\n`);
  res.status(500).json({ ok: false, error: err.message });
});

// ─── Event wiring ────────────────────────────────────────────

function wireEvents(): void {
  if (!os) return;
  os.on("node:registered", (n)     => push({ type: "node:registered", node: n }));
  os.on("node:missing",    (uuid)  => push({ type: "node:missing",    uuid }));
  os.on("tab:opened",      (tab)   => push({ type: "tab:opened",      tab }));
  os.on("tab:closed",      (id)    => { routing?.deregisterSession(id); push({ type: "tab:closed", tabId: id }); });
  os.on("command:success", (r)     => push({ type: "cmd:success", commandId: r.commandId, ms: r.durationMs }));
  os.on("command:failed",  (r)     => push({ type: "cmd:failed",  commandId: r.commandId, error: r.error }));

  behavior?.on("plan:generated",    (p)          => push({ type: "behavior:plan",    profile: p.profile, variant: p.variant, steps: p.steps.length }));
  behavior?.on("outcome:recorded",  (sid, ok, er) => push({ type: "behavior:outcome", sessionId: sid, success: ok, errorRate: er }));

  routing?.on("route:escalated",    (f, t, r) => push({ type: "route:escalated",   from: f, to: t, reason: r }));
  routing?.on("route:deescalated",  (f, t)    => push({ type: "route:deescalated", from: f, to: t }));
  routing?.on("route:mismatch",     ()         => push({ type: "route:mismatch" }));

  observer?.on("dom:changed", (c) => push({ type: "dom:changed", tabId: c.tabId, changeType: c.type }));
  observer?.on("dom:batch",   (b) => push({ type: "dom:batch",   count: b.length }));

  hostile?.on("threat:detected",   (sig, state) => push({ type: "threat:detected",  signal: { type: sig.type, level: sig.level }, score: state.score, recommendProfile: state.recommendProfile }));
  hostile?.on("threat:cleared",    (tabId)       => push({ type: "threat:cleared",   tabId }));
  hostile?.on("threat:escalated",  (tabId, f, t) => push({ type: "threat:escalated", tabId, from: f, to: t }));

  replay?.on("replay:done",    (fid, ok, fail) => push({ type: "replay:done",    frameId: fid, succeeded: ok, failed: fail }));
  replay?.on("replay:aborted", (fid, reason)   => push({ type: "replay:aborted", frameId: fid, reason }));

  optimizer?.on("entropy:tuned", (action, old, next) => push({ type: "entropy:tuned", action, old, next }));
}

// ─── Periodic tasks ──────────────────────────────────────────

setInterval(() => {
  if (!os) return;
  push({ type: "health", status: os.status(), routing: routing?.snapshot(), adaptive: memory.snapshot(), replay: replay?.snapshot() });
}, 3_000);

setInterval(() => memory.flush(), 30_000);

// ─── Boot ────────────────────────────────────────────────────

server.listen(PORT, () => {
  process.stdout.write(JSON.stringify({ level: "SYSTEM", event: "boot", port: PORT, ui: `http://localhost:${PORT}`, ts: new Date().toISOString() }) + "\n");

  // ── Register with NEXUS Bridge on boot ───────────────────────────────────
  // Announces ErosmancerOS as a live module so the bridge knows it's up,
  // indicators go green, and /eros/* proxy routes become active.
  const BRIDGE_URL = process.env.BRIDGE_URL ?? "";
  const EROS_UUID  = `eros-os-${randomUUID().slice(0, 8)}`;

  const registerWithBridge = async (attempt = 1): Promise<void> => {
    try {
      const body = JSON.stringify({
        moduleId:    "erosmancer-os",
        hookId:      EROS_UUID,
        version:     "2.0.0",
        port:        PORT,
        url:         `http://127.0.0.1:${PORT}`,
        description: "CDP browser orchestration — behavior, routing, hostile detection",
        hooks: [
          { id: `eros.bridge:${EROS_UUID}`,   label: "ErosmancerOS Bridge",    prefix: "eros", settingsPath: "options.bridge.eros" },
          { id: `eros.behavior:${EROS_UUID}`,  label: "Behavior Engine",        prefix: "eros", settingsPath: "options.bridge.eros" },
          { id: `eros.hostile:${EROS_UUID}`,   label: "Hostile Detection",      prefix: "eros", settingsPath: "options.bridge.eros" },
          { id: `eros.routing:${EROS_UUID}`,   label: "Routing Engine",         prefix: "eros", settingsPath: "options.bridge.eros" },
        ],
        registeredAt: new Date().toISOString(),
      });

      const res = await fetch(`${BRIDGE_URL}/hook/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal:  AbortSignal.timeout(3000),
      });

      if (res.ok) {
        process.stdout.write(JSON.stringify({
          level: "INFO", event: "bridge:registered",
          hookId: EROS_UUID, bridge: BRIDGE_URL, ts: new Date().toISOString(),
        }) + "\n");
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Retry up to 5 times with backoff — bridge may still be starting
      if (attempt < 5) {
        const delay = attempt * 3000;
        process.stdout.write(JSON.stringify({
          level: "WARN", event: "bridge:register:retry",
          attempt, delay, error: msg, ts: new Date().toISOString(),
        }) + "\n");
        setTimeout(() => registerWithBridge(attempt + 1), delay);
      } else {
        process.stdout.write(JSON.stringify({
          level: "WARN", event: "bridge:register:failed",
          error: msg, hint: "Bridge offline — ErosmancerOS running standalone", ts: new Date().toISOString(),
        }) + "\n");
      }
    }
  };

  // §0.39.265 — the NEXUS Bridge is gone (:3747 is architect now, and nothing
  // serves /hook/register), so the default target only ever answered 404 five
  // times and gave up. Clear Glass registers ErosmancerOS with the orchestrator
  // itself (clear-glass/src/main — "ErosmancerOS registered with orchestrator
  // :9000"). Register with a bridge only when one is named explicitly.
  if (!process.env.BRIDGE_URL) return;
  // Slight delay so bridge has time to init its /hook/register route
  setTimeout(() => registerWithBridge(), 1500);
});

export { app, server };
