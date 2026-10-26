// E11 Books page (design 24b, 10 and 11): the export badge (fresh, changed,
// none), "Exported <date>" in the meta line, a failed badge read (no badges,
// no error), the card menu's Export, a DOCX export refreshes the badge and a
// Markdown export does not; the AI usage stat from usage_month. Screenshots.
// Run: tests/browser/run.sh books t-badge.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const S = () => globalThis.__store;
  const card = (id) => page.locator('.book-card', { has: page.locator(`[data-book-menu="${id}"]`) });
  const T = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  async function open(modes = {}, badges) {
    globalThis.__modes = modes;
    await setupE11(page);
    if (badges) S().badges = badges;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.stat .bar').waitFor({ timeout: 10000 });
  }

  const t1 = '2026-10-25T09:00:00Z', t2 = '2026-10-20T09:00:00Z';
  await open({}, [{ book_id: E11.B1, exported_at: t1, changed: false }, { book_id: E11.B2, exported_at: t2, changed: true }]);
  const c1 = await T(card(E11.B1)), c2 = await T(card(E11.B2)), c3 = await T(card(E11.B3));
  ok('10 fresh: "DOCX exported", success style with an icon', c1.includes('DOCX exported') && (await card(E11.B1).locator('.badge-success svg').count()) === 1, c1);
  ok('10 fresh: the meta line says "Exported <date>"', c1.includes(`Exported ${day(t1)}`) && !c1.includes('Edited'), c1);
  ok('10 changed: "Changed since export", neutral (not a warning), an info icon', c2.includes('Changed since export') && (await card(E11.B2).locator('.badge-neutral svg').count()) === 1
    && (await card(E11.B2).locator('.badge-warning').count()) === 0 && c2.includes(`Exported ${day(t2)}`), c2);
  ok('10 never exported: no badge, "Edited …"', !c3.includes('export') && c3.includes('Edited'), c3);
  ok('usage stat: 21% from usage_month, resets Nov 1', (await T(page.locator('.stat').nth(2))).includes('21%') && (await T(page.locator('.stat').nth(2))).includes('Resets Nov 1'));
  await page.locator('.book-grid').screenshot({ path: `${SHOTS}/books-badges-1440.png`, timeout: 10000 }).catch(() => out.push('shot timeout'));
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/books-badges-900.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout'));
  await page.setViewportSize({ width: 1440, height: 900 });

  // 11. The card menu: Export after Rename, before the separator and Delete.
  await page.locator(`[data-book-menu="${E11.B2}"]`).click();
  const items = await page.locator('#bookMenu [role="menuitem"]').allInnerTexts();
  ok('11 card menu: Open, Rename, Export, Delete', JSON.stringify(items.map((x) => x.trim())) === JSON.stringify(['Open', 'Rename', 'Export', 'Delete']), items);
  await page.locator('#bookMenu').screenshot({ path: `${SHOTS}/books-menu.png`, timeout: 8000 }).catch(() => {});
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  ok('11 the menu reaches Export by keyboard', await page.evaluate(() => document.activeElement.dataset.action === 'export'));
  await page.keyboard.press('Enter');
  await page.locator('.exp-dialog [data-exp-go]').waitFor({ timeout: 10000 });
  ok('11 opens the dialog for that book', (await T(page.locator('[data-exp-sub]'))).startsWith('Chair Yoga for Seniors Over 60'));

  // A Markdown export does not read the badges again; a DOCX export does, and book 2 turns fresh.
  await page.locator('[data-exp-ack]').check();
  await page.locator('input[value="md"]').check();
  let reads = S().calls.filter((c) => c.includes('export_badges')).length;
  let dl = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('[data-exp-go]').click();
  await dl;
  await page.locator('[data-exp-done]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  ok('Markdown: the badges are not read again; still "Changed since export"', S().calls.filter((c) => c.includes('export_badges')).length === reads && (await T(card(E11.B2))).includes('Changed since export'));
  await page.locator('[data-exp-again]').click();
  await page.locator('.exp-dialog [data-exp-go]').waitFor({ timeout: 10000 });
  await page.locator('input[value="docx"]').check();
  await page.locator('[data-exp-ack]').check();
  dl = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('[data-exp-go]').click();
  await dl;
  await page.locator('[data-exp-done]').waitFor({ timeout: 10000 });
  await page.waitForFunction((id) => document.querySelector(`[data-book-menu="${id}"]`).closest('.book-card').innerText.includes('DOCX exported'), E11.B2, { timeout: 5000 });
  ok('DOCX: the badges are read again; book 2 is "DOCX exported" now', S().calls.filter((c) => c.includes('export_badges')).length === reads + 1);
  await page.locator('[data-exp-done]').click();
  await page.waitForTimeout(200);
  ok('Done: focus back on the card menu button (the card was redrawn)', await page.evaluate((id) => document.activeElement.matches(`[data-book-menu="${id}"]`), E11.B2));

  // The badge read fails: no badges, no error, the books still show.
  await open({ badgesFail: true }, [{ book_id: E11.B1, exported_at: t1, changed: false }]);
  ok('badge read failed: no badges and no error', (await page.locator('.book-card').count()) === 3 && !(await T(page.locator('.book-grid'))).includes('export')
    && (await page.locator('[role="alert"]').count()) === 0);
  return out.join('\n');
};
