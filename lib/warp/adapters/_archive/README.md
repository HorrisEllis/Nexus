# Archived (§0.3), 2026-11-05, EAS4 L0

`emerge-field.js` is superseded by Emerge's own `emerge/emerge/core/admit.js` (the same `admitFrom`, on Emerge's `evaluate`).
Why: the adapter serves Emerge's constraints, so it is Emerge's (AXIOMS §5.15); WARP's Engine takes `admit` handed in, so lib needs no
edge up into emerge/ (lib/system-boundary.js counted the direct require as a new upward crossing). Map:
docs/2026-10-31-emerge-as-a-system-phasemap.spec, EAS4.
