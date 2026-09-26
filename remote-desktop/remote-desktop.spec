# ═══════════════════════════════════════════════════════════════════════════
# remote-desktop.spec
# Enterprise spec: channel contracts + bottom-up build phasemap + gap closures
#
# Read order for implementers: `phasemap` first (build order + rationale),
# then the referenced sections. Nothing in `phasemap` introduces a config key
# that isn't defined elsewhere in this file — the phasemap is a *sequencing*
# view over the same spec, not a separate plan.
# ═══════════════════════════════════════════════════════════════════════════

spec_version: "1.1.0"
compat_min_spec_version: "1.0.0"   # oldest peer spec_version this build can talk to

# ─────────────────────────────────────────────────────────────────────────
# PHASEMAP — bottom-up, dependency-ordered, most-stable-first
#
# Ordering rule: a phase is placed as early as possible subject to its
# `depends_on`. Within that constraint, phases with the least-likely-to-churn
# API surface (protocol/schema definitions) go before phases that consume
# them, so downstream work never gets rebuilt due to an upstream shape change.
# Each phase lists the gaps in the original spec it exists to close.
# ─────────────────────────────────────────────────────────────────────────
phasemap:

  - phase: 0
    name: foundations
    depends_on: []
    stability_rationale: >
      Zero runtime dependencies beyond the language toolchain. These are pure
      data-shape and contract definitions — the thing every later phase codes
      against — so they must freeze first.
    deliverables:
      - binary_protocol_definitions      # input event frames, chunk headers — not_started
      - config_schema_validator          # validates this file itself at boot — not_started.
                                          # contracts.js exists but is a narrower thing: it
                                          # validates shapes crossing the remote-desktop/core
                                          # boundary, not this spec file itself. Don't count
                                          # it toward this deliverable when phase 0 comes up.
      - logging_framework_core           # not_started
      - secrets_keystore_module          # satisfied_by: bridge-os-core/bridge-identity/keystore
                                          # (vendored, not built fresh here — see remote-desktop/README.md)
    closes_gaps:
      - "no config was previously validated before use — malformed spec could
         crash mid-session instead of failing fast at boot"
      - "no defined place for tokens/keys to live — they were implied, not specced"
    exit_criteria:
      - "100% schema validation coverage on malformed/missing-field spec fixtures"
      - "secrets never appear in logging_framework_core output (redaction test)"

  - phase: 1
    name: transport_primitives
    depends_on: [foundations]
    stability_rationale: >
      WebRTC peer connection lifecycle and datachannel wrappers are consumed
      by every higher phase and rarely change shape once correct — build once,
      build solid.
    deliverables:
      - webrtc_peer_connection_wrapper    # lifecycle, ICE restart, renegotiation
      - datachannel_wrapper               # generic, parameterized by channels.*.network.datachannel_config
      - stun_turn_provisioning_module
    closes_gaps:
      - "ICE restart on network change (wifi->cellular) was unhandled"
      - "TURN credential rotation/expiry was unspecified"
    exit_criteria:
      - "peer connection survives simulated network interface swap without app-level teardown"

  - phase: 2
    name: signaling_and_session
    depends_on: [foundations, transport_primitives]
    stability_rationale: >
      Session/token/transport-selection logic is a state machine with a fixed
      contract (see `events.states`) — build it before media, since media
      phases assume a connected, authenticated transport already exists.
    deliverables:
      - local_ws_signaling_server           # done — signal.js
      - session_token_issuance              # done — session-token.js, wraps
                                             # bridge-os-core/bridge-identity + bridge-contracts
                                             # via contracts.js. Tested: tests/test-session-token.js
                                             # (isolated, event-bus only) and
                                             # tests/test-signal-integration.js (real host+viewer
                                             # WS clients through signal.js's gate, full
                                             # offer/answer round trip). Both pass.
                                             # host.html/viewer.html now actually use it —
                                             # no longer a stub, see implementation_log below.
                                             # Deviation from spec: TTL fixed at 5min, no config
                                             # key for it yet — will need one if phase 0's
                                             # config_schema_validator lands and this needs to
                                             # be tunable.
      - cloudflared_process_supervisor      # not_started
      - ble_advertise_pairing_module        # not_started
      - lan_mdns_discovery_module           # not_started
    closes_gaps:
      - "cloudflared has no supervised restart on crash — added: resilience.process_supervision"   # not_started
      - "port collision on signaling_server.port was unhandled — added: fallback port range"        # not_started
      - "tunnel URL parsing from stdout had no failure path — added: regex fallback + retry with backoff"  # not_started
    exit_criteria:
      - "cloudflared killed mid-session triggers ice:reconnecting via supervised restart, not session:ended"  # not_started, blocked on cloudflared_process_supervisor

  - phase: 3
    name: media_pipeline
    depends_on: [transport_primitives]
    stability_rationale: >
      Capture/encode/tile-diff/bitrate-control form one cohesive subsystem
      with internal churn (codec tuning, tile size tuning) — isolate it behind
      a stable interface before input/control phases attach to it.
    deliverables:
      - capture_abstraction               # display/window/region, per-OS backend
      - webcodecs_encode_decode_wrapper
      - hardware_accel_fallback_chain     # av1 -> vp9 -> h264 -> software
      - tile_diff_engine
      - perceptual_quantization_module
      - adaptive_bitrate_controller
      - audio_capture_and_noise_gate
    closes_gaps:
      - "codec negotiation failure had no fallback chain — added: hardware_accel_fallback_chain"
      - "screen-capture permission revoked mid-session was unhandled — added: resilience.permission_revocation"
      - "GPU/driver crash during hardware encode had no recovery path — added: resilience.encoder_crash_recovery"
    exit_criteria:
      - "forced software-fallback path produces a visually correct (if lower-fps) stream"
      - "revoking OS screen-recording permission mid-session closes the video channel cleanly, other channels unaffected"

  - phase: 4
    name: input_and_control
    depends_on: [transport_primitives, signaling_and_session]
    stability_rationale: >
      Input injection is OS-specific and security-sensitive — build after
      transport is proven stable so injection bugs aren't confused with
      transport bugs during debugging.
    deliverables:
      - host_input_listener_and_injector   # done — input-injector.js. Real per-OS
                                            # backend is lazy-loaded (@nut-tree/nut-js)
                                            # with a logging fallback when unavailable —
                                            # this sandbox has no display, so the
                                            # fallback is what's actually been run.
      - mobile_virtual_trackpad_component  # not_started
      - mobile_virtual_keyboard_component  # not_started
      - input_rate_limiter_coalescer       # done — input-injector.js. Coalescer runs
                                            # BEFORE the rate limiter deliberately (see
                                            # implementation_log) so a mousemove burst
                                            # can't starve out a click/keydown.
      - view_only_lock_toggle              # done — input-injector.js setLocked()/isLocked(),
                                            # wired to a bridge-electron tray menu item
    closes_gaps:
      - "no per-message authentication on the input channel — a MITM on a
         misconfigured TURN relay could inject arbitrary input. Added:
         security.input_message_authentication"   # done — input-auth.js, HMAC-SHA256
                                                    # keyed by the phase-2 session token.
                                                    # Verified in main process, not renderer.
      - "malformed/out-of-order input frames were unguarded — added:
         error_taxonomy.input_channel"   # done — input-injector.js shape/kind/coordinate
                                          # checks (fail closed, never throw) +
                                          # input-auth.js's replay guard (ts window +
                                          # nonce dedup) for out-of-order/stale frames
      - "no OS-specific permission-denied UX (e.g. macOS Accessibility) — added
         to permission.os_input_injection_consent with per-OS deep link to settings"  # not_started
    exit_criteria:
      - "fuzzed/malformed input frames cannot crash the injector or desync state"  # covered — tests/test-input-injector.js feeds malformed shapes, wrong types, unknown kinds; none throw
      - "replayed input frame (captured + resent) is rejected"  # covered — tests/test-input-pipeline.js signs a real frame, injects it, replays the identical signed frame, confirms rejection
    verification: >
      tests/test-input-auth.js (10 assertions), tests/test-input-injector.js
      (12 assertions), tests/test-input-pipeline.js (5 assertions, the exact
      sign→verify→replay-check→inject composition main.js's IPC handler
      runs) — all pass, 2026-09-16. The IPC transport itself (renderer to
      main process) is not runtime-verified, same caveat as phase 7's
      Electron surface — no display in this sandbox.

  - phase: 5
    name: file_and_data_transfer
    depends_on: [transport_primitives, signaling_and_session]
    stability_rationale: >
      Independent of media/input — can build in parallel with phase 3/4 once
      phase 1/2 are done. Placed after input deliberately: file transfer
      consent UX reuses the approval-dialog pattern proven out in phase 2/4.
    deliverables:
      - chunked_transfer_engine_with_backpressure
      - directory_allowlist_enforcement
      - resumable_transfer_with_checksum
    closes_gaps:
      - "path traversal via crafted relative paths was unguarded — added:
         security.path_traversal_guard"
      - "disk-full mid-transfer had no defined behavior — added:
         error_taxonomy.data_channel.disk_full"
      - "cancelled transfer left partial files with no cleanup contract — added:
         data.network.chunking cleanup_on_cancel: true"
    exit_criteria:
      - "path traversal fuzzing (../, symlinks, absolute paths) cannot escape host_exposed_paths"
      - "killing the process mid-transfer and resuming produces a byte-identical file"

  - phase: 6
    name: security_hardening_layer
    depends_on: [media_pipeline, input_and_control, file_and_data_transfer]
    stability_rationale: >
      Wraps all channels rather than belonging to one — must come after every
      channel exists to have something to wrap, but before phase 7/8 so the
      app shells are built on an already-hardened core, not patched after.
    deliverables:
      - viewer_fingerprint_trust_store
      - consent_approval_ui_flow
      - session_kill_switch
      - tamper_evident_audit_log
    closes_gaps:
      - "no session hijack detection if a fingerprint is spoofed — added:
         security.session_hijack_detection"
      - "no replay protection at the session layer (channel-level replay was
         closed in phase 4, this closes it at the signaling layer) — added:
         security.signaling_replay_protection"
      - "no enforced minimum DTLS-SRTP version — added:
         security.dtls_srtp_min_version, rejects downgrade attempts"
    exit_criteria:
      - "spoofed fingerprint with valid token is rejected and audit-logged"
      - "signaling replay attempt (captured offer/answer resent) is rejected"

  - phase: 7
    name: host_application_shell
    depends_on: [security_hardening_layer]
    stability_rationale: >
      The Electron shell is glue code over an already-correct, already-secure
      core — building it last-but-two means UI/tray work never blocks or gets
      blocked by core logic changes.
    out_of_order_note: >
      Built now, out of spec order, at explicit request ("make it work cross
      device... electron, batch with background service option and closing
      to taskbar"). depends_on above is NOT yet satisfied — phase 6
      (security_hardening_layer) hasn't started, so this shell currently
      wraps a core with no DTLS-SRTP enforcement, no replay protection, and
      no fingerprint trust store. Fine for LAN testing between trusted
      devices; not fine to expose past a LAN until phase 6 lands. Said
      plainly here rather than left implicit.
    deliverables:
      - electron_main_process_wiring         # done — bridge-electron/main.js
      - tray_ui_and_autostart                 # partial — tray + close-to-tray +
                                               # background-hosting toggle done;
                                               # launch-at-login not implemented
      - host_config_persistence               # done — host-config.json (signalPort),
                                               # bridge-electron/main.js loadConfig/saveConfig
      - crash_reporter_and_auto_restart_supervisor   # not_started
    closes_gaps:
      - "no auto-update mechanism was specified — added: packaging.auto_update
         with mandatory signature verification"   # not_started
      - "no crash telemetry path (opt-in) — added: observability.crash_reporting"  # not_started
    exit_criteria:
      - "killed host process auto-restarts and resumes previous config within 5s"  # not_started, blocked on crash_reporter_and_auto_restart_supervisor
    verification_caveat: >
      main.js/preload.js are syntax-checked (node --check) and their
      non-Electron-API logic (config load/save, LAN address discovery) is
      unit-verified directly. The Electron-API surface itself (Tray,
      BrowserWindow, setDisplayMediaRequestHandler, ipcMain) is NOT
      runtime-verified — this sandbox has no display and doesn't install
      Electron. Needs a real run on an actual machine before calling this
      deliverable done rather than written.

  - phase: 8
    name: viewer_application_shell
    depends_on: [security_hardening_layer]
    stability_rationale: >
      Can be built in parallel with phase 7 (both depend only on phase 6) —
      listed after only for document ordering, not a hard sequence dependency.
    deliverables:
      - pwa_shell_and_service_worker
      - responsive_layout_mobile_desktop
      - qr_scan_flow
    closes_gaps:
      - "no offline/reconnect UX if the PWA loses network mid-session — added:
         resilience.viewer_reconnect_strategy"
      - "no PWA install prompt flow specified — added: viewer.install_prompt"
    exit_criteria:
      - "viewer network drop + return within reconnect_window_ms resumes without re-scanning QR"

  - phase: 9
    name: observability_and_ops
    depends_on: [host_application_shell, viewer_application_shell]
    stability_rationale: >
      Instrumenting a system before its interfaces are final means rewriting
      instrumentation twice — deliberately last-but-two so it instruments the
      real, frozen interfaces.
    deliverables:
      - structured_logging_pipeline_with_redaction
      - health_check_self_diagnostics_command
      - opt_in_metrics_pipeline
    closes_gaps:
      - "no self-diagnostic command existed for support/triage — added:
         observability.self_diagnostics"
      - "no PII/secret redaction guarantee on log pipeline — added:
         observability.redaction_policy"

  - phase: 10
    name: testing_and_qa
    depends_on: [observability_and_ops]
    stability_rationale: >
      Final gate before packaging — runs against the fully assembled,
      instrumented system so tests validate what ships, not an approximation
      of it.
    deliverables:
      - unit_tests_per_module
      - network_emulated_integration_tests   # loss/jitter/bandwidth caps
      - scripted_e2e_loopback_session
      - chaos_tests                          # kill cloudflared, revoke perms, drop BLE mid-handoff
    closes_gaps:
      - "no chaos/failure-injection testing existed anywhere in the original spec"
    exit_criteria:
      - "chaos suite passes: every mid-session failure mode in error_taxonomy
         resolves to a defined state, never an unhandled crash"

  - phase: 11
    name: packaging_and_distribution
    depends_on: [testing_and_qa]
    stability_rationale: >
      Last, by definition — nothing ships until everything above is verified.
    deliverables:
      - code_signing_host_and_updates
      - platform_installers               # dmg / nsis / AppImage
      - spec_version_compat_matrix
      - eula_consent_screens
      - uninstall_cleanup_routine
    closes_gaps:
      - "no defined uninstall behavior — added: packaging.uninstall_cleanup
         (revokes OS perms, clears trusted fingerprints, wipes config)"
      - "no host/viewer version-skew handling — added: compat_min_spec_version
         negotiation, refuses connection below floor with a clear toast"

# ─────────────────────────────────────────────────────────────────────────
# APP IDENTITY
# ─────────────────────────────────────────────────────────────────────────
app:
  name: "remote-desktop"
  host_process: electron
  viewer_process: web-pwa
  config_paths:
    host: "~/.config/remote-desktop/host.config.json"
    viewer: "indexeddb://remote-desktop/viewer.config"
  autostart:
    enabled: true
    login_item: true
    start_hidden: true
    persistence:
      saved: true
      requires_reapproval: false

# ─────────────────────────────────────────────────────────────────────────
# SESSION / SIGNALING
# ─────────────────────────────────────────────────────────────────────────
session:
  token:
    length_bytes: 32
    ttl_seconds: 900
    single_use: true
    rotate_on_disconnect: true
  transports_priority:
    - ble_local
    - lan_mdns
    - cloudflared_tunnel
  network:
    ble_local:
      enabled: true
      service_uuid: "generated-per-install"
      advertise_interval_ms: 200
      max_range_hint: "same-room"
      fallback_on_timeout_ms: 3000
    lan_mdns:
      enabled: true
      service_type: "_remotedesktop._tcp"
      port: 0
    cloudflared_tunnel:
      enabled: true
      binary_path: "auto-detect"
      mode: quick_tunnel
      spawn_timeout_ms: 15000
      retry:
        attempts: 3
        backoff_ms: [1000, 3000, 8000]
      signaling_server:
        protocol: wss
        port: 8843
        port_fallback_range: [8843, 8863]   # gap closure: port collision handling
        max_connections: 1
      url_parse:                             # gap closure: stdout parse fragility
        strategy: regex_with_retry
        regex: 'https://[a-z0-9-]+\.trycloudflare\.com'
        max_parse_attempts: 5
        parse_retry_interval_ms: 500
  control:
    who_can_initiate_pairing: host_only
    max_concurrent_viewers: 1
    require_host_approval_per_connection: true
  permission:
    host_approval_dialog: true
    remember_approved_viewer_fingerprint: true
    revoke_anytime: true
  persistence:
    save_last_transport_used: true
    save_trusted_viewer_fingerprints: true
    requires_reapproval_after_days: 30

# ─────────────────────────────────────────────────────────────────────────
# EVENT / STATE MACHINE
# ─────────────────────────────────────────────────────────────────────────
events:
  states:
    - tunnel:starting
    - tunnel:ready
    - tunnel:failed
    - qr:generated
    - peer:waiting
    - peer:approval_pending
    - peer:approved
    - peer:denied
    - ice:connecting
    - ice:connected
    - ice:reconnecting        # gap closure: distinct from failed, drives supervised-restart UX
    - ice:failed
    - channel:video:open
    - channel:audio:open
    - channel:input:open
    - channel:data:open
    - channel:*:closed
    - channel:*:error
    - session:ended
  toast_policy:
    errors: always
    info: on_change_only
    retry_visible: true

# ─────────────────────────────────────────────────────────────────────────
# CHANNELS
# ─────────────────────────────────────────────────────────────────────────
channels:
  video:
    enabled: true
    network:
      transport: webrtc_track
      codec_priority: [av1, vp9, h264]
      encoding_engine: webcodecs
      hardware_acceleration: prefer
      hardware_accel_fallback_chain: [av1_hw, vp9_hw, h264_hw, software]   # gap closure
      capture:
        source: display
        fps_target: 30
        fps_min: 5
        fps_max: 60
        resolution_initial: "native"
        resolution_min_scale: 0.25
      adaptive_bitrate:
        enabled: true
        controller: ewma_aimd
        sample_interval_ms: 1000
        ewma_alpha: 0.3
        bitrate_kbps: { min: 150, max: 20000, start: 4000 }
        step_up_pct: 0.10
        step_down_pct: 0.25
        triggers: [rtt_ms, packet_loss_pct, available_outgoing_bitrate]
        thresholds:
          rtt_ms_degrade: 250
          packet_loss_pct_degrade: 3
      optimization:
        tile_diffing:
          enabled: true
          tile_size_px: 32
          hash_algo: xxhash32
          lru_cache_size: 4096
          skip_unchanged_tiles: true
        perceptual_quantization:
          enabled: true
          dark_region_luminance_threshold: 40
          dark_region_bit_depth_reduction: 2
          contrast_delta_skip_threshold: 3
        keyframe_interval_ms: 4000
        idle_frame_skip: true
      ice:
        stun_servers: ["stun:stun.cloudflare.com:3478"]
        turn_servers: []
        turn_fallback_enabled: true
        turn_credential_rotation_seconds: 3600   # gap closure
    control:
      direction: host_to_viewer_only
      viewer_can_request_quality_change: true
      viewer_can_pause_stream: true
      host_can_switch_source_mid_session: true
    permission:
      os_screen_capture_consent: true
      per_session_consent_prompt: false
      revoked_behavior: channel_closes_immediately
    persistence:
      save_last_source_selected: true
      save_quality_preset: true
      requires_reapproval: false

  audio:
    enabled: true
    network:
      transport: webrtc_track
      codec: opus
      opus_settings:
        bitrate_kbps: { min: 16, max: 128, start: 64 }
        complexity: 5
        dtx: true
        fec: true
      constraints:
        echo_cancellation: true
        noise_suppression: true
        auto_gain_control: true
      advanced_noise_gate:
        enabled: true
        engine: rnnoise_wasm
        applied_in: audio_worklet
      output_routing:
        set_sink_id_supported: true
        bluetooth_passthrough: true
    control:
      direction: host_to_viewer_default
      viewer_to_host_mic_enabled: false
      host_can_mute_remotely: true
    permission:
      os_audio_capture_consent: true
      viewer_mic_permission_prompt: true
      revoked_behavior: channel_closes_immediately
    persistence:
      save_output_device_preference: true
      save_mute_state: false

  input:
    enabled: true
    network:
      transport: webrtc_datachannel
      datachannel_config:
        ordered: false
        max_retransmits: 0
        priority: very-high
      protocol: binary_compact
      batching:
        mouse_move_coalescing: true
        coalesce_window_ms: 8
        keyboard_coalescing: false
    control:
      direction: viewer_to_host_only
      accepted_input_types: [mouse_move, mouse_click, mouse_scroll, key_down, key_up, touch_gesture]
      mobile_input_modes:
        virtual_trackpad:
          enabled: true
          mode: relative
          tap_to_click: true
          two_finger_scroll: true
          long_press_right_click: true
          long_press_ms: 500
        virtual_keyboard:
          enabled: true
          mode: hidden_input_proxy
      rate_limit:
        max_events_per_sec: 250
        overflow_policy: drop_oldest
      host_can_lock_input: true
    permission:
      os_input_injection_consent: true
      os_specific_consent_deeplink: true    # gap closure: e.g. macOS Accessibility settings pane
      view_only_mode_default: false
      revoked_behavior: input_events_silently_dropped_channel_stays_open
    persistence:
      save_view_only_preference: true
      save_trackpad_sensitivity: true
      requires_reapproval: false

  data:
    enabled: true
    network:
      transport: webrtc_datachannel
      datachannel_config:
        ordered: true
        reliable: true
        priority: low
      chunking:
        chunk_size_bytes: 16384
        cleanup_on_cancel: true            # gap closure
        backpressure:
          strategy: buffered_amount_low_event
          low_water_mark_bytes: 262144
          high_water_mark_bytes: 1048576
      throughput_cap:
        enabled: true
        max_kbps: 0
        yield_to_video_channel: true
      integrity:
        checksum_per_chunk: crc32
        resume_supported: true
    control:
      direction: bidirectional
      allowed_operations: [upload, download, list_directory, delete]
      directory_scope:
        host_exposed_paths: []
        viewer_can_browse_outside_scope: false
      max_file_size_mb: 0
      concurrent_transfers: 3
    permission:
      per_transfer_consent: true
      remember_folder_approval: true
      revoked_behavior: in_flight_transfers_abort_cleanly
    persistence:
      save_exposed_paths: true
      save_transfer_history: true
      transfer_history_retention_days: 30

# ─────────────────────────────────────────────────────────────────────────
# SECURITY (cross-cutting)
# ─────────────────────────────────────────────────────────────────────────
security:
  dtls_srtp: mandatory
  dtls_srtp_min_version: "1.2"                    # gap closure: reject downgrade
  end_to_end: true
  signaling_encryption: wss_tls
  viewer_fingerprinting:
    enabled: true
    algo: sha256_of_public_key
  session_hijack_detection:                        # gap closure (phase 6)
    enabled: true
    action_on_detect: kill_session_and_audit_log
  signaling_replay_protection:                      # gap closure (phase 6)
    enabled: true
    nonce_window_seconds: 60
  input_message_authentication:                     # gap closure (phase 4)
    enabled: true
    scheme: hmac_per_message
    key_derivation: session_token_derived
  path_traversal_guard:                             # gap closure (phase 5)
    enabled: true
    reject: [relative_parent_refs, symlinks_outside_scope, absolute_paths]
  session_kill_switch:
    host_hotkey: "Ctrl+Alt+Shift+K"
    tray_disconnect_button: true
    effect: closes_all_channels_immediately

# ─────────────────────────────────────────────────────────────────────────
# RESILIENCE (gap closure: crash/failure recovery, previously unspecified)
# ─────────────────────────────────────────────────────────────────────────
resilience:
  process_supervision:
    cloudflared:
      restart_on_crash: true
      max_restarts_per_hour: 10
      on_restart: emit ice:reconnecting, preserve session token if within ttl
  permission_revocation:
    mid_session_screen_capture_revoked: close_video_channel_only
    mid_session_input_permission_revoked: close_input_channel_only
  encoder_crash_recovery:
    hardware_encoder_crash: fall_back_to_next_in_hardware_accel_fallback_chain
    software_fallback_crash: close_video_channel_emit_toast
  viewer_reconnect_strategy:
    reconnect_window_ms: 30000
    backoff_ms: [500, 1000, 2000, 5000]
    resume_without_requeuing_qr: true

# ─────────────────────────────────────────────────────────────────────────
# ERROR TAXONOMY (gap closure: previously implicit, now enumerated per channel)
# ─────────────────────────────────────────────────────────────────────────
error_taxonomy:
  session:
    - tunnel_spawn_failed
    - tunnel_url_parse_failed
    - port_collision
    - token_expired
  video:
    - capture_permission_denied
    - codec_negotiation_failed
    - hardware_encoder_crashed
  audio:
    - capture_permission_denied
    - output_device_unavailable
  input:
    - malformed_frame
    - out_of_order_frame
    - replayed_frame
    - injection_permission_denied
  data_channel:
    - disk_full
    - checksum_mismatch
    - path_traversal_attempt
    - transfer_cancelled_midflight
  handling_policy: every_error_maps_to_named_event_and_toast   # no silent failures

# ─────────────────────────────────────────────────────────────────────────
# OBSERVABILITY (gap closure: expands original `logging` into enterprise reqs)
# ─────────────────────────────────────────────────────────────────────────
observability:
  structured_logging:
    enabled: true
    format: json
    level: info
    retention_days: 14
  redaction_policy:
    redact_fields: [session.token, security.*.key, viewer_fingerprints]
    enforced_in: logging_pipeline_and_crash_reports
  self_diagnostics:
    command: "remote-desktop --diagnose"
    checks: [cloudflared_binary_present, os_permissions_status, ice_connectivity_probe, disk_space]
  crash_reporting:
    enabled: false            # opt-in
    anonymized: true
  opt_in_metrics:
    enabled: false
    anonymized: true

# ─────────────────────────────────────────────────────────────────────────
# COMPATIBILITY / VERSIONING (gap closure: host/viewer skew was unhandled)
# ─────────────────────────────────────────────────────────────────────────
compatibility:
  negotiation: on_signaling_handshake
  below_compat_min_behavior: refuse_connection_with_toast
  channel_level_capability_negotiation: true   # e.g. viewer without WebCodecs falls back gracefully

# ─────────────────────────────────────────────────────────────────────────
# PACKAGING / DISTRIBUTION (gap closure: no lifecycle-end spec existed)
# ─────────────────────────────────────────────────────────────────────────
packaging:
  code_signing: required
  auto_update:
    enabled: true
    signature_verification: required
    channel: stable
  installers: [dmg, nsis, appimage]
  uninstall_cleanup:
    revoke_os_permissions: true
    clear_trusted_fingerprints: true
    wipe_config: true

# ─────────────────────────────────────────────────────────────────────────
# TESTING (gap closure: no test strategy existed in original spec)
# ─────────────────────────────────────────────────────────────────────────
testing:
  unit_coverage_target_pct: 85
  integration:
    network_emulation: [packet_loss, jitter, bandwidth_cap]
  chaos_suite:
    scenarios:
      - kill_cloudflared_mid_session
      - revoke_screen_capture_permission_mid_session
      - drop_ble_mid_handoff
      - resend_captured_input_frame
      - disconnect_network_interface_mid_transfer
    pass_criteria: every_scenario_resolves_to_named_error_taxonomy_state

# ─────────────────────────────────────────────────────────────────────────
# RUNTIME STATE PERSISTENCE (cross-cutting)
# ─────────────────────────────────────────────────────────────────────────
persistence:
  autosave_runtime_state: true
  autosave_interval_ms: 5000
  fields_excluded_from_persistence:
    - session.token
    - security.viewer_fingerprinting.current_session_key

# ─────────────────────────────────────────────────────────────────────────
# IMPLEMENTATION LOG — append-only, newest last. Updated alongside the code,
# not after. Each entry: what shipped, where, how it was verified, and any
# deviation from what this spec says above.
# ─────────────────────────────────────────────────────────────────────────
implementation_log:

  - date: "2026-09-15"
    phase: 0
    event: "bridge-os-core vendored in, untouched (diff -rq clean against source)."
    note: >
      Not a phase-0 deliverable itself — this is the pre-existing sovereign-node
      project's vital core (identity/core/IME/sngate/data/heartbeat/contracts),
      reused rather than rebuilt. secrets_keystore_module deliverable above
      points here.

  - date: "2026-09-15"
    phase: 2
    event: "signal.js — local_ws_signaling_server. Session-scoped WS relay, no auth yet."
    verified: "manual — two browser tabs, host+viewer, offer/answer/ICE relayed"

  - date: "2026-09-15"
    phase: 2
    event: >
      session-token.js — session_token_issuance. Event-driven authority wrapping
      bridge-os-core's identity+contracts through contracts.js as the sole boundary.
      signal.js now requires a valid token from a viewer before relaying anything.
    verified: >
      tests/test-session-token.js (13 assertions, isolated) and
      tests/test-signal-integration.js (4 assertions, real WS host+viewer against
      the actual signal.js process) — both pass, 2026-09-15.
    deviation: "TTL hardcoded to 5min — see inline note on the deliverable above."
    still_stub: "host.html/viewer.html don't request/send a token yet — join:rejected until wired."

  - date: "2026-09-16"
    phase: 2
    event: >
      host.html/viewer.html wired to the real token flow. signal.js refactored
      to export start()/stop() (still runs standalone via `node signal.js`,
      require.main check preserved) and now notifies the host with
      viewer:joined once a viewer's token verifies — fixes a race where the
      host's offer was sent before any viewer existed and silently dropped.
    verified: >
      tests/test-signal-integration.js extended to assert viewer:joined fires
      and the full offer→answer round trip relays both directions. 6/6 pass,
      2026-09-16.
    still_manual: "actual two-browser-tab click-through not re-run this pass — protocol-level round trip is what's verified."

  - date: "2026-09-16"
    phase: 7
    event: >
      bridge-electron/ — host_application_shell, out of spec order (depends_on
      security_hardening_layer, not yet built — see out_of_order_note on the
      phase-7 block above). main.js runs signal.js in-process via its new
      start()/stop() export, adds Tray with close-to-tray (window 'close'
      hides, doesn't quit) and a background-hosting toggle, persists
      signalPort to host-config.json, and registers
      setDisplayMediaRequestHandler so host.html's existing getDisplayMedia()
      call needs no changes to run inside Electron. preload.js exposes exactly
      one thing (getNetworkInfo) so host.html can show viewers on another
      device what LAN address to use.
    verified: "node --check on main.js/preload.js; lanAddresses() logic unit-verified directly."
    not_verified: >
      No real Electron runtime in this sandbox (no display, not installed) —
      Tray/BrowserWindow/setDisplayMediaRequestHandler/ipcMain are written
      correctly against Electron's documented API but not runtime-tested.
      Run `cd bridge-electron && npm install && npm start` on an actual
      machine before trusting this beyond "should work."

  - date: "2026-09-16"
    phase: 2
    event: >
      scripts/start-signal-background.bat, scripts/stop-signal-background.bat —
      headless background-service option for signal.js on a machine that
      doesn't want the Electron shell (server box, no GUI). PID-file based so
      stop doesn't kill unrelated node.exe processes.
    not_verified: "no Windows environment in this sandbox — written and reviewed, not run."

  - date: "2026-09-16"
    phase: 4
    event: >
      input-auth.js — HMAC-SHA256 per-message signing/verification keyed by
      the phase-2 session token (no new secret to distribute), plus a
      nonce+timestamp replay guard. Browser+Node compatible (webcrypto both
      places), same file loaded by viewer.html (signs), host.html (relays
      raw, doesn't verify — see next entry), and bridge-electron/main.js
      (verifies, in the trusted main process).
    verified: "tests/test-input-auth.js, 10/10 assertions pass."

  - date: "2026-09-16"
    phase: 4
    event: >
      input-injector.js — per-OS injection abstraction (real backend
      lazy-loaded via @nut-tree/nut-js, logging fallback otherwise), with
      mousemove coalescing, a rate limiter for discrete events, and a
      view-only lock toggle. Deliberately has zero knowledge of tokens or
      signatures — single responsibility, same split as session-token.js
      (auth) vs signal.js (transport).
    verified: "tests/test-input-injector.js, 12/12 assertions pass."
    bug_caught_by_the_test: >
      First version ran the rate limiter on every incoming mousemove BEFORE
      coalescing, so a mousemove burst could exhaust the rate-limit window
      and cause the NEXT real click to be rejected as rate_limited — the
      test test-input-injector.js ("click succeeds again after unlocking")
      caught this by asserting on the actual returned reason, not just
      truthiness. Fixed: coalescing now happens before the rate-limit check,
      so raw mousemove volume never touches the limiter at all.

  - date: "2026-09-16"
    phase: 4
    event: >
      Wired end to end: viewer.html signs every input frame via input-auth.js
      before sending (currentToken captured at connect-time from the same
      token used to join). host.html no longer has any injection logic
      itself — it relays raw frames to bridge-electron/preload.js's
      injectInput(), which IPCs to main.js. main.js's 'inject-input' handler
      is the only place a frame gets trusted: verifyFrame() -> replayGuard
      .check() -> inputInjector.inject(), in that order, in the main
      process, never the renderer. Fails closed if no session token has
      been set yet (no_active_session).
    verified: >
      tests/test-input-pipeline.js replicates that exact handler's logic
      (not through IPC, but the same four calls in the same order) and
      confirms: legit signed frame injects; identical frame replayed is
      rejected; forged/unsigned frame is rejected before reaching the
      injector; with no session token set, fails closed. 5/5 pass.
    not_verified: "the actual IPC hop (renderer -> preload -> main) — same no-Electron-runtime caveat as phase 7."
