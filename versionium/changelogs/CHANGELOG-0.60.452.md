# 0.60.452 — PC3 slice a: RAID takes a build request by route

James, 2026-11-08: "a step can also be a build request, like a gap, or error or bottleneck" · "Continue to get the automation done."

- **Cortex serves RAID's contract queue for writing.**
  - `POST /api/raid/contracts` files a contract (content, its test, a title, and optionally what it depends on and what to do on failure) and
    answers with its queue id.
  - `GET /api/raid/contracts/:id` reads one back.
  - Before this, the queue could be read from outside but not written to. RAID is the only write authority for requests (§9.1), so a build
    request now goes through it. The route moves with RAID when RAID moves into COS.
- **Proven on a real Cortex in the sandbox:**
  - a build request was filed and queued, then read back;
  - a contract with no content was refused, with the reason;
  - an unknown id answered 404.
- **Next (PC3 slice b):**
  - COS offers a build box as a held proposal after a step fails (his PC_D3); when he takes it, COS files it through this route;
  - the engine's build step waits until the contract passes, then opens.
