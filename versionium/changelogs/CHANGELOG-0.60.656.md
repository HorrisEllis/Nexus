# 0.60.656: an adopted engine is idled out; COS shutting things down, proven

James, 2026-11-25: "prove it"

Evidence, from COS's own ledger (cos/data/manager/ledger.jsonl), for 0.60.655 ("COS can shut it down"):
- 11:02:13 — COS adopted the DeepSeek engine (pid 9008, :10809) and the 3b's (pid 3240, :9942): "already answered ... adopted, not started again".
- 11:02:14 — COS ended the old leftover 3b (pid 18184) by itself: "ran llama-server.exe, which a declaration runs, but no declaration held it: ended". No one used Task Manager.
- 13:4x — COS stopped its adopted DeepSeek engine on a rule, after RAID approved the stop on its evidence (unused, idle since 11:12, 1.6 GB of RAM free): free RAM went from 1.6 GB to 5.0 GB.
- The supervisor's tests, rerun with memory free: 9 of 9, twice (they had failed alike on old and new code at 0.4 GB free).

Fixed here: an engine adopted when COS starts had no last-used time, so the 10-minute idle stop never applied (DeepSeek held its memory for two hours unused). It now counts from its adoption.

Not yet proven: the 3b alone completing EMB10. Its last run wrote all 5 pieces (each passed Emerge's compiler), the module failed its examples, and its two diagnoses ran past 15 minutes while DeepSeek's idle engine held the memory (one sentence from the 3b took 38 s). Rerun after this release.
