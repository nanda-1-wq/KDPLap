/* ═══════════════════════════════════════════════════
   KDP Lab — Code checks of a section's text (step 06 Checks tab, E10.4)
   /js/text-checks.js   (used by js/write-checks.js; needs js/sentences.js
                         and js/word-budget.js; tested by tests/text-checks.test.js)

   What our code checks in the browser, live and free. Never the AI.

   kdpTextChecks.check(md, { known, target, title, others }) → { rows, warnings }
     rows, in this order (every offset is in md, so "Show" can select it):
       marks    open " [Verify: no source]" marks: one row, each sentence listed
       number   claim numbers with no source and no mark (the server's rule)
       ending   the text ends mid-sentence (E12 M9; "Show" selects the cut piece)
       mention  sentences that preview or number another part of the book (E12 Part 3)
       source   a source label left in the text ("[S3]") or a source with no
                name ("another source suggests"; E12 fix batch 2, items 9, 10)
       again    sentences of 8 or more words that another section also has
                (opts.others; E12 fix batch 2, item 11 A); each sent has where
       repeat   phrases of 3 to 6 words used 3 or more times (at most 5 rows);
                'info', never counted, and never the words of the section
                title (opts.title) or its own subheadings (fix batch 2, item 7)
       opener   3 or more sentences in a row that start with the same word
       words    under 80% or over 120% of the section's word target
     each row: { code, kind: 'warn' | 'info', text, sub, ranges: [{ start, end }],
                 sents: [{ start, end, text }] (marks, and numbers when more than one) }
     warnings: the number of 'warn' rows (the Checks tab count; the words row
       is 'info' and never counted, owner decision 6).
   kdpTextChecks.mark(text, known) → { text, flagged }: a copy of the server's
     markUnsourced (generate/lib/numbers.ts, E12 step 2); a parity test runs both.
   kdpTextChecks.ending(md) → null, or { start, end, text } of the cut last
     piece when the text ends mid-sentence: the server's endsMidSentence
     (generate/lib/section_write.ts) on the text without source labels; a
     parity test runs both.
   kdpTextChecks.knownOf(brief, research, chapters) → the author's sources as
     text: a copy of the server's writeKnown (Brief, Research, the outline).
   kdpTextChecks.stripLabels(md) → the text without source labels: a copy of
     the server's stripSourceLabels (generate/lib/section_write.ts); the
     Export strips them too. SOURCE_LABEL is the shared pattern (parity test).
   kdpTextChecks.sentenceKeys(md) → [{ key, start, end, text }] for every
     sentence of 8 or more words in paragraphs and list items: key = its
     words in lower case (marks, labels and punctuation left out).
   kdpTextChecks.bookRepeats(md, others) → [{ start, end, text, where }]: the
     sentences of md that a section in others ([{ label, text }]) also has.
═══════════════════════════════════════════════════ */

