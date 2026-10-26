# docs/2026-10-24-brave-cori-reconciliation.spec
# Reading PR #161 (claude/brave-cori-eczug1) against main, and the map for bringing its work in — before any merge.
# His rule, 2026-10-24: "read and map first." This is the read and the map; nothing is merged or closed by it.
# A reconciliation/decision record (structural housekeeping, like docs/2026-10-24-system-consolidation-phasemap.spec),
# not an emerge-module spec: it moves and ports existing work and decides between two lines, it adds no new module.

origin:
  date: 2026-10-24
  james: >-
    "can you merge these?" (the branches page: #159, #160, #161) · "read and map first." · (the brave-cori line, in its own
    commits) "focus on just decoupling so we can get every system in a cos compartment. maybe start with one at a time? like
    guardian?" · "okay warp and emerge." · "Isn't loom in a compartment already or clearglass? / Do it." · "im saying for web
    servers, dns, firewall, email smtp, like integrating into deployable. i want to use those engines for test env, web servers,
    etc all of them / this is all the networking backend for anything needed netwroking wise."
  what_was_done: >-
    #159 (claude/intelligent-curie-ezwvoq) was already merged — it IS main's RF2 0.60.236 (ten folders moved into the systems
    that use them). #160 (claude/sleepy-gates-9lc085) was merged clean (the crystallizer gate 0.60.237 and the agent confidence
    gate CG1–CG3, 0.60.238–240). #161 is NOT merged: GitHub reports mergeable_state 'dirty' (2782 files, 51 behind), so it is read
    and mapped here instead of force-merged.

read:
  method: "git log/diff origin/main...origin/claude/brave-cori-eczug1 on the real tree (evidence, §0.1), not the PR summary."
  brave_cori_is: >-
    His COS-COMPARTMENTALIZATION line, 24 commits (0.60.225–0.60.242). It reaches the same goal main's RF2 reached — sovereign
    systems — by a DIFFERENT route. RF2 (in main) MOVED folders into the systems that use them. brave-cori goes further: it puts
    systems behind KERNEL PORTS (a system reaches another only through a port) and into COS COMPARTMENTS (a boundary that is
    physical in COS), and it builds the anonymousservers engines as COS's networking backend. Both are his; they are not the same.
  unique_to_brave_cori_main_lacks:
    - "cos/services/ — 126 files: the anonymousservers engines (web servers, DNS, firewall, SMTP) folded into COS as its deployable networking backend. Main has NO cos/services. Spec: cos/spec/cos-services.spec + docs/2026-10-24-cos-services-phasemap.spec (SV0–SV4)."
    - "the kernel-port boundary model: lib/raid-port.js, lib/ollama-port.js, lib/spec-compiler-port.js, lib/pulse.js (the pulse moved to the kernel), lib/trust-rule.js, lib/registry-draft.js, loom/lib/ (loom reaches into no other system)."
    - "5 specs/phasemaps: cos-services, emerge-warp-system, guardian-into-cos, loom-into-cos, and docs/2026-10-24-phase-nodes-spec-coverage.md."
    - "6 new test modules; idearium/spec-compiler additions; orchestrator/registry-components.draft.json."
    - "his DECISIONS recorded as commits: emerge stays a system with warp folded in (EW1); Guardian first, RAID reached never loaded (GD0/GD1); Loom in a COS compartment behind a wall (LM0–LM4)."
  overlaps_or_superseded_by_rf2:
    - "the folds themselves: erosmancer→clear-glass, remote-desktop/security→cos, Sentinel/emergence archived, the non-system folders parked. Main's RF2 (0.60.234–236) did these too, its own way — so brave-cori's fold commits (0.60.230–234) are largely redundant with main and conflict on the same paths."
    - "the version numbers 0.60.225–0.60.242 are used by BOTH lines for different work (the same collision class the 0.60.233 merge already recorded). A reconciliation renumbers brave-cori's kept work above main's latest, keeping both records (§0.3)."

