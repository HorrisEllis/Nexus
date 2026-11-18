# 0.60.564: mapped — Ollama writes the code, Nexus plans and reviews, every primitive rated, gaps filled like a torrent, Nexus on its own OS

James, 2026-11-18: "all of nexus is made to improve small llm capability, and outsource complexity and memory to nexus. its cybernetics,
for me and for the agents. its like a second brain with me the mind or copilot the mind." · "nexus makes systems using deterministic code and
resuable primitives. its how i've learned to navigate the world." · "Yeah. We need a structural metric for rating primitives. Yes but we can
skip steps and mark them as gaps rated with tension. And have system focus on them after like pieces of a torrent, filling piece by piece." ·
"Yes also once emerge is done. Then that can be the beginning of our os. Then we can replace the pillars slowly. I want a fully built from my
architecture os"

Mapped only. Nothing built in this release.

## The factory map (docs/2026-11-15-the-factory-phasemap.spec), with a census of what each phase stands on
- IF13 Ollama writes the code (3b, then deepseek-coder-v2:16b; browser agents plan and review, never write files; a failed step is
  decomposed, then held).
- IF14 Nexus plans deterministically (the spec module, .phase/.graph, component store, code-intel, schemas, templates; a model only for what
  they cannot fill).
- IF15 Nexus reviews deterministically (syntax, Emerge's checker, the plan's exports, verify-first, the phase's own test, contract gates,
  sigma/delta; an agent reviews only after a check failed).
- IF16 tests run in COS's test environment, as a pipeline step. IF17 Emerge first, JavaScript when Emerge cannot. IF18 the visual debugger.
- IF19 a structural rating for every primitive: load, verification, confidence as the weakest link and as the product (both, his yes),
  tension = load × (1 − confidence). IF20 gaps filled like a torrent: a step that cannot pass is skipped and held as a gap at its tension;
  Nexus fills them highest first; a phase closes with its last gap. IF21 the adversarial system attacks the most load-bearing primitive first
  (contract attacks, bidirectional causal chaining, cross-domain verification).
- Each with its .phase spec and graph (idearium/spec-engine/phase-specs.cjs), and a ledger line.

## The COS machines map (docs/2026-10-05-cos-machines-phasemap.spec)
- OS3 Nexus on Debian minimal (after Emerge: his order), measured against Windows on the same machine. OS4 Debian's pillars replaced by his
  architecture's, one at a time, written in Emerge, each swappable back.

## Recorded
- The first Ollama-only run (routing.escalation = the two Ollama models, his "without guardian preferably"): GQ1 written in Emerge by Ollama,
  checked by Emerge's compiler, "landed clean" with 0 agent calls — an 8-line placeholder. GQ1 stays open (IN PROGRESS); the two gaps (test-first
  without a planner; placeholder refusal) are IF15's.
- docs/FRAMEWORK-THREADS.md T12 (attack the most load-bearing first), its prediction written before any run.
