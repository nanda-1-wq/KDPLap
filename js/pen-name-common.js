/* ═══════════════════════════════════════════════════
   KDP Lab — Pen name helpers shared by the list, detail, and dialogs
   /js/pen-name-common.js

   Load AFTER js/supabase.js. The JSON shapes of pen_names.bio_facts and
   pen_names.voice live here. The database checks structure only
   (supabase/migrations/0005): keys, types, max lengths, at most 6 tones.
   The ALLOWED VALUES are only here, so a new value needs no migration.

   bio_facts = { background, credentials, personal }        strings, may be ''
   voice     = { tones: [key…], reading_level, perspective,
                 sentences, paragraphs, sample }             choices are a key or null
   A missing key reads as empty. The browser always writes the full object.
═══════════════════════════════════════════════════ */

(function () {
  const svg = (size, stroke, body) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const ICON = {
    check: (s = 13) => svg(s, 2.4, '<path d="M5 12l5 5 9-10"/>'),
    x: (s = 13) => svg(s, 2.4, '<path d="M6 6l12 12M18 6L6 18"/>'),
    warn: (s = 13) => svg(s, 2.2, '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>'),
    close: svg(20, 2, '<path d="M6 6l12 12M18 6L6 18"/>'),
    plus: svg(18, 2, '<path d="M12 5v14M5 12h14"/>'),
    sparkle: svg(16, 2, '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"/>'),
    more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    rename: svg(16, 2, '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>'),
    trash: (s = 16) => svg(s, 2, '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')
  };

  const MAX_NAME = 100;     // database: 1 to 100 after trim (0001, 0005)
  const MAX_NICHE = 200;    // browser only
  const MAX_BIO = 3000;     // browser only
  const FACT_MAX = { background: 1000, credentials: 300, personal: 500 };
  const MAX_SAMPLE = 10000;
  const MAX_TONES = 6;
  const SAMPLE_ENOUGH = 150;   // words

  // Allowed values, in display order: [key, label].
  const TONES = [['warm', 'Warm'], ['encouraging', 'Encouraging'], ['practical', 'Practical'],
    ['direct', 'Direct'], ['humorous', 'Humorous'], ['formal', 'Formal']];
  const CHOICES = {
    reading_level: [['beginner', 'Beginner'], ['general', 'General'], ['advanced', 'Advanced']],
    perspective: [['second', 'Second person (you)'], ['first', 'First person (I)'], ['third', 'Third person']],
    sentences: [['short', 'Short and simple'], ['mixed', 'Mixed'], ['long', 'Long and detailed']],
    paragraphs: [['short', 'Short (2 to 3 lines)'], ['medium', 'Medium']]
  };
  const CHOICE_KEYS = Object.keys(CHOICES);

  const STEP_NAMES = ['Brief', 'Research', 'Positioning', 'Title', 'Outline', 'Write',
    'Quality Control', 'Format', 'Cover', 'Metadata', 'Publish'];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = (v) => (typeof v === 'string' ? v : '');
  const allowed = (list, v) => list.some(([k]) => k === v);

  /** bio_facts from the database, with every key present. */
  function readFacts(raw) {
    const j = raw && typeof raw === 'object' ? raw : {};
    return { background: str(j.background), credentials: str(j.credentials), personal: str(j.personal) };
  }

  /** voice from the database, with every key present. Unknown values read as not set. */
  function readVoice(raw) {
    const j = raw && typeof raw === 'object' ? raw : {};
    const tones = Array.isArray(j.tones) ? j.tones.filter((t, i, a) => allowed(TONES, t) && a.indexOf(t) === i) : [];
    const v = { tones: tones.slice(0, MAX_TONES), sample: str(j.sample) };
    CHOICE_KEYS.forEach((k) => { v[k] = allowed(CHOICES[k], j[k]) ? j[k] : null; });
    return v;
  }

  /** Trimmed bio_facts ready to save, or { error }. */
  function cleanFacts(f) {
    const out = {};
    for (const k of Object.keys(FACT_MAX)) {
      const v = str(f[k]).trim();
      if (v.length > FACT_MAX[k]) return { error: `${k} is longer than ${FACT_MAX[k]} characters.` };
      out[k] = v;
    }
    return { value: out };
  }

  /** voice ready to save (sample keeps its line breaks, trimmed at the ends), or { error }. */
  function cleanVoice(v) {
    const tones = Array.isArray(v.tones) ? v.tones : [];
    if (tones.length > MAX_TONES) return { error: `Pick at most ${MAX_TONES} tones.` };
    if (tones.some((t, i) => !allowed(TONES, t) || tones.indexOf(t) !== i)) return { error: 'Unknown tone.' };
    const out = { tones: tones.slice() };
    for (const k of CHOICE_KEYS) {
      const val = v[k] === undefined ? null : v[k];
      if (val !== null && !allowed(CHOICES[k], val)) return { error: `Unknown ${k}.` };
      out[k] = val;
    }
    const sample = str(v.sample).trim();
    if (sample.length > MAX_SAMPLE) return { error: `The writing sample is longer than ${MAX_SAMPLE} characters.` };
    out.sample = sample;
    return { value: out };
  }

  /** Error text for a pen name, or '' when it is fine. Checks the trimmed value. */
  function nameError(name) {
    if (!name) return 'Enter a pen name.';
    if (name.length > MAX_NAME) return `Use ${MAX_NAME} characters or fewer. This one has ${name.length}.`;
    return '';
  }

  const label = (list, key) => { const f = list.find(([k]) => k === key); return f ? f[1] : ''; };

  /** "Warm, encouraging, practical. Second person, short paragraphs, beginner level." or '' */
  function voiceSummary(raw) {
    const v = readVoice(raw);
    const parts = [];
    if (v.tones.length) {
      const t = v.tones.map((k) => label(TONES, k).toLowerCase()).join(', ');
      parts.push(t.charAt(0).toUpperCase() + t.slice(1) + '.');
    }
    const style = [];
    if (v.perspective) style.push(label(CHOICES.perspective, v.perspective).replace(/ \(.*\)$/, '').toLowerCase());
    if (v.sentences) style.push(`${label(CHOICES.sentences, v.sentences).toLowerCase()} sentences`);
    if (v.paragraphs) style.push(`${v.paragraphs} paragraphs`);
    if (v.reading_level) style.push(`${v.reading_level} level`);
    if (style.length) {
      const s = style.join(', ');
      parts.push(s.charAt(0).toUpperCase() + s.slice(1) + '.');
    }
    return parts.join(' ');
  }

  const wordCount = (text) => (str(text).trim().match(/\S+/g) || []).length;
  const bioReady = (p) => !!(p && p.bio_text && p.bio_text.trim());
  const initial = (name) => (str(name).trim().charAt(0) || '?').toUpperCase();
  const one = (v) => (Array.isArray(v) ? v[0] : v) || null;

  /** Book title, else the Brief's topic (the working title on the Books page). */
  function bookTitle(b) {
    if (b.title && b.title.trim()) return b.title;
    const brief = one(b.book_briefs);
    return (brief && brief.topic_text) || '';
  }

  const stepLabel = (n) => `${String(n).padStart(2, '0')} ${STEP_NAMES[n - 1] || ''}`;

  /** "Bio ready" or "Bio missing": always icon and word (CLAUDE.md §7). */
  const bioBadge = (p) => (bioReady(p)
    ? `<span class="check-badge pass">${ICON.check()}Bio ready</span>`
    : `<span class="check-badge warn">${ICON.warn()}Bio missing</span>`);

  const defaultChip = '<span class="pill pen-default">Default</span>';

  window.kdpPens = {
    ICON, MAX_NAME, MAX_NICHE, MAX_BIO, FACT_MAX, MAX_SAMPLE, MAX_TONES, SAMPLE_ENOUGH,
    TONES, CHOICES, CHOICE_KEYS,
    esc, readFacts, readVoice, cleanFacts, cleanVoice, nameError, voiceSummary,
    wordCount, bioReady, initial, one, bookTitle, stepLabel, bioBadge, defaultChip
  };
})();
