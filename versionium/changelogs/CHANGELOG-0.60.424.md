# 0.60.424 — the JavaScript removal mapped; CIE2: SHA-256 native, from the CPU

James, 2026-11-06: "Remove the last of the JavaScript" · "When is it good enough to call it a full coding language". Asked what comes
next and what happens to the door: "Start the JS removal now" · "Door in Emerge too".

The direction is his: Emerge with no JavaScript, its door included. The measure, the order and the code are the coder's.

## Measured first (said to him before he chose)
- JavaScript under emerge/emerge: 23,525 lines in 119 files:
  - the language with its tests: 8,338;
  - the spec compiler: 6,197;
  - tests: 5,335;
  - top-level files, server.js among them: 2,645;
  - lib, observe, core and siso: 2,333.
- Emerge's own code (`.eg`): 8,420 lines.
- His question, answered:
  - By the usual bar, Emerge is a language now: its compiler is written in Emerge and rebuilds itself with no Node (selfhost 16/16).
  - By CIE-EG 0's own bar, it is one when `emerge.exe` rebuilds itself on Windows with no JavaScript in it. What stands between:
    - components, roads, the gate, the ledger and the contract run only on the JavaScript interpreter;
    - the tools are JavaScript;
    - there is no Windows build.

## Mapped (docs/2026-11-06-cie-eg-build-phasemap.spec)
- **Decisions:**
  - CIE_D1 (his): the removal starts now, in CIE-EG's order.
  - CIE_D2 (his): the door moves into Emerge. Left open for him: on Windows a socket needs ws2_32.dll, which CIE-EG 0's allowlist of
    imports does not name.
  - CIE_D3 (decided by his CIE-004 and the axioms): SHA-256 comes from the CPU first and from the OS library second. This kernel refuses
    AF_ALG (errno 97); the CPU has SHA-NI.
- **Phases, each with its DAG:**
  - CIE2: SHA-256;
  - CIE3: the ledger;
  - CIE4: components, roads, the gate and the contract;
  - CIE5: `emerge test`;
  - CIE6: the checker;
  - CIE7: observe and debug;
  - CIE8: the spec compiler;
  - CIE9: the test harnesses;
  - CIE10: the door;
  - CIE11: the interpreter archived;
  - CIE12: Windows.

  The graphs show no crossings and no dangling references.

## Built: CIE2 (MOD-NATIVE-SYSTEM, partial)
- `sha256()` now works in programs that `emerge.exe` compiles:
  - two codegen intrinsics, `cpu_sha` and `sha256_block`, carry the instructions (`lang/native/x64.eg`);
  - the instructions were assembled from the standard SHA-NI sequence and checked against FIPS 180-4 before they were carried;
  - the round constants are inline in the generated code;
  - `rt.eg` pads the message and writes the digest.
- A CPU without the SHA extensions is refused by name. There is no software fallback, by CIE-004.
- `native/bin/emerge` was rebuilt by stage 0.

## Proof
- `lang/test/native.test.js` 92/92. Its new `sha256` case covers:
  - FIPS 180-4's five vectors, the million a's among them;
  - 14 padding boundaries (0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000 bytes);
  - non-ASCII text;
  - the type refusal.

  All of it is equal to the interpreter's output, which uses Node's own SHA-256.
- selfhost 16/16, with stages 0, 1 and 2 byte-identical.
- Other suites green: lang 166, differential 19, bootstrap 11, ledger 21, contract 8, and Emerge's npm test.
- Not proved here: the refusal on a CPU without SHA-NI, since this one has it.
- A cost he should know: Intel desktop CPUs before Ice Lake / Rocket Lake (8th–10th generation Core) have no SHA-NI. On them the native
  ledger refuses until the OS source is added (CIE12).
