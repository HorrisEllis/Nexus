# 0.60.101 (built on the branch as 0.60.77; renumbered at the merge with main) - 2026-10-16

James: "I'm saying from all domains, relative to coding, qa, qc, all checks and test. Any for all syntax and languages, compilers, and software, all coding. Then Can we have a passthrogu to the terminal for the test inviremr t. Need to get cos working. I also want to get a hackentash going for devoloping apple apps. Androidos for android apps using Android adk with the highest leveraage and most powerful project that's the easiest to use, without losing all the capabilities like not a wrapper, a full on Android app development project"

Context: right after the proposal-evidence work (0.60.75-0.60.76). The first sentence widens "find all tests, qa, qc" to every language and compiler.

## Built
- **Every language's own parser at the gate (MB5).** `lib/checks/ck-248-toolchain.js` grew from 9 to 18 languages (php, ruby, rust, java, kotlin, swift, lua, toml, xml added). `selfTest` / `coverage` run each tool on valid and on broken code, so an installed tool that cannot tell them apart is caught. `checkText()` checks a text. The `code.write` gate calls it for every language, at `propose()` and `edit()`. A language whose tool is missing is reported in the proposal's evidence as "syntax NOT checked — this is not a pass".
- **The test VM's own terminal (MB1).** `cos vm shell <compartment> [--user=u] [-- cmd]`: ssh over the loopback forward COS already had (127.0.0.1:2200+N), the terminal handed straight through, the guest's exit code returned.
- **cos/spec/language-toolchains.spec:** 31 languages x every kind of check, plus Android- and Apple-specific checks.
- **docs/2026-10-16-mobile-compartments-phasemap.spec:** Android and Apple as COS compartments; the open decisions.
- tests LC-01..07, VS-01..06. Old SG-06 / SG-09 changed: they asserted Rust and TypeScript were "unchecked", which was the old contract.

## The coder's call, not a tooling limit
I did not build a Hackintosh. Apple's licence allows macOS only on Apple-branded hardware, Xcode follows it, and Apple has said macOS Tahoe (26) is the last release for Intel Macs, so a Hackintosh stops getting updates within about a year. The goal (Xcode, driven by Nexus) is mapped as a real Mac over ssh (MB4).

## Not built
The Android and Apple compartments themselves (MB2-MB4), the linters/fuzzers/mutation tools in the matrix, tree-sitter for languages with no installed compiler.

## Honest limits
15 of 18 language tools were verified, in the build container. Kotlin, Swift and Lua are written and untested (no tool). `cos vm shell` was tested with a fake ssh: never against a real VM, never on Windows. "Android ADK" was read as the Android SDK (to confirm). "Need to get cos working" is not addressed beyond the terminal: what is not working in COS has not been looked at.
