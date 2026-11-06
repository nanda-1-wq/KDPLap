/* ═══════════════════════════════════════════════════
   NicheInk · 07 Quality Control: the free checks (E14.2, plan section 5)
   /js/qc-rules.js   (used by js/book-qc.js; needs js/word-budget.js,
                      js/sentences.js, js/text-checks.js, js/export-rules.js,
                      js/section-check-key.js, js/qc-promise-key.js, js/qc-lists.js
                      and js/qc-glyphs.js; tested by tests/qc-rules.test.js)

   Pure, no DOM, no AI. It reads the whole book through the 06 and Export
   rules, so the screens never disagree. Offsets are in the version's Markdown,
   the same as 06 "Show". A quote is always the text at start, cut to 300.

   kdpQcRules.run(qcJson)   → { items, more, sources, notes, sections, words, style }
     qcJson is the qc_json() reply (migration 0028). items, more, sources and
     notes are qc_runs.results and pass qc_results_ok.
     item: { g, rule, key, section_id, version_id, start, end, message, quote }
       chapter_review has no section: its key starts with the chapter id.
     more: { "1": n, … } open issues past the caps.
     A dismissed issue never takes the place of an open one, and past a cap it
     is left out, not counted in more: more holds open issues only.
   kdpQcRules.steps(qcJson) → a generator of { group } between groups, then
     returns the same result, so the screen can yield (no frozen page).
   kdpQcRules.results(run)  → the four keys qc_runs.results holds.
   kdpQcRules.verdict(results, qcJson) → { open, marked, ready, title }
     open = items minus dismissals, plus the issues past the caps, plus the
     chapters that drift on a current promise check. Never "not ready".
   kdpQcRules.driftKey(row) → the Mark as OK key of a book_checks row.
═══════════════════════════════════════════════════ */

