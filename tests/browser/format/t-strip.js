// E16.1 (owner, Nov 18): no step shows the "This book is marked completed" strip, 08 Format included
// (design 22f, 13 replaced). Reopen book stays in the 06 Write foot and the Books card menu.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  st.book.status = 'completed';
  await FM.open(page);
  await page.waitForTimeout(400);   // readStatus() runs after a completed book opens
  const none = () => page.evaluate(() => !document.querySelector('[data-book-strip], [data-strip-reopen]') && !document.body.innerText.includes('This book is marked completed'));
  ok(await none(), '08 completed: no strip, no strip Reopen');

  st.book.status = 'in_progress';
  await FM.open(page);
  ok(await none(), '08 in progress: no strip');
  return log.join('\n');
};
