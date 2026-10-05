# 0.39.310 — 2026-10-05

James: "every system is supposed to be sovereign. the components registry is a an event driven interaction contract. nodes for data to persist or move through the system … like the atlas' are supposed to list the commands and routes in relation to the component or module, like its all supposed to be very specific and etailed. nodes schemas, taxonomy. guardian is the closest the system."

## Every atlas now carries its generated half
The atlas generator (`lib/atlas-generate.js`, built in 0.39.266) had **never been run**: none of the 17 atlases had its section. It's now run for every system.

**What each atlas now lists,** from the registry and the code itself:
- every route;
- every event, with who hears it;
- every file, with its purpose, exports, requires, required-by and covering tests.

The section sits between markers and is rewritten each time the generator runs, so it can't drift from the code. Run `node scripts/generate-atlases.js`, after `node loom/bootstrap.js` when the code has moved. The hand-written narrative above the markers is untouched.

**Already showing:** 10 of Guardian's 14 events have no listener anywhere in the code.

## Fixed in the generator
Two problems made the new sections fail the atlas reference test:
- **Loom's data files were written as links.** Data folders sit outside the snapshot, so they're now written as plain text.
- **A port in a file's header became a link.** An unknown port (an old Emerge `:4242`) then read as a dead link. Ports in file descriptions are now written as words.

## Not in it yet
- **Commands per component,** from each component's grammar and the CLIs.
- **Node types and their schemas** per system.
- **Each system's event taxonomy** checked against what it actually emits.
- **Each route tied to the file that serves it,** not only where it's declared.

## Proof
`test-nexus-atlas-refs` passes **51/51** and `test-nexus-atlas-and-glass` passes **9/9**.
