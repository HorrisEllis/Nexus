'use strict';
/**
 * engines/ui/lib/reply-types.js
 *
 * Every reply type emitted by an engine, harvested from the engine sources.
 * The correlator subscribes to these once at boot and matches on requestId.
 *
 * Note the naming drift: eight handlers answer with a type that is not
 * `<request>:reply` — cache:get answers `cache:reply`, dns zone:get answers
 * `zone:reply`, billing tenant:get answers `tenant:reply`, and so on. That is
 * why correlation is by requestId and not by reconstructed type name.
 * Renaming those eight is tracked separately; it has consumers beyond the panel.
 */

module.exports = [
  'auth:apikey:reply',
  'auth:verify:reply',
  'builder:analyse:reply',
  'builder:build:reply',
  'builder:cancel:reply',
  'builder:list:reply',
  'builder:status:reply',
  'cache:reply',
  'cache:stats:reply',
  'catalog:list:reply',
  'firewall:status:reply',
  'ftp:info:reply',
  'ftp:users:create:reply',
  'ftp:users:delete:reply',
  'ftp:users:list:reply',
  'monitor:status:reply',
  'optimizer:report:reply',
  'proxy:routes:reply',
  'queue:status:reply',
  'registrar:add:reply',
  'registrar:check:reply',
  'relay:status:reply',
  'secret:reply',
  'signal:check:reply',
  'signal:filter:reply',
  'signal:honeypot:reply',
  'signal:status:reply',
  'smtp:mailbox:reply',
  'ssh:addkey:reply',
  'ssh:install:reply',
  'ssh:start:reply',
  'ssh:status:reply',
  'ssh:stop:reply',
  'status:pong',
  'storage:usage:reply',
  'sysfw:apply:reply',
  'sysfw:detect:reply',
  'sysfw:list:reply',
  'sysfw:remove:reply',
  'tenant:reply',
  'tls:status:reply',
  'tunnel:reply',
  'upnp:close:reply',
  'upnp:open:reply',
  'upnp:status:reply',
  'webserver:accesslog:reply',
  'webserver:php:check:reply',
  'webserver:status:reply',
  'webserver:vhost:add:reply',
  'webserver:vhost:list:reply',
  'webserver:vhost:remove:reply',
  'webserver:vhost:update:reply',
  'zone:reply',
];
