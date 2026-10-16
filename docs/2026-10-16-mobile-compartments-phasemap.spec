# docs/2026-10-16-mobile-compartments-phasemap.spec — Android and Apple app development as COS compartments, and the test VM's terminal
# MB1 BUILT 0.60.77 (`cos vm shell`) and MB5 BUILT 0.60.77 (language checks). MB2-MB4, MB6 MAPPED, not built. Owner: how Nexus builds, tests and signs a phone app.
meta:
  name: 2026-10-16-mobile-compartments-phasemap
  version: 1.0.0
  origin: >-
    James, 2026-10-16: "Then Can we have a passthrogu to the terminal for the test inviremr t. Need to get cos working. I also want to get a
    hackentash going for devoloping apple apps. Androidos for android apps using Android adk with the highest leveraage and most powerful
    project that's the easiest to use, without losing all the capabilities like not a wrapper, a full on Android app development project"
    Context: said right after the proposal-evidence work (0.60.75-0.60.76), in the same message that widened "all tests, qa, qc" to every
    language and compiler (cos/spec/language-toolchains.spec). Earlier he wrote "money is needed badly" (docs/CLAUDE.md), which is the lens
    for the cost options below.
readings_to_confirm:
  - "'Android ADK' read as the Android SDK (cmdline-tools, build-tools, platform-tools incl. adb, the emulator). The Android Open Accessory Development Kit is a separate, old thing about USB accessories. TO CONFIRM."
  - "'a hackentash' read as a Hackintosh: macOS on non-Apple hardware, to get Xcode. TO CONFIRM it is not 'a hackathon' or a Mac in a VM on a Mac."
  - "'passthrough to the terminal for the test environment' read as: a real interactive terminal into the COS test VM (cos/testenv), not a log view. TO CONFIRM."
coder_position:
  hackintosh: >-
    I will not build a Hackintosh installer or recipe, and this is the coder's call, not a limit of the tooling. Apple's macOS licence
    allows macOS only on Apple-branded hardware, and Xcode's licence follows it; a Hackintosh is a breach of that licence, and a fragile one:
    Apple has said macOS Tahoe (26) is the last release for Intel Macs, so the machine this relies on gets no macOS or Xcode updates within
    about a year, and Xcode keeps requiring newer macOS. It would also be the one part of this project that depends on something that can be
    broken by an Apple update overnight. What the goal needs is Xcode running on real Apple hardware that Nexus can drive; that is cheap
    and does not need the licence breach. See MB4.
  android: >-
    Native Kotlin + Jetpack Compose + Gradle (Kotlin DSL, version catalog), structured as modules so shared logic can move to Kotlin
    Multiplatform later. That is the full Android platform with nothing between you and it. Flutter and React Native are cross-platform
    layers (the thing James said he does not want); the modern native stack is also the easiest because Android Studio, the Gradle plugin,
    the emulator and Google's samples all assume it. The build is plain Gradle on the command line, so a COS compartment can drive all of
    it headless. Kotlin Multiplatform is the one 'shared' option worth having because the UI stays native on both sides.
costs_checked_by_the_coder_from_memory_not_looked_up:
  - "Apple Developer Program is about 99 USD a year (needed to put an app on a device for long or on the App Store). Google Play's developer account is a one-time 25 USD. Check current prices before relying on them."
  - "A used Apple Silicon Mac mini is a few hundred dollars; an always-on build host that is also the Xcode box. Check current prices."
  - "CI macOS runners (GitHub Actions and others) bill macOS minutes at a higher rate than Linux; free allowances differ for public and private repos. Check current terms."
what_exists:
  - "cos/compartment/qemu-runtime.js: a QEMU VM with the guest's sshd forwarded to 127.0.0.1:2200+N (0.60.12) and the guest login nexus (cos/testenv/provision.js). Nothing used it for a terminal until MB1."
  - "cos/testenv/detect.js: finds a repo's stacks (node, python, go, rust, ruby, php, shell) and its test commands. It has no android or swift stack."
  - "cos/compartment/process-runner.js: a compartment that is a host process: the right shape for a Gradle build on a machine that already has the Android SDK."
  - "Docker is present in the build container but not known on James's Windows machine."
  - "No Android SDK, Kotlin compiler, Swift toolchain, adb, KVM or dotnet in the build container, so nothing Android or Apple was built or run while writing this."
