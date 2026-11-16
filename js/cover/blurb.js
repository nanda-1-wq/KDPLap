/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the back blurb dialog (E16 Part 8, design 68, plan §3)
   /js/cover/blurb.js   (the pure rules work with no DOM: tests/cover-blurb.test.js;
                         the dialog needs js/supabase.js, js/ui.js and the editor)

   Length (Short, Medium, Long: about 80, 130, 180 words), tone (Warm, Direct,
   Expert), "End with one line about the author ([pen name])" from the pen
   name's bio only (off, with its reason, when the pen name has no bio), Write
   with AI / Write again (one generate cover_blurb call each, v28; "One AI
   call each time, counted in your usage", no cost line), an editable draft,
   the word count, the fit note (under 1,100 characters 11 pt; under 1,500
   10 pt; else too long, a warning: plan D4), the words KDP may not accept
   (whole words: plan D3), and "Verify: no source" for numbers the server
   found no source for, while they are still in the draft (plan D8).
   "Put on the back cover" saves a cover_blurbs version (source 'ai' when the
   AI's draft goes on unchanged, else 'manual'), then sets the one blurb layer.

   Pure: kdpCover.blurb.LENGTHS / TONES / MAX_CHARS / FIT
         kdpCover.blurb.words(text) / fit(text) / flags(text) / verify(text, unsourced)
         kdpCover.blurb.errorText(error) → the dialog's words for a generate error
   Dialog: kdpCover.blurb.hostHtml(E) / bindHost(host, E) / meta(E) (the counts under the draft)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The server's own lists (supabase/functions/generate/lib/limits.ts COVER_LENGTHS, COVER_TONES, COVER; tests/limits-parity.test.js).
  const LENGTHS = [['short', 'Short', 'about 80 words'], ['medium', 'Medium', 'about 130 words'], ['long', 'Long', 'about 180 words']];
  const TONES = [['warm', 'Warm'], ['direct', 'Direct'], ['expert', 'Expert']];
  const MAX_CHARS = 1500;            // 0029 cover_blurbs.body
  const FIT = { at11: 1100, at10: 1500 };
  // The words KDP may not accept (design F68), matched as whole words (plan D3: "secure" is fine).
  const BANNED = [
    [/\bguarantee[sd]?\b/i, 'guarantee', 'promises a result'],
    [/\bcure[sd]?\b/i, 'cure', 'is a health claim'],
    [/\bbest-selling\b/i, 'best-selling', 'is a sales claim KDP may reject'],
    [/\bbestsellers?\b/i, 'bestseller', 'is a sales claim KDP may reject'],
    [/(?:^|[^\w#])#1(?!\d)/, '#1', 'is a ranking claim'],
    [/\bamazon(?:'s|’s)?\b/i, 'amazon', 'is a store name on the cover']
  ];

  const words = (t) => (String(t || '').match(/\S+/g) || []).length;
  /** The fit note: { key: '' | 'at11' | 'at10' | 'long', text }. */
  function fit(t) {
    const n = String(t || '').trim().length;
    if (!n) return { key: '', text: '' };
    if (n < FIT.at11) return { key: 'at11', text: 'Fits the back cover at 11 pt, above the barcode.' };
    if (n < FIT.at10) return { key: 'at10', text: 'Fits at 10 pt. Shorter reads better.' };
    return { key: 'long', text: 'Too long for the back cover. Cut it down.' };
  }
  /** The words KDP may not accept, each once: [{ word, text }]. */
  const flags = (t) => BANNED.filter(([re]) => re.test(String(t || ''))).map(([, w, why]) => ({ word: w, text: `"${w}" ${why}.` }));
  /** The server's unsourced numbers still in the draft ("5000" also matches "5,000"). */
  function verify(t, unsourced) {
    const flat = String(t || '').replace(/(\d),(?=\d{3}\b)/g, '$1');
    return (unsourced || []).filter((n) => {
      const re = new RegExp('(?<![\\d.,])' + String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ in /g, '\\s+(?:in|out of)\\s+') + '(?![\\d]|[.,]\\d)', 'i');
      return re.test(flat);
    });
  }
  function errorText(err) {
    const code = err && err.code;
    if (code === 'not_enough_facts' && err.missing === 'bio') return 'This pen name has no bio yet. Add one in Pen Names, or turn off the author line. Nothing was counted in your usage.';
    if (code === 'not_enough_facts') return 'This book has no title yet. Add it in 04 Title first. Nothing was counted in your usage.';
    if (code === 'positioning_not_locked') return 'Lock your Positioning in 03 first: the blurb uses its reader and promise. Nothing was counted in your usage.';
    if (code === 'monthly_limit' || code === 'rate_limited' || code === 'network') return root.kdpUi ? root.kdpUi.aiMessage(code)[1] : 'Try again in a moment.';
    return 'The AI did not answer this time. Nothing was counted in your usage. Try again in a moment.';
  }

  /* ── The dialog ── */
  const I = {
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>'
  };

  /** The word count, the fit note, the words KDP may not accept and Verify (redrawn while typing, the textarea stays). */
  function meta(E) {
    const B = E.blurb, f = fit(B.draft), fl = flags(B.draft), vf = verify(B.draft, B.unsourced);
    const n = words(B.draft);
    return `<div class="cv-bl-count"><span class="cv-mono">${n} word${n === 1 ? '' : 's'}</span>
        ${f.key ? `<span class="cv-bl-fit is-${f.key === 'long' ? 'long' : 'ok'}">${f.key === 'long' ? I.warn : I.ok}${esc(f.text)}</span>` : ''}</div>
      ${vf.length ? `<div class="cv-bl-box cv-bl-verify" data-bl-verify>${I.warn}<div><strong>Verify: no source.</strong> ${vf.length === 1 ? 'This number is' : 'These numbers are'} not in your Positioning, title or subtitle${B.author ? ' (or, in the author line, your bio)' : ''}: ${vf.map((x) => `<span class="cv-mono">${esc(x)}</span>`).join(', ')}. Check ${vf.length === 1 ? 'it' : 'them'}, or cut ${vf.length === 1 ? 'it' : 'them'}.</div></div>` : ''}
      ${fl.length ? `<div class="cv-bl-box cv-bl-flags" data-bl-flags>${I.warn}<div><strong>Words KDP may not accept:</strong>${fl.map((x) => `<div>${esc(x.text)}</div>`).join('')}</div></div>` : ''}`;
  }

  function hostHtml(E) {
    const B = E.blurb;
    if (!B || !B.open) return '';
    const bio = !!E.bioText(), pen = E.bookWords('pen');
    const real = C.bookData.realBlurb(E.cover.layers);
    const tooLong = fit(B.draft).key === 'long' && B.draft.trim().length > 0;
    const putOff = !B.draft.trim() || B.busy || B.saving || tooLong;
    const putTitle = tooLong ? ' title="Too long for the back cover. Cut it down first."' : '';
    const seg = (on) => `cv-bl-seg${on ? ' is-on' : ''}`;
    const lens = LENGTHS.map(([k, label, note]) => `<button type="button" class="${seg(B.len === k)} cv-bl-len" data-k="bl-len-${k}" data-bl-len="${k}" aria-pressed="${B.len === k}"><span class="cv-bl-lt">${label}</span><span class="cv-bl-ln">${note}</span></button>`).join('');
    const tones = TONES.map(([k, label]) => `<button type="button" class="${seg(B.tone === k)}" data-k="bl-tone-${k}" data-bl-tone="${k}" aria-pressed="${B.tone === k}">${label}</button>`).join('');
    const penLink = E.data && E.data.book && E.data.book.pen_name_id ? `pen-name.html?id=${encodeURIComponent(E.data.book.pen_name_id)}` : 'pen-names.html';
    const author = `<label class="cv-bl-author${bio ? '' : ' is-off'}"><input type="checkbox" data-k="bl-author" data-bl-author${B.author && bio ? ' checked' : ''}${bio ? '' : ' disabled aria-describedby="cv-bl-nobio"'}>End with one line about the author (${esc(pen || 'your pen name')})</label>
      ${bio ? '' : `<p class="cv-bl-nobio" id="cv-bl-nobio">Add a bio in Pen Names first. The author line uses only what your bio says. <a href="${penLink}" target="_blank" rel="noopener" data-k="bl-pen">Open Pen Names</a></p>`}`;
    const body = B.busy ? '<div class="cv-bl-wait" role="status">Writing from your book…</div>'
      : B.draft || B.shown ? `<textarea class="cv-bl-text" aria-label="Back blurb" data-k="bl-text" data-bl-text maxlength="3000">${esc(B.draft)}</textarea><div class="cv-bl-meta" data-bl-meta>${meta(E)}</div>`
        : '<div class="cv-bl-empty">Pick a length and tone, then press "Write with AI". Or type your own blurb here after the first draft.</div>';
    return `<div class="cv-bl-wrap" data-blurbdlg>
      <div class="cv-bl" role="dialog" aria-modal="true" aria-labelledby="cv-bl-h">
        <div class="cv-bl-head"><div><h2 id="cv-bl-h">Back blurb</h2><p>AI drafts it from your book's reader and promise (03 Positioning). You edit it and decide what goes on the cover.</p></div>
          <button type="button" class="cv-bl-x" data-k="bl-x" data-bl-close aria-label="Close">${I.x}</button></div>
        <div class="cv-bl-body">
          <div class="cv-bl-grid">
            <div class="cv-bl-col"><span class="cv-bl-h3" id="cv-bl-len">Length</span><div class="cv-bl-segs" role="group" aria-labelledby="cv-bl-len">${lens}</div></div>
            <div class="cv-bl-col"><span class="cv-bl-h3" id="cv-bl-tone">Tone</span><div class="cv-bl-segs" role="group" aria-labelledby="cv-bl-tone">${tones}</div></div>
          </div>
          ${author}
          <div class="cv-bl-write"><button type="button" class="cv-bl-go" data-k="bl-write" data-bl-write${B.busy ? ' aria-disabled="true"' : ''}>${I.spark}${B.draft || B.aiText ? 'Write again' : 'Write with AI'}</button>
            <span class="cv-bl-note">One AI call each time, counted in your usage.</span></div>
          ${B.err ? `<div class="cv-bl-err" role="alert">${I.warn}<span>${esc(B.err)}</span></div>` : ''}
          ${body}
          ${B.saveErr ? `<div class="cv-bl-err" role="alert">${I.warn}<span>${esc(B.saveErr)}</span></div>` : ''}
        </div>
        <div class="cv-bl-foot"><span class="cv-bl-note">You can change the font, size and color on the cover after.</span>
          <div class="cv-bl-btns"><button type="button" class="cv-bl-cancel" data-k="bl-cancel" data-bl-close>Cancel</button>
          <button type="button" class="cv-bl-put" data-k="bl-put" data-bl-put${putOff ? ' aria-disabled="true"' : ''}${putTitle}>${B.saving ? 'Saving…' : real ? 'Update the back cover' : 'Put on the back cover'}</button></div></div>
      </div></div>`;
  }

  function bindHost(host, E) {
    host.addEventListener('click', (e) => {
      if (!E.blurb || !E.blurb.open) return;
      const b = e.target.closest('button');
      if (e.target === host.querySelector('[data-blurbdlg]')) { E.closeBlurb(); return; }   // the gray around it
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      if (b.hasAttribute('data-bl-close')) E.closeBlurb();
      else if (b.dataset.blLen) { E.blurb.len = b.dataset.blLen; E.refreshBlurb(); }
      else if (b.dataset.blTone) { E.blurb.tone = b.dataset.blTone; E.refreshBlurb(); }
      else if (b.hasAttribute('data-bl-write')) E.writeBlurb();
      else if (b.hasAttribute('data-bl-put')) E.putBlurb();
    });
    host.addEventListener('change', (e) => {
      if (e.target.matches('[data-bl-author]')) { E.blurb.author = e.target.checked; E.refreshBlurb(); }
    });
    host.addEventListener('input', (e) => {
      if (!e.target.matches('[data-bl-text]')) return;
      E.blurb.draft = e.target.value; E.blurb.saveErr = '';
      const m = host.querySelector('[data-bl-meta]'); if (m) m.innerHTML = meta(E);
      // Put follows the draft (empty, too long) without drawing the textarea again.
      const put = host.querySelector('[data-bl-put]');
      if (put) {
        const long = fit(E.blurb.draft).key === 'long', off = !E.blurb.draft.trim() || E.blurb.busy || E.blurb.saving || long;
        if (off) put.setAttribute('aria-disabled', 'true'); else put.removeAttribute('aria-disabled');
        if (long) put.title = 'Too long for the back cover. Cut it down first.'; else put.removeAttribute('title');
      }
    });
    // Tab stays inside the dialog (aria-modal).
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...host.querySelectorAll('button, input:not([disabled]), textarea, a[href]')].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  C.blurb = { LENGTHS, TONES, MAX_CHARS, FIT, BANNED, words, fit, flags, verify, errorText, meta, hostHtml, bindHost };
})(globalThis);
