# 0.60.397 — The Element Engine plugin (EE0)

James, 2026-11-05: "okay this needs to live inside the new plugin also. lets do the merge." Before that: "can you integrate erosmanceros, the
adblocker, and guardian picker into one? should be a phase for it."

## Built
The Ad Blocker plugin is now the **Element Engine** (3.0.0). It is the same plugin: the same id, folder and handlers, so your filter lists,
allowed sites and your own filters stay where they are. Its panel (🛡 on the toolbar) has four parts:
1. **Ad blocking**: exactly as before.
2. **Elements**: **Pick an element** starts the Guardian picker. After a pick, the bars it already had follow: Gate this element, Bind a key.
3. **ErosmancerOS**: its state, read through Clear Glass's own `/eros-supervisor` route. ErosmancerOS stays its own process; that decision
   (EE_D1) is still yours.
4. **Edit ErosmancerOS**:
   - Export a copy to edit;
   - Show my changes;
   - Import my changes.

   This is the ES5 tool with all its checks: the syntax is checked, the old files are kept in `_archive`, and the module's own test runs,
   putting the old files back if it fails.

## Proof
- `test-cg-element-engine-plugin` 4/4.
- `test-adblock` 13/13 and `clear-glass-plugin-routes` 3/3, unchanged.

## Open
- EE1: one lasting identity for a picked element.
- EE2: Hide what you point at.
- EE3: one element panel.
- EE4: archive the old ways.
