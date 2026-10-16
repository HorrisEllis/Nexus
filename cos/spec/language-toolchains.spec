# cos/spec/language-toolchains.spec — every language Nexus may meet, and every kind of check each one has
# Companion to cos/spec/qa-catalog.spec (methods, by domain) and cos/spec/check-catalogue.spec (the checks Nexus has built).
# This one is the MATRIX: language x kind of check. 0.60.77.
spec:
  name: Language toolchains and the checks each has
  owner: cos (the test environment, cos/testenv) · lib/checks/ck-248-toolchain.js (the syntax column, built)
  status: catalogue — written from knowledge; only the `here:` column was run (see verified)
  james: "I'm saying from all domains, relative to coding, qa, qc, all checks and test. Any for all syntax and languages, compilers, and software, all coding."
  context: >-
    James, 2026-10-16, after the proposal-evidence work (0.60.75), widening "find all tests, qa, qc, debugging, strategy" to every language
    and every compiler. Said alongside: a terminal passthrough to the test environment, an Apple-app path, and an Android-app path.
how_to_read:
  - "`syntax` is the cheapest check and the one a proposal can be given before anything runs: the language's own parser, no code executed."
  - "`typecheck` needs the neighbours (imports, SDKs): it is run in the test environment, not on a lone proposed file."
  - "`nexus` says what Nexus does today: CK-248 = a parser run by lib/checks/ck-248-toolchain.js (and the code.write gate, 0.60.77); test-detect = cos/testenv/detect.js finds and runs its tests; none = nothing yet."
  - "Nothing here is claimed to work on a machine until `ck-248 coverage` has run its self-test there: a tool that is installed must tell valid from broken code."
verified:
  here: "run 2026-10-16 in the build container with `node -e \"require('./lib/checks/ck-248-toolchain.js').coverage()\"`: js ts py sh json yaml go c cpp php rb rs java toml xml — 15 of 18, each detects broken vs valid. kt (kotlinc), swift (swiftc), lua (luac) are in the table and NOT installed here: written, untested."
  not_run: "Everything in the other columns (linters, formatters, test runners, sanitizers, fuzzers, mutation tools, SAST) is from knowledge, not run."
kinds_of_check:
  static_no_run: [syntax/parse, typecheck, lint, format, dead-code, complexity, duplication, dependency-graph cycles, import resolution, license scan, secrets scan, SAST (taint, injection, crypto misuse), SCA (known-vulnerable dependencies), SBOM, spec/schema conformance (OpenAPI, JSON Schema, protobuf breaking-change)]
  dynamic_run: [unit, integration, end-to-end, contract, snapshot/golden, property-based, fuzz (coverage-guided), mutation, differential (two implementations), metamorphic, regression, flaky-test detection, benchmark/perf, load, soak, chaos/fault-injection]
  runtime_instrumented: [AddressSanitizer, UBSan, ThreadSanitizer, MemorySanitizer, Valgrind, leak detectors, race detectors, coverage (line/branch/mutation), tracing/profiling, heap/GC analysis, strict-mode/assert builds]
  human_facing: [accessibility, visual regression, usability heuristics, localisation/pseudo-locale, device matrix, store-review guideline checks, privacy manifests]
  build_release: [reproducible build, signing, notarisation, bundle/APK/IPA size budget, startup time, crash-free-rate canary, migration up/down, rollback rehearsal]
