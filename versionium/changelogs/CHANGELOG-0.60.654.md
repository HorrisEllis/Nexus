# 0.60.654: the build no longer freezes or fills drive C:

James, 2026-11-25: "okay pipeline" · the day's order: "keep working on the pipeline, so it can fix itself. build nexus, contineu" · "the pipeline and emerge are vital"

Found on your PC: before it tests a built module, the build makes a sandbox copy of Nexus, and it copied **every folder named `data` anywhere in Nexus** (Cortex's memory, Versionium, Idearium, the model server's 750 MB of engine zips) into Windows' temporary folder on C:. Each test froze the build for an hour or more, several builds did it at once (COS resumed the old runs at each restart), and C: fell to 872 MB free.

Now a sandbox copies only the small `data` folders (2 MB at most: a test's fixtures); a bigger one is an empty folder in the sandbox, so a test still cannot write into real data. Measured in COS's folder: 0.7 s and 1.1 MB, where it was more than an hour and gigabytes.

Checked: the sandbox's tests are as they were before the change (proposal evidence 10 of 11, expectation tests 7 of 7; PE-10 and SS-01 failed before too). Still to do on your PC: Disk Cleanup › Temporary files on C:, for the copies left in Windows' own temporary folder.
