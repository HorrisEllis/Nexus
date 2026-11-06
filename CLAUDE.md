# NEXUS

James's project. **Read the axioms first, every session: `docs/AXIOMS-v3.1.md`** (at least Part IV, the quick reference; Group 5C,
sovereignty, in full). They are his law and decide every technical call. James, 2026-10-29: "Remember sovereignty. Add that to the axioms
and then add it to the claude.md to read the axioms in the docs".
**Do not guess if you do not know. Ambiguity is reconciled by him, never by the coder: ask, with the readings side by side.** Read first: the
Atlas in Idearium (`docs/atlases/<system>-atlas.md`) and each system's own spec folder (`<system>/spec/`). James, 2026-11-03: "Also put do not
guess if you do not know. Ambiguity must be reconciled by me. Use the Atlas in Idearium. The specs in each spec folder. Of each system."
**Each system is sovereign: its own data, modules and commands, all inside its own folder. It reaches another system only through its API routes
and the CLI server, so the other can be swapped. `lib/` is not a directory for what a system uses.** (docs/CLAUDE.md, addendum 2026-11-03.)
**Each system's component registry, in his words only (2026-11-03):** "No component registry is the spine." · "The drawbridge is the the component
registry, which is also the event bus, and interaction contract and bridge into the compartment." · "the server.js is the process for each system.
It’s what cos manages. The spine and component registry for each system routes through there. Cli and api."
**The component registry is per system. The system registry connects the component registries; COS and the Orchestrator use it to orchestrate.**
**Every system's component registry is its own: per system, sovereign, never central, and Loom is NOT it (AXIOMS §5.16).** James, 2026-11-03:
"And enforce that. I’m sick of you confusing that. It’s fucking sovereign. Do not  make this mistake again."
**Every phase needs a DAG.** James, 2026-11-03: "Okay we also need to clean the phases at some point. Add to the Claude.md. That every phase needs a
dag." Every phase of every map has its `depends_on:` (`[]` when none, every name resolving, no cycles), its `files:`, and its graph written before
any code (his 2026-10-18 and 2026-10-19 rules, in docs/CLAUDE.md: `node idearium/spec-engine/phase-specs.cjs <map>`, moved from lib/emerge 2026-11-05 by his EAS_D10, `lib/phase-dag.js`). A phase
without them is not built. **Pending, his:** the phases need cleaning (the open ones are spread over many maps; when, his call).
**Phases expand; they are not written again.** James, 2026-11-03: "Like they stop getting written and start getting, they expand." Before writing a
phase, find the one that already covers its files or intent and expand it (a dated addendum quoting why); write a new phase only when none does.
Every phase id is unique across all maps. (docs/2026-10-23-self-building-loop-phasemap.spec SL_D11, SL11.)
**Always log in the phase ledger.** James, 2026-11-06: "we also need to add a phase ledger, to idearium, then add to claude.md to to always log in the
ledger". Every phase written, expanded, built or closed gets one line, with why, in the same commit:
`node idearium/spec-engine/phase-ledger.cjs log <phase> <written|expanded|built|closed|note> "<why>" --version <x.y.z>` (or `phases log`). Before
writing a phase, `phase-ledger.cjs covers <files…> --does "…"` names the phase to expand instead. The how is in docs/CLAUDE.md.
**THE FOCUS (his, 2026-11-06): Emerge first, then Fiverr.** James: "Emerge first then fiverr maybe? I’m struggling. Emerge is the highest
leverage. If fiverr isn’t days of work. I can also use remote control to give you access." Emerge: the CIE-EG decisions (D3's default, D4's
reading, D6–D10), then the merged kernel (EAS_D8) and the small-model benchmark. Fiverr after, if it is not days of work: FP5's test, FG4, TC3,
FG5 (docs/2026-10-28-gated-flows-phasemap.spec), proved live through his Remote Control. Work outside the focus waits unless he asks. The how is in
docs/CLAUDE.md (addendum 2026-11-06, the focus).
**No non-Emerge code unless the contract or the project names it; a missing capability is built (AXIOMS §17.13).** James, 2026-11-06: "the
moment js is removed from emerge it becomes the replacement. focus on that first. no more js, we focus on .eg" · "No non-emerge code, unless
specified in the contract or project. lack of capability is an opportunity to build it." First in order: the JavaScript removal from Emerge
(docs/2026-11-06-cie-eg-build-phasemap.spec). **Crystallise verified primitives; log every benchmark** (his, the same day): the how is in
docs/CLAUDE.md (addendum 2026-11-06, Emerge is the replacement). **Note metrics while coding in Emerge, expand Emerge as you go, and define
every new extension in a taxonomy and ledger** (his, the same day: "remember to take note of metrics while coding in emerge, and expanding emerge
while you do." · "all new extensions need to be defined in a taxonomy and ledger."); the how is in docs/CLAUDE.md (addendum 0.60.429).
**Every change and every version goes to Versionium, in full (§17.12).** James, 2026-10-29: "full changes, and versions have to be pushed
to versionium? enforce it everywhere that you'd find it." The how is in docs/CLAUDE.md.

The working agreement — map before build, reuse before build, wire the registry, addend the specs,
lose nothing, quote him and his decisions with their context — is in docs/CLAUDE.md, imported here so it loads at the
repo root:

@docs/CLAUDE.md