languages:
  javascript: {exts: [js, mjs, cjs], syntax: "node --check", typecheck: "tsc --checkJs, flow", lint: "eslint, biome", format: "prettier, biome", test: "node --test, jest, vitest, mocha", extras: "fast-check (property), stryker (mutation), c8/nyc (coverage), npm audit, semgrep", nexus: "CK-248 + code.write gate; test-detect"}
  typescript: {exts: [ts, tsx], syntax: "tsc --noEmit --isolatedModules (per file)", typecheck: "tsc --noEmit (whole project)", lint: "eslint + typescript-eslint", format: "prettier", test: "vitest, jest(ts-jest), playwright-test (NOT used here: Clear Glass is the UI harness)", extras: "ts-prune (dead code), madge (cycles), stryker", nexus: "CK-248 (tsc) + gate"}
  python: {exts: [py], syntax: "python3 -m py_compile / ast.parse", typecheck: "mypy, pyright", lint: "ruff, pylint, flake8, bandit (security)", format: "black, ruff format", test: "pytest, unittest", extras: "hypothesis (property), atheris (fuzz), mutmut/cosmic-ray (mutation), coverage.py, pip-audit, vulture (dead code)", nexus: "CK-248 + gate; test-detect"}
  go: {exts: [go], syntax: "gofmt -e", typecheck: "go build, go vet", lint: "staticcheck, golangci-lint", format: "gofmt, goimports", test: "go test (-race, -cover, -fuzz built in)", extras: "govulncheck, gosec", nexus: "CK-248 + gate; test-detect"}
  rust: {exts: [rs], syntax: "rustfmt --emit stdout", typecheck: "cargo check", lint: "cargo clippy", format: "rustfmt", test: "cargo test (+ doc tests), nextest", extras: "cargo-fuzz/libFuzzer, proptest, miri (UB), cargo-mutants, cargo-audit/deny, loom (concurrency), sanitizers (nightly)", nexus: "CK-248 + gate; test-detect"}
  java: {exts: [java], syntax: "javac (syntax errors picked out; unresolved symbols ignored)", typecheck: "javac / gradle compileJava", lint: "checkstyle, PMD, SpotBugs, errorprone", format: "google-java-format, spotless", test: "JUnit 5, TestNG", extras: "jqf/jazzer (fuzz), PIT (mutation), JaCoCo, OWASP dependency-check", nexus: "CK-248 (heuristic) + gate"}
  kotlin: {exts: [kt, kts], syntax: "kotlinc (syntax errors picked out) — UNTESTED here; ktlint parses without compiling", typecheck: "kotlinc / gradle compileKotlin", lint: "detekt, ktlint, Android lint", format: "ktlint --format, spotless", test: "JUnit 5, kotest, Robolectric, Compose UI test, Paparazzi (screenshot)", extras: "PIT (mutation), kover (coverage)", nexus: "CK-248 (heuristic, untested) + gate"}
  swift: {exts: [swift], syntax: "swiftc -parse — UNTESTED here (no Swift toolchain)", typecheck: "swiftc / xcodebuild build", lint: "SwiftLint", format: "swift-format, SwiftFormat", test: "XCTest, Swift Testing, XCUITest", extras: "Instruments, Thread/Address Sanitizer (Xcode), xcodebuild analyze, Periphery (dead code)", nexus: "CK-248 (untested) + gate; needs a Mac for everything except swift syntax/Package.swift on Linux"}
  objective_c: {exts: [m, mm, h], syntax: "clang -fsyntax-only (needs the SDK headers)", lint: "clang-tidy, xcodebuild analyze", test: "XCTest", nexus: "none"}
  c: {exts: [c, h], syntax: "gcc/clang -fsyntax-only", typecheck: "compile", lint: "clang-tidy, cppcheck, splint", format: "clang-format", test: "ctest, Unity, CMocka", extras: "ASan/UBSan/TSan/MSan, Valgrind, libFuzzer/AFL++, gcov, Coverity/CodeQL", nexus: "CK-248 + gate"}
  cpp: {exts: [cpp, cc, cxx, hpp], syntax: "g++/clang++ -fsyntax-only", lint: "clang-tidy, cppcheck", format: "clang-format", test: "GoogleTest, Catch2, doctest", extras: "same as C + include-what-you-use", nexus: "CK-248 + gate"}
  csharp: {exts: [cs], syntax: "dotnet build (no syntax-only mode); Roslyn", typecheck: "dotnet build", lint: "Roslyn analyzers, StyleCop", format: "dotnet format", test: "xUnit, NUnit, MSTest", extras: "Stryker.NET, coverlet, SharpFuzz", nexus: "none (no dotnet here)"}
  php: {exts: [php], syntax: "php -l", typecheck: "phpstan, psalm", lint: "phpcs, phpmd", format: "php-cs-fixer, pint", test: "PHPUnit, Pest", extras: "infection (mutation), composer audit", nexus: "CK-248 + gate"}
  ruby: {exts: [rb], syntax: "ruby -c", typecheck: "sorbet, steep", lint: "rubocop", format: "rubocop -A", test: "rspec, minitest", extras: "mutant, brakeman (Rails SAST), bundler-audit", nexus: "CK-248 + gate; test-detect"}
  perl: {exts: [pl, pm], syntax: "perl -c RUNS BEGIN blocks and `use` — not syntax-only; deliberately not wired", lint: "perlcritic", test: "prove / Test::More", nexus: "none (by choice)"}
  lua: {exts: [lua], syntax: "luac -p — UNTESTED here", lint: "luacheck", format: "stylua", test: "busted", nexus: "CK-248 (untested)"}
  shell: {exts: [sh, bash], syntax: "bash -n", lint: "shellcheck", format: "shfmt", test: "bats", nexus: "CK-248 + gate; test-detect"}
  powershell: {exts: [ps1, psm1], syntax: "[System.Management.Automation.Language.Parser]::ParseFile", lint: "PSScriptAnalyzer", test: "Pester", nexus: "none"}
  sql: {exts: [sql], syntax: "dialect parser (sqlglot, pg_query, sqlite3 EXPLAIN)", lint: "sqlfluff", test: "pgTAP, dbt tests", extras: "migration up/down rehearsal, EXPLAIN plan regression, sqlmap-style injection tests on the app", nexus: "none"}
  r: {exts: [r, R], syntax: "Rscript -e 'parse(file=...)'", lint: "lintr", format: "styler", test: "testthat", nexus: "none"}
  julia: {exts: [jl], syntax: "Meta.parseall", test: "Test stdlib", nexus: "none"}
  dart_flutter: {exts: [dart], syntax: "dart format / dart analyze", typecheck: "dart analyze", lint: "dart analyze + flutter_lints", test: "flutter test, integration_test", nexus: "none (not used: Flutter is a cross-platform layer, see the mobile phasemap)"}
  scala: {exts: [scala, sc], syntax: "scalac / scalafmt parse", lint: "scalafix, wartremover", test: "ScalaTest, munit, ScalaCheck", nexus: "none"}
  elixir: {exts: [ex, exs], syntax: "elixir -e Code.string_to_quoted", lint: "credo", format: "mix format --check-formatted", test: "ExUnit, StreamData", extras: "dialyzer", nexus: "none"}
  haskell: {exts: [hs], syntax: "ghc -fno-code", lint: "hlint", format: "ormolu, fourmolu", test: "HUnit, Hspec, QuickCheck", nexus: "none"}
  zig: {exts: [zig], syntax: "zig ast-check", format: "zig fmt --check", test: "zig test", nexus: "none"}
  html_css: {exts: [html, css], syntax: "html-validate / vnu.jar (Nu validator), stylelint", lint: "axe-core, pa11y (accessibility)", test: "Clear Glass page probes (clear-glass/src/driver/glass.js): the UI is tested there, never Playwright", nexus: "partial — probes"}
  config_data: {exts: [json, yaml, toml, xml, plist], syntax: "JSON.parse, js-yaml, tomllib, xml.dom.minidom", lint: "yamllint, taplo, xmllint --schema", test: "JSON Schema validation", nexus: "CK-248 + gate (json yaml toml xml)"}
  iac: {exts: [tf, yml], syntax: "terraform validate, ansible-playbook --syntax-check, kubeconform, hadolint (Dockerfile)", lint: "tflint, checkov, trivy config, kube-linter", test: "terratest, conftest/OPA policy tests", nexus: "none"}
  api_schemas: {exts: [proto, graphql, yaml], syntax: "protoc, graphql-js parse, openapi-spec-validator", test: "buf breaking (schema compatibility), schemathesis/dredd (contract), pact (consumer-driven)", nexus: "none"}
  gradle_build: {exts: [gradle, kts], syntax: "gradle help (config phase)", lint: "gradle dependencies, dependencyUpdates, lint tasks", nexus: "none"}
