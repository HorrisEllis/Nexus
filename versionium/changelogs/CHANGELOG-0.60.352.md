# 0.60.352 — the COS channel always has a way in; update from the floating menu

James, 2026-11-01:
- "not tension, thats noise. cos ui needs a channel."
- "can i update nexus from the floating menu button.?"

## The COS channel (MG34)
The ⬢ COS channel used to frame :7797 directly. Whenever COS's cockpit was not running, it showed only a browser error ("refused to connect"). That happened when Nexus was started without `npm run start:all`, or on a folder older than 0.60.347.

The channel is now a page (`lib/ui/tv-shell/channels/cos/`) that asks the orchestrator whether COS's cockpit (:7797) and manager (:7799) answer.
- **The cockpit answers:** the page frames it.
- **It does not:** the page says which part is down and why, and offers **Start COS**. Start COS starts only what is down:
  - with no manager running, it starts COS's manager, which starts its cockpit and boots nothing;
  - with the manager up, it starts the cockpit alone;
  - when an old autopilot holds :7799, it refuses, because a second supervisor would run beside it.
- The door's logic lives in `orchestrator/cos-ui-door.js`. It starts COS by the server's path, the same way the launcher does, and never requires COS's code.

TENSION (0.60.351) is hidden from the rail and kept. The channel editor can show it again, and the `tension` command still works.

## ⇪ UPDATE in the floating menu (UP10)
The floating menu has a new **⇪ UPDATE** button.
- **What it shows:** your version, the one on GitHub, how many commits and releases are waiting, and anything that blocks the update (local edits, or a diverged folder).
- **Update now:** applies after your yes.
- **How it applies:** through the orchestrator (:9000) to Idearium's `/api/update`, still the one place the tree is changed (lib/nexus-update.js).
- **Restarting stays yours.** The reply says what to restart.

## Found by the tests
`start()` returned `ok: true` on a refusal: the status it carried had `ok: true`, and that value overwrote the refusal's `ok: false`. Fixed by putting the refusal's fields last.

## Proof
- tests/modules/test-cos-channel.test.js passes 5/5:
  - the real cockpit (cos/ui/serve.js) is started and answers;
  - start is refused beside a stand-in old autopilot;
  - the page, in Clear Glass, shows the reason and then the frame.
- tests/modules/test-update-menu.test.js passes 3/3, in Clear Glass:
  - no yes → nothing applied;
  - yes → applied, with the restart note;
  - up to date, diverged and Idearium down are each said.
