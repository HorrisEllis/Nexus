spec:
  meta:
    name:        clearglass-snowflake-relay
    version:     1.0.0
    status:      proposed
    author:      james-brooks
    compiled_by: claude
    created_at:  2026-09-17T00:00:00Z
    purpose: >
      Answers thread_1_mesh_node's open "what transport?" question from
      docs/nexus-uri-clearglass-mesh-integration.spec, grounded in real,
      deployed prior art rather than invented from scratch: James asked
      to "invent, innovate, look everywhere... GitHub, anywhere" for a
      way for each mesh node to act as a relay without needing a VPS.
      That already exists, in production, for exactly this threat model —
      Tor's Snowflake. This spec maps what Snowflake actually does onto
      ClearGlass's mesh-node design, and is explicit about what to reuse
      as-is versus what needs real, separate design. Status stays
      "proposed" and thread_1's own gate still applies: no mesh-node code
      until James answers thread_1's five open questions and this gets
      external review. This document narrows the transport question; it
      does not unblock phase E.

  prior_art:
    name: Tor Snowflake
    what_it_is: >
      A pluggable transport for Tor, in production since 2019, used
      heavily during real network disruptions (Russia 2021, Iran 2022).
      Built by the Tor Project specifically for the journalist/activist
      threat model this mission shares.
    how_it_avoids_a_vps: >
      Proxies run as a lightweight browser extension or even just an open
      tab — "no special setup required," no port forwarding, no server
      with guaranteed uptime. Volunteers' proxies come and go constantly
      (the docs call this "melting") and a broker matches a client to
      whichever proxy is currently available; if one disappears mid-use,
      the client is reseated with a new one. ~8,000 proxies available on
      a typical day.
    how_rendezvous_works_without_a_central_relay_server: >
      Domain fronting handles the brief signaling step needed to
      establish the WebRTC connection (finding a proxy, exchanging SDP)
      — it rides on infrastructure that's already permitted in a
      censored network (a large CDN), so the rendezvous itself is hard to
      block even though it needs SOME centrally-reachable broker to exist.
      Once signaling completes, the actual data moves peer-to-peer over
      the WebRTC data channel — the broker is never in the traffic path.
    what_the_volunteer_proxy_cannot_see: >
      A user's visible traffic exits through the Tor network, not through
      the volunteer's own connection — the volunteer relays encrypted Tor
      cells, not readable content, and never learns what sites the person
      they're helping is visiting.
    trust_model: >
      Deliberately open and anonymous — anyone can run a proxy, no
      invitation, no identity check. That's correct for Snowflake's own
      job (maximize the pool of available relays for the general
      censorship-circumvention public) and wrong for ours (see below).

  # ── What to take, what not to ────────────────────────────────────────
  what_to_reuse:
    - id: ephemeral_no_vps_proxy_role
      take: >
        A ClearGlass instance volunteering as a relay should work the
        same way — a role the browser can pick up and drop at any time,
        no dedicated server, no port forwarding, no guaranteed uptime.
        This directly answers thread_1's "what transport" question: the
        relay role itself needs no VPS, only a broker needs to be
        reachable.
    - id: broker_never_in_the_data_path
      take: >
        Same separation Snowflake makes: a small matching service
        (broker) handles only "who is available right now," never
        touches actual mesh content. Keeps the broker's own trust
        requirements low even though it does need to be reachable.
    - id: graceful_melt_handling
      take: >
        A relay disappearing mid-session is the normal case, not a
        failure — thread_1's kill-switch design (from the e2e-channel
        work) already treats a dropped connection this way; the mesh
        should reseat to another available relay rather than treat a
        melt as an incident.

  what_not_to_reuse:
    - id: open_anonymous_trust_model
      problem: >
        Snowflake's own trust model — anyone can be a proxy, no
        invitation — is wrong for this mesh. thread_1 already
        recommended invite-only, closed-group membership (signed Ed25519
        identity, reusing signaling-envelope.js's model). An open relay
        pool would mean any stranger could see mesh membership/traffic
        patterns even if payload content stays encrypted end-to-end via
        e2e-channel.js — that's a real regression from thread_1's own
        traffic_shape_awareness principle.
    - id: literal_domain_fronting
      problem: >
        Domain fronting largely stopped working as a technique after
        major CDNs (Google, Amazon/CloudFront) closed the loophole it
        depended on — Snowflake itself has had to adapt over time.
        Reusing the PATTERN (route rendezvous through infrastructure a
        censor can't easily block without wide collateral damage) is
        sound; assuming the specific 2019-era mechanism still works
        without checking current status is not. Needs a fresh check of
        what actually works today before anything is built on it, not an
        assumption carried over from Snowflake's original design.
    - id: direct_reuse_of_the_snowflake_codebase
      problem: >
        Snowflake is real, open-source, and could in principle be run
        as-is underneath something else — but it's built to shuttle Tor
        cells for an anonymous public, not to carry an invite-only,
        Ed25519-authenticated, application-encrypted mesh payload for a
        closed group. Wiring ClearGlass into it directly would mean
        adopting Tor as a dependency and Snowflake's own trust model
        along with it. Worth a real evaluation as a separate option (see
        open question below) rather than either assumed-yes or
        assumed-no here.

  # ── How this maps onto ClearGlass's own design questions ──────────────
  mapping_onto_thread_1:
    who_is_in_the_mesh: >
      Unchanged from thread_1's recommendation — invite-only, closed
      group, Ed25519-signed identity. Snowflake's open model does not
      change this answer; it only answers the transport question.
    transport: >
      thread_1 flagged that update-system.zip's WebRTCTransport is
      one-directional and needs real redesign for N-peer mesh. Snowflake
      demonstrates the redesign doesn't need to be invented from
      scratch: ephemeral relay role + small broker + WebRTC data channel
      is a proven shape. A NEW broker component is still needed — ours
      matches CLOSED, invited peers to each other, not the general
      public to volunteer proxies — but the mechanics (ephemeral roles,
      broker-never-in-data-path, graceful reseat on drop) transfer
      directly.
    direct_p2p_vs_relay_only: >
      thread_1 recommended forcing TURN-relay-only to avoid exposing
      real IPs between mesh peers. Snowflake's proxy IS effectively a
      relay by design (the volunteer's connection stands between client
      and the Tor entry node) — same shape thread_1 already wanted, now
      with a concrete working precedent instead of just a recommendation.
    what_gets_meshed_by_default: unchanged — nothing, opt-in per capture.
    kill_switch: unchanged — e2e-channel.js's existing kill switch (never
      overridable by a remote push) extends naturally to "this relay
      role melted, reseat to another."

  open_questions_before_any_code:
    - Should the broker be a new, small, purpose-built service, or a new
      role added to guardian's existing NCP server (it already runs an
      SSE channel — a matching function is a smaller addition than a new
      service)?
    - Is running actual Snowflake (the Tor Project's real, audited
      codebase) underneath ClearGlass — as a transport dependency, not a
      design template — worth evaluating directly, given it's
      open-source, battle-tested, and already solves NAT traversal
      without a VPS? This needs its own real evaluation (licensing,
      whether Tor-as-a-dependency fits ClearGlass's threat model, whether
      running two overlapping anonymity/relay systems in one product
      creates confusion for a user relying on it), not a yes here.
    - What does "reseat to another relay" actually look like for mesh
      DATA (not just Tor cells) — Snowflake's client has no state to
      preserve across a proxy swap because it's tunneling generic
      traffic; a mesh relay might be mid-relaying a specific peer's
      queued data when it melts, which needs its own real handling.

  status_note: >
    This narrows thread_1's open transport question with real prior art.
    It does not answer thread_1's five questions on James's behalf, and
    it does not move phase E off blocked. Phase E still starts only after
    James answers those five questions and this gets external security
    review.
