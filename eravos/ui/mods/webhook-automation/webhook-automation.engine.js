/* ═══════════════════════════════════════════════════════════
   MOD: WEBHOOK AUTOMATION  v1.0.0
   id: eravos.webhook-automation

   External/OS-level automation bridge. A browser sandbox cannot
   exec shell commands — so this mod fires an HTTP request
   to a configured webhook URL whenever a chosen bus event fires.
   That's the real, honest bridge point: external automation
   tools (Home Assistant, n8n, Shortcuts HTTP triggers, Keyboard
   Maestro web triggers, IFTTT Webhooks, a local listener script)
   all consume webhooks the same way.
   ═══════════════════════════════════════════════════════════ */

window.WebhookAutomationEngine = (() => {
'use strict';

function mount(instanceId, sBus, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    url:          config.url          || '',
    method:       config.method       || 'POST',
    triggerTopic: config.triggerTopic || 'pad:trigger',
    soundFilter:  config.soundFilter  || '',
    noCors:       !!config.noCors,
    rateLimitMs:  config.rateLimitMs != null ? config.rateLimitMs : 250,
  };

  let _topicSub   = null;
  let _lastFireAt = 0;
  let _fireCount  = 0;

  async function _fire(payload) {
    if (!_params.url) { sBus.publish('org:log', { level: 'error', message: 'No webhook URL set.' }); return; }
    const now = Date.now();
    if (now - _lastFireAt < _params.rateLimitMs) return; /* rate limit */
    _lastFireAt = now;

    const body = JSON.stringify({ ...payload, source: 'eravos', instanceId, ts: now });
    const opts = {
      method: _params.method,
      headers: _params.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: _params.method === 'POST' ? body : undefined,
      mode: _params.noCors ? 'no-cors' : 'cors',
    };
    const url = _params.method === 'GET'
      ? _params.url + (_params.url.includes('?') ? '&' : '?') + 'payload=' + encodeURIComponent(body)
      : _params.url;

    try {
      const res = await fetch(url, opts);
      _fireCount++;
      sBus.publish('org:log', { level: 'ok', message: `Fired (${_fireCount}) → ${_params.noCors ? 'sent (no-cors, response opaque)' : res.status} `, count: _fireCount });
    } catch (err) {
      sBus.publish('org:log', { level: 'error', message: 'Fetch failed: ' + err.message });
    }
  }

  function _resubscribe() {
    if (_topicSub) { _topicSub(); _topicSub = null; }
    _topicSub = gBus.subscribe(_params.triggerTopic, (payload) => {
      if (_params.triggerTopic === 'pad:trigger' && _params.soundFilter && payload.sound !== _params.soundFilter) return;
      _fire(payload || {});
    });
  }

  function testFire() { _fire({ test: true }); }

  function _updateParam(key, val) {
    if (!(key in _params)) return;
    _params[key] = val;
    if (key === 'triggerTopic' || key === 'soundFilter') _resubscribe();
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params }, fireCount: _fireCount });
  }

  const _unsubs = [
    gBus.subscribe('ui:webhook_test:'  + instanceId, testFire),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _updateParam(key, value)),
  ];

  _resubscribe();
  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.webhook-automation',
    label:    'Webhook Automation',
    provides: ['capability.external_automation'],
    requires: [],
    permissions: ['network_fetch', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'webhook.hook.trig_in', direction: 'in', event_type: 'pad:trigger', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { if (_topicSub) _topicSub(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    testFire,
    get params() { return { ..._params }; },
    get fireCount() { return _fireCount; },
  };
}

return { mount };
})();
