# docs/2026-11-25-cos-pages-the-models-phasemap.spec — COS pages the models; RAID decides by signal to noise
# author: james-brooks (the direction and the calls are his; the map is the coder's, to his words)
origin: >-
  James, 2026-11-25: "we need the dynamic resource allaction. imagine if we had our own operating system we could make page or swapfiles." ·
  "raid signal to noise". Before them, the same day: "can we intelligently split between ssd, hdd, gpu and cpu?" · "Okay cos ui needs to be able
  to do that in the memory and storage settings." · 2026-11-24: "what about the cos superviser being a dns. or raid being a dns? also raid being
  a load balancer, resource manager, signal to noise can be way too many things".
found: >-
  The coder's census, 2026-11-25. The engine already holds both OS mechanisms: llama.cpp maps a model's file from disk (its weights page in from
  SSD or HDD as used: a page file), and its slot save/restore (--slot-save-path, the model server's slot_dir setting, "the rewind hook") writes a
  request's whole working context to a file and back (a swap file per request). COS already has the supervisor (start, stop, idle-stop, adopt,
  0.60.650-656) and the resource manager (cos/manager/resources.js: per compartment, a memory baseline with its sigma, pressure, acts RAID
  approves through lib/raid-port.js). Missing: VRAM measured at all; a decision of where each model lives; hibernate and wake. Evidence of the
  need, the same day: DeepSeek's engine held its memory two hours unused; free RAM 0.1 GB, the 3b's diagnosis past 15 minutes; RAID refused the
  resource manager's priority lowering of DeepSeek every 30 s (no evidence given), then approved a stop with evidence (RAM 1.6 to 5.0 GB).
decided: >-
  His: RAID decides by signal to noise; COS measures and acts. A demand or a pressure is signal when it is sustained and outside its baseline
  by its sigma, noise when it is a spike that passes; COS moves a model (wake, hibernate, place) only on signal, so it never thrashes. The rules
  are Emerge (his "no js"), the acts COS's existing doors.
axioms: "§5.9-§5.16 (COS measures and acts through its supervisor; RAID decides through its port; the model server declares its engines), §8.6 (resources.js, the supervisor, slot save, mmap reused, no second manager), §17.13 (the rules in Emerge)"

phases:
  PG1_measure_each_engine:
    status: OPEN
    depends_on: []
    files: [cos/manager/resources.js, inference/inference.eg]
    does: >-
      Each model engine's memory measured: its RAM (resident, from its process), its VRAM (the engine's own report, or nvidia-smi per process),
      its queue (jobs waiting for it, from the bridge), and the machine's free RAM and VRAM; each a sample kept with its baseline and sigma, as
      resources.js already keeps RAM. Shown in COS › Resources under the model server's row.
    proof: "with the 3b and DeepSeek up, each engine's RAM and VRAM read and their baselines kept; one sample per minute, no second manager"
  PG2_raid_signal_to_noise:
    status: OPEN
    depends_on: [PG1_measure_each_engine]
    files: [cortex/raid/pager.eg, lib/raid-port.js]
    does: >-
      RAID's decision, in Emerge: from PG1's samples, each demand (a model waited for) and each pressure (free RAM or VRAM falling) is signal
      when sustained past its sigma for a window, noise otherwise; on signal it decides one act (wake a model, hibernate one, place one) with
      its evidence, the act COS's resource manager asks it for today (fail closed: no evidence, no act).
    proof: "a spike of demand for a minute: no act; a queue waiting on DeepSeek for five minutes while RAM is free: wake it; RAM under the floor for three samples with an idle engine: hibernate it; each decision with its evidence on RAID's ledger"
  PG3_hibernate_and_wake:
    status: OPEN
    depends_on: [PG1_measure_each_engine]
    files: [inference/inference.eg, inference/server.eg, cos/manager/supervisor.js]
    does: >-
      A model hibernates: its slots saved to files (slot save, on D: per his tiering), its engine stopped by COS; it wakes: started by COS, its
      slots restored, every request's context exactly where it was. The swap file per request, the rewind he asked for (PC24) by the same act.
    proof: "a request mid-conversation on the 3b: hibernated, the engine gone and its memory freed; woken, the next answer follows on as if never stopped"
  PG4_place_and_admit:
    status: OPEN
    depends_on: [PG2_raid_signal_to_noise, PG3_hibernate_and_wake]
    files: [inference/settings.eg, inference/server.eg, cos/ui/models/page.js]
    does: >-
      Each model's placement from his tiers: layers on the GPU, MoE experts in RAM (--cpu-moe for DeepSeek), its working text at half size
      (-ctk/-ctv q8_0), its file on SSD or HDD; chosen from what PG1 measures and kept where it runs fastest (words a second, measured), every
      choice his to override in COS › Settings › Model server. Admission: a job whose model cannot fit now waits, said, until RAID wakes room.
    proof: "DeepSeek placed with its experts in RAM runs faster than with 8 layers on the GPU (measured); a job that cannot fit waits and runs once room is made, the PC never under its floor"

build_order: [PG1, PG2, PG3, PG4]