android_specific:
  - {check: "Android lint (./gradlew lint)", finds: "API-level misuse, missing permissions, accessibility, performance, RTL, security", needs: "SDK + Gradle"}
  - {check: "detekt / ktlint", finds: "Kotlin style, complexity, smells", needs: "Gradle plugin or CLI"}
  - {check: "JUnit + Robolectric", finds: "logic and Android framework behaviour on the JVM, no emulator", needs: "SDK jars"}
  - {check: "Compose UI tests / Espresso / UI Automator", finds: "screen behaviour on a device or emulator", needs: "emulator (CPU virtualisation) or a device over adb"}
  - {check: "Paparazzi / Roborazzi screenshot tests", finds: "visual regression with no emulator", needs: "JVM"}
  - {check: "StrictMode, LeakCanary, Android Profiler, Macrobenchmark", finds: "main-thread I/O, leaks, jank, cold-start time", needs: "device"}
  - {check: "monkey (adb shell monkey), Firebase Test Lab / device farm", finds: "crashes under random input, device-matrix breaks", needs: "device or paid farm"}
  - {check: "R8/ProGuard mapping + release build test", finds: "code stripped by minification that only breaks in release", needs: "release build"}
apple_specific:
  - {check: "xcodebuild build / analyze", finds: "compile errors, static analyzer issues", needs: "macOS + Xcode"}
  - {check: "XCTest / Swift Testing / XCUITest", finds: "logic and UI behaviour", needs: "macOS + simulator"}
  - {check: "SwiftLint / swift-format", finds: "style and some smells", needs: "any OS with the Swift toolchain (Linux works)"}
  - {check: "Thread / Address / Undefined Behavior Sanitizer, Instruments (Leaks, Time Profiler)", finds: "races, memory errors, leaks, hot paths", needs: "macOS + Xcode"}
  - {check: "App Store review guideline + privacy manifest + required-reason API check", finds: "rejection causes before submission", needs: "macOS + Xcode (the manifest is a file; the rules are Apple's)"}
gaps_in_nexus_today:
  - "Property-based, fuzzing, mutation, coverage, load/soak, visual regression and accessibility testing: none built (cos/spec/qa-catalog.spec said the same on 2026-10-10)."
  - "Linters and formatters: only syntax is wired into the gate. A proposal is not linted."
  - "Typecheck of a proposal in context: not done; run through the test environment (PE6 in docs/2026-10-16-proposal-evidence-phasemap.spec)."
  - "tree-sitter as one parser for every language, including those with no installed compiler (Kotlin, Swift, C#...), would remove the 'tool not installed' column. It is a new dependency (COS bundles only js-yaml today), so it is mapped, not added."
