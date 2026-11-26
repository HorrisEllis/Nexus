# 0.60.663: the adversary gate, three different 3b models; the model server reads every store; its engines under one row

James, 2026-11-25: "like another compiler. like the other one treats success as a problem ... could even use another 3b" · "I'm not paying for tokens. more tokens wasted on unstable code than doing the work of critisizing it" · "yes. three different 3b. i use abliterated so they are less bias" · "the three models on under the side panel. need to be under one system. the model server."

- **The adversary gate (EMB12)**: after a piece passes its own examples, one model writes new cases from its sentence (never its code), two other models read them blind, Emerge runs the piece; gaps.eg's adversary_verdict decides each case: all three agree and the piece differs, refused with the case; they disagree, a tension in the spec (kept, his to settle); they agree with the piece, the case joins its examples. On only when a pipeline names three adversary models (one model reading three times agreed on wrong answers in tonight's test). Cases must fit the signature; each runs on its own; True/False read as true/false.
- **Two more abliterated 3b models**, llama3.2-abliterate:3b and smallthinker-abliterated:3b, on D: (C: had 4 GB free), checked against their checksums; **the model server reads every store** in its settings, not only the first.
- **COS's menu**: a system's own processes (the model server's three engines) sit under one row, "model server", opened or closed with a click.

Checked: test-emerge-rung 14 of 14, test-contract-gates 20 of 20, gaps.eg 19 of 19, the model server's tests 11 of 11. The three-model proof runs after this release.
