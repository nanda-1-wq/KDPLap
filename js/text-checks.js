/* ═══════════════════════════════════════════════════
   KDP Lab — Code checks of a section's text (step 06 Checks tab, E10.4)
   /js/text-checks.js   (used by js/write-checks.js; needs js/sentences.js
                         and js/word-budget.js; tested by tests/text-checks.test.js)

   What our code checks in the browser, live and free. Never the AI.

   kdpTextChecks.check(md, { known, target }) → { rows, warnings }
     rows, in this order (every offset is in md, so "Show" can select it):
       marks    open " [Verify: no source]" marks: one row, each sentence listed
       number   claim numbers with no source and no mark (the server's rule)
       repeat   phrases of 3 to 6 words used 3 or more times (at most 5 rows)
       opener   3 or more sentences in a row that start with the same word
       words    under 80% or over 120% of the section's word target
     each row: { code, kind: 'warn' | 'info', text, sub, ranges: [{ start, end }],
                 sents: [{ start, end, text }] (marks, and numbers when more than one) }
     warnings: the number of 'warn' rows (the Checks tab count; the words row
       is 'info' and never counted, owner decision 6).
   kdpTextChecks.mark(text, known) → { text, flagged }: a copy of the server's
     markUnsourced (generate/lib/section_write.ts); a parity test runs both.
   kdpTextChecks.knownOf(brief, research, chapters) → the author's sources as
     text: a copy of the server's writeKnown (Brief, Research, the outline).
═══════════════════════════════════════════════════ */

(function (root) {
  const MARKER = '[Verify: no source]';
  const split = (line) => root.kdpSentences.split(line);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  /* ── The number rule: the same as generate/lib/common.ts and lib/section_write.ts ── */

  const numbersIn = (s) => [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, ''));
  const FIGURES_OF_SPEECH = /(?<![\d.,/])(?:9(?:-to-| to )5|24\/7\/365|24\/7|24-7|1-on-1|50\/50|20\/20)(?![\d/]|[.,]\d)/gi;
  const withoutFigures = (s) => s.replace(FIGURES_OF_SPEECH, ' ');
  const SECTION_WORDS = /(?:\b(?:sections?|chapters?|parts?|steps?|see)|§)\s*(?:\d+(?:\.\d+)*\s*(?:,|and|or|to|-|–)\s*)*$/i;
  const CLAIM_WORDS = /\b(?:stud(?:y|ies)|research(?:ers?)?|surveys?|data|evidence)\b/i;

  /** Claim numbers in one sentence that the sources do not have: [{ n, shown }]. */
  function claimNumbers(sentence, have) {
    const s = withoutFigures(sentence).replace(/^(\s*(?:[-*]\s+)?)\d+[.)](?=\s)/, '$1');
    const claim = CLAIM_WORDS.test(s);
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
      if (claim || percent || money || decimal || Number(n) >= 100) {
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

  function repeats(md, lines) {
    // Words of each sentence (never across sentences or lines), with offsets; markers are not words.
    const sents = [];
    for (const l of lines) {
      if (l.kind === 'blank') continue;
      for (const s of l.sents) {
        const body = md.slice(s.start, s.end);
        const words = [];
        let skip = l.kind === 'item' && s.start === l.from + (l.text.length - l.text.trimStart().length) ? (body.match(ITEM) || [''])[0].length : 0;
        if (l.kind === 'heading') skip = (body.match(HEADING) || [''])[0].length;
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
      if (occ.length < 3 || key.split(' ').every((w) => COMMON.has(w))) continue;
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
      code: 'repeat', kind: 'warn',
      text: `"${md.slice(u.start, u.end).replace(/\s+/g, ' ')}" used ${fmt(f.uses.length)} times`, sub: '',
      ranges: f.uses.map((x) => ({ start: x.start, end: x.end })), sents: []
      };
    });
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

  /* ── All five ── */

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

    // 3. Repeated phrases. 4. Same opener.
    rows.push(...repeats(text, lines), ...openers(text, lines));

    // 5. Words vs the target (advice, never counted).
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

  root.kdpTextChecks = { check, mark, knownOf, plural, MARKER };
})(globalThis);
