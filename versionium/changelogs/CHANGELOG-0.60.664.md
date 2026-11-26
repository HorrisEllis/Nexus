# 0.60.664: the pipeline tested on its own build; COS's supervisor through RAID; the compiler side catches self-defeating code

James, 2026-11-25: "test the pipeline while testing them, while building the pipeline ... So why are you wasting it on garbage?" · "okay everything should be routing through raid." · "raid and the cos superviser" · "Like a tree of branches. Like each event, step, decision, action, like nothing in nexus wouldn't be explicit"

The EMB10 pipeline ran with the adversary gate on three different abliterated 3b models (T17, its predictions registered before). What the real run found, and what changed:

- **The build asks RAID to wake the model bridge, with measured proof.** A start with no proof was refused and the run stopped mid-build.
- **The compiler side refuses self-defeating bodies, no model asked** (gaps.eg `self_defeating`): a loop named as a parameter, or a name compared with itself. Two wrong helpers had passed ("if key == key"); on the next run it refused one with "the loop's name item is also a parameter's".
- **A helper's sentence is never a type word** ("bool"); the adversary reads only pieces with a sentence.
- **The adversary's readers answer numbered cases;** their raw replies are kept on the piece. Reasoning readers' prose ("Result: True") and "->" read as answers; each case counted once; a per-model repetition penalty in the model server (smallthinker looped).
- **COS's supervisor routes its own acts through RAID, split by harm (his choice, PG5):** an idle stop or ending a stray waits for RAID's yes with proof; a wake, crash restart or adoption goes at once and is reported, and a refused report holds the next repeat; Cortex, where RAID runs, is never held.
- **A build step that did not build its phase now fails** (it exited 0, and COS showed EMB10 done with served_by held).
- Maps: PC26 (the run grows from the gates, one tree, nothing implicit; the census: 93 open phases are this one tree), PC27 (his equations as measurements, his original framework), PC28 (the pipeline observes itself), PG5; T17 judged in FRAMEWORK-THREADS: 2 held, 2 failed, 1 in part.

Checked: supervisor 12/12, cos-service 11/11, emerge-rung 14/14, contract gates 20/20, gaps.eg 20/20, model server 11/11.
Not proven: the adversary catching anything on real work; EMB10 complete.
