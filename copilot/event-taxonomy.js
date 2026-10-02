'use strict';
// copilot/event-taxonomy.js — every event the co-pilot emits, in the ET1 shape (lib/event-taxonomy-pattern.js).
// component_id: copilot.event-taxonomy
// Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (EV0, invariant E14)
//
// Written from the code: each entry is an event a file under copilot/ emits today (server.js's broadcast and its local
// bus, lib/expectation-watcher.js), its payloadShape the fields at the emit site. `nexus contracts check --system=copilot`
// holds it to the code — an emit added without its entry here fails the suite.

module.exports = Object.freeze({
  COPILOT_PROMPT_RECEIVED: { description: 'A prompt reached the co-pilot, from a channel or a session.', payloadShape: ['prompt', 'channel', 'sessionId', 'via'], severity: 'info' },
  COPILOT_CONTEXT_ASSEMBLED: { description: 'The context for a reply was assembled: its layers and token count, or the fallback when none could be.', payloadShape: ['layers', 'tokens', 'fallback', 'noCopilotContext'], severity: 'info' },
  COPILOT_MASTERMIND_ENRICHED: { description: 'MASTERMIND\'s state was added to a session\'s context.', payloadShape: ['sessionId'], severity: 'info' },
  COPILOT_CHANNEL_CHANGED: { description: 'The active channel changed.', payloadShape: ['channelId', 'channelName'], severity: 'info' },
  COPILOT_LIFELINE_ESCALATED: { description: 'Confidence was too low, so the request was escalated to a stronger provider (the lifeline).', payloadShape: ['provider', 'confidence', 'reason'], severity: 'notable' },
  COPILOT_FULFILLMENT_ATTEMPT: { description: 'One attempt at fulfilling a request: the agent chosen, whether it worked, and how its reply scored.', payloadShape: ['attempt', 'agent', 'cluster', 'reason', 'ok', 'reflectionScore', 'reflectionReason', 'faultType', 'ts'], severity: 'info' },
  COPILOT_RETRY_INTROSPECTED: { description: 'A reply was examined, found lacking, and retried with its diagnosis.', payloadShape: ['requestId', 'sessionId', 'verdict', 'diagnosis', 'blind'], severity: 'notable' },
  COPILOT_BUILD_STARTED: { description: 'A build was asked for through the co-pilot.', payloadShape: ['description'], severity: 'info' },
  COPILOT_BUILD_COMPLETE: { description: 'A build asked for through the co-pilot finished, and whether it passed.', payloadShape: ['ok', 'passed'], severity: 'notable' },
  EMERGE_CONTRACT_DISPATCHED: { description: 'A passing build\'s contract was handed to EMERGE — the co-pilot\'s side of closing the build loop.', payloadShape: ['type', 'payload', 'ts'], severity: 'notable' },
  COPILOT_STREAM_EVENT: { description: 'An event entered the co-pilot\'s live stream (and its local bus, for the expectation watcher).', payloadShape: ['type', 'ts'], severity: 'info' },
  COPILOT_ERROR_DETECTED: { description: 'An expectation was not met: something that should have happened did not, or happened wrong.', payloadShape: ['source', 'expectationId', 'reason', 'triggerData', 'ts'], severity: 'warning' },
});
