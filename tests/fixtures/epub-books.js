/* ===================================================
   NicheInk - tests: the EPUB books (E13.3 Part 1)
   /tests/fixtures/epub-books.js   (used by tests/format-epub.test.js,
                                    tests/epub-check.test.js and
                                    tools/epubcheck.mjs, the golden set)

   Made-up text only, never a real book. kdpEpubBooks.data(over) is an
   export_json reply (the shape kdpFormatRules.modelOf reads);
   kdpEpubBooks.golden lists the golden EPUBs (plan section 8): every style x label,
   sections in contents on and off, the parts on and off, no pen name,
   Unicode and emoji, links, lists and quotes, hostile text, print-only
   options, and a long book (200 chapters).
=================================================== */

(function (root) {
  const NOW = '2026-11-23T10:00:00Z';
  const BOOK_ID = '7d3c2a10-5b4e-4f6a-9c8d-0e1f2a3b4c5d';

  const v = (id, content) => ({ id: `v-${id}`, version_no: 1, content, partial: false, word_count: 1 });
  const sec = (id, title, status, content, position = 1) => ({ id, position, title, status, version: content == null ? null : v(id, content) });

  const BASE_TEXT = {
    intro: 'Small habits add up. This book shows how.\n\nRead one chapter a day. Try the "two minute" rule first.',
    c1a: 'Pick one habit. Write it down.\nKeep the note where you can see it.\n\nIt\'s easier than it looks. The 1990\'s had no apps, and people still learned.\n\n## A quick test\n\nAsk yourself three questions.',
    c1b: '- Morning: read one page\n- Noon: review one card\n- Night: write one line\n\nThat is the whole plan.',
    c2a: '1. Choose a time\n2. Choose a place\n3. Start small\n\n> "Start where you are."\n> Use what you have.\n\nThen keep going. [Verify: no source]',
    c2b: 'A *short* note on **focus**: put the phone in another room. See [our guide](https://example.com/guide?a=1&b=2#top).',
    c3a: 'Review each week. Mark what worked.\n\nDrop what did not.',
    concl: 'You have a plan now. Use it today.',
    draft: 'This draft is not Final, so it is never in the file.'
  };

  /** An export_json reply. over: { book, chapters, now } replaces parts. */
  function data(over = {}) {
    const T = BASE_TEXT;
    return {
      book: { id: BOOK_ID, title: 'Micro Study Habits', subtitle: 'Small Steps for Busy Adult Learners', pen_name: 'Ada Haroun', bio: 'Ada writes about learning.\nShe lives by the sea.\n\nShe has two cats.', trim: '6x9', ...(over.book || {}) },
      known: { brief: {}, research: { sources: [], competitors: [], insights: null } },
      now: over.now || NOW,
      chapters: over.chapters || [
        { id: 'ci', kind: 'intro', position: 1, title: '', sections: [sec('si', 'Why small steps', 'final', T.intro)] },
        { id: 'c1', kind: 'chapter', position: 2, title: 'One habit at a time', sections: [
          sec('s11', 'Pick one', 'final', T.c1a, 1), sec('s12', 'A daily plan', 'final', T.c1b, 2), sec('s13', 'Not ready yet', 'draft', T.draft, 3)] },
        { id: 'c2', kind: 'chapter', position: 3, title: 'Time and place', sections: [
          sec('s21', '', 'final', T.c2a, 1), sec('s22', 'Focus', 'final', T.c2b, 2)] },
        { id: 'c3', kind: 'chapter', position: 4, title: '', sections: [sec('s31', 'Weekly review', 'final', T.c3a)] },
        { id: 'cc', kind: 'conclusion', position: 5, title: 'What comes next', sections: [sec('sc', '', 'final', T.concl)] }
      ]
    };
  }

  const ALSO_BY = [{ title: 'Deep Work for Students', subtitle: 'Focus in a Noisy World' }, { title: 'The "Five Card" Method', subtitle: null }];

  const ALL_PARTS = { title: true, copyright: true, contents: true, intro: true, conclusion: true, about: true, also_by: true };

  const UNICODE = {
    book: { title: 'Caf\u00E9 Notes \uD83D\uDCDA: Lernen, \u5B66\u4E60, \u062A\u0639\u0644\u0651\u0645', subtitle: 'Na\u00EFve \u201Csmart\u201D ideas \u2013 50% off\u2026 \u2713', pen_name: 'Zo\u00EB \u00C5ngstr\u00F6m-\u00D8berg', bio: 'Zo\u00EB \uD83D\uDC69\u200D\uD83C\uDFEB teaches in Krak\u00F3w.\nShe likes \u00BD cups of tea.\n\n\u3053\u3093\u306B\u3061\u306F.' },
    chapters: [
      { id: 'u1', kind: 'chapter', position: 1, title: 'Emoji \uD83D\uDC4D\uD83C\uDFFD and flags \uD83C\uDDEF\uD83C\uDDF5', sections: [sec('u11', 'Family \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66', 'final', 'Mixed scripts: \u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC, \u0440\u0443\u0441\u0441\u043A\u0438\u0439, \u05E2\u05D1\u05E8\u05D9\u05EA, \u0939\u093F\u0928\u094D\u0926\u0940, \uD55C\uAD6D\uC5B4.\n\nCombining: e\u0301 a\u0308 n\u0303. Non-breaking\u00A0space and zero\u2011width\u200Cnon-joiner.\n\nControl characters \u0001\u0007\u0085\u009f are removed, so is a lone \ud800 surrogate and \uFFFF.')] },
      { id: 'u2', kind: 'chapter', position: 2, title: 'Math \u00D7 symbols \u2264 \u2265 \u2260 \u221E', sections: [sec('u21', 'Quotes "inside" titles', 'final', 'She said "it\'s 5 o\'clock" and left. "Nested \'single\' quotes" work. 5" and 6\' stay straight. ("Bracketed") and [\'square\'].')] }
    ]
  };

  const LINKS = {
    chapters: [{ id: 'l1', kind: 'chapter', position: 1, title: 'Links', sections: [sec('l11', 'Kinds of links', 'final', [
      'Web: [example](https://example.com). Mail: [write to us](mailto:hello@example.com).',
      'Query and fragment: [search](https://example.com/s?q=a&r=b#res). Unicode path: [caf\u00E9](https://example.com/caf\u00E9/\u00FC).',
      'Not a link: [file](file:///etc/passwd), [js](javascript:alert(1)), [no host](https:///nohost), [bad host](https://exa<mple.com).',
      'Also not a link: [empty](https://), [dot](https://.com), [no address](mailto:nobody), [no domain](mailto:a@b).',
      'Port and user: [port](https://example.com:8443/x), [user](https://me@example.com/). Unicode host: [shop](https://b\u00FCcher.de/a). Subject: [mail](mailto:a.b@mail.example.co?subject=Hi).',
      '**[Bold link](https://example.com/b)** and *[italic link](https://example.com/i)*.'
    ].join('\n\n'))] }]
  };

  const LISTS = {
    chapters: [{ id: 'q1', kind: 'chapter', position: 1, title: 'Lists and quotes', sections: [sec('q11', 'Shapes', 'final', [
      '5. five\n6. six\n9. nine',
      '- one\n- two\n\n1) first\n2) second',
      '> A quote\n> - with a list\n> - inside\n>\n> > and a nested quote',
      '# A top heading in the text\n\n## A heading\n\n### Smaller\n\n#### Smaller still',
      '\\- not a list\n\\## not a heading\n1\\. not a number',
      'A line\nbreak, then **bold *and italic* text** and \\*stars\\*.'
    ].join('\n\n'))] }]
  };

  const HOSTILE = {
    book: { title: '<script>alert("x")</script> & ]]> #title', subtitle: '\'single\' & "double" <b>', pen_name: 'A & B <C>' },
    chapters: [{ id: 'h1', kind: 'chapter', position: 1, title: '</h1><h1>Fake', sections: [sec('h11', '<img src=x onerror=alert(1)>', 'final',
      '<p>Not HTML</p> &amp; &lt; &#x41; ]]> <!-- not a comment --> <?xml?>\n\n#strong[x] $math$ @ref `code` ~ = + / \\\\ backslash\n\n*unclosed **bold* italic**')] }]
  };

  // Headings nested properly (Kindle): an untitled first section with headings in its
  // text, a titled section, then an untitled one (the text goes through mdBody, which
  // adds one "#", as print).
  const HEADINGS = {
    chapters: [{ id: 'n1', kind: 'chapter', position: 1, title: 'Untitled first section', sections: [
      sec('n11', '', 'final', '# A big heading\n\nSome text.\n\n## A small heading\n\nMore text.', 1),
      sec('n12', 'Steps', 'final', '## Inside Steps\n\nStep text.', 2),
      sec('n13', '', 'final', '## After Steps\n\nLast text.', 3)] }]
  };

  // Unicode format characters (category Cf) and the spaces of Guidelines 6.7. The EPUB
  // keeps every one as typed; the owner decides (STOP 1).
  const FORMAT_CHARS = {
    'U+00AD soft hyphen': '\u00AD',
    'U+200B zero width space': '\u200B',
    'U+200C zero width non-joiner': '\u200C',
    'U+200D zero width joiner': '\u200D',
    'U+200E left-to-right mark': '\u200E',
    'U+200F right-to-left mark': '\u200F',
    'U+061C Arabic letter mark': '\u061C',
    'U+2060 word joiner': '\u2060',
    'U+2066 left-to-right isolate': '\u2066',
    'U+2069 pop directional isolate': '\u2069',
    'U+FEFF zero width no-break space': '\uFEFF',
    'U+E0067 tag g (England flag)': '\uDB40\uDC67',
    'U+E007F cancel tag (England flag)': '\uDB40\uDC7F'
  };
  const FORMAT_SAMPLES = {
    family: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67',
    england: '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F',
    softHyphen: 'hy\u00ADphen\u00ADation'
  };
  const FORMAT = {
    book: { title: 'Soft\u00ADhyphen title\u200B', subtitle: 'Marks \u200ELTR\u200E and \u200FRTL\u200F', bio: 'Word\u2060joiner and \uFEFFBOM.\nIsolate \u2066abc\u2069 here.' },
    chapters: [{ id: 'f1', kind: 'chapter', position: 1, title: 'Format characters', sections: [sec('f11', 'Kinds', 'final', [
      'Family ' + FORMAT_SAMPLES.family + ' and England ' + FORMAT_SAMPLES.england + '.',
      'A ' + FORMAT_SAMPLES.softHyphen + ' word, a zero\u200Bwidth space, zero\u200Cwidth non-joiner, Devanagari \u0915\u094D\u200D\u0937.',
      'Marks: \u200ELTR\u200E, \u200FRTL\u200F, \u061CArabic mark, word\u2060joiner, \uFEFFBOM inside, \u2066isolate\u2069.'
    ].join('\n\n'))] }]
  };

  function longBook() {
    const chapters = [];
    for (let i = 1; i <= 200; i++) {
      chapters.push({ id: `L${i}`, kind: 'chapter', position: i, title: `Chapter title ${i}`, sections: [1, 2, 3].map((k) =>
        sec(`L${i}-${k}`, `Section ${i}.${k}`, 'final', `Paragraph one of ${i}.${k}. It has "quotes" and it's short.\n\nParagraph two of ${i}.${k}.`, k)) });
    }
    return { chapters };
  }

  // The golden set: { name, settings (over the defaults), data over, extras over }.
  const golden = [];
  const STYLES = ['classic', 'modern', 'clean', 'warm'];
  const LABELS = ['chapter', 'number', 'none'];
  STYLES.forEach((style, si) => LABELS.forEach((chapter_label, li) => {
    golden.push({ name: `${style}-${chapter_label}`, settings: { style, chapter_label, contents_sections: (si + li) % 2 === 0, parts: ALL_PARTS } });
  }));
  golden.push(
    { name: 'sections-on', settings: { contents_sections: true, parts: ALL_PARTS } },
    { name: 'sections-off', settings: { contents_sections: false, parts: ALL_PARTS } },
    { name: 'parts-off', settings: { parts: { title: true, copyright: true, contents: false, intro: false, conclusion: false, about: false, also_by: false } } },
    { name: 'no-pen-no-subtitle', settings: { parts: ALL_PARTS }, data: { book: { pen_name: '', subtitle: '' } } },
    { name: 'print-options', settings: { drop_cap: true, recto_start: false, running_header: true, header_title: 'Header', isbn: '9781234567897', paper: 'cream', parts: ALL_PARTS }, data: { book: { trim: '8.5x11' } } },
    { name: 'unicode-emoji', settings: { style: 'warm', contents_sections: true, parts: ALL_PARTS }, data: UNICODE },
    { name: 'links', settings: { parts: ALL_PARTS }, data: LINKS },
    { name: 'lists-quotes', settings: { style: 'modern', parts: ALL_PARTS }, data: LISTS },
    { name: 'hostile', settings: { contents_sections: true, parts: ALL_PARTS }, data: HOSTILE },
    { name: 'headings-untitled', settings: { contents_sections: true, parts: ALL_PARTS }, data: HEADINGS },
    { name: 'format-chars', settings: { style: 'clean', parts: ALL_PARTS }, data: FORMAT },
    { name: 'long-200', settings: { contents_sections: true, parts: ALL_PARTS }, data: longBook() }
  );

  root.kdpEpubBooks = { NOW, BOOK_ID, ALSO_BY, ALL_PARTS, data, sec, golden, UNICODE, LINKS, LISTS, HOSTILE, HEADINGS, FORMAT, FORMAT_CHARS, FORMAT_SAMPLES, longBook };
})(globalThis);
