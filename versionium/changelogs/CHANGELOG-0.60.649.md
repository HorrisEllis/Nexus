# 0.60.649: a wall in the build reaches DeepSeek, not the 3b

James, 2026-11-24: "if its repairing itself. why is it stopping?"

Found while the build ran end to end on the model server: the self-repair worked (each held piece diagnosed, the lesson kept, the next round run), but every climb to DeepSeek 16b reached the 3b. First because DeepSeek was still downloading (expected, said in the bridge's log), then because of a bug: the model server gave each model its port by its place in the list, so DeepSeek's arrival moved the 3b from 9931 to 9932 while the 3b's engine still answered on 9931. Every DeepSeek request went to that 3b, and two copies of the 3b held the graphics card.

- **Each model keeps its own port**, made from its name (9931 to 10930): adding or removing a model never moves another. The 3b is now on 9942, the 7b on 10060, DeepSeek on 10809. A port you set yourself in COS › Settings › Model server still wins.
- **The bridge checks who answers**: an engine on a model's port is used only when it serves that model's file; otherwise the call fails and says which model answered instead.

Checked: the model server's tests (11 pass, one new: a model keeps its port when another is added); the bridge's tests (installed models 4, the tape 5, resource-adaptive 28, all pass).
