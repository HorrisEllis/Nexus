# 0.60.659: each piece is told what it is for; progress counts only what was planned

James, 2026-11-25: "Okay you need to be checking. And then it needs to be checking its own work."

On the fresh 3b-alone run of EMB10 (8352d009), checked against its examples, served_by was refused each time, and the record showed why: its description was empty. Told only a signature and examples full of JSON text, the 3b read `models` as an object (`models.data`; the runtime said "string has no member .data") and built six parse_json helpers. Each helper "passed" on compile alone, so every round counted as progress and the run went on.

- **Each piece gets its own sentence from its phase** when it has none: served_by is told it "is true when the engine's model list (its /v1/models text) names the model's file, or says nothing (an empty text)". The sentence runs to where the next function's sentence begins, so one with semicolons (sse_text) stays whole.
- **Progress is the planned functions that hold**, not every piece: on that run the old count said 8 passed, the true count is 0.
- **Cancel, proven live (0.60.655):** COS answered {"ok":true,"ended":1}, the run read cancelled, and the build wrote nothing more.

Next: the 3b-alone proof run again, EMB10 started fresh (its earlier piece files kept, renamed).
