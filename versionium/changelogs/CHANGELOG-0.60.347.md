# 0.60.347 — MG33: COS's UI starts with COS, and the TV opens it

James, 2026-11-01: "where is cos ui?"

## Found
- **No way in.** COS's UI, the cockpit (cos/ui/serve.js on :7797), was never started and nothing linked to it.
- **Not started by start:all.** `npm run start:all` started only COS's manager on :7799. The COS UI could be opened only by typing
  `node cos/ui/serve.js`. That is a screen with no way in (his 2026-10-29 rule: a way in for a person).

## Changed
- **The manager starts its cockpit.** COS's manager now starts the cockpit beside itself when it starts:
  - the port is COS_UI_PORT, default 7797;
  - `--no-ui` leaves it off;
  - if the port is held, the manager says so once and runs on.
- **A COS channel on the TV.** It frames http://127.0.0.1:7797/, appended to the rail.
- **The test sandbox redirects COS_MANAGER_DATA.** A test that started the manager wrote cos/data/manager/ledger.jsonl into the repo. It is
  caught here, and every test is protected.

## Proof
tests/modules/test-cos-ui-starts.test.js 3/3. The manager is started exactly as start:all starts it:
- the cockpit serves its shell and the contract;
- with the cockpit's port held, the manager still answers and says why;
- the TV channel is in place.
