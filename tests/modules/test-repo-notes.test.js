'use strict';
/**
 * tests/modules/test-repo-notes.test.js — 0.60.6
 *
 * James (2026-10-13): "this is what i mean by i need to be able to log these somewhere, its too much. like can we have a
 * notes or something section for the repos so i can note all of this down? im out of ideas"
 *
 *   RN-0x  lib/repo-notes.js: add, list (this repo / no repo / every repo), search, kinds, pin, done, archive (never delete)
 *   WR-0x  routes, commands (every agent has them), the Notes tab
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\ntest-repo-notes\n');
  try {
    const N = require(path.join(ROOT, 'lib/repo-notes.js'));
    const repo = `r-${Date.now()}`;
    const a = N.add({ repoUuid: repo, body: '# Import MASTERMIND\nsplit the unintegrated packages first', kind: 'idea', tags: '#mm, import' });
    const b = N.add({ repoUuid: repo, body: 'which ERAVOS specs are current?', kind: 'question' });
    const c = N.add({ body: 'a thought about nothing in particular' });
    check('RN-01 a note keeps its words, its first line is its title, tags are cleaned, who wrote it is recorded',
      a.title === 'Import MASTERMIND' && a.body.includes('unintegrated') && a.tags.join() === 'mm,import' && a.source === 'james' && a.status === 'open');
    check('RN-02 a repo\'s notes are its own; a note on no repo is apart; every repo sees all',
      N.list({ repoUuid: repo }).length === 2 && N.list({}).some(n => n.id === c.id) && !N.list({}).some(n => n.id === a.id) && N.list({ all: true }).filter(n => [a.id, b.id, c.id].includes(n.id)).length === 3);
    check('RN-03 search is plain words over title, body and tags; a kind filters', N.list({ repoUuid: repo, q: 'unintegrated packages' }).length === 1 && N.list({ repoUuid: repo, kind: 'question' })[0].id === b.id && N.list({ repoUuid: repo, tag: 'mm' })[0].id === a.id);
    N.update(b.id, { pinned: true });
    check('RN-04 a pinned note comes first', N.list({ repoUuid: repo })[0].id === b.id);
    N.update(b.id, { status: 'done' });
    check('RN-05 done: a question answered stays listed, marked; the counts follow', N.list({ repoUuid: repo }).find(n => n.id === b.id).status === 'done' && N.counts(repo).question === 0 && N.counts(repo).idea === 1);
    N.update(a.id, { status: 'archived' });
    check('RN-06 archived is hidden, never deleted — and can come back', !N.list({ repoUuid: repo }).some(n => n.id === a.id) && N.list({ repoUuid: repo, status: 'archived' })[0].id === a.id && N.get(a.id));
    const e = N.update(c.id, { body: 'a better thought' });
    check('RN-07 editing the body re-titles a note whose title was its first line', e.title === 'a better thought' && e.updatedAt >= e.createdAt);
    let bad = null; try { N.add({ body: 'x', kind: 'shopping' }); } catch (err) { bad = err; }
    let empty = null; try { N.add({ body: '   ' }); } catch (err) { empty = err; }
    check('RN-08 an unknown kind and an empty note are refused with why', bad && bad.status === 400 && /kind must be/.test(bad.message) && empty && empty.status === 400);

    const API = src('idearium/api/index.js'), CMD = src('idearium/cli/route-commands.js'), UI = src('idearium/ui/index.html'), APP = src('idearium/ui/js/app.js');
    check('WR-01 routes: a repo\'s notes (GET/POST), every note (GET), a note on no repo (POST), change one (PATCH)',
      /'repo\.notes'\]/.test(API) && /'repo\.notes\.add'\]/.test(API) && /'notes\.list'\]/.test(API) && /'notes\.add'\]/.test(API) && /\['PATCH',\s+\['api','notes',':id'\]/.test(API));
    check('WR-02 every agent has them: repo notes, repo note, notes, note, note done', ['repo.notes', 'repo.note', 'notes', 'note', 'note.done'].every(k => CMD.includes(`key: '${k}'`)));
    check('WR-03 the Notes tab: a button, its panel, its script, the tab switch calls it',
      /data-subtab="notes"/.test(UI) && /id="repo-subtab-notes"/.test(UI) && /js\/repo-notes\.js/.test(UI) && /renderRepoNotes\(CURRENT_API_REPO\)/.test(APP));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
