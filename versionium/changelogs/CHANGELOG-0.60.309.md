# 0.60.309 — the pipe door decided; too many primitives, and ESS; his uploads kept whole

James, 2026-10-30:
> "these? give you input about all of this. not just han holding. your my partner in this."
> "non-linear / input, which can be any input, any data packet, then the system / way to many primitives i feel like / the data needs to flow into the /input and then moved to the output one by one."
> "both, one per system using the server.js as a ingest, from the input folder, with the intent as a flag after the command. / and then orchastrator/cos using raid as the routing, for systems, load balancing, and agents"

## Decided (his): RULE C, the door
- Each system has one door, served by its own `server.js`.
- An input folder is ingested one packet at a time. The pipe routes are the same door over HTTP.
- Each packet carries its intent, as a flag on the command (the exact syntax is to confirm).
- COS routes between systems with RAID: systems, load balancing and agents.

## Recommended (to confirm): ESS's five are the kernel
- ESS's five primitives (WRITE, BIND, CALLTO, RESOLVE, UNRESOLVE) are CIE-EG's register, road, emit, deliver and gap under other names.
- Everything else becomes a function registered by its hash: a library, not a primitive.

## The coder's review of ESS v0.1.0
1. The 7-character short hash is 28 bits. In an append-only store, the odds of two functions colliding reach one in two at about 19,000 functions. The full hash should be the identity.
2. A hash pins code, not behaviour, when the code calls a role.
3. BIND needs a capability per role. Otherwise every plugin is effectively root.
4. CONTRACT_UPDATE should be gated. Otherwise noise can become signal by redefining it.
5. Replay should go by sequence number, not by clock time.

Structural noise (§8) is the strongest idea in it.

## Kept
- **The uploads:** `_archive/imports/2026-10-30-uploads/`, with a manifest of hashes.
- **Removed:** Microsoft's `cmd.exe` from the lattice zip (redundant, and not ours to redistribute). Its hash is recorded.
- **Attribution, as the files state it:** SISO and Jaa's architecture are by Jonathan Bailey.
