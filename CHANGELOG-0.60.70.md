# 0.60.70 — 2026-10-16

_Built on branch claude/vibrant-edison-n2f9es as 0.60.50; renumbered when merged with main, which had moved to 0.60.69._

James: "alright." (answering "SP2 next, then the 33-writer gap sweep — in that order?"), with his 0.60.47 run log.

## SP2: a picked field is found by what it is, not only by its class names

His runs showed the cost of CSS selectors on provider sites: Claude's reply was "not found" after a page change, and
ChatGPT's placeholder `<p>` was once saved as the send button.

- **Picker** (`clear-glass/src/providers/attention.js`): every pick now records its semantic address beside the
  selector, for example `main › form › button "Send message"`. The address comes from
  `clear-glass/src/page/semantic-tree.js addressScript`: role, accessible name and landmark path. A reply's inner
  `<div>` gets its article's address.
- **Role check:** a pick whose role does not fit its field is refused, and the panel says why:
  - send must be a button;
  - input must be a text box;
  - a reply can be anything.
- **Guardian** (`guardian/lib/selector-map.js`): the address travels to the tab with the selectors and anchors
  (`semantics`).
- **Field map** (`guardian/userscript-field-map.js`): when a verified selector matches nothing, the field is found by
  its address through `window.NexusSemantic`. Clear Glass's own module is injected before the field map
  (`host.js`). Fallback order:
  1. selector;
  2. address;
  3. the anchor's x, y and z.

  A reply is the last node of its shape (`main › article`), whatever its number. `NexusFields.state().lastHow` says
  which of the three found each field.
- **Found by the test:** `type()` and `find()` disagreed on what a rich editor is. `find()` accepted a
  `contenteditable` box, then `type()` treated it as an `<input>` and failed. Both now use one check.
  `execCommand` is guarded.

## From his log

- **"path is required"**, over and over, from agents' `idearium.code_read.tool` calls.
  - Every tool call passes `lib/agent-tools/index.js executeTool`. There, a required parameter given as `file`,
    `file_path`, `filePath` or `filename`, or the same name in another case (`repo_uuid` → `repoUuid`), now reaches
    the tool under its declared name.
  - A parameter that is really missing still reaches the tool, so its own refusal stands, and the error now names
    what to pass.
  - My reading, to confirm: the log shows the error, not the arguments. If the agents sent no path at all, the new
    error message is the fix, not the alias.
- **"pattern crystallised" flood** (hundreds of lines per pass): Intelligence now names the first three clean patterns
  and counts the rest in one line. Bus events are unchanged.
- **Officiator "no real agent response (forAgent=ollama)":** I found and fixed this in the officiator. At the merge,
  main's 0.60.62 had already fixed it in `copilot/lifeline.js` for every caller, with a 240 s wait. Mine was a
  duplicate, so it was dropped and main's kept (§0.3: a true duplicate, reported here).

## Proof

- `tests/modules/test-semantic-field-map.test.js` 5/5. With every class renamed, input, send and the last reply are
  found by address; a wrong-role pick is refused.
- `tests/modules/test-tool-required-alias.test.js` 2/2.
- Unchanged and green: semantic-page-tree 7/7, cg-attention-focus 6/6, ncp-half-open 3/3, selector-map 15/15,
  reply-not-found-attention 3/3, checklist-workset 6/6, faculty-tools 8/8, intelligence 9/9, capability-spec 6/6,
  lifeline-ollama-dispatch 3/3.
- CK-254: `clear-glass/spec/semantic-tree.spec` 1.1.0 is green; its surface grew by `addressScript`, `preludeSource`,
  `roleFits` and `FIELD_ROLES`, each promised in an addendum.

## Not proven here

The picker and the field map are tested in jsdom, not in a live Clear Glass provider window. His next pick will log
the address (`picked send: … · main › form › button "…"`).
