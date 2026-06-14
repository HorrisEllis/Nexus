# NEXUS — End-to-End Tutorial
**From zero to your first .nex file, first AI dispatch, first self-heal patch.**

---

## Before you start

You need:
- Node.js ≥ 18
- Ollama installed and running (`ollama serve` in a terminal)
- Mistral pulled: `ollama pull mistral:7b-instruct-q4_K_M`
- qwen2.5-coder pulled: `ollama pull qwen2.5-coder:1.5b`
- The NEXUS folder from the zip

Confirm Ollama works:
```
curl http://localhost:11434/api/tags
```
You should see a JSON list with both models.

---

## Step 1 — Boot the stack

Open a terminal in the NEXUS folder.

```
npm run start:all
```

You will see seven colored prefixes appear:
```
[ORCH]    NEXUS Orchestrator online :9000
[BRIDGE]  Bridge online :9999
[CORTEX]  Cortex online :3748
[GUARDIAN] Guardian online :7820
[IDEARIUM] Idearium online :4800
[ARCHITECT] Architect online :3747
[DIAG]    Diagnostic online :7825
```

If any service fails to start, it will print its error and the others keep running.
That is intentional — the system is designed to degrade, not crash.

**Verify everything is up:**
Open http://127.0.0.1:9000 in your browser.
You should see the NEXUS boot screen, then the home panel with all system dots green.

---

## Step 2 — Your first .nex snapshot

A `.nex` file is a complete frozen snapshot of NEXUS's memory at a point in time.
Cortex takes one automatically on every boot.

**To get your first .nex file:**

The moment cortex booted in Step 1, it created one.
Open: http://127.0.0.1:9000

Navigate to **CORTEX** tab → **SNAPSHOTS** sub-tab → click **↻ refresh**.

You will see a list. The top entry will be type `boot`.

Click it, then click **DOWNLOAD** — or copy the snapId shown.

To get the file directly:
```
curl http://127.0.0.1:3748/api/snapshots > snapshots.json
```

The `.nex` files live on disk at:
```
/path/to/nexus/data/snapshots/nex-XXXXXXXX.nex
```

---

## Step 3 — Understand what a .nex file is

Open any `.nex` file in a text editor. It looks like this:

```json
{
  "format": "NEX-SNAP/1.0",
  "uuid": "nex-02c9e103",
  "ts": 1718200000000,
  "type": "boot",
  "message": "automatic boot snapshot",
  "totalRows": 47,
  "tables": {
    "event_log": [ ... ],
    "gaps": [ ... ],
    "project_registry": [ ... ],
    ...
  }
}
```

Every JAA table, frozen in time. This is what you drag into the Lab to test against.

---

## Step 4 — Log your first idea

In the NEXUS UI, click the **+** FAB button (bottom right).
Click **Log Idea**.

Type something you want to build. For example:
```
A rate limiter that protects the guardian dispatch endpoint
```

Press enter or click CREATE.

The idea is now stored in Idearium and synced to Cortex's project_registry.

You can also do this from the CLI — open a second terminal in the NEXUS folder:
```
node cli/nexus-repl.js
nexus> idea A rate limiter that protects the guardian dispatch endpoint
```

---

## Step 5 — Dispatch your first AI job

This is the core loop. You send a prompt, the system routes it to Ollama,
gets a response, and stores the artifact.

**In the browser:**
Go to **GUARDIAN** tab → **DISPATCH** sub-tab.
- Provider: Ollama (local)
- Command: code
- Prompt: `Write a simple JavaScript function that limits calls to 10 per second`

Click **→ DISPATCH**.

The dot next to Ollama will pulse. After a few seconds (Ollama is loading the model),
you will see the response appear.

**What just happened:**
1. POST /command → Guardian received the job
2. RAID decided → Ollama first (LAW_I: local always first)
3. Guardian sent the prompt to Ollama via HTTP
4. Ollama returned the response
5. Guardian stored it as an artifact in JAA
6. The response appeared in the UI

**Verify the artifact was stored:**
GUARDIAN → ARTIFACTS tab → you should see the response there.

---

## Step 6 — Send a chunk through the SEAM pipeline

SEAM is how you send large specs to an AI in pieces.
Each piece gets verified before the next is sent.

**In the browser:**
Go to **GUARDIAN** tab → **SEAM** sub-tab.

Paste this spec text:
```
# Rate Limiter Spec

## Purpose
Protect the guardian dispatch endpoint from overload.

## Constraints
- Max 10 requests per second per provider
- Requests over limit are queued, not dropped
- Timeout after 30 seconds in queue

## Implementation
- Token bucket algorithm
- Per-provider semaphore
- JAA audit log on every rate limit event
```

Split on: **HEADINGS**
Provider: **ollama**

Click **Parse Spec →**

You will see 3 chunks appear. Click **Queue Full Spec** to dispatch all three.

Watch the progress bar fill as each chunk is verified.

---

## Step 7 — Check what Cortex remembers

Everything that happened in Steps 4-6 is now in Cortex's memory.

Go to **CORTEX** tab → **EVENTS** sub-tab.

You will see a live stream of events:
- `idea.created` — your idea from Step 4
- `guardian.job.complete` — the dispatch from Step 5
- `guardian.seam.chunk.dispatched` — the SEAM chunks from Step 6

