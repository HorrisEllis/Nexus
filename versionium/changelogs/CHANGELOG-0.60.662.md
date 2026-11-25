# 0.60.662: the pipeline runs the gaps.eg fixes it was said to run (a correction)

James, 2026-11-25: "Okay you need to be checking."

A correction. The rung does not run idearium/lib/gaps.eg itself: it runs a copy Emerge's compiler builds from it (idearium/lib/eg-build/gaps, lang-build --standalone). That copy was last built 2026-11-24 07:57 and was never rebuilt, so the gaps.eg changes of 0.60.658 and 0.60.661 never reached the pipeline: the hint that contains is a word between two values, and the refusal of helpers named after Emerge's words, its builtins, or one letter. Their tests passed because the tests run gaps.eg directly. Found when EMB11's build linked helpers named join, push and pop again.

- **The copy is rebuilt** from gaps.eg with Emerge's own compiler, and checked on the copy: may_name("join") is false, may_name("is_member") true, and the contains refusal gets its fix.
- **The rule acts where a helper is made**: gaps.eg's may_name(n) (not an Emerge word, not a builtin, not one letter) is asked by the rung before it creates a helper, not only by link afterwards (link left the order alone, but the helper had already been made).

Checked: gaps.eg's Emerge tests 18 of 18 (may_name added), test-emerge-rung 14 of 14, test-contract-gates 20 of 20. Still to make it impossible to repeat: the rung should rebuild the copy when gaps.eg is newer than it.
