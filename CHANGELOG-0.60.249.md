# 0.60.249 — BCR2 LM4: the wall around a compartment (from brave-cori); one question for him

James, 2026-10-24: "can you resolve this?" (claude/brave-cori-eczug1)

This ports brave-cori's 0.60.242 LM4, which carried his words: "Do it." · "once it's merged with COS, those fucking boundaries, they're
not, it's not coupling after that. There's no coupling after that."

## Ported (cherry-picked, resolved against RF2)
- **The wall:** `cos/compartment/boundary.js`. COS's process runner preloads it for a compartment whose env carries `COS_BOUNDARY`.
  Any `require()` outside the compartment's allowed paths (its folder, core, node_modules) is refused.
- **`loom/templates/cos-compartment.js`:** `boundaryFor` and `moveIn`. The seal moves a system in, never before.
- **`lib/cos-bridge.js`:** `start`, `stop`, `processOf`.
- **`lib/gap-field.js`:** no longer loads Cortex's store just by being required. It is lazy, and outside Cortex it uses an async API
  over Cortex's new `/api/gap-field/report` and `/api/gap-field/open`. The wall found this on brave-cori; the census cannot see it.

## Changed for main
- `processOf` asks COS's host (`cos/host` gains `processOf`), instead of core loading `cos/compartment/process-runner.js`. That would
  have been a new crossing up into COS, and the ratchet refused it.
- `FOLDED` and `LANGUAGE_PATHS` are exported empty. Brave-cori kept those folders at the top level; RF2 put them inside `lib/`, which is
  mounted. When warp becomes a system (CS19), `LANGUAGE_PATHS` names it.
- The atlases, phase nodes and loom registry were regenerated, not merged.

## A question for him (it is his call)
On brave-cori, "sovereign" meant "loads no other system's code", and his "Do it." moved Loom into its compartment. On main, sovereign
means both ways, by his CS_D7: "Dont they need to be sovereign first?" … "no other system loading its code". Loom loads no other system's
code now, but 34 places still load Loom's. So the seal refuses, and **Loom is not moved in yet**. The refusal now names both halves.

The coder's reading by the axioms: the wall constrains only Loom's own requires. What loads Loom's code does so from its own process, so
moving Loom in would break nothing, and it can be undone (stop). But his two statements disagree, so the seal stays strict until he says
which holds.

## Proof
test-loom-into-cos 8/8. LI-07: the seal refuses guardian and names both halves. LI-08: the refusal and its reason now, and the full move-in
once the seal is ready. Also: CT 8/8, gap-field 18/18, SB 10/10, SV 9/9. The ratchet is green.