phases:
  MB1_terminal_passthrough: {status: BUILT-0.60.77, what: "`cos vm shell <compartment> [--user=u] [-- cmd]`: ssh over the loopback forward with the terminal handed through (a real TTY: editors, sudo, colours, Ctrl+C), the guest's exit code returned. In the COS window's command line pane there is no stdin, so use `cos sh` in a terminal: `node cos/cli/index.js vm shell <name>`. tests VS-01..06 with a fake ssh. NOT run against a real VM: it needs the provisioned test image running with sshd.", limits: ["needs an OpenSSH client (Windows 10+ has one)", "the VM must be running and have sshd (the image provision.js builds)", "password prompt is ssh's own; default login is nexus/nexus unless settings desktop.user/password changed it", "not verified on Windows"]}
  MB2_android_compartment: {status: MAPPED, what: "A Nexus system template 'android-app' (Kotlin + Compose + Gradle Kotlin DSL + version catalog, modules app/ core/ feature-*/, a Gradle wrapper, lint/detekt/ktlint wired, unit + Robolectric + Compose UI + Paparazzi tests, a .contract per feature). A COS compartment kind that builds it: (a) process-runner on a host with the Android SDK, or (b) a container image with JDK 17 + cmdline-tools + build-tools. Headless: sdkmanager --licenses, ./gradlew assembleDebug testDebugUnitTest lint, adb install. The emulator needs CPU virtualisation (KVM on Linux, Hyper-V/WHPX on Windows, HVF on macOS) and does not run well inside a QEMU VM compartment, so the default device is a real phone over adb (USB or `adb pair`/wireless), the emulator is opt-in on a host that has virtualisation."}
  MB3_testenv_stacks: {status: MAPPED, what: "cos/testenv/detect.js learns two stacks: android (build.gradle(.kts), settings.gradle, AndroidManifest.xml; suite ./gradlew testDebugUnitTest lint) and swift (Package.swift, *.xcodeproj; suite swift test, xcodebuild test on a Mac). Their languages join lib/checks/ck-248-toolchain.js's coverage (kt and swift are in the table, untested)."}
  MB4_apple_via_a_real_mac: {status: MAPPED, what: "A compartment kind `remote` whose runtime is an ssh target (a Mac mini on the desk, a rented Mac, or a CI runner) instead of a QEMU guest: the same `shell` passthrough (MB1), plus `xcodebuild test/analyze` through it, and results returned as the test environment returns them. Swift code with no UI frameworks also runs on Linux (Package.swift), so most logic can be built and tested without a Mac; only SwiftUI/UIKit, simulators, signing and the App Store need Xcode. Code signing and provisioning stay in the Mac's keychain; Nexus never holds the signing key."}
  MB5_language_checks: {status: BUILT-0.60.77, what: "lib/checks/ck-248-toolchain.js grew from 9 to 18 languages (php rb rs java kt swift lua toml xml added), with selfTest/coverage (a tool must tell valid from broken code, so 'installed' is never taken for 'works') and checkText(); the code.write gate (lib/step-gate.js) calls it for every language, so a proposal in Python, PHP, Go, Rust, Java... is parse-checked at propose() and edit(); a language whose tool is missing is said 'NOT checked — this is not a pass' in the proposal's evidence. 15 of 18 verified in the build container. tests LC-01..07.", limits: ["Kotlin, Swift and Lua are written and untested (no tool here)", "Java/Kotlin check picks syntax errors out of the compiler's output; a file that only fails on unresolved symbols is read as parsed", "syntax only: no typecheck, lint or tests of a lone proposed file"]}
  MB6_everything_else: {status: MAPPED, what: "cos/spec/language-toolchains.spec is the matrix (31 languages x every kind of check). Building the columns that matter for his projects, in order: lint (eslint, ruff, ktlint/detekt, SwiftLint) into the proposal evidence; property-based and mutation testing in the test environment; tree-sitter as one parser for languages with no installed compiler (a new dependency: COS bundles only js-yaml, so COS preflight must learn it)."}
decisions_open:
  - "Do you have a Mac (or the budget for a used Mac mini)? That decides MB4: own hardware, a rented Mac, or CI minutes."
  - "Android scope: a phone-only Kotlin/Compose app first, or Kotlin Multiplatform from day one so the logic is shared with the Apple app?"
  - "Does your Windows machine have virtualisation on (Hyper-V/WHPX) for the Android emulator, or will a real phone over adb be the device?"
  - "Is the 'test environment' terminal wanted inside the COS window as well (needs a pty; today `cos sh` in a terminal does it)?"
