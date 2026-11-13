# 0.60.524: the Emergence page wakes Intelligence instead of showing ECONNREFUSED

James, 2026-11-13, of COS's Emergence page showing "intelligence did not answer: connect ECONNREFUSED 127.0.0.1:3753": "why is it
coupled to intelligence?"

## Why it is coupled
Two of the page's three panels are Intelligence's own data: what has crystallised, and what is still forming (the liminal spaces). COS reads
them through Intelligence's routes, never its files. That coupling is by design: the data has one owner (§5.15).

## The fault, fixed
Intelligence starts on demand, and COS's `/api/cos/emergence/*` never woke it, so an asleep Intelligence was shown as a raw connection
error. Now:
- a refused ask wakes it, with the supervisor's `touch`, as any on-demand call does;
- every caller shares one wait of up to 25 s, and the question is then asked again;
- one that cannot start says its state (for example, held under the memory floor);
- the page re-asks every 10 s.

## Proof
A COS manager in the sandbox, with Intelligence asleep: the page's route woke it and answered in about 1 s. test-emergence-channel 8/8.
