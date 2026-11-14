# NSM v2.0 (his Nexus Service Manager), uploaded 2026-11-14 — kept, not run

James, 2026-11-14, sharing NSSM.7z: "use this and create a exe and build it into cos" · asked to choose (A: package it as nsm.exe hosted by
cos-svc.exe, B: rewrite in cos-svc.exe, C: fold its features into COS's supervisor): "a. im not attached to it. do what ever. write it in emerge if
possible."

Kept whole here (§0.3). Not executed (his rule: code from an uploaded archive is read, not run). nexus-svc.js is the same file as
_archive/2026-11-04-nsm-upload/nexus-svc.js.

What was done with it (the coder's call under his "do what ever", decided by the axioms):
- A Windows service must answer the Service Control Manager; Node cannot, so nsm.exe alone would be killed by Windows (error 1053). cos-svc.exe
  (COS 0.9.0, CA9, C#) is that answer and already carries NSM v2's health-contract restarts and backoff.
- Emerge cannot make a Windows exe yet (its native compiler targets Linux x86-64; native_windows is E2). So no nsm.exe now.
- NSM v2's other inventions are mapped into COS's supervisor, to be written in Emerge (CA9 expanded_2026_11_14, docs/2026-11-02-cos-the-application-
  phasemap.spec): start order by dependency (after:), a JSONL metrics stream per service, profiles, secrets masked in logs, drain in reverse order.
