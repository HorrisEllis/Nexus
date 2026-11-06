# 0.60.436 — CIE5 built: test blocks natively

James, 2026-11-06: "okay. so are you removing it when you're finisged?" · "continue"

- **`emerge prog.eg --test`** builds a program whose `test` blocks run after it. Each test runs from the same world, as a `whatif`, and the
  program prints what `eg test` prints, with its exit status. Without `--test`, test blocks are skipped, as `eg run` skips them.
- **Each test's `try`** sits in the program itself, so a failure names its own line.
- **`examples/tests.eg`** natively equals `eg test` in stdout, stderr and exit status. 6 of 9 examples in run mode.
- **Suites:** native 101/101, selfhost 16/16, lang 166/166, differential 19/19.
- **To his question:** the JavaScript goes file by file, archived as each `.eg` replacement passes the same tests. The first drop is the
  interpreter core at CIE11.
