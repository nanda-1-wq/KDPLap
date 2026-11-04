/* ═══════════════════════════════════════════════════
   NicheInk · tests: a placeholder book in the export_json shape (E13.1)
   /tests/browser/format/placeholder.js   (used by the format browser tests
                                           and tools/make-style-samples.mjs)

   Generated words from a fixed seed (as E13.0 make-sample.js). Never a real
   book: no book text goes in any commit.

   kdpPlaceholderBook.make({ seed, chapters, sections, paras, intro, conclusion,
                             tricky, title, subtitle, pen, bio, edit })
     → export_json-like data: { book, known, now, chapters: [{ id, kind, title, sections }] }
     Every section is Final with a current version.
   kdpPlaceholderBook.TRICKY → the special characters mixed into the text
═══════════════════════════════════════════════════ */

(function (root) {
  const WORDS = ('calm body breath habit study minute focus small daily simple notice tension morning evening quiet ' +
    'routine practice gentle steady learn reader page note plan time short clear step return begin rest ' +
    'shoulder jaw hands walk water light window chair table write read review choose start finish keep').split(' ');
  // Markup and quote cases from E13.0 (cases.js), as a writer might type them.
  const TRICKY = ['save $20', 'the #1 habit', 'email me @home', '5 * 3 = 15', 'snake_case', 'C:\\notes', '<tag>', '[1]',
    '`code`', 'a ~ b', '50% off', 'a // b', 'wait -- no', 'it\'s "fine"', '#read("x")', '#let x = 1', '$5 and $10',
    'the 1990\'s', '5\' tall', 'café', 'naïve', '…and then', '— a pause —', '€10', '½ cup', '© note'];

  function make(opts = {}) {
    const o = { seed: 7, chapters: 8, sections: 3, paras: [4, 7], intro: true, conclusion: true, tricky: true,
      title: 'Placeholder Book: Small Daily Habits', subtitle: 'A Generated Sample for the Print Engine',
      pen: 'Sample Author', bio: 'Sample Author writes placeholder books for tests.\n\nThis text is generated.', ...opts };
    let seed = o.seed;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const cap = (w) => w[0].toUpperCase() + w.slice(1);

    function sentence() {
      const n = 8 + Math.floor(rand() * 14);
      const w = Array.from({ length: n }, () => pick(WORDS));
      if (o.tricky && rand() < 0.15) w.splice(Math.floor(rand() * n), 0, pick(TRICKY));
      if (rand() < 0.08) w.splice(Math.floor(rand() * n), 0, `**${pick(WORDS)} ${pick(WORDS)}**`);
      if (rand() < 0.08) w.splice(Math.floor(rand() * n), 0, `*${pick(WORDS)}*`);
      return cap(w.join(' ')) + '.';
    }
    const paragraph = () => Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(' ');
    const title = (n) => Array.from({ length: n }, () => cap(pick(WORDS))).join(' ');

    function content() {
      const out = [];
      const paras = o.paras[0] + Math.floor(rand() * (o.paras[1] - o.paras[0] + 1));
      for (let i = 0; i < paras; i++) {
        out.push(paragraph());
        if (i === 1 && rand() < 0.5) out.push(Array.from({ length: 3 }, () => `- ${sentence()}`).join('\n'));
        if (i === 2 && rand() < 0.4) out.push(Array.from({ length: 3 }, (_, k) => `${k + 1}. ${sentence()}`).join('\n'));
        if (i === 2 && rand() < 0.3) out.push(`## ${title(2)}`);   // always followed by a paragraph
        if (i === 3 && rand() < 0.2) out.push(`> ${sentence()}`);
      }
      return out.join('\n\n');
    }

    let vid = 0;
    const section = (cid, i) => ({
      id: `${cid}-s${i + 1}`, position: i + 1, title: title(3 + Math.floor(rand() * 3)), status: 'final',
      version: { id: `v${++vid}`, version_no: 1, content: content(), partial: false, word_count: 0 }
    });
    const chapters = [];
    let pos = 0;
    if (o.intro) chapters.push({ id: 'ci', kind: 'intro', position: ++pos, title: 'Introduction', sections: [section('ci', 0)] });
    for (let c = 1; c <= o.chapters; c++) {
      const id = `c${c}`;
      chapters.push({ id, kind: 'chapter', position: ++pos, title: title(3), sections: Array.from({ length: o.sections }, (_, i) => section(id, i)) });
    }
    // edit: one word added to the first chapter's first section (the "one-word edit" rebuild time).
    if (o.edit) { const s = chapters.find((c) => c.kind === 'chapter').sections[0]; s.version = { ...s.version, id: `${s.version.id}-e`, content: `${o.edit} ${s.version.content}` }; }
    if (o.conclusion) chapters.push({ id: 'cc', kind: 'conclusion', position: ++pos, title: 'Conclusion', sections: [section('cc', 0)] });
    return {
      book: { id: `placeholder-${o.seed}-${o.chapters}x${o.sections}`, title: o.title, subtitle: o.subtitle, pen_name: o.pen, bio: o.bio, trim: '6x9' },
      known: { brief: {}, research: { sources: [], competitors: [], insights: null } },
      now: '2026-11-04T12:00:00Z',
      chapters
    };
  }

  root.kdpPlaceholderBook = { make, TRICKY, WORDS };
})(globalThis);
