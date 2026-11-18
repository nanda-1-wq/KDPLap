// Owner, Nov 17: 09 Cover drops the "marked completed" strip; 08 Format keeps it (design 22f, 13).
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  st.book.status = 'completed';
  await FM.open(page);
  await page.waitForSelector('[data-book-strip]:not([hidden])', { timeout: 5000 });
  ok((await FM.txt(page, '[data-book-strip]')) === 'This book is marked completed. You can still edit it. A new version keeps it completed. Reopen book', '08: the strip and its words');
  const btn = await page.$eval('[data-strip-reopen]', (b) => ({ t: b.textContent.trim(), dis: b.disabled, h: Math.round(b.getBoundingClientRect().height) }));
  ok(btn.t === 'Reopen book' && !btn.dis, `08: Reopen book is there and on (${JSON.stringify(btn)})`);
  ok(await page.$eval('[data-book-strip]', (e) => e.getAttribute('role') === 'note'), '08: the strip is a note');

  st.book.status = 'in_progress';
  await FM.open(page);
  ok(await page.$eval('[data-book-strip]', (e) => e.hidden), '08 in progress: no strip');
  return log.join('\n');
};
