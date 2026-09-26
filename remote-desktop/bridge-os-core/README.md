# Bridge OS — CORE

The full project is 43 modules / 187 files / ~2.3MB across networking,
transport, mesh, onion routing, steganography, radio, voting, and more.
This is the 7 modules MANIFEST.json marks `"vital": true`, and nothing
else — the part of Bridge OS that has no dependents but is depended on
by everything: **408KB, 30 files, zero npm packages.**

```
identity → core → IME → sngate → bus+data → heartbeat → contracts
```

Verified: this actually boots and answers HTTP standalone (`node index.js`,
tested against `/health`, `/identity`, `/pulse`, `/nodes`, `/ime/profile`,
`/sngate/trace|rules`, `/data/*`) — this isn't a doc restructuring, it's a
working subset.

## What's cut

Everything else in the full tree: bridge-integrity, bridge-cobalt (ledger
seal), bridge-nat, bridge-plugin (WS gateway), bridge-mesh/trust-mesh,
bridge-causal (1M-entry ring buffer), bridge-dht, bridge-pipeline,
network-identity, bridge-routing, bridge-gateway, bridge-magnet,
bridge-bayesian, bridge-sovereign-vote, bridge-onion, bridge-steg,
bridge-radio, bridge-phantom, bridge-sybil, bridge-transport (BLE/cellular),
bridge-mobile, bridge-ipfs, bridge-ssh, bridge-proxy, bridge-ddns,
bridge-health, bridge-electron, bridge-cli.

I confirmed by grepping every vital module's `require()` calls that none
of them reach into any of the above — the cut is clean, not a guess.

## Verified checked in, not just copied

- `node --check` passed on every file
- Live boot: all 6 phases (identity → heartbeat) complete
- All 7 vital routes return correct JSON
- Unauthenticated request correctly gets `401` (fail-closed API key, same
  fix as the full build — no key set means denied, not allowed)

## Adding a module back

Each cut module is additive, not load-bearing — restore by copying its
directory back in, adding its `require()` to `bridge-node/boot.js`, and
porting its route block from the full `index.js`. Say which one and I'll
do that as its own step against this core, same pattern as before.

## Run it

```
npm install   # no-op, zero deps
node index.js
```

First boot generates `data/.nexus-api-key` — send it as
`Authorization: Bearer <key>` on every request.
