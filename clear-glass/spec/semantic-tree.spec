# clear-glass/spec/semantic-tree.spec — SP1 (0.60.49). Surface drafted from the code (lib/capability-spec.js draft); purpose from the map.
spec:
  meta:
    name: semantic-tree
    version: 1.1.0
    kind: capability
    files: [clear-glass/src/page/semantic-tree.js]
  purpose: "The page as a semantic tree for Clear Glass's browser agent: roles and accessible names with unique addresses (main › form › button \"Send prompt\") that survive class churn; from the browser's accessibility tree, or computed in the page for code that runs there."
  origin: "James (2026-10-15): \"what about a semantic tree for our own browser agent?\""
  surface:
    exports: [DEFAULTS, FIELD_ROLES, KEEP, MODULE_ID, VERSION, _inPageResolve, _inPageTree, addressOf, addressScript, fromAX, normalize, outline, pageScript, parseAddress, preludeSource, readAX, resolveScript, roleFits]
    events: []
    routes: []
  invariants:
    - "an address names one node or is refused — never guessed"
    - "hidden nodes (display:none, aria-hidden, hidden) are not in the tree"
    - "the in-page builder closes over nothing (it is serialised into the page)"
  checks: [CK-254]

## ADDENDUM 2026-10-15 — SP2: addresses for the provider field map (1.1.0)
# James (2026-10-15, answering "SP2 next, then the 33-writer gap sweep — in that order?"): "alright."
# Surface grew by three, promised here: addressScript(xpath) (the picker's pick → its address; the nearest kept
# container's when the element itself is not kept, exact:false), preludeSource() (the in-page tree + resolver as
# window.NexusSemantic for the userscripts, which cannot reach CDP), roleFits(key, role) + FIELD_ROLES (send is a button,
# input a text box). The in-page builder takes opts.targetXpath and still closes over nothing.
