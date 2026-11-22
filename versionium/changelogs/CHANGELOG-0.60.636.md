# 0.60.636: profiles are Clear Glass's alone

James, 2026-11-22: "okay profiles are in clearglass. no coupline".

0.60.635 started Emerge's toolchain from Emerge's folder each time a profile changed. The rules are still written in Emerge (`clear-glass/src/profiles/profiles.eg`), but are now compiled into `clear-glass/src/profiles/built` and run inside Clear Glass. No other system's folder is read at run time. Others reach profiles only through Clear Glass's `/profiles` routes.

Proof: `eg test` 6/6; Clear Glass's real store on a throwaway folder, with Emerge's path blocked. The routes have not run inside Clear Glass, and no cookie has moved.