(function (root) {
  const MARKER = '[Verify: no source]';
  const split = (line) => root.kdpSentences.split(line);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  /* ── The number rule: the same as generate/lib/numbers.ts (E12 step 2: one rule for every stage) ── */

  const numbersIn = (s) => [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, ''));
  const FIGURES_OF_SPEECH = /(?<![\d.,/])(?:9(?:-to-| to )5|24\/7\/365|24\/7|24-7|1-on-1|50\/50|20\/20)(?![\d/]|[.,]\d)/gi;
  const withoutFigures = (s) => s.replace(FIGURES_OF_SPEECH, ' ');
  const SECTION_WORDS = /(?:\b(?:sections?|chapters?|parts?|steps?|see)|§)\s*(?:\d+(?:\.\d+)*\s*(?:,|and|or|to|-|–)\s*)*$/i;
  const CLAIM_WORDS = /\b(?:stud(?:y|ies)|research(?:ers?)?|surveys?|data|evidence|proven|proves?)\b/i;
  // A unit counts only in a sentence with a result word (owner, STOP 1 decision 1).
  const UNITS = new Set(('pound pounds lb lbs kg kgs kilo kilos kilogram kilograms gram grams oz ounce ounces stone ' +
    'inch inches cm centimeter centimeters centimetre centimetres mm foot feet ft meter meters metre metres mile miles km ' +
    'kilometer kilometers calorie calories kcal mg ml liter liters litre litres bmi mmhg bpm').split(' '));
  const RESULT_WORDS = /\b(?:los(?:e|es|ing|t)|drop(?:s|ped|ping)?|cut(?:s|ting)?|reduc(?:e|es|ed|ing)|lower(?:s|ed|ing)?|burn(?:s|ed|t|ing)?|gain(?:s|ed|ing)?|shed(?:s|ding)?|boost(?:s|ed|ing)?|improv(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing))\b/i;
  // Book parts: a decimal or a number of 100 or more that counts these is a plan ("120 seconds"). Not "times".
  const PART_WORDS = new Set(('move moves step steps week weeks day days minute minutes chapter chapters month months hour hours ' +
    'second seconds pose poses exercise exercises routine routines stretch stretches pattern patterns breath breaths ' +
    'habit habits lesson lessons tip tips way ways part parts session sessions rule rules question questions set sets ' +
    'rep reps recipe recipes tool tools worksheet worksheets plan plans level levels phase phases stage stages ' +
    'check checks idea ideas').split(' '));

  /** Claim numbers in one sentence that the sources do not have: [{ n, shown }]. */
  function claimNumbers(sentence, have) {
    const s = withoutFigures(sentence).replace(/^(\s*(?:[-*]\s+)?)\d+[.)](?=\s)/, '$1');
    const claim = CLAIM_WORDS.test(s);
    const result = RESULT_WORDS.test(s);
    const out = [];
    for (const m of s.matchAll(/(?<![A-Za-z\d.,])([$£€]\s*)?(\d+(?:[.,]\d+)*)/g)) {
      const n = m[2].replace(/,(?=\d{3}\b)/g, '');
      const before = s.slice(0, m.index);
      const after = s.slice(m.index + m[0].length);
      const ofM = after.match(/^\s+(?:in|out of)\s+(\d+(?:,\d{3})*)\b/i);
      const of = ofM ? ofM[1].replace(/,/g, '') : null;
      if (of && !have.has(`${n} in ${of}`)) { out.push({ n: `${n} in ${of}`, shown: `${m[0]}${ofM[0]}` }); continue; }
      if (have.has(n) || out.some((x) => x.n === n)) continue;
      const rest = after.replace(/^\s*(?:to|-|–)\s*[$£€]?\d+(?:[.,]\d+)*/i, '');
      const pm = rest.match(/^\s*(?:%|percent\b|per cent\b)/i);
      const percent = !!pm;
      const money = !!m[1] || /^\s*(?:dollars?|usd|euros?|cents?)\b/i.test(rest);
      const decimal = /[.,]/.test(n);
      if (!percent && !money) {
        if (/^\s*(?:[ap]\.?m\b|o'clock)/i.test(after) || /^:\d/.test(after) || /\d:$/.test(before)) continue;
        if (decimal && (SECTION_WORDS.test(before) || (/\(\s*$/.test(before) && /^\s*\)/.test(after)))) continue;
      }
      const um = rest.match(/^[\s-]*([A-Za-z]+)/);
      const unit = UNITS.has((um ? um[1] : '').toLowerCase());
      const words = (rest.match(/[A-Za-z]+/g) || []).slice(0, 2).map((w) => w.toLowerCase());
      const bw = before.match(/([A-Za-z]+)[\s-]*$/);
      const part = words.some((w) => PART_WORDS.has(w)) || PART_WORDS.has((bw ? bw[1] : '').toLowerCase());
      if (claim || percent || money || (unit && result) || ((decimal || Number(n) >= 100) && !part)) {
        const range = after.length - rest.length;
        out.push({ n, shown: m[0] + after.slice(0, range) + (pm && pm[0].trim() === '%' ? '%' : '') });
      }
    }
    return out;
  }

  function haveOf(known) {
    const ratios = [...known.matchAll(/(?<![\d.,])(\d+(?:,\d{3})*)\s+(?:in|out of)\s+(\d+(?:,\d{3})*)\b/gi)]
      .map((m) => `${m[1].replace(/,/g, '')} in ${m[2].replace(/,/g, '')}`);
    return new Set([...numbersIn(known), ...ratios]);
  }

  /** The server's markUnsourced, line for line. */
  function mark(text, known) {
    const have = haveOf(String(known || ''));
    const out = String(text || '').split('\n').map((line) => {
      if (!line.trim() || /^##\s/.test(line)) return line;
      return split(line).map((p) => {
        if (p.includes(MARKER) || !/\d/.test(p) || !claimNumbers(p, have).length) return p;
        const sentence = p.replace(/\s+$/, '');
        return `${sentence} ${MARKER}${p.slice(sentence.length)}`;
      }).join('');
    }).join('\n');
    return { text: out, flagged: out.split(MARKER).length - 1 };
  }

  /** The server's writeKnown: knownText (Brief, Research) + the outline's titles and objectives. */
  function knownOf(brief, research, chapters) {
    const b = brief || {};
    const o = obj(b.options);
    const r = research || {};
    const ins = obj(r.insights);
    const lines = (v) => (Array.isArray(v) ? v : []).map((x) => str(obj(x).text)).filter(Boolean);
    const known = [
      b.topic_text, b.target_reader, b.reader_problem, b.promise_draft, str(o.stance), str(o.standout), str(o.references),
      ...lines(ins.loves), ...lines(ins.hates), ...lines(ins.gaps),
      ...(r.competitors || []).map((c) => c.title),
      ...(r.sources || []).flatMap((s) => [s.body, s.citation])
    ].map((t) => str(t)).join('\n');
    const outline = (chapters || []).flatMap((c) => [c.title, c.objective, ...(c.sections || []).map((s) => s.title)]).map((t) => str(t));
    return [known, ...outline].join('\n');
  }

  /* ── Ends mid-sentence (E12 M9): the server's endsMidSentence, line for line ── */

  /**
   * null when the text ends complete; else the cut last piece of the last
   * paragraph { start, end, text } (offsets in md). The last line with text
   * counts: a heading or a list item is complete; a paragraph needs . ! ? or …
   * at its end, Verify marks, closing quotes, brackets and * or _ aside.
   */
  function ending(md) {
    const text = String(md || '');
    const lines = text.split('\n');
    let i = lines.length - 1;
    // Source labels are not text (fix batch 2, item 9): "…the minimum. [S3]" ends complete. The server
    // never saves a label, so this is its endsMidSentence on the text without labels.
    while (i >= 0 && !stripLabels(lines[i].split(MARKER).join('')).trim()) i--;
    if (i < 0) return null;
    const last = lines[i];
    if (/^\s*#{1,6}\s/.test(last) || /^\s*(?:[-+*]|[0-9]{1,9}[.)])\s/.test(last)) return null;
    if (/[.!?…]$/.test(stripLabels(last.split(MARKER).join('')).replace(/[\s"'”’)\]*_]+$/u, ''))) return null;
    const from = lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
    const parts = split(last);
    const piece = parts[parts.length - 1];
    const at = from + last.length - piece.length;
    const lead = piece.length - piece.trimStart().length, trail = piece.length - piece.trimEnd().length;
    return { start: at + lead, end: at + piece.length - trail, text: piece.trim() };
  }

  /* ── Mentions another part of the book (E12 Part 3) ── */

  // A preview or a section or chapter number: the file has no section numbers and no
  // previews. Back references ("earlier in this book") are fine. Whole words, any case.
  const MENTION = /\b(?:next\s+(?:section|chapter)|following\s+(?:section|chapter)|later\s+in\s+(?:this|the)\s+book|later\s+in\s+this\s+chapter|(?:section|chapter)\s+\d+(?:\.\d+)?)\b/i;

  /* ── Sources with no name (E12 fix batch 2, items 9 and 10) ── */

  // A source label the AI left in the text: the same pattern as the server's
  // SOURCE_LABEL (generate/lib/section_write.ts; tests/text-checks.test.js).
  const SOURCE_LABEL = /[ \t]*[[(]S\d{1,3}(?:[ \t]*[,;–-][ \t]*S?\d{1,3})*[\])]/g;
  // A source with no name: "another source", "other sources" always; "a source" or
  // "one source" only before a reporting word ("a source of stress" is fine).
  const VAGUE_SOURCE = /\b(?:another|the\s+other)\s+sources?\b|\bother\s+sources\b|\b(?:a|one|some)\s+sources?\s+(?:says?|suggests?|shows?|puts?|notes?|found|finds|explains?|argues?|reports?|states?|recommends?|adds?|claims?)\b/i;

  /** The text without source labels: the server's stripSourceLabels. */
  function stripLabels(md) {
    return String(md || '').split('\n').map((l) => {
      const out = l.replace(SOURCE_LABEL, '');
      if (out === l) return l;
      const lead = l.match(/^[ \t]*/)[0];
      return lead + out.slice(lead.length).replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    }).join('\n');
  }

  /* ── Lines and sentences with their offsets ── */

  const HEADING = /^#{1,6}[ \t]+/;
  const ITEM = /^[ \t]*(?:[-+*]|[0-9]{1,9}[.)])[ \t]+/;

  /** Every line: { from, text, kind: 'blank' | 'heading' | 'item' | 'para', sents: [{ start, end, text }] } (sentences trimmed). */
  function linesOf(md) {
    const out = [];
    let from = 0;
    for (const text of md.split('\n')) {
      const kind = !text.trim() ? 'blank' : HEADING.test(text) ? 'heading' : ITEM.test(text) ? 'item' : 'para';
      const sents = [];
      if (kind !== 'blank') {
        let pos = 0;
        for (const p of kind === 'heading' ? [text] : split(text)) {
          const lead = p.length - p.trimStart().length, trail = p.length - p.trimEnd().length;
          if (p.trim()) sents.push({ start: from + pos + lead, end: from + pos + p.length - trail, text: p.trim() });
          pos += p.length;
        }
      }
      out.push({ from, text, kind, sents });
      from += text.length + 1;
    }
    return out;
  }

  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const clean = (t) => t.split(MARKER).join('').replace(/\s+/g, ' ').trim();

  /* ── Repeated phrases ── */

  // Phrases made only of these words are never reported ("in the", "you can do").
  const COMMON = new Set(('a an the and or but nor so yet of to in on at by for with from into onto about as than then there here this that these those ' +
    'it its is are was were be been being am do does did done can could will would should may might must have has had ' +
    'i me my we us our you your yours he him his she her they them their what when where which who how why if not no ' +
    'all any each every more most some up out over just very too also one').split(' '));
  const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

  // A word and its singular forms ("habits" → "habit", "touches" → "touch"), to match the title's words.
  const forms = (w) => [w, w.replace(/'s$/, ''), w.replace(/s$/, ''), w.replace(/es$/, '')];

  function repeats(md, lines, title) {
    // The section's own topic (fix batch 2, item 7): the words of its title and its own subheadings.
    const topic = new Set();
    const addWords = (t) => { for (const m of String(t || '').matchAll(WORD)) forms(m[0].toLowerCase().replace(/’/g, "'")).forEach((f) => topic.add(f)); };
    addWords(title);
    for (const l of lines) if (l.kind === 'heading') addWords(l.text.replace(HEADING, ''));
    const isTopic = (w) => COMMON.has(w) || forms(w).some((f) => topic.has(f));
    // Words of each sentence (never across sentences or lines), with offsets; markers are not words.
    // Headings are not uses (fix batch 2, item 7).
    const sents = [];
    for (const l of lines) {
      if (l.kind === 'blank' || l.kind === 'heading') continue;
      for (const s of l.sents) {
        const body = md.slice(s.start, s.end);
        const words = [];
        const skip = l.kind === 'item' && s.start === l.from + (l.text.length - l.text.trimStart().length) ? (body.match(ITEM) || [''])[0].length : 0;
        const masked = body.split(MARKER).join(' '.repeat(MARKER.length));
        for (const m of masked.slice(skip).matchAll(WORD)) words.push({ w: m[0].toLowerCase().replace(/’/g, "'"), start: s.start + skip + m.index, end: s.start + skip + m.index + m[0].length });
        if (words.length >= 3) sents.push(words);
      }
    }
    // Every phrase of 3 to 6 words; longer ones only where the 3-word start repeats (speed).
    const seen3 = new Map();
    for (const ws of sents) for (let i = 0; i + 3 <= ws.length; i++) { const k = `${ws[i].w} ${ws[i + 1].w} ${ws[i + 2].w}`; seen3.set(k, (seen3.get(k) || 0) + 1); }
    const groups = new Map();   // key → [{ si, i, start, end }]
    sents.forEach((ws, si) => {
      for (let i = 0; i + 3 <= ws.length; i++) {
        if ((seen3.get(`${ws[i].w} ${ws[i + 1].w} ${ws[i + 2].w}`) || 0) < 3) continue;
        let key = '';
        for (let n = 1; n <= 6 && i + n <= ws.length; n++) {
          key = n === 1 ? ws[i].w : `${key} ${ws[i + n - 1].w}`;
          if (n < 3) continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ si, i, n, start: ws[i].start, end: ws[i + n - 1].end });
        }
      }
    });
    const found = [];
    for (const [key, occ] of groups) {
      if (occ.length < 3 || key.split(' ').every(isTopic)) continue;
      // Uses that do not overlap.
      const kept = [];
      for (const o of occ) {
        const last = kept[kept.length - 1];
        if (last && last.si === o.si && o.i < last.i + o.n) continue;
        kept.push(o);
      }
      if (kept.length >= 3) found.push({ key, n: kept[0].n, uses: kept });
    }
    // A shorter phrase inside a longer reported one with the same count is left out.
    found.sort((a, b) => b.n - a.n || b.uses.length - a.uses.length);
    const out = [];
    for (const f of found) {
      if (out.some((g) => g.uses.length === f.uses.length && ` ${g.key} `.includes(` ${f.key} `))) continue;
      out.push(f);
    }
    out.sort((a, b) => b.uses.length - a.uses.length || b.n - a.n || a.uses[0].start - b.uses[0].start);
    return out.slice(0, 5).map((f) => {
      // Shown as written, preferring a use that does not start a sentence ("roll your shoulders", not "Roll").
      const u = f.uses.find((x) => x.i > 0) || f.uses[0];
      return {
      code: 'repeat', kind: 'info',
      text: `"${md.slice(u.start, u.end).replace(/\s+/g, ' ')}" used ${fmt(f.uses.length)} times`, sub: '',
      ranges: f.uses.map((x) => ({ start: x.start, end: x.end })), sents: []
      };
    });
  }

  /* ── The same sentence in another section (E12 fix batch 2, item 11 A) ── */

  const AGAIN_MIN_WORDS = 8;

  /** Every sentence of 8 or more words in paragraphs and list items, with its key. */
  function sentenceKeys(md) {
    const text = String(md || '');
    const out = [];
    for (const l of linesOf(text)) {
      if (l.kind !== 'para' && l.kind !== 'item') continue;
      for (const st of l.sents) {
        const words = [...stripLabels(clean(st.text).replace(ITEM, '')).matchAll(WORD)].map((m) => m[0].toLowerCase().replace(/’/g, "'"));
        if (words.length >= AGAIN_MIN_WORDS) out.push({ key: words.join(' '), start: st.start, end: st.end, text: clean(st.text).replace(ITEM, '') });
      }
    }
    return out;
  }

  /** The sentences of md that another section also has: [{ start, end, text, where: [labels] }]. */
  function bookRepeats(md, others) {
    const seen = new Map();   // key → labels
    for (const o of others || []) {
      for (const k of sentenceKeys(o.text)) {
        const list = seen.get(k.key) || [];
        if (!list.includes(o.label)) list.push(o.label);
        seen.set(k.key, list);
      }
    }
    if (!seen.size) return [];
    return sentenceKeys(md).filter((k) => seen.has(k.key)).map((k) => ({ start: k.start, end: k.end, text: k.text, where: seen.get(k.key) }));
  }

  /* ── Same opener ── */

  function openers(md, lines) {
    const rows = [];
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        rows.push({
          code: 'opener', kind: 'warn', text: `${fmt(run.length)} sentences in a row start with "${run[0].shown}".`, sub: '',
          ranges: [{ start: run[0].s.start, end: run[run.length - 1].s.end }], sents: []
        });
      }
      run = [];
    };
    for (const l of lines) {
      if (l.kind === 'blank') continue;
      if (l.kind !== 'para') { flush(); continue; }
      for (const s of l.sents) {
        const m = s.text.split(MARKER).join(' ').match(/[\p{L}]+(?:['’][\p{L}]+)*/u);
        if (!m) { flush(); continue; }
        const w = m[0].toLowerCase();
        if (run.length && run[0].w !== w) flush();
        run.push({ w, shown: m[0], s });
      }
    }
    flush();
    return rows;
  }

  /* ── All nine ── */

  function check(md, opts = {}) {
    const text = String(md || '');
    const rows = [];
    if (!text.trim()) return { rows, warnings: 0, empty: true };
    const lines = linesOf(text);
    const have = haveOf(String(opts.known || ''));

    // 1. Open marks.
    const marked = [];
    for (const l of lines) for (const s of l.sents) if (s.text.includes(MARKER)) marked.push(s);
    if (marked.length) {
      rows.push({ code: 'marks', kind: 'warn', text: marked.length === 1 ? '1 claim needs a source' : `${fmt(marked.length)} claims need a source`, sub: '',
        ranges: marked.map((s) => ({ start: s.start, end: s.end })), sents: marked.map((s) => ({ start: s.start, end: s.end, text: clean(s.text) })) });
    }

    // 2. Numbers with no source and no mark: exactly the sentences mark() would mark
    // (the same split, the same "## " rule), with their offsets.
    const nums = [];
    for (const l of lines) {
      if (!l.text.trim() || /^##\s/.test(l.text)) continue;
      let pos = 0;
      for (const p of split(l.text)) {
        const at = pos;
        pos += p.length;
        if (p.includes(MARKER) || !/\d/.test(p)) continue;
        const c = claimNumbers(p, have);
        if (!c.length) continue;
        const lead = p.length - p.trimStart().length, trail = p.length - p.trimEnd().length;
        const s = { start: l.from + at + lead, end: l.from + at + p.length - trail, text: p.trim() };
        nums.push({ s, shown: c[0].shown.trim() });
      }
    }
    if (nums.length) {
      rows.push({
        code: 'number', kind: 'warn',
        text: nums.length === 1 ? `"${nums[0].shown}" has no source` : `${fmt(nums.length)} numbers have no source`,
        sub: 'Add a source in 02 Research, or mark it.',
        ranges: nums.map((x) => ({ start: x.s.start, end: x.s.end })),
        sents: nums.length > 1 ? nums.map((x) => ({ start: x.s.start, end: x.s.end, text: clean(x.s.text) })) : []
      });
    }

    // 3. Ends mid-sentence (E12 M9): a stopped Generate, or a cut by hand.
    const cut = ending(text);
    if (cut) {
      rows.push({ code: 'ending', kind: 'warn', text: 'The section ends mid-sentence.', sub: 'Finish the last sentence or cut it.',
        ranges: [{ start: cut.start, end: cut.end }], sents: [] });
    }

    // 4. Mentions another part of the book (E12 Part 3): paragraphs and list items, each sentence once.
    const mentions = [];
    for (const l of lines) {
      if (l.kind !== 'para' && l.kind !== 'item') continue;
      for (const st of l.sents) if (MENTION.test(clean(st.text))) mentions.push(st);
    }
    if (mentions.length) {
      rows.push({ code: 'mention', kind: 'warn', text: 'Mentions another part of the book', sub: 'Cut it, or say what that part covers.',
        ranges: mentions.map((st) => ({ start: st.start, end: st.end })), sents: mentions.map((st) => ({ start: st.start, end: st.end, text: clean(st.text) })) });
    }

    // 5. Source not named (fix batch 2, items 9 and 10): each label (Show selects just the label;
    // the list shows it with its sentence), and each sentence with a source that has no name.
    const unnamed = [];
    /** From `at`, past spaces and any labels, to where the words start. */
    const afterLabels = (at, to) => {
      for (;;) {
        while (at < to && /\s/.test(text[at])) at++;
        const m = text.slice(at, to).match(/^[[(]S\d{1,3}(?:[ \t]*[,;–-][ \t]*S?\d{1,3})*[\])]/);
        if (!m) return at;
        at += m[0].length;
      }
    };
    for (const l of lines) {
      if (l.kind !== 'para' && l.kind !== 'item') continue;
      for (const st of l.sents) {
        const body = text.slice(st.start, st.end);
        // Each label; one right after an end mark closes that sentence ("…the minimum. [S3] Another…"),
        // so the text is cut there into parts.
        const labels = [...body.matchAll(SOURCE_LABEL)].map((m) => ({
          start: st.start + m.index + (m[0].length - m[0].trimStart().length), end: st.start + m.index + m[0].length,
          closes: /[.!?…]["'”’)\]*_]*$/.test(body.slice(0, m.index).trimEnd())
        }));
        const parts = [];
        let from = st.start;
        for (const g of labels) if (g.closes) { parts.push({ start: from, end: g.end }); from = g.end; }
        if (from < st.end) parts.push({ start: from, end: st.end });
        // The list shows each label with its part; Show selects just the label.
        for (const g of labels) {
          const p = parts.find((x) => x.start <= g.start && g.start < x.end) || parts[parts.length - 1];
          unnamed.push({ start: g.start, end: g.end, text: clean(text.slice(afterLabels(p.start, p.end), p.end)).replace(ITEM, '') });
        }
        // A source with no name: the part from its first word.
        for (const p of parts) {
          const a = afterLabels(p.start, p.end);
          if (a < p.end && VAGUE_SOURCE.test(clean(text.slice(a, p.end)))) unnamed.push({ start: a, end: p.end, text: clean(text.slice(a, p.end)).replace(ITEM, '') });
        }
      }
    }
    if (unnamed.length) {
      unnamed.sort((a, b) => a.start - b.start);
      rows.push({ code: 'source', kind: 'warn', text: 'Source not named', sub: 'Name the author or the title, or cut the label.',
        ranges: unnamed.map((u) => ({ start: u.start, end: u.end })), sents: unnamed });
    }

    // 6. The same sentence in another section (fix batch 2, item 11 A).
    const again = bookRepeats(text, opts.others);
    if (again.length) {
      rows.push({ code: 'again', kind: 'warn', text: again.length === 1 ? '1 sentence is also in another section' : `${fmt(again.length)} sentences are also in another section`,
        sub: 'Rewrite it here or cut it.', ranges: again.map((a) => ({ start: a.start, end: a.end })), sents: again });
    }

    // 7. Repeated phrases (info, fix batch 2). 8. Same opener.
    rows.push(...repeats(text, lines, opts.title), ...openers(text, lines));

    // 9. Words vs the target (advice, never counted).
    const target = Number(opts.target) || 0;
    if (target > 0) {
      const n = root.kdpWords.count(text);
      if (n < target * 0.8 || n > target * 1.2) {
        rows.push({ code: 'words', kind: 'info', text: `${fmt(n)} of ${fmt(target)} words`, sub: n < target * 0.8 ? 'Under 80% of the target.' : 'Over 120% of the target.',
          ranges: [], sents: [] });
      }
    }
    return { rows, warnings: rows.filter((r) => r.kind === 'warn').length, empty: false };
  }

  root.kdpTextChecks = { check, mark, knownOf, ending, stripLabels, sentenceKeys, bookRepeats, SOURCE_LABEL };
})(globalThis);
