# CHANGELOG 0.60.413 — CP6f: the load balancer, balancing the machine

James, 2026-11-05: "map: once commited and released. build the load balancer."

Asked which balance, with both readings from the maps side by side (balance the machine, CP6; or balance the work, CS11): "Balance the machine"

## What it does
- **When it acts:** under pressure, meaning free memory under `balanceMemPct` (default 15%, above the halt floor), or the systems' CPU
  together over `balanceCpuPct` of the cores (default 85%).
- **What it does:** COS lowers the busiest non-critical system running at normal priority to below-normal. The busiest is by CPU under
  CPU pressure, and by memory under memory pressure.
- **How each act goes:** one act per sample. Each is asked of RAID first (as CP6b's restarts are), then applied, read back from the OS,
  and written on the ledger.
- **Undoing it:** when the pressure is gone (hysteresis: +5% memory, −15% CPU), each lowered system is put back, RAID-approved too.
- **Never touched:** a critical system, or any priority he set above normal. If he changes a balanced system's priority, his call wins
  and the balance lets go, said on the ledger.
- **His switch:** `balance` in COS's policy, on by default, shown on the Resources page.
- **What it cannot do, said on the page:** a lower priority frees no memory. The halt floor's proposal stays the act that frees memory.

## Order of delivery
- **Backend:** `cos/manager/resources.js` (`balanceStep`, `balance()`).
- **API:** `GET /api/cos/resources` carries the balance; `PATCH /api/cos/policy` sets it.
- **Command:** `cos balance [on|off]`. Setting it is the person's.
- **UI:** the Resources page's Balancing panel, which was "CS7 · next" before: on or off, its rule in words, what is lowered and why.
  The page now declares `GET|PATCH /api/cos/policy` in COS's contract; its handshake refuses any call it doesn't declare.

## Spec and map
- New module `MOD-CP-BALANCE` in `cos/spec/compartment.spec`. The spec still compiles at full depth.
- `CP6f_raid_balances_load` is BUILT (the compartment map). Work balancing stays CS11's.

## Proof
- `test-cos-resources` 11/11:
  - CR-08: CPU pressure lowers the busiest system, RAID is asked, the priority is read back from the OS.
  - CR-09: it is put back when the pressure is gone.
  - CR-10: refused means not lowered; critical systems and his above-normal are untouched; off means nothing happens.
  - CR-11: his change wins.
- `test-cos-resources-page` 3/3: RP-03 drives the panel's switch in Clear Glass.
- `test-cos-console` 11/11, `test-cos-supervisor` 8/8, `test-cos-ui` 6/6, `test-cos-app-ui` 22/22, `test-substrate-spec` 3/3.
