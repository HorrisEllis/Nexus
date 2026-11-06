# 0.60.425 — CIE3: the ledger in Emerge; D5's text subset in both ledgers

James, 2026-11-06: "Remove the last of the JavaScript" (asked a second time, to keep going). Asked whether the JavaScript removal pauses for
building codebases in any language: "emerge, first. i want better code, less tokens, and more control". On D5's subset, asked with the
readings side by side: "no idea what that means".

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE3_native_ledger; emerge/emerge/spec/cie-eg.spec MOD-LEDGER)
- `emerge/emerge/lang/cie/ledger.eg` holds the ledger's format (CIE-EG §4) in Emerge:
  - `ecf`: the canonical form;
  - `hash_entry`: the domain tag, prev, the u64 seq and the length prefixes;
  - `merkle_root`, `merkle_proof`, `merkle_fold`;
  - `verify` and `verify_from`.

  It gives the same bytes as `lang/ledger.js`, whether interpreted or compiled native, using CIE2's SHA-256 from the CPU.

## Found, and decided by the axioms
- **The runtime breaks the subset itself.** It writes → into every transition and — into its error messages. Both would be outside a
  ledger limited to code points below U+0300.
- **The JavaScript ledger enforced no subset at all.** It was written before D5.
- **His answer left it to the axioms.** He said "no idea what that means", so the subset was decided by the axioms (§1.2, determinism,
  TRUTH_OVER_COHERENCE):
  - every code point below U+0300, plus – — ‘ ’ “ ” … → ─ ✓ ✗, the punctuation the system writes itself;
  - each one was checked with Python's unicodedata: none decomposes or combines, so such text is NFC by construction;
  - the same rule is in both ledgers, so a program behaves the same under Node and under `emerge.exe`;
  - he can overturn it.

## Proof
- `lang/test/native.test.js` 93/93. The new `ledger` case covers:
  - `ledger.test`'s independent known answers (a separate Python implementation of §4.2 and §4.6), natively;
  - a real run's 24 entries (a contract, its roads, checkpoints, a gap, → in the bodies) re-hashed and verified natively;
  - every Merkle proof folding to the root;
  - a forged entry caught at seq 3;
  - the subset refused the same way.
- `ledger.test` 21/21. Two cases used characters now refused (U+FF5E, an emoji, a combining accent). They are moved into the subset, and
  the old lines are kept as comments.
- Other suites green:
  - lang 166
  - differential 19
  - bootstrap 11
  - ide 7
  - selfhost 16
  - say 16
  - learn 6
  - contract 8
  - Emerge's npm test and test:system

## Scope, said
- A native program does not write its own ledger yet. That needs the native world (components, the gate), so it moves into CIE4, which
  is expanded with it.
