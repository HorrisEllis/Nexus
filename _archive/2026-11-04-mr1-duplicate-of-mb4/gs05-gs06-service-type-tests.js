// GS-05 / GS-06 of tests/modules/test-gig-stop-and-toast.test.js (branch 0.60.299): the branch's own Service type, superseded by main's GT5
// (clear-glass/src/autofill/gig-pages.js serviceTypeScript, which main's tests cover). Kept, not run (§0.3).
  if (browser) await test('GS-05', 'in Clear Glass: the Service type is chosen in its row and gated; a missing option stops there with a toast', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const d = driverOn(page); const toasts = [];
    const gig = { title: 'I will spec and architect your project', category: 'Programming & Tech', subcategory: 'AI Development', serviceType: 'Desktop Application', tags: ['spec'], packages: {} };
    const r = await Bridge.prototype._gigFill.call(selfOn(d, toasts), { gig });
    const sv = r.dropdowns.find(x => x.key === 'serviceType');
    assert.ok(sv && sv.ok && sv.option === 'Desktop Application', JSON.stringify(r.dropdowns) + JSON.stringify(r.notFound));
    assert.strictEqual(await page.evaluate(() => document.getElementById('svc').textContent), 'Desktop Application');
    assert.ok(r.gates.some(g => g.key === 'serviceType' && g.open), JSON.stringify(r.gates));
    assert.deepStrictEqual([r.stopped, toasts, r.tags && r.tags.done], [undefined, [], ['spec']]);
    await page.goto(base + '/users/x/manage_gigs/new');
    const bad = await Bridge.prototype._gigFill.call(selfOn(driverOn(page), toasts), { gig: { ...gig, serviceType: 'Mobile App' } });
    assert.ok(bad.stopped && bad.stopped.key === 'serviceType' && /Mobile App/.test(bad.stopped.why), JSON.stringify(bad.stopped));
    assert.strictEqual(bad.tags, undefined, 'the tags after it did not run');
    assert.match(toasts[0], /^Gig fill stopped at serviceType: /);
    await page.close();
  });

  if (browser) await test('GS-06', 'in Clear Glass: the page asks for a Service type the gig does not name: the fill stops there, naming its options', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/users/x/manage_gigs/new');
    const d = driverOn(page); const toasts = [];
    const gig = { title: 'I will spec and architect your project', category: 'Programming & Tech', subcategory: 'AI Development', tags: ['spec'], packages: {} };
    const r = await Bridge.prototype._gigFill.call(selfOn(d, toasts), { gig });
    assert.ok(r.stopped && r.stopped.key === 'serviceType', JSON.stringify(r.stopped) + JSON.stringify(r.notFound));
    assert.match(r.stopped.why, /the page asks for a Service type and the gig has none — its options: Web Application \| Desktop Application \| Automation\. Put one in the gig as serviceType/);
    assert.strictEqual(await page.evaluate(() => [document.getElementById('svc').textContent, !!document.querySelector('.menu')].join('|')), 'SELECT A SERVICE TYPE|false', 'nothing chosen, the menu closed');
    assert.strictEqual(r.tags, undefined);
    assert.match(toasts[0], /^Gig fill stopped at serviceType: the page asks for a Service type/);
    await page.close();
  });

