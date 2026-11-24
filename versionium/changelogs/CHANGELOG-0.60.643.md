# 0.60.643: the pieces always save

James, 2026-11-23: "Like torrents in a magnet link. The pieces always save." · "Every step can be broken down using end state first and a dag. Like nothing too small as long as it's persistent."

- **The torrent:** a phase's passed pieces are taken from disk with their own shapes; only what is missing is made. EMB3 rebuilt with Ollama unreachable: 13 pieces, 0 model calls, its 10 examples passed.
- **Repair before retry:** an answer the compiler refuses is repaired by autocorrect, the code the 3b wrote in 0.60.642. A refused `if !x` passed with no second model call.
- **A repeat splits smaller** instead of going to a bigger model.

Not built yet: Nexus splitting a phase from its end state into a DAG of pieces by itself (EMB4 slice b). Found: autocorrect does not handle an escaped quote, so it is used only after a refusal.