decisions:
  BC_D1_emerge_home:
    status: DECIDED 2026-10-24 by James — "A system, warp folded in"
    asked: "emerge: a top-level SYSTEM with warp folded in (brave-cori, his 'okay warp and emerge'), or folded into core/lib (main's RF2 plan, 'emerge, warp → core', not yet applied in batch 1)?"
    chosen: >-
      emerge is its own system, warp folded into it. His brave-cori call "okay warp and emerge", confirmed here, is the later explicit
      decision: it answers main's still-OPEN CN_D3 and SUPERSEDES the RF2 plan to send emerge to core (§0.3, by a dated addendum on the
      consolidation map, both kept). emerge comes off the archive/core list; RF2's remaining "12 folders into lib" must exclude emerge and warp.
  BC_D2_cos_compartments:
    status: DECIDED 2026-10-24 by James — "Yes — layer it on RF2"
    asked: "adopt brave-cori's COS-compartment + kernel-port model on main (systems reach each other only through ports; each in a COS compartment), on top of RF2's placement?"
    chosen: >-
      Yes. RF2 placed the folders (done, in main); brave-cori's kernel ports + COS compartments are the next layer — a system reaches
      another only through its port, each in a COS compartment. They compose: RF2 is where the code lives, the ports are how it is reached.
  BC_D3_how_to_bring_it_in:
    status: DECIDED 2026-10-24 by James — "Port it phase-by-phase"
    chosen: >-
      Do NOT merge #161 as-is: it is dirty, 51 behind, and its fold commits re-do RF2 and collide on paths and versions. Instead PORT
      its unique work onto a fresh branch off current main, phase by phase (cos/services, the kernel ports, the 5 specs, the 6 tests,
      the emerge-warp and loom-into-cos decisions), each re-based and renumbered above main's latest, each proven, §0.3 record kept.
      #161 then stays as the archive of that line, or is closed once its unique work is ported — his say.

