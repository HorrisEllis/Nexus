# 0.60.473 — Emerge: {{ and }} are literal braces

James, 2026-11-09: "Did it code stably?" · "Yes fix it."

## Measured first
Writing about 1,000 lines of Emerge for `cos/pipeline/` today, about nine mistakes were caught by Emerge's checker, each with its line and column.
None got through to a wrong result at run time. The commonest, 4 of the 9, was a brace in a string read as an interpolation.

## Built (CIE14)
- **The rule, in both lexers:** in a string, `{{` is a literal `{` and `}}` a literal `}`, as in Python's and C#'s strings. It's in the
  interpreter's lexer (`lang/lexer.js`) and the native compiler's (`native/front.eg`), so the two agree.
  - JSON and templates read as written: `"{{with.x}}"`, `"{{}}"`, `"{{\"k\": {n}}}"`.
  - `\{` and `\}` still work.
  - Each brace error says how to write a literal brace.
- **The native compiler** was rebuilt with itself: stage 2 = stage 3, byte for byte. Its new source uses only `\{`, so the old compiler could build
  it.
- **Checked:** nothing in the tree used `{{` to start an interpolation of a map.

## Proof
- `node emerge/emerge/lang/test/lang.test.js`: 168/168, with two new cases (interpreted and compiled).
- native 109/109, differential 19/19, selfhost 16/16, bootstrap 11/11.
- `cos/pipeline`'s Emerge tests, and test-cos-pipeline 14/14, are unchanged.
