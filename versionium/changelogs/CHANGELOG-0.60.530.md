# 0.60.530 — RAID asks Emerge to read a request only when the work is Emerge code

James, 2026-11-14: "look at emerge it does the same thing. end state. raid is meant to route every request, from a contract or request." · asked how RAID's contract and Emerge's end state fit together: "only emerge based contracts that need emerges code"

## Read first
Emerge's `say` (`emerge/emerge/lang/say/say.eg`, spec `emerge/emerge/spec/say.spec`) already reads his words, with no model, into what a
thing is, its name, its end state ("so that …", "intent"), its gates and fields, and names what it did not understand. RAID's new contract
template (0.60.529) asked him for the end state instead of reading it.

## Built
- **RAID still routes every request and books its own contract** (RD9).
- **Only a request whose work is Emerge code** gets an Emerge-based contract. RAID decides that by what the request says: it sets
  `emerge`, names the system `emerge`, an `emerge.` command, or a `.eg` file.
  - RAID asks Emerge by Emerge's own route, `POST /lang/say { sentence, json: true }`. Cortex never runs Emerge's files.
  - Emerge's end state becomes the contract's `outcome` unless one was given.
  - What `say` did not understand is a gap in its own words, with the line that teaches it (`eg teach …`).
  - The contract carries `emerge: { kind, name, intent, gates, fields }` and the tag `kind:emerge`.
  - Emerge not answering is a gap, said, not a failure.
- **Any other request never asks Emerge.**
- `say.eg`'s answer now carries its meaning as data, beside the source it writes; `eg say "…" --json` prints it and writes nothing.

## Proof
- `tests/modules/test-raid-input.test.js` 7/7. RI-07 uses the real `say`: "a compartment called counter so that it counts the visits,
  never negative, at most 100" becomes a contract whose outcome is "it counts the visits", kind compartment, name Counter, with Emerge's two
  gaps named. A plain request does not ask Emerge. Emerge down is a gap.
- Emerge: `say.test.js` 16/16, `lang-door.test.js` 8/8, its suites 31, 14, 6.

## Not yet
- Not run on a live Cortex and Emerge here.
- `say` knows his vocabulary only: most plain requests ("make the parser accept a trailing comma") are all gaps today until the words
  are taught.
- The pipeline UI forked from Idearium's tabs: asked, three readings put to him, not answered yet.

## JavaScript, said
Lines added to existing JavaScript only: Cortex's RAID (`input.js`, `contract-template.js`, `boot.js`), Emerge's door (`lib/lang.js`, 2
lines) and `eg.js` (1 line), both to be retired with Emerge's interpreter. The reading itself is Emerge's.
