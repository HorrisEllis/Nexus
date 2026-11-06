# 0.60.423 — CIE1: the contract block, in Emerge's language

James, 2026-11-06 (CIE-EG D7, "Contract syntax: new contract block as proposed, or reuse wire only?"): "New contract block". Then, with the
contract block offered as the next step in his focus ("Emerge first"), before Pillar's contracts (PIL2), which are written in it: "Next".

The decision is his: a contract is one block that holds the version, the text rules, the gate's limits and the roads, in place of wires
scattered through a program. The code is the coder's.

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE1_the_contract_block; emerge/emerge/spec/cie-eg.spec MOD-CONTRACT)
```
contract counter_main {
  version = "1.0.0"
  text { encoding = "utf-8"  normalization = "nfc" }
  gate { block_at = 0.9  max_steps = 100000  checkpoint_every = 256 }
  road Counter.changed -> Display.show
}
```
- **The block in the language** (`emerge/emerge/lang/parser.js`, checked by the new `lang/contract.js`). It is refused, with the line named,
  when:
  - an id or road end is not an identifier (CIE-EG 2.4);
  - the version is not semver;
  - the text is anything but utf-8/nfc;
  - a gate setting is unknown or out of range;
  - a road or setting is written twice;
  - a second contract is declared;
  - a module that is used declares one.

  `contract` is a keyword only at the top of a file, before a name and `{`, so existing code naming a variable `contract` is untouched.
- **What it changes at run time** (`lang/runtime.js`, both backends):
  - Its gate settings replace the primitives' for the run: `max_steps` is the storm limit (the error names the contract), `checkpoint_every`
    the checkpoint interval, and `block_at` what observe escalates against.
  - Its `contract_hash`, SHA-256 over the canonical form (ECF, CIE-EG 4.3), is in the genesis entry with its id and version, and in every
    checkpoint.
  - Each road runs as a wire and is checked like one. Roads are wired once every component is declared, so the contract can stand at the
    top of the file.
- **Written again in Emerge:** `lang/cie/contract.eg`, with `parse_contract`, `contract_hash`, `roads_from` and `canonical`. It runs with no
  JavaScript of its own, as CIE-EG 0 requires of what is added to the scaffold.
- **Departures, said:**
  - roads are a set: the order they are written in does not change the hash, and a road written twice is refused;
  - a program with no contract keeps its genesis entry byte for byte as before.
- **Not yet:**
  - `emerge.exe`'s own parser (`lang/native/front.eg`) does not know the block; that is MOD-NATIVE-LANG's;
  - the gate does not yet close a road at `block_at`; that is MOD-GATE's.

## Found on the way
- The first cut read the primitives when a runtime was created. `eg bootstrap` builds the primitives in a seed mode that refuses any read,
  so 8 of the 11 bootstrap tests failed. The values are now read when used, and bootstrap is 11/11.

## Proof
- `emerge/emerge/lang/test/contract.test.js` CT-01..08, 8/8. CT-08 checks that `contract.eg` and the scaffold give the same hash on four
  contracts and refuse the same six. CT-02 checks that a self-feeding road stops at the contract's `max_steps = 3`, not the primitives'
  100000.
- Emerge's language suites:
  - lang 166/166
  - differential 19/19
  - bootstrap 11/11
  - ide 7/7
  - ledger 21/21
  - native 91/91
  - selfhost 16/16
  - say 16/16
  - learn 6/6
- Emerge's `npm test` and `test:system` are green. `test/target.test.js`'s built list now names `contract` (was: planned to run).
- The phase's graph: 26 nodes, 0 crossings. Emerge's lock was retaken.
