spec:
  meta:
    name:     cos-machines
    version:  1.0.1   # 1.0.1: a COS phasemap — each phase systems: [cos]; linked from the COS testenv map and cos.spec
    date:     2026-10-05
    release:  0.39.340 (base) → each phase its own patch
    uuid:     nexus-cos-machines-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    "cos — a COS phasemap (James: like that needs to be add to the cos phasemaps). It continues docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec and is listed in cos/spec/cos.spec. Every phase is tagged systems [cos]; cos/ is core's directory, so loom files them under core."
    status:   "MAPPED 2026-10-05 — nothing built. Order below is bottom-up; James has not yet said which goes first (VM1 vs the CP1 / PI1 he was offered)."
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up, §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost,
              §1.2 nothing silently fails, §4.1 UI tested in Clear Glass.
    origin: >
      James, 2026-10-05: "No, I'm saying we add the VMware capabilities to cos, or invent our own qumu. Like I want to use
      snapshots, pause, rewind, etc. like full VMware style. Not actual VMware." · "i want, at some point, to be able to
      build compartments as os'. like android emulator uses the androidos." · "yes, and they're automatically downloaded,
      anbd updated, using clearglass. then we could have a compiler for electron. i want to have an immensely high
      leverage, full android app builder, using the sdk, like no wrapper, full enterprise grade android apk builder. so
      much we can do with cos."
      The ideas and the direction are James's. The coder's input is in each phase's `decided:` — his to overrule.

  found:
    - >-
      cos/compartment/qemu-runtime.js runs every VM: hardware acceleration picked per host (WHPX / KVM / TCG), a QMP
      control channel already open on every VM (used today only for set_link — cutting the network), VNC + websocket for
      the screen, qemu-img INTERNAL snapshots (save / apply / list / delete) — disk only, and refused while the VM runs
      (cos/cli/commands/vm.js). Desktop overlays over a base image, stamped and archived when stale (DK1, 0.39.293).
    - >-
      Live snapshots (savevm / loadvm — RAM and devices too) are QEMU features over QMP; they are blocked by a 9p shared
      folder, which COS uses only on a Linux host (-virtfs); Windows hosts move files by tar (cos/testenv/tar.js).
    - >-
      Every image recipe is Debian-specific: cos/testenv/provision.js downloads a Debian cloud image, seeds cloud-init,
      waits for the guest to report, verifies through qemu-guest-agent. Nothing describes another OS.
    - >-
      The Android emulator is a QEMU fork running an Android system image; Android-x86 / BlissOS images boot in plain
      QEMU. Android has no qemu-guest-agent — adb (over TCP) is its control channel.
    - >-
      docs/2026-10-01-idearium-agent-ready-master-phasemap.spec TP1 already maps "Android app" and "desktop app
      (Electron/Tauri)" as spec templates — the skeletons a project starts from. This map is the machines that BUILD and
      RUN them; TP1 is not duplicated here.

  phases:
    VM1_control_like_vmware:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: []
      files: [cos/compartment/qemu-runtime.js, cos/workspace/index.js, cos/cli/commands/vm.js, idearium/api/index.js]
      james: '"I want to use snapshots, pause, rewind, etc. like full VMware style. Not actual VMware."'
      does: >-
        Over the QMP channel every VM already has: pause / resume (stop / cont); live snapshots (savevm / loadvm — memory
        and devices, so a restore lands mid-session); the snapshot list as a timeline with names, times and what made each
        one; automatic checkpoints before every agent action, build and run (its id on the run), so "rewind" is choosing a
        point. One API, the CLI (cos vm pause|resume|snapshot …) and the desktop window's toolbar.
      decided: >-
        Not our own hypervisor: VMware Workstation, Proxmox and UTM are control layers over an engine, and QEMU is ours.
        Continuous second-by-second rewind (QEMU record/replay) is not practical; checkpoints are how VMware does it too.
        A Linux host with a 9p shared folder cannot live-snapshot — said where it applies, disk-only snapshot offered.
      proof: "a running VM pauses and resumes; a live snapshot restored puts back a file written after it AND the process that was running; an agent run leaves a checkpoint its rewind restores"
    OS1_compartments_as_operating_systems:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: [VM1_control_like_vmware]
      files: [cos/testenv/provision.js, cos/compartment/qemu-runtime.js, cos/compartment/guest-agent.js]
      james: '"i want, at some point, to be able to build compartments as os''. like android emulator uses the androidos."'
      does: >-
        An OS profile per compartment — what the image is, how it first boots (cloud image + cloud-init · an installer ISO
        · a ready system image), how Nexus talks to it (qemu-guest-agent · adb · none), its screen (VNC for every QEMU
        guest). Profiles: debian (today's, unchanged), android (Android-x86 / BlissOS in plain QEMU, adb over TCP for
        install / tap / logs / instrumentation), and a bring-your-own ISO (Windows included — its licence and install are
        the person's). VM1's controls work the same for every OS: they are QEMU's, not the guest's.
      decided: >-
        Android-x86 on our own engine first, not Google's emulator binary: one engine, one set of controls. Google's
        emulator stays an option for what Android-x86 lacks (Play services images, newer GPUs).
      proof: "an android compartment boots to its home screen in the desktop window; adb installs an APK and starts it; pause and a snapshot work on it as on Debian"
    OS2_images_downloaded_and_kept_current:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: [OS1_compartments_as_operating_systems]
      files: [cos/testenv/provision.js, cos/testenv/installer.js, clear-glass/src/driver/glass.js]
      james: '"and they''re automatically downloaded, anbd updated, using clearglass."'
      does: >-
        A catalogue of image sources per profile, each with where its releases are listed and how a release is verified
        (published checksum / signature). Nexus checks for a newer release, downloads it, verifies it, and keeps the old
        one (§0.3): a new image becomes a new base; compartments made over the old one keep running and are rebuilt only
        when asked (the DK1 stamp says which base each was made over). Clear Glass is used where a release page needs a
        real browser to find the link (a JS-rendered download page, a mirror chooser) — driven read-only through its
        driver; nothing in Clear Glass changes.
      decided: >-
        Plain HTTPS + checksum first, Clear Glass where a page needs it — a download does not need a browser, and an
        image that is not verified is never booted. Updates are offered, not forced onto running compartments.
      proof: "a newer release is found, downloaded, verified and kept beside the old; a bad checksum is refused and said; a compartment on the old base keeps booting"
    AP1_android_build_compartment:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: [OS2_images_downloaded_and_kept_current]
      files: [cos/testenv/provision.js, cos/testenv/environment.js, lib/cos-run.js]
      james: '"i want to have an immensely high leverage, full android app builder, using the sdk, like no wrapper, full enterprise grade android apk builder."'
      does: >-
        A Debian build compartment with the real toolchain: JDK, the Android SDK command-line tools, sdkmanager-installed
        platforms and build-tools, Gradle — native Kotlin / Java projects, no WebView wrapper (no Cordova / Capacitor).
        The SDK and Gradle caches live on the compartment's disk across builds. A repo whose code is an Android project
        is detected (settings.gradle(.kts), AndroidManifest.xml) and gets this environment from the setup popup (DK2).
      decided: >-
        "No wrapper" read as no WebView wrapper. The Gradle wrapper (gradlew) is kept — it pins the Gradle version, which
        is what makes a build repeatable. The SDK licences are accepted by James, once, in the popup — never accepted on
        his behalf. Needs ~8–10 GB of disk and 8 GB RAM for a build compartment; said before the setup starts.
      proof: "a new Android project from the TP1 template builds a debug APK in the compartment; a second build reuses the caches"
    AP2_test_on_the_android_compartment:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: [AP1_android_build_compartment, OS1_compartments_as_operating_systems]
      files: [lib/cos-run.js, idearium/repo/proof-run.js]
      does: >-
        The built APK installed on an android compartment (OS1) over adb; unit tests in the build compartment,
        instrumented tests (connectedAndroidTest) on the device compartment, a screenshot per screen through VNC; failures
        through the prove loop like any other repo (lib/cos-debug-report.js reads Gradle's and logcat's output).
      proof: "an instrumented test that fails is attributed to its file and sent back; repaired, it passes on the device"
    AP3_release_like_an_enterprise:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: [AP2_test_on_the_android_compartment]
      files: [cos/testenv/environment.js, lib/cos-run.js]
      does: >-
        A release build: R8 shrinking, signed APK and AAB (for Play), versionCode / versionName from the repo's version,
        lint as a gate, Gradle dependency verification, an SBOM. The signing keystore is a secret held outside the repo
        and outside the compartment's image, mounted only for a release build, never in a log or a prompt.
      decided: >-
        The keystore is James's; losing it means never updating the app on Play again — it is backed up where he says,
        and Nexus never generates a release key without asking.
      proof: "a release build produces a signed AAB and APK whose signature verifies (apksigner); the keystore never appears in the build log or the repo"
    EL1_electron_compiler:
      layer: library
      systems: [cos]
      status: OPEN
      depends_on: [OS1_compartments_as_operating_systems]
      files: [cos/testenv/provision.js, lib/cos-run.js]
      james: '"then we could have a compiler for electron."'
      does: >-
        Package an Electron app (Clear Glass itself, or any repo) into installers inside a compartment: Linux
        (AppImage, deb) in the Debian compartment; Windows (NSIS) in a Windows compartment (OS1, bring-your-own ISO);
        signed where a certificate is given; the installer then launched in a clean compartment and smoke-tested.
      decided: >-
        macOS builds need a Mac — Apple's licence does not allow macOS in a VM on other hardware; said, not attempted.
        Windows installers built under wine are fragile; a real Windows compartment is the honest path.
      proof: "an Electron app packages to an AppImage that starts in a clean Debian compartment"
