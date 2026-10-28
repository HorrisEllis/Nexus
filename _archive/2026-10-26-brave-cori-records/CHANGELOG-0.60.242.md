# 0.60.242 — 2026-10-24

James: "Do it." · earlier the same day: "once it's merged with COS, those fucking boundaries, they're not, it's not coupling after that.
There's no coupling after that."

## Loom runs in its COS compartment, behind a wall

**Loom is the first Nexus system that runs inside its own compartment.** COS starts it, and it can't reach into another system's code.

- **The wall:** \`cos/compartment/boundary.js\`, COS's own code.
  - COS's process runner preloads it into the compartment's process.
  - Every \`require()\` that lands outside what the compartment allows is refused, with the route to use instead.
  - Allowed: its own folder, the kernel, the language (emerge + warp) and \`node_modules\`. The census and the wall share this one list.
  - Until now a compartment's mounts were only written down (\`lib/cos-bridge.js\`: "a RECORD, not an enforcement"), so "in a compartment"
    meant nothing for coupling. Now it does, which is what you said COS would do.
- **The seal:** \`moveIn\` moves a system in only once it is sovereign. Guardian is refused, with its 20 blockers listed.
- **COS's bridge** gains \`start\`, \`stop\` and \`processOf\`, through COS's own gates.

## Proof

- **Real move-in** (sandboxed):
  - Loom answered \`/health\`, its 4 hooks, the phasemap, its history, hooks validate and graph, compartments, contract and changelog;
  - the wall refused nothing at boot;
  - the tree was untouched.
- **The wall works:** inside it, requiring Cortex's database is refused, while Loom's own files and Node's built-ins load.
- **Tests:** test-loom-into-cos 8/8. LI-08 is the real move-in, and LI-07 is the seal refusing Guardian.

## What the wall found that the census cannot see

- **\`lib/gap-field.js\` loaded Cortex's database the moment anything required it.** The census counts every use of the kernel as allowed,
  so it never saw this; inside the wall, Loom could not have started.
  - gap-field now loads it only when its synchronous API is used.
  - It gains \`reportAsync\` / \`openGapsAsync\`, which ask Cortex through two new routes. Cortex runs the very same code, so nothing
    about gaps changes.
  - Loom uses the async ones. The other 30 users move when their system does.
- **\`loom/server.js\` builds a \`require\` path at runtime** (\`hooks/<system>.hooks.js\`), which the scanner cannot read. The wall
  refused it, and its \`catch\` would have said "no hooks file" for a file that exists. It now says the wall refused it. The real fix is
  LM5.

## Not walled yet (said)

- Reading and writing files directly.
- Child processes.
- The network.

The wall is on code coupling only.

## Next

- LM5: the 36 places other systems read Loom's files.
- Then Guardian, GD2 onward, and moving it in the same way.
