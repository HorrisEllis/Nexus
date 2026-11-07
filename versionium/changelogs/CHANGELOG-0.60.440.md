# 0.60.440 — CIE6 slice a: the checker in Emerge

James, 2026-11-07: "continue"

- **`lang/cie/check.eg`:** the language's checker (`lang/checker.js`) written again in Emerge, rule for rule and message for message.
- **The judge:** `test/world/check-corpus.json` holds 227 programs, harvested from `lang.test.js` and the examples. On the 211 that parse,
  `check.eg` gives the same 75 errors and 43 warnings as `checker.js`, each at the same line and column, interpreted and native. Natively, it
  checks all 211 in 0.17 s.
- **`parse_json`** now compiles natively, onto `lang/native/json.eg`.
- **Suites:** native 105/105, selfhost 16/16, lang 166/166, differential 19/19.
- **Next, slice b:** `front.eg` builds the JS parser's exact tree, so the native compiler runs `check.eg` itself. That closes the native
  `let`-write gap.
