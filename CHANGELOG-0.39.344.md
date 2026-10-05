# 0.39.344 — 2026-10-05

James: "okay its stuck."

His screenshots: the desktop setup at "ready: C:\Users\…\cos-testenv\base.qcow2" and still "setting up · 38:24", with Ready never ticked and "Close — it keeps running"; the Environment page reading "setup job: running — [object Object]".

- **What happened.** The setup finished: it built the image, verified it, put it in place and wrote its result. But its process did not exit, because something on his machine kept it alive. `cos/testenv/setup-job.js` marked a job done only when the process exited, so the job read "running" forever. The image itself is ready; the Environment page already showed the VM ✓.
- **Fixed in three places.**
  - `cos/testenv/setup-job.js` settles the job on the result line, which is the answer. A process still alive 20 s after its result is stopped, and the log says so.
  - `cos/testenv/provision.js` exits once its result is written and stdout has flushed.
  - `idearium/ui/js/repo-environment.js` reads a log entry's `msg`. It read `.text`, which log entries do not have, so it printed the object itself.
- **Tests.** `test-setup-job-settles` 5/5 (registered): a fake setup that writes its result and never exits settles as done, is stopped after the linger window, and that is said. test-cos-testenv 29/29, test-cos-testenv-any-repo 63/63, test-desktop-setup-popup 9/9.
- **Not found from here.** What kept the process alive on his machine. Possibly a QEMU child or a guest-agent socket on Windows; the fix holds whatever it was.
