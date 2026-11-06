# CHANGELOG 0.60.421 — EMB1: Emerge writes the brick, with its own retry engine

James, 2026-11-06: "emerge, we need to get it coding remember. thats why emerge is important, also the test env, using the test file for
expectation, the primitive also, then emerge can also verify itself with the compiler." · then, told most of the loop already exists in
Idearium and asked whether Emerge should be every brick's language or a rung tried first: "yes basically nexus holds as much complexity as
possible, agent tools, context per gate, component registry as the spine so components can be dumb. also the retry engine for emerge."

## Found (he said "look at idearium. most of it is built already", and it was)
▶ build already has:
- test first (TF2): the planner writes the phase's test, and it must fail first;
- the test file as the expectation (TF1);
- the shadow test environment;
- the last failure carried into the next attempt;
- verify-first;
- the agent ladder, and WARP.

It lacked Emerge. Two side paths (the chunk-build orchestrator, the WARP adapter) do retry blind; ▶ build does not.

## Built — `idearium/lib/emerge-rung.cjs`, wired before the JavaScript ladder
For each **new** planned JS file (routing.emerge_first: prefer, the default, or off):
1. The first rung's agent is asked for Emerge, through WARP and with the gate's context. Nexus holds the complexity; the brick stays simple.
2. **Emerge's compiler checks it** through its own command line (`lang-check`), which gives line, column and why. Emerge stays its own system.
3. **The retry engine:** what failed goes into the next try word for word. That is a compile error, a planned export not defined, or the
   expectation test's failure. Three tries at most, then it says why.
4. It is built to JavaScript (`lang-build --standalone`), and the planned file becomes a three-line adapter: Emerge's runtime, then plain
   exports.
5. **Its expectation test (TF1) judges it**, in the shadow.
6. A pass lands as proposals: the `.eg` source, the built module, the runtime once at the root, and the adapter. It is also stored as a
   **verified primitive**.
7. Otherwise it is said on the run (`emerge-fell-back`), and the JavaScript ladder builds the file as before.

Also: the setting in Idearium's settings and through `system routing emerge_first`.

**His to confirm:** "yes" read as the rung tried first, with JavaScript as the fallback.

## Proof
- `test-emerge-rung` **6/6**:
  - ER-02: Emerge's own compiler error (`main.eg:3:22: error: "high" is not defined`) is carried into try 2, which passes;
  - ER-04: the built file is required as a plain module and its functions run; a wrong type is said with its line;
  - with the feedback disabled, ER-02 and ER-03 fail.
- Build-path suites unchanged: chunked 16/16, contract 14/14, expectation 7/7, routing 19/19, verify-first 10/10, WARP rung 7/7.
  test-first 4/5, the same as the base (TF-04).
- **Not measured:** with a real model on his machine. The run log's `emerge-passed` and `emerge-fell-back` rows will give the rate.
