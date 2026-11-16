// Pictures for the mocked 09 Cover tests (E16 Part 6). Every picture is made in the page (a canvas), never a
// real photo: a synthetic "photo" (sky, sun, hills), a see-through PNG cutout, and small PDFs built by hand.
// Files reach the app the way a person's do: a File set on the real file field (DataTransfer) and its change
// event, or a paste event with the file on its clipboardData.
const PIC = {
  /**
   * Makes a picture file in the page and keeps it as window.__pic[key].
   * o: { w, h, type: 'image/jpeg' | 'image/png', alpha (see-through PNG), name, quality, pad (bytes added to the end) }
   */
  make: (page, key, o) => page.evaluate(async ([key, o]) => {
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
    const g = c.getContext('2d');
    if (!o.alpha) {
      const sky = g.createLinearGradient(0, 0, 0, o.h); sky.addColorStop(0, '#6FA8DC'); sky.addColorStop(1, '#F6C58F');
      g.fillStyle = sky; g.fillRect(0, 0, o.w, o.h);
      g.fillStyle = '#FFD966'; g.beginPath(); g.arc(o.w * 0.7, o.h * 0.35, Math.min(o.w, o.h) * 0.12, 0, 7); g.fill();
      g.fillStyle = '#3B6E3B'; g.beginPath(); g.moveTo(0, o.h); g.quadraticCurveTo(o.w * 0.3, o.h * 0.45, o.w * 0.6, o.h * 0.8); g.quadraticCurveTo(o.w * 0.8, o.h * 0.6, o.w, o.h * 0.75); g.lineTo(o.w, o.h); g.fill();
      // a red mark at the top left, so flips and crops show in pixels
      g.fillStyle = '#C0392B'; g.fillRect(0, 0, o.w * 0.15, o.h * 0.15);
    } else {
      g.fillStyle = '#7A2E2E'; g.beginPath(); g.arc(o.w / 2, o.h / 2, Math.min(o.w, o.h) * 0.4, 0, 7); g.fill();
    }
    let blob = await new Promise((r) => c.toBlob(r, o.type || 'image/jpeg', o.quality || 0.9));
    if (o.pad) blob = new Blob([blob, new Uint8Array(o.pad)], { type: blob.type });
    window.__pic = window.__pic || {};
    window.__pic[key] = new File([blob], o.name || `picture.${(o.type || 'image/jpeg') === 'image/png' ? 'png' : 'jpg'}`, { type: o.fileType || blob.type });
    c.width = 0;
    return window.__pic[key].size;
  }, [key, o]),
  /** Any bytes as a file (a PDF, a GIF, text), from an array of numbers or a string. */
  raw: (page, key, { bytes, text, name, type }) => page.evaluate(([key, bytes, text, name, type]) => {
    window.__pic = window.__pic || {};
    window.__pic[key] = new File([text != null ? text : new Uint8Array(bytes)], name, { type });
    return window.__pic[key].size;
  }, [key, bytes || null, text == null ? null : text, name, type]),
  /** A small PDF with n pages (letter size, a number drawn on each), made by hand: 1.4, no fonts needed. */
  pdf(n, { w = 612, h = 792 } = {}) {
    const objs = [];
    const pages = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    for (let i = 0; i < n; i++) {
      const pid = 3 + i * 2, cid = 4 + i * 2;
      pages.push(`${pid} 0 R`);
      // a gray band and a black box that moves with the page number (so pages differ in pixels)
      const stream = `0.85 g 0 ${h - 120} ${w} 120 re f 0 g ${40 + i * 30} 300 120 120 re f`;
      objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${cid} 0 R /Resources << >> >>`;
      objs[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }
    objs[2] = `<< /Type /Pages /Kids [${pages.join(' ')}] /Count ${n} >>`;
    let out = '%PDF-1.4\n';
    const offs = [];
    for (let k = 1; k < objs.length; k++) { offs[k] = out.length; out += `${k} 0 obj\n${objs[k]}\nendobj\n`; }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  },
  /** Puts window.__pic[key] on the real file field and sends its change event (what a pick in the dialog does). */
  pick: (page, key, which = 'file') => page.evaluate(([key, which]) => {
    const inp = document.querySelector(which === 'pdf' ? '[data-up-pdf]' : '[data-up-file]');
    if (!inp) return 'no field';
    const dt = new DataTransfer(); dt.items.add(window.__pic[key]);
    inp.disabled = false;   // a disabled field takes no file from the dialog; the app reads rights itself
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  }, [key, which]),
  /** A paste event on the cover with window.__pic[key] on its clipboard. */
  paste: (page, key, target) => page.evaluate(([key, target]) => {
    const dt = new DataTransfer(); if (key) dt.items.add(window.__pic[key]); else dt.setData('text/plain', 'just words');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    (target ? document.querySelector(target) : document.body).dispatchEvent(ev);
    return ev.defaultPrevented;
  }, [key, target || null]),
  /** Opens Images and ticks the rights box. */
  async ready(page, tick = true) {
    await page.click('[data-tool="images"]');
    await page.waitForSelector('[data-rights]');
    if (tick && !(await page.$eval('[data-rights]', (e) => e.checked))) await page.click('[data-rights]');
  },
  /** Waits until no upload is running (the busy line is gone). */
  idle: (page) => page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && !E.img.busy; }, null, { timeout: 20000 }),
  /** Waits until every picture the cover uses is drawn or known missing. */
  drawn: (page) => page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && E.cover.layers.filter((l) => l.type === 'image' && l.asset).every((l) => { const s = kdpCover.images.state(E, l); return s === 'ready' || s === 'missing' || s === 'failed'; }); }, null, { timeout: 20000 }),
  /** The image layers. */
  layers: (page) => page.evaluate(() => window.kdpBookSteps[9]._debug().cover.layers.filter((l) => l.type === 'image')),
  /** An uploaded file row in the mock store with its file, as 0030 would hold it (for a picture already in Uploads). */
  seed(row, file) { const st = globalThis.__store; st.assets.push(row); if (file) st.files[row.path] = file; }
};
