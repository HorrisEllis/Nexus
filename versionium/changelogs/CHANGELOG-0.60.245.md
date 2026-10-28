# 0.60.245 — BCR1: his network engines in COS, ported from brave-cori

James, 2026-10-24: "https://github.com/HorrisEllis/Nexus/tree/claude/brave-cori-eczug1 / can you resolve this?"

The work it carries is his: "im saying for web servers, dns, firewall, email smtp, like integrating into deployable. i want to use those
engines for test env, web servers, etc all of them / this is all the networking backend for anything needed netwroking wise."

## How brave-cori is being resolved
Not by merging it. #161 is 24 commits on a line that redid RF2's folds its own way and used the same version numbers for other work.
He decided how on 2026-10-24 (docs/2026-10-24-brave-cori-reconciliation.spec): "Port it phase-by-phase" (BC_D3). Each piece that is only
on brave-cori comes onto main by itself, renumbered above main, and proven there. This is BCR1.

## What came in, verbatim from brave-cori's 0.60.235 SV0
- `cos/services/anonymous/`: 126 files. His anonymousservers engines: a kernel supervising its engines over newline-JSON IPC (web servers,
  DNS, firewall, SMTP, TLS, proxy, storage, queue …), as services COS can deploy, one stack per compartment.
- `cos/spec/cos-services.spec`: the full spec in emerge's module format.
- `docs/2026-10-24-cos-services-phasemap.spec`: its phases SV0–SV4.
- `tests/modules/test-cos-services.test.js`, registered in run-all.

## Proof on main
- test-cos-services 4/4: the gate grammar runs no IPC string as code, two kernels run side by side, upstream is unchanged, and no secret
  is carried in.
- `cos-services.spec` compiles at full depth (test-substrate-spec 3/3, now listed there).
- The boundary ratchet adds no crossing. A scan for private keys and tokens finds none. loom has the engines with their wires.

## Also in this release: a miss of the coder's, fixed
0.60.244 put the sovereignty phases (SV0–SV8) and the placement phases (CS12–CS21) in docs/2026-10-23-cos-spine-phasemap.spec. That map
is tied to cos-spine.spec's modules, so SS-02 went red on main. They moved word for word to
`docs/2026-10-24-sovereign-systems-phasemap.spec`, with a pointer left behind. His answers CS_D9–CS_D14 stay in the COS map.

A name clash, said: the cos-services phasemap's phases are also called SV0–SV4. Their full names differ, so the DAG keeps them apart. Both
are kept as written.

## What is left of brave-cori
- BCR2: the other kernel ports, and Guardian's 4 remaining RAID requires.
- BCR3: the emerge+warp system, and loom and guardian into COS (built through their own maps).
- BCR4: close #161 with a pointer, its branch kept.
