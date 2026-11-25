# 0.60.661: a long module reaches Emerge by a file; helpers cannot take a builtin's name

James, 2026-11-25: "Compiler is supposed to debug its own code." · "you know why I love this idea? Because it's a feedback loop."

Found on EMB11's build on the 3b (9735fb83):
- **"spawn ENAMETOOLONG"**: the rung gave Emerge's compiler the whole module on the command line; with the 3b's helpers it passed Windows' limit and the build stopped. Emerge's command line now reads any argument from a file (`--<name>-file <path>`), and the rung sends a module over 6,000 characters as `--source-file` (a 29,000-character module checked in 171 ms).
- **Helpers named `push` and `t`** were linked in as pieces and "passed": a builtin's name and a one-letter name (a parameter or loop variable). gaps.eg now refuses Emerge's builtin names and one-letter names, as it refuses its keywords (0.60.658).

Checked: test-emerge-rung 14 of 14 (ER-05 now matches the file form; Emerge is still reached only by its command line), test-contract-gates 20 of 20, gaps.eg's Emerge tests 18 of 18. emerge-lock rewritten (emerge/ changed).