phases:
  BCR0_the_decisions:
    status: DONE 0.60.241
    layer: library
    depends_on: []
    files: [docs/2026-10-24-brave-cori-reconciliation.spec]
    does: "his three calls above (emerge home, COS direction, how to bring it in) answered before anything is ported."
    proof: "BC_D1 (emerge a system, warp folded) · BC_D2 (adopt COS + kernel-port, layered on RF2) · BC_D3 (port phase-by-phase) all DECIDED 2026-10-24 with his words"

  BCR1_cos_services:
    status: "DONE 0.60.245 — ported verbatim (126 files, the spec, the phasemap, the test); test-cos-services 4/4, the spec at full depth, no new crossing, no secret; loom has the engines"
    layer: integration
    depends_on: [BCR0_the_decisions, BC_D2_cos_compartments]
    files: [cos/services, cos/spec/cos-services.spec]
    does: "port the 126 cos/services files (the anonymousservers engines as COS's networking backend) and their spec onto main, re-based; IPC gates parsed, never run, no secret carried in (its own SV constraint)."
    proof: "cos/services present on main; its tests green; the boundary census names COS's new edges, no new crossing outside a port"

  BCR2_kernel_ports:
    status: "PARTLY — GD1 DONE 0.60.246 (Guardian's last 4 RAID loads through lib/raid-port.js; RP-04 in run-all); the pulse DONE 0.60.247 (lib/pulse.js); LM0–LM3 DONE 0.60.248 (lib/ollama-port.js, loom/lib/store.js; Loom 0 ways out); LM4's code DONE 0.60.249 (the wall, moveIn, start/stop; Loom not moved in while the seal is strict, his call to confirm). REMAIN: the spec-compiler port (EW2/EW3), registry-draft (DB16), trust-rule (with brave-cori's SL5, to compare with main's own SL line first)."
    layer: integration
    depends_on: [BCR0_the_decisions, BC_D2_cos_compartments]
    files: [lib/raid-port.js, guardian/api-dispatch.js, guardian/lib/dispatcher.js, guardian/server.js, tests/modules/test-raid-port.test.js]
    does: >-
      DONE 0.60.242: lib/raid-port.js ported (the one door to RAID — in-process in Cortex, Cortex's routes elsewhere, approval fails closed);
      guardian/api-dispatch.js and guardian/lib/dispatcher.js rewired to it wholesale (their only diff from main was this GD1 rewire); two
      server.js sites rewired (the /build gate — which also FIXES a latent ReferenceError on main, `raid` was never defined in that async
      handler — and the SEAM-forge gate). test-raid-port RP-01/02/03 green (the port's in-process / route / fail-closed behaviour).
      REMAINS (the careful part, by REVERSIBILITY not rushed on core infra): 4 more cortex/core/raid requires in server.js — the raw-dispatch
      DECIDE route (a bigger fix: main's comment says "_raid.decide does not exist" so RAID has never routed a raw job), the auto-chunk and
      chat approval gates, and the queue-match — some in non-async handlers that must be made async; RP-04 (no guardian→RAID crossing) passes
      only when all are done, so test-raid-port is NOT yet in run-all (the suite stays green). Then the other ports (ollama, spec-compiler,
      pulse, trust-rule, registry-draft, loom/lib) and their consumers. GD1 completes with Guardian run to verify, like UI in Clear Glass.
    proof: "raid-port RP-01/02/03 green; guardian/server.js parses; guardian-dispatch-ladder 18/18, idearium-guardian-dispatch 5/5 still green; 2 of 6 server.js crossings removed, 4 remain (RP-04 pending GD1 completion)"

  BCR3_emerge_and_loom_decisions:
    status: PARTLY 0.60.241 — the decisions and maps are ON main; the builds (EW/LM/GD phases) remain
    layer: integration
    depends_on: [BCR0_the_decisions, BC_D1_emerge_home]
    files: [docs/2026-10-24-emerge-warp-system-phasemap.spec, docs/2026-10-24-loom-into-cos-phasemap.spec, docs/2026-10-24-guardian-into-cos-phasemap.spec, docs/2026-10-24-system-consolidation-phasemap.spec]
    does: >-
      DONE 0.60.241: the three COS/emerge phasemaps ported verbatim from brave-cori (§0.3, his record unchanged), and the emerge
      decision recorded as an addendum on the consolidation map (BC_D1 closes CN_D3, supersedes the RF2 emerge→core plan, both kept).
      REMAINS: the actual builds those maps describe (emerge-as-system with warp folded; loom and guardian into COS) land through
      their own phases, after BCR2 (the ports they stand on). Their version numbers inside are brave-cori's; re-numbered when built on main.
    proof: "the three phasemaps on main; the consolidation map's CN_D1 addendum; next the EW/LM/GD phases build against them"

  BCR4_close_or_archive_161:
    status: "DONE 0.60.255 — merged (his 2026-10-26 \"merge that repo please\", the addendum at the end); the branch kept as the archive of its line (§0.3)"
    layer: integration
    depends_on: [BCR1_cos_services, BCR2_kernel_ports, BCR3_emerge_and_loom_decisions]
    files: []
    does: "once its unique work is ported and proven, #161 is closed (its branch kept as the archive of the line, §0.3) — his say. Nothing is deleted."
    proof: "every unique item in read.unique_to_brave_cori is present on main or named as dropped-with-reason; #161 closed with a comment pointing at the ported work"

order: >-
  BCR0 first (his three decisions). Then BCR1 (cos/services), BCR2 (kernel ports), BCR3 (the emerge/loom/guardian decisions) —
  each independent, each ported and renumbered above main's latest, each proven. BCR4 last (close/archive #161). Nothing is merged
  or closed until he answers BC_D1–BC_D3; #161 is left exactly as it is until then.

# ── ADDENDUM 2026-10-26 (0.60.255) — merged, not ported: his new call supersedes BC_D3 (both kept, §0.3) ──
# Context: by 0.60.254 BCR1–BCR3 had ported cos/services, the kernel ports (RAID, pulse, Ollama, Loom's store, the wall) and the maps.
# Still on brave-cori only: SL4/SL5 (the loop and his trust rule), the proof-strength fix, the DB16 registry drafts, the spec-compiler
# port, PS3/PS4, and its records. Asked nothing; he wrote:
# James, 2026-10-26: "Claude/brave cori eczug1. merge that repo please. make sure we dont regenerate the files we moved, and archived."
# BC_D3 was "Port it phase-by-phase" (2026-10-24). The coder's reading: "merge" = a real git merge, so the branch's history is in main's
# line and #161 has nothing left unmerged; "dont regenerate the files we moved, and archived" = main's tree wins for every path main moved
# (emerge → lib/emerge, erosmancer → clear-glass/erosmancer, emergence → lib/emergence, remote-desktop and security → cos/, sentinel →
# lib/sentinel, cli → lib/cli, nexus → lib/nexus) and every archive, and no generated node (.phase, .graph, atlases, README) is rewritten.
merge_2026_10_26:
  how: >-
    git merge of origin/claude/brave-cori-eczug1 (24 commits, base d7ef2d0b) into claude/keen-davinci-rqxxpb at 0.60.254. 2,946 paths
    under moved, archived or generated folders resolved to main's side (or left out where main has no such path). Every other conflict
    resolved by hand, file by file.
  brought_in:
    - "SL4 the self-building loop: idearium/lib/autobuild.js; GET/POST /api/repos/:uuid/loop(/start|/stop|/step); the minute tick; `repo loop`; the Phases rail's loop (start asks, stop)"
    - "SL5 his trust rule B: lib/trust-rule.js; GET/POST /api/trust-rule (his words required); `trust`; a proven run's proposals land by his rule before the close check"
    - "0.60.226 proof strength: idearium/repo/proof-run.js says what a proof ran; lib/phase-close.js refuses to close a files-only proof; the stall default 10 → 20 min"
    - "DB16 registry drafts: lib/registry-draft.js, `system drafts`, GET /api/system/registry-drafts and /:system/draft; the three drafts regenerated from main's tree (orchestrator, components, cos)"
    - "cortex/boot.js provides RAID to lib/raid-port.js in-process (main's port documented it, Cortex never called provide())"
    - "guardian /forge/health: cockpit/forge is not in the tree; said instead of throwing (GD0)"
    - "records: the graph-build G0 status; contract-queue's CB3 addendum (his job-ledger words); self-building-loop.spec's SL addendum; cos-spine and self-building-loop map addenda; PROOF-OF-COMPETENCY entries 0.60.237–0.60.239 under a from-brave-cori note; docs/2026-10-22-looking-glass-v0_4-error-report.md (his upload)"
    - "its 18 CHANGELOGs and version lines (numbers 0.60.225–0.60.242 collide with main's own) in _archive/2026-10-26-brave-cori-records/"
  not_ported_said:
    - "the spec-compiler port (EW2/EW3) and its /api/compiler routes: on main the compiler is the kernel's (lib/emerge/compiler), so its callers' require is no crossing. Kept in _archive/2026-10-26-brave-cori-records/not-ported/."
    - "PS3/PS4 (a uuid per bundle; one file per phase): would rewrite every .phase and drop every .graph — the regeneration he said not to do. Open as his call."
    - "EW1 emerge as a 16th system, the 'language' crossing kind, FOLDED/realSystems in lib/system-boundary.js: main's RF2 put the language in lib/; main's census stands."
    - "sentinel's archive (his 2026-10-24 \"Yeah archive it.\"): main keeps lib/sentinel; open as BCR5."
    - "readme-generate's phase-node folding: it changes the generated README; left for the next README generation, said."
  tests: "test-registry-draft 6/6 (RD-05/RD-06 rewritten for main's tree; brave-cori's kept in not-ported/), test-self-building-loop 5/5, test-phase-close 7/7, test-proof-run 7/7, test-phase-proof 7/7, test-raid-port 4/4, test-loom-into-cos 8/8, test-sovereign-systems 10/10, test-cos-compartment-template 8/8"
phases_added_2026_10_26:
  BCR5_sentinel_archive:
    status: OPEN
    depends_on: [BCR4_close_or_archive_161]
    files: [lib/sentinel/interaction-contract.json, lib/cli/sentinel.js, tests/modules/test-sentinel-cli.js, docs/nexus-sentinel.spec]
    does: "his 2026-10-24 \"Yeah archive it.\" applied on main: lib/sentinel and lib/cli/sentinel.js to _archive (git mv), test-sentinel-cli out of run-all, the spec addended. Not done in the merge: it is a move, and the merge kept main's moves."