(function (root) {
  const T = root.kdpTextChecks;
  const R = root.kdpExportRules;
  const W = root.kdpWords;
  const L = root.kdpQcLists;
  const G = root.kdpQcGlyphs;

  const GROUPS = [1, 2, 3, 4, 5, 7];
  // Table order in plan section 5. The same list as qc_rule_ok (tests/limits-parity.test.js).
  const RULES = ['not_final', 'no_text', 'needs_review', 'chapter_review', 'under_target', 'stopped_run', 'cut_off',
    'verify_mark', 'number_no_source', 'source_not_named',
    'same_sentence', 'same_sentence_here', 'same_paragraph', 'overused_word',
    'chapter_missing', 'section_number', 'preview', 'leftover',
    'two_spellings', 'us_uk',
    'web_link', 'emoji', 'missing_char', 'length', 'disclaimer'];
  // The numbers of 0028 (tests/limits-parity.test.js). bytes stays under its 400,000: results::text adds spaces.
  const CAPS = { perGroup: 100, total: 400, sources: 50, sourceSections: 400, citation: 200, message: 300, quote: 300, key: 300, bytes: 370000, words: 1000000 };
  // Owner Q5: 4 or more letters, 20 or more uses and 25 or more per 10,000 words, at most 5 words.
  const OVERUSED = { letters: 4, uses: 20, per10k: 25, max: 5 };
  // KDP paperback page limits.
  const PAGES = { min: 24, max: 828 };
  const PARAGRAPH_MIN_WORDS = 8;
  // The 08 defaults before there is a book_formats row, equal to qc_inputs_key (tests/limits-parity.test.js).
  const DEFAULTS = { style: 'classic', copyright: true };
  const STATUS = { not_started: 'Not started', draft: 'Draft', reviewed: 'Reviewed' };

  const MARKER = '[Verify: no source]';
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const str = (v) => (typeof v === 'string' ? v : '');
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const blank = (s) => ' '.repeat(s.length);
  const code = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  const hash = (t) => root.kdpSectionCheckKey.hash(t);
  /** h() of the plan: long sentences fit in a key, and spaces and case do not change it. */
  const hText = (t) => hash(T.textKey(t) || str(t).trim());
  const hMatch = (t) => hash(str(t).trim().toLowerCase());

  /** At most n characters, never half of a surrogate pair (jsonb refuses a lone one). */
  function cut(s, n) {
    if (s.length <= n) return s;
    const t = s.slice(0, n);
    const last = t.charCodeAt(t.length - 1);
    return last >= 0xD800 && last <= 0xDBFF ? t.slice(0, -1) : t;
  }
  /** A piece of text inside a message. */
  const shown = (t, n = 60) => { const c = str(t).replace(/\s+/g, ' ').trim(); return c.length > n ? `${cut(c, n - 1).trimEnd()}…` : c; };

  /** A key that always fits: a very long form is hashed. */
  const keyOf = (k) => (k.length <= CAPS.key ? k : `${cut(k, 37)}|${hash(k)}`);

  /* ── Text of a section ── */

  // http(s)://, www., a domain with a path, an email address. A bare "example.com" is not a link.
  const LINK = /\bhttps?:\/\/[^\s<>()\]]+|\bwww\.[^\s<>()\]]+|(?<![@\w.-])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\/[^\s<>()\]]*|(?<![\w.%+-])[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
  const LINK_TAIL = /[.,;:!?'"”’*_]+$/;
  // Flags, keycaps, then one emoji with its skin tone and joined parts. © ® ™ in text form are not in it.
  const EMOJI = /\p{RI}\p{RI}|[0-9#*]\uFE0F?\u20E3|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*/gu;
  const TOKEN = /[\p{L}\p{N}]+(?:['’\-\u2010\u2011][\p{L}\p{N}]+)*/gu;
  const HEADING_LINE = /^#{1,6}[ \t].*$/gm;
  const LETTERS = /^\p{L}+$/u;
  const SKIP_CHAR = /[\s\p{Cf}]/u;

  function linksIn(md) {
    const out = [];
    for (const m of md.matchAll(LINK)) {
      const text = m[0].replace(LINK_TAIL, '');
      if (text) out.push({ start: m.index, end: m.index + text.length, text });
    }
    return out;
  }

  /** What one section holds, read once: its words without marks, labels and links. */
  function read(sec) {
    const md = sec.content;
    const links = linksIn(md);
    const emoji = [...md.matchAll(EMOJI)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
    let prose = md.split(MARKER).join(blank(MARKER)).replace(T.SOURCE_LABEL, blank);
    for (const l of links) prose = `${prose.slice(0, l.start)}${blank(l.text)}${prose.slice(l.end)}`;
    const heads = [...prose.matchAll(HEADING_LINE)].map((m) => [m.index, m.index + m[0].length]);
    const forms = new Map();     // whole token in lower case → { n, start, end, text }
    const used = new Map();      // word outside headings → { n, start, end, text }
    const raw = new Set();       // tokens as written, for surnames
    const seq = [];              // words in lower case, in order, for title words
    const bump = (map, k, start, text) => {
      const e = map.get(k);
      if (e) e.n++;
      else map.set(k, { n: 1, start, end: start + text.length, text });
    };
    let hi = 0;
    for (const m of prose.matchAll(TOKEN)) {
      const text = m[0];
      const lower = text.toLowerCase().replace(/’/g, "'").replace(/[\u2010\u2011]/g, '-');
      const base = lower.replace(/'s$/, '');
      bump(forms, base, m.index, text.slice(0, base.length));
      raw.add(text.replace(/['’]s$/, ''));
      while (hi < heads.length && heads[hi][1] <= m.index) hi++;
      const inHead = hi < heads.length && heads[hi][0] <= m.index;
      let at = m.index;
      for (const part of base.split('-')) {
        seq.push(part);
        if (!inHead && !part.includes("'")) bump(used, part, at, text.slice(at - m.index, at - m.index + part.length));
        at += part.length + 1;
      }
    }
    return { sec, md, prose, links, emoji, forms, used, raw, seq };
  }

  /* ── Group 3: repeats ── */

  function repeats(reads, add) {
    // One paragraph in two or more places. Its sentences are not listed again.
    const paras = new Map();
    for (const r of reads) {
      for (const p of T.paragraphs(r.md)) {
        const key = T.textKey(p.text);
        if (key.split(' ').length < PARAGRAPH_MIN_WORDS) continue;
        if (!paras.has(key)) paras.set(key, []);
        paras.get(key).push({ r, start: p.start, end: p.end });
      }
    }
    const covered = new Map();   // section id → paragraph places
    for (const [key, places] of paras) {
      if (places.length < 2) continue;
      for (const p of places) {
        (covered.get(p.r.sec.id) || covered.set(p.r.sec.id, []).get(p.r.sec.id)).push(p);
        add(3, 'same_paragraph', hash(key), p.r.sec, `This paragraph is in ${fmt(places.length)} places. Keep one.`, p);
      }
    }
    const inPara = (id, k) => (covered.get(id) || []).some((p) => p.start <= k.start && k.end <= p.end);
    // One sentence in two or more sections, or twice in one: the Export's rule (sentenceKeys).
    const sents = new Map();
    for (const r of reads) {
      for (const k of T.sentenceKeys(r.md)) {
        if (!sents.has(k.key)) sents.set(k.key, []);
        sents.get(k.key).push({ r, start: k.start, end: k.end, inPara: inPara(r.sec.id, k) });
      }
    }
    for (const [key, places] of sents) {
      if (places.length < 2 || places.every((p) => p.inPara)) continue;
      const bySection = new Map();
      for (const p of places) (bySection.get(p.r.sec.id) || bySection.set(p.r.sec.id, []).get(p.r.sec.id)).push(p);
      const firsts = [...bySection.values()].map((l) => l[0]);
      if (firsts.length > 1) {
        for (const p of firsts) {
          const other = firsts.find((x) => x !== p);
          const rest = firsts.length - 2;
          add(3, 'same_sentence', hash(key), p.r.sec, `This sentence is also in ${other.r.sec.label}${rest ? ` and ${fmt(rest)} more ${rest === 1 ? 'place' : 'places'}` : ''}.`, p);
        }
      }
      for (const list of bySection.values()) {
        if (list.length > 1) add(3, 'same_sentence_here', `${list[0].r.sec.id}|${hash(key)}`, list[0].r.sec, 'This sentence is here twice.', list[1]);
      }
    }
  }

  /** Owner Q5. The word's section is the one with the most uses, the spot its first use there. */
  function overused(reads, ctx, add) {
    const common = new Set(L.COMMON_WORDS);
    const titled = new Set();
    for (const t of ctx.titles) for (const m of t.matchAll(TOKEN)) for (const f of T.forms(m[0].toLowerCase().replace(/’/g, "'"))) titled.add(f);
    const total = new Map();
    for (const r of reads) {
      for (const [w, e] of r.used) {
        const t = total.get(w) || { n: 0, best: null, bestN: 0 };
        t.n += e.n;
        if (e.n > t.bestN) { t.best = { r, start: e.start, end: e.end }; t.bestN = e.n; }
        total.set(w, t);
      }
    }
    const per10k = (n) => (n * 10000) / Math.max(1, ctx.words);
    const found = [];
    for (const [w, t] of total) {
      if (t.n < OVERUSED.uses || per10k(t.n) < OVERUSED.per10k) continue;
      if (!LETTERS.test(w) || [...w].length < OVERUSED.letters) continue;
      const fs = T.forms(w);
      if (fs.some((f) => common.has(f) || titled.has(f))) continue;
      found.push({ w, ...t });
    }
    found.sort((a, b) => b.n - a.n || (a.w < b.w ? -1 : 1));
    for (const f of found.slice(0, OVERUSED.max)) {
      add(3, 'overused_word', keyOf(f.w), f.best.r.sec, `"${shown(f.w)}" is used ${fmt(f.n)} times, about ${fmt(Math.round(per10k(f.n)))} per 10,000 words.`, f.best);
    }
  }

  /* ── Group 5: consistency ── */

  const NOT_VARIANT = new Set(L.NOT_VARIANTS);
  const SPACED = new Map(L.SPACE_VARIANTS);
  const SPACED_RE = new RegExp(`\\b(?:${L.SPACE_VARIANTS.map(([s]) => s.replace(' ', '[ \\t]+')).join('|')})\\b`, 'gi');

  /** closed form → form → { n, first }: the terms written in more than one way. */
  function termForms(reads) {
    const terms = new Map();
    const add = (closed, form, n, first) => {
      const t = terms.get(closed) || terms.set(closed, new Map()).get(closed);
      const e = t.get(form);
      if (e) e.n += n;
      else t.set(form, { n, first });
    };
    const closedSeen = new Set();
    for (const r of reads) {
      for (const f of r.forms.keys()) if (!f.includes('-')) closedSeen.add(f);
      for (const m of r.prose.matchAll(SPACED_RE)) {
        const form = m[0].toLowerCase().replace(/[ \t]+/g, ' ');
        add(SPACED.get(form), form, 1, { r, start: m.index, end: m.index + m[0].length });
      }
    }
    for (const r of reads) {
      for (const [form, e] of r.forms) {
        if (!form.includes('-')) continue;
        const closed = form.split('-').join('');
        if ((closedSeen.has(closed) || terms.has(closed)) && !NOT_VARIANT.has(closed)) add(closed, form, e.n, { r, start: e.start, end: e.end });
      }
    }
    for (const r of reads) {
      for (const [form, e] of r.forms) if (terms.has(form)) add(form, form, e.n, { r, start: e.start, end: e.end });
    }
    return terms;
  }

  function twoSpellings(reads, add) {
    for (const forms of termForms(reads).values()) {
      if (forms.size < 2) continue;
      const list = [...forms].map(([form, e]) => ({ form, ...e }));
      // Most uses first. A tie: the form that comes first in the book stands.
      const place = (x) => x.first.r.index * 1e9 + x.first.start;
      list.sort((a, b) => b.n - a.n || place(a) - place(b));
      for (const x of list.slice(1)) {
        add(5, 'two_spellings', keyOf(`${x.first.r.sec.id}|${x.form}`), x.first.r.sec,
          `"${shown(x.form)}" here, "${shown(list[0].form)}" ${fmt(list[0].n)} ${list[0].n === 1 ? 'time' : 'times'} in the book. Pick one.`, x.first);
      }
    }
  }

  const US_OF = new Map();   // uk word → us word
  const UK_OF = new Map();   // us word → uk word
  for (const [us, uk, suffixes] of L.US_UK) {
    for (const x of suffixes.split(' ')) {
      const end = x === '-' ? '' : x;
      US_OF.set(uk + end, us + end);
      UK_OF.set(us + end, uk + end);
    }
  }

  /** The majority of uses in the book wins. Each minority word, per section, at its first use. */
  function usUk(reads, add) {
    let us = 0, uk = 0;
    for (const r of reads) {
      for (const [w, e] of r.forms) {
        if (UK_OF.has(w)) us += e.n;
        else if (US_OF.has(w)) uk += e.n;
      }
    }
    if (!us || !uk) return;
    if (us === uk) {
      add(5, 'us_uk', 'tie', null, `US and UK spellings are tied at ${fmt(us)} uses each. Pick one.`, null);
      return;
    }
    const usWins = us > uk;
    const other = usWins ? US_OF : UK_OF;
    for (const r of reads) {
      for (const [w, e] of r.forms) {
        if (!other.has(w)) continue;
        add(5, 'us_uk', `${r.sec.id}|${w}`, r.sec, `"${shown(w)}" is the ${usWins ? 'UK' : 'US'} spelling. This book mostly uses ${usWins ? 'US' : 'UK'} spelling ("${shown(other.get(w))}").`, e);
      }
    }
  }

  /* ── Group 7: KDP rules ── */

  function missingChars(reads, ctx, add) {
    const known = new Map();
    const has = (cp) => {
      if (!known.has(cp)) known.set(cp, G.has(ctx.style, cp));
      return known.get(cp);
    };
    const font = G.FONT[ctx.style];
    const say = (ch, cp) => `"${ch}" (${code(cp)}) is not in ${font}, the font of your 08 style. It prints as an empty box.`;
    const scan = (text, each) => {
      for (const m of text.matchAll(/[^\x00-\x7F]/gu)) {
        if (SKIP_CHAR.test(m[0])) continue;
        const cp = m[0].codePointAt(0);
        if (!has(cp)) each(m[0], cp, m.index);
      }
    };
    for (const r of reads) {
      const seen = new Set();
      // A character of an emoji is listed as the emoji, not twice.
      let text = r.md;
      for (const e of r.emoji) text = `${text.slice(0, e.start)}${blank(e.text)}${text.slice(e.end)}`;
      scan(text, (ch, cp, at) => {
        if (seen.has(cp)) return;
        seen.add(cp);
        add(7, 'missing_char', `${r.sec.id}|${code(cp)}`, r.sec, say(ch, cp), { start: at, end: at + ch.length });
      });
      scan(r.sec.title, (ch, cp) => {
        if (seen.has(cp)) return;
        seen.add(cp);
        add(7, 'missing_char', `${r.sec.id}|${code(cp)}`, r.sec, say(ch, cp), null);
      });
    }
    // Titles with no section of their own: one issue per character, for the book.
    const seen = new Set();
    for (const t of ctx.bookTitles) {
      scan(t.replace(EMOJI, blank), (ch, cp) => {
        if (seen.has(cp)) return;
        seen.add(cp);
        add(7, 'missing_char', `book|${code(cp)}`, null, say(ch, cp), null);
      });
    }
  }

  const wordsRe = (list) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
  const HEALTH_RE = wordsRe(L.HEALTH);
  const MONEY_RE = wordsRe(L.MONEY);
  const PHRASE_RE = wordsRe(L.DISCLAIMER);
  const DISCLAIMER_HEAD = /^#{1,6}[ \t]+.*\bdisclaimers?\b/im;
  const DISCLAIMER_TITLE = /\bdisclaimers?\b/i;

  function disclaimer(reads, ctx, add) {
    const topic = ctx.topicTexts.join('\n');
    const health = HEALTH_RE.test(topic), money = MONEY_RE.test(topic);
    if (!health && !money) return;
    if (ctx.copyright) return;
    if (ctx.titles.some((t) => DISCLAIMER_TITLE.test(t)) || reads.some((r) => DISCLAIMER_TITLE.test(r.sec.title) || DISCLAIMER_HEAD.test(r.md) || PHRASE_RE.test(r.md))) return;
    add(7, 'disclaimer', 'disclaimer', null, `The topic is close to ${health && money ? 'health and money' : health ? 'health' : 'money'}, and the book has no disclaimer.`, null);
  }

  /* ── Sources named in the text ── */

  /** The first author's surname in a citation, or null. Approximate on purpose. */
  function surnameOf(citation) {
    const c = citation.replace(/https?:\/\/\S+/g, ' ').replace(/\bet\s+al\b\.?/gi, ' ').trim();
    const NAME = "\\p{Lu}[\\p{L}'’-]+";
    const by = c.match(new RegExp(`\\bby\\s+(?:\\p{Lu}\\.\\s*)*(?:${NAME}\\s+)*(${NAME})`, 'u'));
    const initials = c.match(new RegExp(`^(?:\\p{Lu}\\.\\s*)+(${NAME})`, 'u'));
    const first = c.match(new RegExp(`^(?:${NAME}\\s+)?(${NAME})\\s*[,(]`, 'u'));
    return (by || initials || first || [null, null])[1];
  }

  /** Runs of 3 words from a citation: the words of its title, its author's segment included. */
  function titleWords(citation, common) {
    const out = [];
    for (const seg of citation.replace(/https?:\/\/\S+/g, ' ').split(/[.,;:()?!]/)) {
      const ws = (seg.toLowerCase().replace(/’/g, "'").match(/[\p{L}\p{N}']+/gu) || []);
      for (let i = 0; i + 3 <= ws.length; i++) {
        const three = ws.slice(i, i + 3);
        if (three.some((w) => w.length > 3 && !common.has(w))) out.push(three.join(' '));
      }
    }
    return out;
  }

  function sourcesNamed(reads, research) {
    const common = new Set(L.COMMON_WORDS);
    const list = ((research && research.sources) || [])
      .map((s) => str(s && s.citation).trim())
      .filter(Boolean)
      .filter((c, i, all) => all.indexOf(c) === i);
    // One pass over the words: a run of 3 is only built where its first word starts a title run.
    const runs = new Map(), starts = new Set();
    const named = list.map((citation, i) => {
      for (const three of titleWords(citation, common)) {
        (runs.get(three) || runs.set(three, []).get(three)).push(i);
        starts.add(three.slice(0, three.indexOf(' ')));
      }
      const surname = surnameOf(citation);
      return { citation, name: surname && surname.length >= 3 && !common.has(surname.toLowerCase()) ? surname.replace(/['’]s$/, '') : null, sections: new Set() };
    });
    for (const r of reads) {
      const seq = r.seq;
      for (const n of named) if (n.name && r.raw.has(n.name)) n.sections.add(r.sec.id);
      for (let i = 0; i + 3 <= seq.length; i++) {
        if (!starts.has(seq[i])) continue;
        for (const c of runs.get(`${seq[i]} ${seq[i + 1]} ${seq[i + 2]}`) || []) named[c].sections.add(r.sec.id);
      }
    }
    return named.filter((n) => n.sections.size).slice(0, CAPS.sources).map((n) => ({
      citation: cut(n.citation, CAPS.citation).trim(),
      sections: [...n.sections].slice(0, CAPS.sourceSections)
    }));
  }

  /* ── Caps ── */

  /** n items from the lists, one from each in turn, so no list takes every place. */
  function fair(lists, n) {
    const out = [];
    for (let i = 0; out.length < n; i++) {
      let any = false;
      for (const l of lists) {
        if (i >= l.length) continue;
        any = true;
        if (out.length < n) out.push(l[i]);
      }
      if (!any) break;
    }
    return out;
  }

  const byRule = (list) => [...list.reduce((m, x) => (m.get(x.rule) || m.set(x.rule, []).get(x.rule)).push(x) && m, new Map()).values()];
  const inBook = (a, b) => a.at - b.at || a.from - b.from || a.order - b.order;

  /** Book order, with book-wide issues first so a cap never takes them. Open issues go first and are the only ones counted in more. */
  function capped(all, off) {
    const pick = {}, rest = {};
    for (const g of GROUPS) {
      const inGroup = all.filter((x) => x.g === g).sort(inBook);
      const open = inGroup.filter((x) => !off(x));
      pick[g] = fair(byRule(open), CAPS.perGroup).sort(inBook);
      rest[g] = { open: open.length, off: inGroup.filter(off) };
    }
    const kept = fair(GROUPS.map((g) => pick[g]), CAPS.total);
    const count = (g) => kept.filter((x) => x.g === g).length;
    const more = {};
    for (const g of GROUPS) {
      const past = rest[g].open - count(g);
      if (past > 0) more[g] = past;
    }
    const room = (g) => CAPS.perGroup - count(g);
    const extra = GROUPS.map((g) => rest[g].off.slice(0, Math.max(0, room(g))));
    const items = [...kept, ...fair(extra, CAPS.total - kept.length)];
    return { items: items.sort((a, b) => a.g - b.g || inBook(a, b)), more };
  }

  /** results::text must stay under 0028's size check, whatever the quotes hold. */
  function fit(res, off) {
    const size = () => new TextEncoder().encode(JSON.stringify(res)).length;
    if (size() <= CAPS.bytes) return;
    for (const n of [120, 40, 0]) {
      for (const x of res.items) x.quote = cut(x.quote, n);
      if (size() <= CAPS.bytes) return;
    }
    for (const s of res.sources) s.sections = s.sections.slice(0, 20);
    while (size() > CAPS.bytes && res.items.length) {
      const x = res.items.pop();
      if (!off(x)) res.more[x.g] = (res.more[x.g] || 0) + 1;
    }
  }

  /* ── The run ── */

  function context(qc) {
    const q = obj(qc);
    const data = obj(q.data);
    const book = obj(data.book);
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    const model = R.model(data, { include: 'all', format: 'docx', parts: { intro: true, conclusion: true } });
    const format = obj(q.format);
    const brief = obj(obj(data.known).brief);
    const positioning = obj(q.positioning);
    const titles = [book.title, book.subtitle, ...chapters.map((c) => c.title)].map(str).filter(Boolean);
    return {
      data, chapters, model, book, brief, titles,
      raw: new Map(chapters.flatMap((c) => (c.sections || []).map((s) => [s.id, s]))),
      known: T.knownOf(brief, obj(data.known).research, chapters),
      count: chapters.filter((c) => c.kind === 'chapter').length,
      style: G.STYLES.includes(format.style) ? format.style : DEFAULTS.style,
      copyright: obj(format.parts).copyright === undefined ? DEFAULTS.copyright : obj(format.parts).copyright !== false,
      words: model.words,
      bookTitles: [...titles, str(book.pen_name)],
      topicTexts: [...titles, str(brief.topic_text), str(brief.reader_problem), str(positioning.one_sentence), str(positioning.reader_promise)],
      off: new Set((Array.isArray(q.dismissed) ? q.dismissed : []).map((d) => `${d.rule}\u0000${d.issue_key}`))
    };
  }

  function* steps(qc) {
    const ctx = context(qc);
    const { model } = ctx;
    const all = [];
    const place = new Map([...ctx.raw.keys()].map((id, i) => [id, i]));
    /** One issue. where is a section or null, spot { start, end } or null. */
    function add(g, rule, key, where, message, spot) {
      const section = where && where.version ? where : null;
      const md = section ? section.content : '';
      all.push({
        g, rule, key,
        section_id: where ? where.id : null,
        version_id: section ? section.version.id : null,
        start: spot ? spot.start : null,
        end: spot ? spot.end : null,
        message: cut(message, CAPS.message),
        quote: spot && section ? cut(md.slice(spot.start, spot.end), CAPS.quote) : '',
        at: where ? place.get(where.id) : -1,
        from: spot ? spot.start : -1,
        order: RULES.indexOf(rule)
      });
    }

    // Each section is read once, with the 06 rows.
    const reads = model.sections.map((sec, index) => {
      const s = ctx.raw.get(sec.id) || {};
      const out = T.check(sec.content, { known: ctx.known, chapters: ctx.count, target: s.word_target || 0 });
      return { ...read(sec), index, rows: new Map(out.rows.map((r) => [r.code, r])) };
    });
    const byId = new Map(reads.map((r) => [r.sec.id, r]));
    yield { group: 0 };

    // 1. Complete.
    for (const r of reads) {
      const s = r.sec;
      if (s.status !== 'final') add(1, 'not_final', `${s.id}|${s.version.id}`, s, `${STATUS[s.status] || 'Draft'}, not Final. Only Final sections go into the book in 08.`, null);
      const words = r.rows.get('words');
      if (words && words.under) add(1, 'under_target', `${s.id}|${s.version.id}`, s, `${words.text}, under 80% of its target.`, null);
      const cutOff = T.ending(s.content);
      if (cutOff) add(1, 'cut_off', `${s.id}|${hText(cutOff.text)}`, s, 'The section ends mid-sentence.', cutOff);
    }
    for (const s of model.noText) add(1, 'no_text', `${s.id}|none`, { id: s.id }, 'No saved text yet.', null);
    for (const s of model.needsReview) {
      if (s.chapter) continue;
      add(1, 'needs_review', `${s.id}|${byId.get(s.id).sec.version.id}`, byId.get(s.id).sec, 'Needs review: written before 03 Positioning changed.', null);
    }
    for (const s of model.partial) {
      add(1, 'stopped_run', `${s.id}|${byId.get(s.id).sec.version.id}`, byId.get(s.id).sec, 'A Generate run stopped here. The text may not be finished.', null);
    }
    let n = 0;
    for (const c of ctx.chapters) {
      if (c.kind === 'chapter') n++;
      if (!c.needs_review) continue;
      const name = c.kind === 'chapter' ? `Chapter ${n}` : c.kind === 'intro' ? 'The Introduction' : 'The Conclusion';
      add(1, 'chapter_review', `${c.id}|review`, null, `${name} needs review: planned before 03 Positioning changed. Open it in 05 Outline.`, null);
    }
    yield { group: 1 };

    // 2. Sources.
    for (const r of reads) {
      const s = r.sec;
      const marks = r.rows.get('marks');
      for (const x of marks ? marks.sents : []) add(2, 'verify_mark', `${s.id}|${hText(x.text)}`, s, '"Verify: no source" is still in the text.', x);
      const nums = r.rows.get('number');
      for (const x of nums ? nums.spots : []) {
        const body = r.md.slice(x.start, x.end);
        const digits = (x.shown.match(/\d[\d.,]*/) || [x.shown])[0];
        const at = body.indexOf(x.shown) >= 0 ? body.indexOf(x.shown) : body.indexOf(digits);
        const len = body.indexOf(x.shown) >= 0 ? x.shown.length : digits.length;
        add(2, 'number_no_source', `${s.id}|${hText(body)}`, s, `"${shown(x.shown)}" has no source. Add a source in 02 Research, or mark it.`, at >= 0 ? { start: x.start + at, end: x.start + at + len } : x);
      }
      const src = r.rows.get('source');
      for (const x of src ? src.sents : []) add(2, 'source_not_named', `${s.id}|${hText(x.text)}`, s, 'Source not named. Name the author or the title, or cut it.', x);
    }
    const sources = sourcesNamed(reads, obj(ctx.data.known).research);
    yield { group: 2 };

    // 3. Repeats.
    repeats(reads, add);
    overused(reads, ctx, add);
    yield { group: 3 };

    // 4. Pointers.
    for (const r of reads) {
      const s = r.sec;
      const row = r.rows.get('mention');
      for (const h of row ? row.hits : []) {
        const sentence = row.sents[h.sentence];
        const key = `${s.id}|${hText(sentence.text)}`;
        const said = shown(r.md.slice(h.start, h.end));
        if (h.kind === 'chapter') add(4, 'chapter_missing', key, s, `"${said}" does not exist. This book has ${fmt(ctx.count)} ${ctx.count === 1 ? 'chapter' : 'chapters'}.`, h);
        else if (h.kind === 'section') add(4, 'section_number', key, s, `"${said}": the book has no section numbers.`, h);
        else add(4, 'preview', key, s, 'Previews another part of the book. Cut it, or say what that part covers.', sentence);
      }
      for (const re of L.LEFTOVERS) {
        for (const m of r.md.matchAll(re)) add(4, 'leftover', `${s.id}|${hMatch(m[0])}`, s, `"${shown(m[0])}" is left in the text.`, { start: m.index, end: m.index + m[0].length });
      }
    }
    yield { group: 4 };

    // 5. Consistency.
    twoSpellings(reads, add);
    usUk(reads, add);
    yield { group: 5 };

    // 7. KDP rules.
    if (reads.length) {
      const pages = W.pages(ctx.words, ctx.book.trim);
      if (pages < PAGES.min) add(7, 'length', 'length', null, `About ${fmt(pages)} pages. KDP needs at least ${PAGES.min} for a paperback.`, null);
      else if (pages > PAGES.max) add(7, 'length', 'length', null, `About ${fmt(pages)} pages. KDP takes at most ${PAGES.max} for a paperback.`, null);
      disclaimer(reads, ctx, add);
    }
    for (const r of reads) {
      for (const l of r.links) add(7, 'web_link', `${r.sec.id}|${hMatch(l.text)}`, r.sec, 'A web link in print text. Paperback readers cannot click it.', l);
      for (const e of r.emoji) add(7, 'emoji', `${r.sec.id}|${hash(e.text)}`, r.sec, 'An emoji. It prints as an empty box.', e);
    }
    missingChars(reads, ctx, add);
    yield { group: 7 };

    const off = (x) => ctx.off.has(`${x.rule}\u0000${x.key}`);
    const { items, more } = capped(all, off);
    const res = {
      items: items.map(({ g, rule, key, section_id, version_id, start, end, message, quote }) => ({ g, rule, key, section_id, version_id, start, end, message, quote })),
      more, sources, notes: { unsaved: model.unsaved.length, running: model.running.length }
    };
    fit(res, off);
    return { ...res, sections: reads.length, words: Math.min(ctx.words, CAPS.words), style: ctx.style };
  }

  function run(qc) {
    const it = steps(qc);
    for (;;) {
      const s = it.next();
      if (s.done) return s.value;
    }
  }

  const results = (r) => ({ items: r.items, more: r.more, sources: r.sources, notes: r.notes });
  const driftKey = (row) => `${row.chapter_id}|${row.inputs_key}`;

  function verdict(res, qc) {
    const q = obj(qc);
    const r = obj(res);
    const off = new Set((Array.isArray(q.dismissed) ? q.dismissed : []).map((d) => `${d.rule}\u0000${d.issue_key}`));
    const items = Array.isArray(r.items) ? r.items : [];
    const marked = new Set();
    let open = 0;
    for (const x of items) {
      const k = `${x.rule}\u0000${x.key}`;
      if (off.has(k)) marked.add(k);
      else open++;
    }
    for (const n of Object.values(obj(r.more))) open += n;
    // A drift counts only while its check is current.
    const chapters = new Map((obj(q.data).chapters || []).map((c) => [c.id, c]));
    for (const row of Array.isArray(q.promise) ? q.promise : []) {
      const c = chapters.get(row.chapter_id);
      if (row.verdict !== 'drifts' || !c || root.kdpQcPromiseKey.ofChapter(c, q.positioning) !== row.inputs_key) continue;
      const k = `promise_drift\u0000${driftKey(row)}`;
      if (off.has(k)) marked.add(k);
      else open++;
    }
    return {
      open, marked: marked.size, ready: open === 0,
      title: open === 0 ? 'Ready for Format' : `Ready for Format, with ${fmt(open)} ${open === 1 ? 'warning' : 'warnings'}`
    };
  }

  root.kdpQcRules = { GROUPS, RULES, CAPS, OVERUSED, PAGES, DEFAULTS, run, steps, results, verdict, driftKey };
})(globalThis);
