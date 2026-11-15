/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the color picker (E16 Part 4, plan §3 "Color picker")
   /js/cover/picker.js   (color math is pure; html()/bind() need a DOM)

   One picker for every color: text color and the background in Part 4;
   fill, gradient ends, stroke, image border and effect color in Parts 5 and 6.
   Ported from design/screens/58-09-cover-new.html (the popover, svAt,
   setColor and its "last 5"); the color math is kdpCover.palettes (Part 1).

   kdpCover.picker.hexToRgb(hex) / rgbToHex(r, g, b) / hsvToHex(h, s, v) / hexToHsv(hex) / cmyk(hex)
   kdpCover.picker.normHex(text)      → "#RRGGBB" or null (accepts "abc", "#abc", "aabbcc")
   kdpCover.picker.remember(recent, hex) → the last 5, newest first
   kdpCover.picker.html(p, o)         → the popover's inner HTML
        p = { hue, sat, val, hexDraft, recent }, o = { title, cur, note, embed (no title or close: inside another popover) }
   kdpCover.picker.bind(el, p, api)   → wires the square, hue, hex, eyedropper, presets
        api.set(hex, keep)  (keep: a deliberate pick, kept in Recent)
        api.hsv(hue, sat, val) (the square or the hue moved)
        api.close()
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const PRESETS = ['#1C1C1A', '#FFFFFF', '#1F3A5F', '#2F4A3A', '#7A2E2E', '#F2C14E', '#E07A5F', '#F2EDE4'];

  // The color math is the design's, in kdpCover.palettes (Part 1, tested there).
  const P = () => C.palettes;
  const hexToRgb = (h) => P().hexToRgb(h), rgbToHex = (r, g, b) => P().rgbToHex(r, g, b);
  const hsvToHex = (h, s, v) => P().hsvToHex(h, s, v), hexToHsv = (h) => P().hexToHsv(h), cmyk = (h) => P().cmyk(h);
  function normHex(text) {
    let s = String(text || '').trim().replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
    return /^[0-9A-F]{6}$/.test(s) ? '#' + s : null;
  }
  const remember = (recent, hex) => P().recent(recent, hex);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const DROP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6-2 2-6-6z"/><path d="M13 7L5 15v4h4l8-8"/></svg>';

  // data-k (Part 5): a picker drawn again gives focus back to the swatch, the hex field or the slider in use.
  function swatch(hex, cur, k) {
    return `<button type="button" class="cv-sw${cur === hex ? ' is-on' : ''}" data-k="${k}-${hex}" data-hex="${hex}" aria-label="${hex}" aria-pressed="${cur === hex}" style="--sw:${hex}"></button>`;
  }

  function html(p, o) {
    const cur = o.cur;
    const [r, g, b] = hexToRgb(cur);
    const k = cmyk(cur);
    // o.embed (Part 5): the picker inside another popover (effects, fill, border): no title, no close.
    return `
      ${o.embed ? '' : `<div class="cv-pop-head"><h2>${esc(o.title)}</h2><button type="button" class="cv-x" data-pk-close aria-label="Close">${X}</button></div>`}
      <div class="cv-sv" role="slider" tabindex="0" aria-label="Saturation and brightness" aria-valuetext="${cur}" data-k="pk-sv" data-pk-sv style="--hue:${p.hue}">
        <span class="cv-sv-dot" style="left:${(p.sat * 100).toFixed(2)}%;top:${((1 - p.val) * 100).toFixed(2)}%"></span>
      </div>
      <label class="cv-field">Hue<input type="range" min="0" max="360" value="${p.hue}" data-k="pk-hue" data-pk-hue></label>
      <div class="cv-hexrow">
        <label class="cv-field">Hex<input type="text" class="cv-hex" value="${esc(p.hexDraft)}" spellcheck="false" autocomplete="off" data-k="pk-hex" data-pk-hex></label>
        <button type="button" class="cv-drop" data-k="pk-drop" data-pk-drop aria-label="Pick a color from the screen"${root.EyeDropper ? '' : ' aria-disabled="true" title="Your browser cannot pick a color from the screen"'}>${DROP}</button>
      </div>
      <div class="cv-readout"><span>RGB ${r}, ${g}, ${b}</span><span>CMYK ${k.join(' ')}</span></div>
      <p class="cv-note">CMYK is shown for reference. Your files stay sRGB, the color space KDP accepted.</p>
      <div class="cv-sws">${PRESETS.map((h) => swatch(h, cur, 'pk')).join('')}</div>
      ${p.recent && p.recent.length ? `<div class="cv-recent">Recent${p.recent.map((h) => swatch(h, cur, 'pkr')).join('')}</div>` : ''}
      ${o.note ? `<p class="cv-note cv-note-2">${esc(o.note)}</p>` : ''}`;
  }

  function bind(el, p, api) {
    const sv = el.querySelector('[data-pk-sv]');
    const at = (e) => {
      const r = sv.getBoundingClientRect();
      const sat = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const val = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      api.hsv(p.hue, sat, val);
    };
    let down = false;
    sv.addEventListener('pointerdown', (e) => { down = true; sv.setPointerCapture(e.pointerId); at(e); });
    sv.addEventListener('pointermove', (e) => { if (down) at(e); });
    sv.addEventListener('pointerup', () => { down = false; });
    sv.addEventListener('pointercancel', () => { down = false; });
    // Keyboard: left and right move saturation, up and down brightness (5 %, 1 % with Alt).
    sv.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const step = e.altKey ? 0.01 : 0.05;
      api.hsv(p.hue, Math.min(1, Math.max(0, p.sat + d[0] * step)), Math.min(1, Math.max(0, p.val + d[1] * step)));
    });
    el.querySelector('[data-pk-hue]').addEventListener('input', (e) => api.hsv(Number(e.target.value), p.sat, p.val));
    const hex = el.querySelector('[data-pk-hex]');
    const takeHex = () => { const h = normHex(hex.value); if (h) api.set(h, true); else hex.setAttribute('aria-invalid', 'true'); };
    hex.addEventListener('change', takeHex);
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); takeHex(); } });
    el.querySelector('[data-pk-drop]').addEventListener('click', () => {
      if (!root.EyeDropper) return;
      new root.EyeDropper().open().then((res) => {
        const v = res.sRGBHex.length === 7 ? res.sRGBHex : rgbToHex.apply(null, (res.sRGBHex.match(/\d+/g) || [0, 0, 0]).map(Number));
        api.set(v.toUpperCase(), true);
      }).catch(() => {});
    });
    el.querySelectorAll('[data-hex]').forEach((b) => b.addEventListener('click', () => api.set(b.dataset.hex, true)));
    const x = el.querySelector('[data-pk-close]'); if (x) x.addEventListener('click', () => api.close());
  }

  /** In place, while the square or the hue slider is dragged: the dot, the hue, the hex, the read-out, the swatch marks. */
  function update(el, p, cur) {
    const sv = el.querySelector('[data-pk-sv]');
    if (sv) {
      sv.style.setProperty('--hue', p.hue);
      sv.setAttribute('aria-valuetext', cur);
      const dot = sv.querySelector('.cv-sv-dot');
      if (dot) { dot.style.left = (p.sat * 100).toFixed(2) + '%'; dot.style.top = ((1 - p.val) * 100).toFixed(2) + '%'; }
    }
    const hue = el.querySelector('[data-pk-hue]'); if (hue && document.activeElement !== hue) hue.value = p.hue;
    const hex = el.querySelector('[data-pk-hex]'); if (hex) { hex.value = cur; hex.removeAttribute('aria-invalid'); }
    const [r, g, b] = hexToRgb(cur), k = cmyk(cur);
    const ro = el.querySelectorAll('.cv-readout span');
    if (ro.length === 2) { ro[0].textContent = `RGB ${r}, ${g}, ${b}`; ro[1].textContent = `CMYK ${k.join(' ')}`; }
    el.querySelectorAll('[data-hex]').forEach((s) => { const on = s.dataset.hex === cur; s.classList.toggle('is-on', on); s.setAttribute('aria-pressed', String(on)); });
  }

  C.picker = { PRESETS, hexToRgb, rgbToHex, hsvToHex, hexToHsv, cmyk, normHex, remember, html, bind, update };
})(globalThis);
