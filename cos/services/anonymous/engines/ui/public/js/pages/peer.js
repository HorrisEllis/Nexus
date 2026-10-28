/* NexusPanel — pages/peer.js */
import { html, apiSoft, esc, stats, emptyRow } from '../core.js';

export async function init() {
  const [id, peers] = await Promise.all([
    apiSoft('/ui/peer/identity'),
    apiSoft('/ui/peer/list'),
  ]);

  html('peer-stats', stats([
    { label: 'Public IP', val: id?.ip || 'not detected', cls: id?.ip ? 'b' : 'y' },
    { label: 'Peer ID',   val: id?.peerId ? id.peerId.slice(0, 10) : '—', cls: '' },
    { label: 'Known peers', val: (peers?.peers || []).length, cls: '' },
  ]));

  html('peer-identity', id?.peerId
    ? '<pre>' + esc(JSON.stringify(id, null, 2)) + '</pre>'
    : '<span style="color:var(--dim)">The peer engine has not published an identity yet.</span>');

  html('peer-table', (peers?.peers || []).length
    ? peers.peers.map(p =>
        '<tr><td class="num">' + esc(p.peerId || p.id || '—') + '</td>' +
        '<td class="num">' + esc(p.address || '—') + '</td>' +
        '<td><span class="badge ' + (p.alive ? 'up' : 'pending') + '">' +
          (p.alive ? 'reachable' : 'unknown') + '</span></td></tr>'
      ).join('')
    : emptyRow(3, 'No peers discovered', 'Peers appear here as the mesh finds them.'));
}
