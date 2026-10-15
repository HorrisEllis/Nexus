# 0.60.49 — 2026-10-15

James: "should we have each module or capability specced. … like specs can reduce surface area, then the phases also. like i want the specs to be like new features or capabilities to the project." · "what about a semantic tree for our own browser agent?" · "start CS1 and SP1"

## CS1: a spec per capability, and its surface is the gate

A module's **surface** is everything other code can touch: its exports, the events it emits, the routes it serves.

**What a capability spec does.**
- It states that surface.
- CK-254 (spec surface) checks the spec against the code and reports what doesn't match:
  - **grew:** in the code, but never promised;
  - **unkept:** promised, but not built.
- A module's surface can only widen when someone decides it should.

**How it fits in.**
- Spec drift used to compare version numbers only. It now counts capability specs, and checks and reports each one's surface at every boot.
- A spec's surface is measured from the code, never typed by hand. `draft` writes a spec whose surface is exactly what the code has, so nothing is invented.

**It caught itself, twice, before shipping.**
1. Its first measurement counted its own doc comments as surface. Comments are now stripped by a character scanner that keeps strings, template literals and regular expressions intact. A regex-based stripper had swallowed 289 of Idearium's 307 routes, because of a `/*` inside a file-pattern string.
2. CK-254 then flagged the export added by that fix (`stripComments`) as surface the spec didn't promise, until the spec listed it.

**The first capability specs:** `lib/spec/capability-spec.spec` and `clear-glass/spec/semantic-tree.spec`. Both pass.

## SP1: the page as a semantic tree for Clear Glass's browser agent

**The problem.** The agent found things by their CSS classes, and sites rename their classes. James's last run lost Claude's reply this way, and saved ChatGPT's placeholder text as the send button.

**The fix.** The page is now read the way a person or a screen reader reads it: by **role** and **name**.
- Each element gets a unique **address**, such as `main › form › button "Send prompt"` or `main › form › textbox "Ask anything"`.
- If two elements share an address, the second gets `#2`, and so do the elements inside it.

**Two sources, one shape.**
- **The browser's own accessibility tree**, read over CDP, for the agent.
- **The same tree built inside the page**, for code that runs there (the userscripts, in SP2).

**Behaviour.**
- Renaming every class on the page changes no address.
- Hidden elements are left out.
- An ambiguous address is refused, with the reason given, and never guessed.

**New actions for agents.**
- `readTree` returns the tree.
- `resolve` turns an address into a selector that `click`, `type` and `setValue` accept.
- Both are in the agent tool and copilot action lists.

## Every gap spec drift finds goes to the intelligence system

James: "i want any gaps to be mapped to the intelligence system"

**The problem.** Spec drift wrote its gaps straight into the gaps table and bypassed the intelligence gap system. That meant three things were missing:
- no predicate saying what proves the gap is still open;
- no dedupe;
- no truth floor, and no tension escalation.

**The fix.** Every gap it opens now goes through the intelligence gap system's door, `enrichGap`. That covers all three gap types:
- version drift;
- a missing spec;
- surface drift (new in this release).

**What changed:**
- The three types are now in the intelligence system's predicate library.
- A gap that comes up again updates the existing gap instead of adding a duplicate.
- Spec drift resolves the gap, and says so, when the next check comes back green.

## Proof

- test-spec-gaps-intelligence 3/3. GI-01 and GI-02 fail on the old spec drift.

- test-capability-spec 6/6.
- test-semantic-page-tree 7/7.
- check catalogue: 121 checks, 7/7.
- Unchanged: clear-glass-agent-surface 16/16, test-cg-field 13/13.

## Not proven here

- **`readAX` against a live Clear Glass page.** Electron doesn't run in this container. The accessibility-tree path is tested on a fixture shaped like CDP's output, and the in-page path in jsdom.

## Next

- **SP2:** the userscripts' field map finds the input, send button and reply by address, with CSS as the fallback.
