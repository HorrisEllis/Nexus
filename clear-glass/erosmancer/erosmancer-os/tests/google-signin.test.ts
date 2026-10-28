// 2026-10-16 — James: "for the google login, can you do everything you can to prevent that? like across domains, contexts,
// erosmanceros, proxy,". ErosmancerOS does not attach a DevTools session to Google's sign-in page, and lets go of a tab
// that navigates into one. Runs with tsx (npm test:all) or `node --experimental-strip-types`.
import { BridgeCore, isGoogleSignin } from "../src/bridge/index.ts";

let n = 0;
const ok = (c: unknown, m: string) => { if (!c) { console.error(`google-signin: FAILED — ${m}`); process.exit(1); } n++; };

ok(isGoogleSignin("https://accounts.google.com/v3/signin/identifier"), "accounts.google.com is sign-in");
ok(isGoogleSignin("https://accounts.google.co.uk/ServiceLogin"), "a country domain is sign-in");
ok(isGoogleSignin("https://gds.google.com/web/chip"), "gds.google.com is sign-in");
ok(!isGoogleSignin("https://gemini.google.com/app") && !isGoogleSignin("https://accounts.google.com.evil.example/") && !isGoogleSignin("nonsense"), "others are not");

const tel = { info() {}, warn() {}, debug() {}, error() {} } as any;
const b = new BridgeCore({ maxReconnectAttempts: 0, reconnectDelayMs: 0 } as any, tel);
const sent: Array<[string, any]> = [];
let url = "https://accounts.google.com/ServiceLogin";
(b as any).send = async (method: string, params: any) => {
  sent.push([method, params]);
  if (method === "Target.getTargetInfo") return { targetInfo: { url } };
  if (method === "Target.attachToTarget") return { sessionId: "S1" };
  return {};
};

(async () => {
  let refused = "";
  try { await b.attachToTarget("T1"); } catch (e) { refused = (e as Error).message; }
  ok(/Google's sign-in page/.test(refused) && !sent.some(([m]) => m === "Target.attachToTarget"), "a sign-in tab is not attached");
  url = "https://gemini.google.com/app";
  ok(await b.attachToTarget("T1") === "S1" && b.getSession("T1") === "S1", "a tab elsewhere is attached");
  const detached: string[] = [];
  b.on("tab:detached", (id: string) => detached.push(id));
  (b as any).routeLifecycleEvent({ method: "Target.targetInfoChanged", params: { targetInfo: { targetId: "T1", url: "https://accounts.google.com/o/oauth2/auth" } } });
  ok(sent.some(([m, p]) => m === "Target.detachFromTarget" && p.sessionId === "S1") && b.getSession("T1") === undefined && detached[0] === "T1", "a tab that goes to sign-in is let go of");
  (b as any).routeLifecycleEvent({ method: "Target.targetInfoChanged", params: { targetInfo: { targetId: "T2", url: "https://accounts.google.com/" } } });
  ok(detached.length === 1, "a tab it never held is not touched");
  console.log(`google-signin: ${n} passed, 0 failed`);
})();