Go to **CORTEX** → **TABLES** → select `artifacts`.
Your generated code is stored there.

Go to **CORTEX** → **TABLES** → select `gaps`.
If anything went wrong, gaps appear here. The healer processes them automatically.

---

## Step 8 — Take a snapshot manually

Now that you have real data in the system, take a named snapshot.

**CORTEX** → **SNAPSHOTS** → type a message: `after first dispatch test` → click **◉ SNAPSHOT**

This creates a `.nex` file in `data/snapshots/`.
This is the snapshot you will use in the Lab.

Or from CLI:
```
curl -X POST http://127.0.0.1:3748/api/snapshots \
  -H "Content-Type: application/json" \
  -d '{"message": "after first dispatch test", "type": "manual"}'
```

---

## Step 9 — Use the Lab (drag-and-drop test environment)

Open the **Diagnostic** panel: http://127.0.0.1:7825
Or from the main UI: click **⬡ DIAG** in the top bar, then navigate to the diagnostic service.

In the diagnostic UI, click **LAB** in the view menu.

You will see:
- A drop zone on the left
- A session list below it
- A production snapshot selector

**Option A — Load from production (easiest):**
The snapshot selector will list all your `.nex` files.
Select the one from Step 8, click **LOAD →**.

**Option B — Drag and drop:**
Open your file explorer.
Go to `data/snapshots/` in your NEXUS folder.
Drag the `nex-XXXXXXXX.nex` file onto the drop zone.

A session appears. The sandbox is now loaded with your system state.

**Run an experiment:**
- Type: `heal`
- Click **▶ RUN**

The lab will show you what the healer would prescribe for each open gap — without touching your live system.

- Type: `query`, table: `artifacts`
- Click **▶ RUN**

You will see the artifacts from your dispatch, isolated in the sandbox.

The **DIFF** panel at the bottom shows what changed between your experiment and the original snapshot.

---

## Step 10 — Check the self-heal status

Go to **CORTEX** → **SELF-HEAL** sub-tab.

Click **↻** to refresh.

You will see:
- `openLoops` — gaps that are open and accumulating tension
- `totalTension` — the aggregate tension score
- `byStatus` — breakdown of gap statuses
- `humanRequired` — gaps that need your attention

If you see `openLoops: 0` and `totalTension: 0` — your system is clean.

If you see gaps in `needs_manual` or `human_required` — the healer has escalated them.
These are visible in the **Diagnostic UI → SELF-HEAL** panel with a HEAL button on each one.

---

## Step 11 — See the diagnostic tension map

Open the diagnostic service UI: http://127.0.0.1:7825

You will see six system boxes. Each shows:
- **sigma** — how far the system is deviating from baseline
- **friction** — how much work is piling up
- **tension** — the combined score (friction × age × open loops)
- **regime** — stable / elevated / turbulent / critical

After running a few dispatches, guardian's sigma will be non-zero.
That is normal — it means the system observed activity and updated its baseline.

---

## Step 12 — Understand the full flow

```
YOU
 │
 ├── Log Idea (Idearium)
 │       ↓
 ├── Dispatch Job (Guardian)
 │       ↓ RAID decides → Ollama first
 │       ↓ Ollama responds
 │       ↓ Artifact stored in JAA
 │       ↓ GapHunter checks the response
 │       ↓
 ├── Gaps detected → Healer prescribes → Self-Heal applies
 │       ↓
 ├── Diagnostic monitors sigma/friction/tension
 │       ↓
 ├── Snapshot → .nex file
 │       ↓
 └── Lab → load .nex → experiment safely → diff
```

---

## Common issues

**Ollama is slow on first dispatch**
Normal. The model loads into RAM on first call. Subsequent calls are fast.
On your 3700X with 16GB RAM, first call takes 10-30 seconds.

**System dots are red/offline**
One or more services didn't start. Check the terminal for errors.
Each service can be started individually:
```
node orchestrator.js    # in terminal 1
node cortex/boot.js     # in terminal 2
```

**gaps table has 150 DELTA.TENSION entries**
Run this once to clear them:
```
curl -X POST http://127.0.0.1:3748/api/gaps/resolve-batch \
  -H "Content-Type: application/json" \
  -d '{"type":"DELTA.TENSION","reason":"signal-not-gap"}'
```

**Integration tests all skip**
They need the stack running first. Start the stack (Step 1), then in a new terminal:
```
npm run test:int
```

**SEAM queue gets stuck on a chunk**
The chunk is in GENERATING state waiting for Ollama. Ollama may have timed out.
Check GUARDIAN → SEAM tab to see the progress. The queue has a 120s timeout and will retry.

---

## What to build next

Once you have walked through Steps 1-12, you understand the system.
The next things to try:

1. **Spec a real idea** — go to ARCHITECT, use the spec wizard, compile the spec,
   watch it chunk and dispatch to Ollama

2. **Open a Claude or ChatGPT tab** — install the Tampermonkey userscript from
   `guardian/userscript-claude.js` in a claude.ai tab, then dispatch a job — it goes
   to Claude instead of Ollama

3. **Trigger self-heal** — go to Diagnostic → SELF-HEAL, click HEAL on an open gap,
   watch self-heal generate a forge patch via Ollama

4. **Compare snapshots** — take one before and one after a series of dispatches,
   load both in the Lab, diff them

