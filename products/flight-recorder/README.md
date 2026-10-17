# flight-recorder

James, 2026-10-16: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?"

James, 2026-10-17, choosing to build it inside Nexus with a real boundary: "I agree, with the recommendation"

## What it is

This is the coder's reading of his question, to be confirmed. It is an undo button and a flight recorder for AI coding
agents. Every change an agent makes is:

- **tested before it lands**, in the tree it belongs to, with a batch of changes tested together;
- **kept as a version** that you can compare and put back;
- **recorded with what caused it**: who, why (the run), what was checked, where it landed;
- **undoable**, even after later edits.

## Where it is built

It is built inside Nexus, so Nexus's own agents use it too. It is branched out into its own Idearium repo at each release:
in Idearium, use My projects → Branch from Nexus, or run `repo carve --preset flight-recorder`.

- **`product.json`** lists what the product is made of:
  - `seeds`: the folders and files the copy starts from;
  - `must`: files the copy has to carry (a copy missing one is refused);
  - `cut`: links the code runs without, left out.
- **Header tags.** A file that is part of the product says so in its header (`Product: flight-recorder`), and the branch
  tool adds it on its own.

## The phases

The phases are in `docs/2026-10-16-repo-carve-phasemap.spec`.

| phase | what | state |
|---|---|---|
| FR1 | one record per change (`lib/change-record.js`) | built 0.60.114 |
| FR2 | tested before it lands (`lib/proposal-evidence.js` gatherBatch, `lib/code-edit.js` promoteTested) | built 0.60.115 |
| FR3 | undo any change, keeping later edits (`versionium/lib/merge3.js`, `repo-inject` revert merge) | built 0.60.117 |
| FR4 | stands alone: FR4a the command (`bin/flight-recorder.js`, state in `<project>/.flight-recorder/`) built 0.60.118; FR4b a server and page | partly built |
| FR5 | the demo: the refactor tool on a real repo, recorded end to end | mapped |

## Using it on its own (FR4a)

Run these from a project folder. Nothing else is needed: no Idearium, no Versionium server, no Nexus checkout. A copy branched
from Nexus is enough.

    node products/flight-recorder/bin/flight-recorder.js init
    node products/flight-recorder/bin/flight-recorder.js propose lib/a.js --from new-a.js --agent the_builder --why "add g"
    node products/flight-recorder/bin/flight-recorder.js test <id>       # its linked tests, before and after, in this project
    node products/flight-recorder/bin/flight-recorder.js apply <id>      # refused if it broke a test; becomes a version
    node products/flight-recorder/bin/flight-recorder.js show <id>       # the record: what, who, why, checked, landed, undo
    node products/flight-recorder/bin/flight-recorder.js undo <id>       # what was there before comes back; later edits are kept
    node products/flight-recorder/bin/flight-recorder.js list | versions

Everything it keeps is in `<project>/.flight-recorder/`: the changes, the versions, the activity and the runs. That folder
holds its own `.gitignore`.
