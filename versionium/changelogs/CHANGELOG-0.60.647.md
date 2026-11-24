# 0.60.647: connect to Nexus from anywhere

James, 2026-11-24: "also that qr zip i uploaded can you impliment that into the network settings? so i can connect remotely?" · 2026-11-03: "can you get cloudflared working in cos. the settings in the network settings. i want to have it connect to a cloudflared url and popup on the screen with a qr code and the link under it"

COS's **Network** page has a **Cloudflare tunnel** section:
- **Start** opens a Cloudflare address to the systems you chose, and a popup shows the address as a **QR code**, with the link under it, to open on your phone.
- **Stop** closes it. A tunnel that dies is restarted, at most 10 times an hour.
- **Quick tunnel**: no Cloudflare account needed, a new random address each time. **Named tunnel**: your own hostname, with a token typed on the page (it is never shown back or put on a command line).
- Nothing is reachable from outside until you turn on outbound reach and the tunnel in the settings on the same page. The ledger records that a tunnel is up, never its address.

From the command line: `cos network` and `cos tunnel status|start|stop|install`. An agent can read them but cannot open the tunnel or change the settings.

This is the work from 2026-11-03, merged into today's COS. Checked: the tunnel's tests (10 pass; one is Linux-only and skipped on Windows) and the page. Not yet checked: starting a real tunnel.
