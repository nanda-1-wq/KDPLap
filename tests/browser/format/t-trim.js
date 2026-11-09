// D2 bug 4 (owner, Nov 9): the trim drawing keeps the page's shape and its label sits under it, never
// inside, for every group A trim and an old 7 × 10 or 8.5 × 11; at 1440 and 900 px. E13.2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const TRIMS = [['6x9', '6×9'], ['5.5x8.5', '5.5×8.5'], ['5.25x8', '5.25×8'], ['5x8', '5×8'], ['7x10', '7×10'], ['8.5x11', '8.5×11']];
  for (const [w, h] of [[1440, 1100], [900, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const [trim, label] of TRIMS) {
      st.brief.trim_size = trim;
      await FM.open(page);
      const m = await page.$eval('.fmt-trim-pic', (fig) => {
        const box = fig.getBoundingClientRect(), pg = fig.querySelector('.fmt-trim-page').getBoundingClientRect();
        const lb = fig.querySelector('.fmt-trim-label'), l = lb.getBoundingClientRect();
        const fits = lb.scrollWidth <= lb.clientWidth + 0.5 && l.left >= box.left - 0.5 && l.right <= box.right + 0.5 && l.bottom <= box.bottom + 0.5;
        return { text: lb.textContent, inside: !!fig.querySelector('.fmt-trim-page').textContent.trim(), fits, under: l.top >= pg.bottom - 0.5, ratio: pg.width / pg.height,
          column: fig.closest('.fmt-settings').scrollWidth <= fig.closest('.fmt-settings').clientWidth, row: fig.parentElement.scrollWidth <= fig.parentElement.clientWidth + 1 };
      });
      const [tw, th] = trim.split('x').map(Number);
      ok(m.text === label && !m.inside, `${w}: ${trim}: the label "${m.text}" is under the drawing, not inside`);
      ok(m.fits && m.under, `${w}: ${trim}: the label fits inside its box (${JSON.stringify(m)})`);
      ok(Math.abs(m.ratio - tw / th) < 0.03, `${w}: ${trim}: the drawing keeps the page's shape (${m.ratio.toFixed(3)} vs ${(tw / th).toFixed(3)})`);
      ok(m.column && m.row, `${w}: ${trim}: no sideways scroll in the column or the row`);
    }
  }
  st.brief.trim_size = '6x9';
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
