// The design's book (plan §10): the fixture behind the mocked 09 Cover tests and the compare shots.
// Micro Study Habits for Busy Adult Learners, its subtitle, Adnan Haroun, 6 × 9, 54 pages, white
// paper, the Band layout, the warm blurb (design/screens/58-09-cover-new.html BOOK and BLURBS.warm).
// Made-up book words from the design, never a real book.
const FIX = {
  BOOK: 'c9c9c9c9-0000-4000-8000-000000000009',
  PEN: 'aaaaaaaa-0000-4000-8000-00000000000a',
  title: 'Micro Study Habits for Busy Adult Learners',
  subtitle: 'How to Keep Up With Your Course After Work, Even on Low-Energy Days',
  pen: 'Adnan Haroun',
  bio: 'Adnan Haroun writes practical guides for adults who learn while they work.',
  fmt: { trim: '6x9', pages: 54, paper: 'white' },
  blurbWarm: 'You signed up for the course. Then work, family and tired evenings got in the way. This book is for the nights you have twenty minutes and almost no energy left.\n\nMicro Study Habits for Busy Adult Learners shows you small routines that still move you forward: five-minute reviews, study cues you attach to things you already do, and a simple plan for the weeks that fall apart.\n\nNo all-nighters. No guilt. Just steady progress you can keep after work.',
  /**
   * The Band layout with the warm blurb, as design F59 makes it (applyLayout('band'), then blurb()),
   * built by the app's own js/cover/layouts.js in a plain page, so it never drifts from the code.
   */
  async band(page) {
    if (globalThis.__band) return JSON.parse(JSON.stringify(globalThis.__band));
    // The Part 2 engine page loads every js/cover file (UTF-8); nothing on it runs until asked.
    await page.goto('http://127.0.0.1:5500/tests/browser/cover/engine.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.kdpCover && window.kdpCover.layouts, null, { timeout: 10000 });
    globalThis.__band = await page.evaluate(({ book, fmt, blurb }) => {
      const r = kdpCover.layouts.build('band', book, fmt, 1, blurb);
      return { layers: r.layers, bg: r.bg, layout: 'band' };
    }, { book: { title: FIX.title, subtitle: FIX.subtitle, pen: FIX.pen }, fmt: FIX.fmt, blurb: FIX.blurbWarm });
    return JSON.parse(JSON.stringify(globalThis.__band));
  },
  /**
   * Part 8: the design's My layouts sample (67 sampleMy): Band, navy, from another made-up book in the
   * series ("Deep Focus for Night Students (example)", its subtitle; the pen name stays), exported Oct 30,
   * as a cover_my_layouts row with layers and a front thumbnail drawn by the app's own renderer.
   */
  async my(page) {
    if (!globalThis.__my) {
      await page.goto('http://127.0.0.1:5500/tests/browser/cover/engine.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.kdpCover && window.kdpCover.render, null, { timeout: 10000 });
      globalThis.__my = await page.evaluate(async ({ fmt, pen }) => {
        const K = kdpCover;
        const r = K.layouts.build('band', { title: 'Deep Focus for Night Students', subtitle: 'Study Smarter When the Day Is Done', pen }, fmt, 1, null);
        K.fonts.install(); K.textlayout.setMeasure(K.fonts.measure);
        await K.fonts.loadAll(r.layers);
        const g = K.geo.geo(fmt), h = 180, w = Math.round(h * g.trimW / g.trimH);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        K.render.paint(c.getContext('2d'), { fmt, bg: r.bg, layers: r.layers }, { scale: h / g.trimH, x0: g.foldR, y0: g.b, images: () => null });
        return { layers: r.layers, bg: r.bg, thumb: c.toDataURL('image/jpeg', 0.85) };
      }, { fmt: FIX.fmt, pen: FIX.pen });
    }
    const m = JSON.parse(JSON.stringify(globalThis.__my));
    return { id: 'b7b7b7b7-0000-4000-8000-00000000007b', user_id: '00000000-0000-4000-8000-000000000001', name: 'Band, navy', from_book_id: 'd8d8d8d8-0000-4000-8000-0000000000d8',
      from_title: 'Deep Focus for Night Students (example)', fmt: { ...FIX.fmt }, bg: m.bg, layers: m.layers, thumb: m.thumb, exported_at: '2026-10-30T12:00:00.000Z' };
  }
};
