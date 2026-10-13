/* ═══════════════════════════════════════════════════
   KDP Lab — Sentences of a section's text (E10.3, Improve menu)
   /js/sentences.js   (used by js/write-improve.js;
                       tested by tests/sentences.test.js)

   kdpSentences.split(line)  → a line cut into sentences. The same rule as
     sentencesOf in supabase/functions/generate/lib/section_write.ts (a parity
     test runs both): a sentence ends at . ! or ? (with closing quotes and an
     existing " [Verify: no source]") before a space and a capital letter, or
     at the line end; not after "a.m.", "e.g.", "Dr.", a decimal or a list
     number. Joined back, the parts give the line exactly.
   kdpSentences.snap(md, start, end) → { start, end, text, sentences } or null.
     Markdown offsets of the selection, moved out to whole sentences: the start
     back to its sentence start, the end forward to its sentence end (its
     marker and closing quotes included). A heading line is one sentence. A
     start at a line's first sentence takes the line marker ("## ", "- ",
     "1. ") too. Blank edges are trimmed. null when nothing is left.
   kdpSentences.context(md, start, end) → { before, after }: about 300 words
     of the text on each side, at most 2,500 characters, cut to a sentence or
     paragraph edge (the server's tailText rule). Empty at the section edges.
═══════════════════════════════════════════════════ */

(function (root) {
  // Same as generate/lib/section_write.ts (SENTENCE_END, ABBREVIATIONS, endsSentence).
  const SENTENCE_END = /[.!?]+["”’)\]]*(?:\s*\[Verify: no source\])?(?=\s+["“‘(]?[A-Z]|\s*$)/g;
  const ABBREVIATIONS = new Set('mr mrs ms dr prof st jr sr vs etc approx no fig vol inc ltd co ca'.split(' '));
  // Same as js/markdown-lite.js HEADING.
  const HEADING = /^#{1,6}[ \t]+/;
  // About 300 words on each side, at most 2,500 characters (generate/lib/limits.ts IMPROVE.contextChars).
  const CONTEXT = { words: 300, chars: 2500 };

  function endsSentence(line, at) {
    if (line[at] !== '.') return true;
    const word = (line.slice(0, at).match(/\S+$/) || [''])[0];
    const bare = word.replace(/^["“‘(]+/, '');
    if (/^\d+$/.test(bare)) return !/^\s*(?:[-*]\s+)?$/.test(line.slice(0, at - word.length));
    return !(/^[A-Za-z](?:\.[A-Za-z])*$/.test(bare) || ABBREVIATIONS.has(bare.toLowerCase()));
  }

  function split(line) {
    const out = [];
    let start = 0;
    for (const m of line.matchAll(SENTENCE_END)) {
      const end = m.index + m[0].length;
      if (line.slice(end).trim() && !endsSentence(line, m.index)) continue;
      out.push(line.slice(start, end));
      start = end;
    }
    if (start < line.length) out.push(line.slice(start));
    return out;
  }

  /** The line around offset `at`: { from, to, text }. */
  function lineAt(md, at) {
    const from = md.lastIndexOf('\n', at - 1) + 1;
    let to = md.indexOf('\n', at);
    if (to < 0) to = md.length;
    return { from, to, text: md.slice(from, to) };
  }

  /** The sentence of `line` that holds offset `at` (from the line start), with its spaces trimmed. */
  function sentenceAt(line, at) {
    let pos = 0;
    const parts = split(line.text);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const end = pos + p.length;
      if (at < end || i === parts.length - 1) {
        const lead = p.length - p.trimStart().length;
        const trail = p.length - p.trimEnd().length;
        return { first: i === 0, from: line.from + pos + lead, to: line.from + end - trail };
      }
      pos = end;
    }
    return { first: true, from: line.from, to: line.to };
  }

  /** Sentences in a passage: a heading line is one, other lines by the rule. */
  function countSentences(text) {
    let n = 0;
    for (const l of text.split('\n')) {
      if (!l.trim()) continue;
      n += HEADING.test(l) ? 1 : split(l).filter((s) => s.trim()).length;
    }
    return n;
  }

  function snap(md, start, end) {
    let s = Math.max(0, Math.min(start, end, md.length));
    let e = Math.min(md.length, Math.max(start, end, 0));
    // Blank edges first, so a space or a blank line never pulls in a whole sentence.
    while (s < e && /\s/.test(md[s])) s++;
    while (e > s && /\s/.test(md[e - 1])) e--;
    if (s >= e) return null;
    const ls = lineAt(md, s);
    if (HEADING.test(ls.text)) s = ls.from;
    else {
      const x = sentenceAt(ls, s - ls.from);
      s = x.first ? ls.from : x.from;
    }
    const le = lineAt(md, e - 1);
    if (HEADING.test(le.text)) e = le.to;
    else e = Math.max(e, sentenceAt(le, e - 1 - le.from).to);
    while (s < e && /\s/.test(md[s])) s++;
    while (e > s && /\s/.test(md[e - 1])) e--;
    if (s >= e) return null;
    const text = md.slice(s, e);
    return { start: s, end: e, text, sentences: countSentences(text) };
  }

  /** The last `words` words of `text`, at most `chars` characters, starting at a paragraph or sentence (tailText). */
  function tail(text, words, chars) {
    const t = String(text || '').trim();
    const ws = [...t.matchAll(/\S+/g)];
    const from = ws.length > words ? ws[ws.length - words].index : 0;
    const max = Math.min(chars, t.length - from);
    if (t.length <= max) return t;
    const cut = t.slice(t.length - max);
    const para = cut.indexOf('\n\n');
    if (para >= 0 && para < max / 2) return cut.slice(para + 2).trim();
    const sentence = cut.search(/[.!?]\s+\S/);
    if (sentence >= 0 && sentence < max / 2) return cut.slice(sentence + 1).trim();
    return cut.replace(/^\S*\s+/, '').trim();
  }

  /** The first `words` words of `text`, at most `chars` characters, ending at a paragraph or sentence. */
  function head(text, words, chars) {
    const t = String(text || '').trim();
    const ws = [...t.matchAll(/\S+/g)];
    const to = ws.length > words ? ws[words - 1].index + ws[words - 1][0].length : t.length;
    const max = Math.min(chars, to);
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const para = cut.lastIndexOf('\n\n');
    if (para > max / 2) return cut.slice(0, para).trim();
    let end = -1;
    for (const m of cut.matchAll(/[.!?]["”’)\]]*(?:\s*\[Verify: no source\])?(?=\s)/g)) end = m.index + m[0].length;
    if (end > max / 2) return cut.slice(0, end).trim();
    return cut.replace(/\s+\S*$/, '').trim();
  }

  function context(md, start, end) {
    return { before: tail(md.slice(0, start), CONTEXT.words, CONTEXT.chars), after: head(md.slice(end), CONTEXT.words, CONTEXT.chars) };
  }

  root.kdpSentences = { split, snap, context, countSentences, CONTEXT };
})(globalThis);
