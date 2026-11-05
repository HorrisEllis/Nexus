# 0.60.411 — COS's Resources page: the resource manager, first step

James, 2026-11-05: "need that resource manager". The coder proposed a first step: a Resources page in COS where each system's priority
(low / below normal / normal) and memory limit are set and applied right away, plus "don't start at boot", with RAID balancing after.
His answer: "yes".

## Found first
The backend was already there (CP6a, 0.60.356): caps by layer, the priority applied and read back from the OS, the heap limit on the command
line, a memory watch with a RAID-approved restart (CP6b). But it had no page of its own, only a key/value form inside each system's cockpit,
and "Resources" sat in the contract's planned list. So this is a page on what exists (CP6a expanded), not a new engine.

## Built
- **COS › Resources**, on the main rail. Each system has one row:
  - **Using now:** memory and CPU, read hidden at the moment the page opens.
  - **Priority:** low, below normal or normal. It applies at once, and the row shows what Windows reports back.
  - **Memory limit:** in MB. It applies at the system's next start, and the row says so.
  - **Restart above:** a memory line. COS restarts the system past it, after asking RAID first.
  - **At boot:** on or off.
- Every change is yours on the ledger, and is read back after it is made.
- **Balancing:** RAID moving load between compartments (CS7) is next. It will balance within the limits set here.

## Proof
- `test-cos-resources-page` 2/2. RP-02 runs in Clear Glass against a real supervisor running two systems:
  - priority set to low on the page, and the OS reports the running process as low;
  - a 512 MB memory limit becomes your setting and says it waits for the next start;
  - Start at boot switched off becomes your configuration;
  - no page errors.
