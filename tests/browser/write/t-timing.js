// Step 06 Write, typing in a long section (PRODUCE gate G2, P2). Not a pass or
// fail on speed: the times print as INFO lines (median and worst), at normal
// CPU and at 4x slower CPU (CDP), with the Versions tab and with the Checks tab
// open. The PASS lines check only what typing must do: the section size, every
// character arrives, the draft is sent, and the Versions panel after typing is
// the same HTML as a full render.
//   "input path" = all input listeners on the editor for one keystroke.
//   "refresh" = the 400 ms debounced timers that run after typing stops.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const info = (msg) => log.push(`INFO ${msg}`);
  const st = globalThis.__store;
  const SID = st.long;
  const KEYS = 50;
  const TYPED = 'and sit tall in the chair with both feet flat now.';   // 50 characters

  // At least 16,000 words, under the 100,000-character limit (0018).
  const para = 'Sit tall and let your arms rest on your legs. Breathe in as you lift your chin a bit, then breathe out as you drop it. Do this five times with care.';
  const text = Array.from({ length: 112 }, (_, i) => `## Part ${i + 1}\n\n${para}\n\n${para} ${para}\n\n${para}\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor`).join('\n\n');
  const words = st.count(text);
  ok(words >= 16000 && text.length < 99000 && TYPED.length === KEYS, `the section holds ${words.toLocaleString('en-US')} words in ${text.length.toLocaleString('en-US')} characters`);

  const stats = (a) => {
    if (!a.length) return 'none';
    const s = [...a].sort((x, y) => x - y);
    const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return `median ${mid.toFixed(1)} ms, worst ${s[s.length - 1].toFixed(1)} ms (n ${s.length})`;
  };

  await page.goto('about:blank');
  const p = await page.context().newPage();
  try {
    await p.addInitScript(() => {
      // Time every input listener on the editor, added up per keystroke (event.timeStamp).
      const per = window.__inp = new Map();
      const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (type !== 'input' || typeof fn !== 'function') return add.call(this, type, fn, opts);
        const el = this;
        return add.call(this, type, function (e) {
          if (!(el.matches && el.matches('[data-editor]'))) return fn.call(this, e);
          const t0 = performance.now();
          try { return fn.call(this, e); } finally { per.set(e.timeStamp, (per.get(e.timeStamp) || 0) + performance.now() - t0); }
        }, opts);
      };
      // The 400 ms debounced timers (the Checks refresh).
      window.__refresh = [];
      const real = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => (ms === 400 && typeof fn === 'function'
        ? real(() => { const t0 = performance.now(); try { fn(...args); } finally { window.__refresh.push(performance.now() - t0); } }, ms)
        : real(fn, ms, ...args));
      window.__long = [];
      window.__evt = [];
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask' }); } catch (e) { /* not there */ }
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (['keydown', 'keypress', 'input', 'beforeinput', 'keyup'].includes(e.name)) window.__evt.push(e.duration); })).observe({ type: 'event', durationThreshold: 16 }); } catch (e) { /* not there */ }
    });
    const cdp = await p.context().newCDPSession(p);
    await p.setViewportSize({ width: 1440, height: 960 });

    for (const rate of [1, 4]) {
      for (const tab of ['versions', 'checks']) {
        // The same start for every run: the long text is the saved version, no draft.
        st.addVersion(SID, text, 'manual');
        delete st.drafts[SID];
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await p.goto(`http://127.0.0.1:5500/app/book.html?id=e7e7e7e7-0000-4000-8000-000000000007&step=6&section=${SID}`, { waitUntil: 'domcontentloaded' });
        await p.waitForSelector('[data-editor][contenteditable="true"]', { timeout: 15000 });
        await p.waitForTimeout(600);
        if (tab === 'checks') { await p.click('[data-tab="checks"]'); await p.waitForTimeout(600); }
        // The caret at the end of a paragraph in the middle of the section.
        await p.evaluate(() => {
          const ed = document.querySelector('[data-editor]');
          const ps = ed.querySelectorAll('p');
          const el = ps[Math.floor(ps.length / 2)];
          ed.focus();
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(false);
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
          window.__inp.clear(); window.__refresh.length = 0; window.__long.length = 0; window.__evt.length = 0;
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await p.keyboard.type(TYPED, { delay: 60 });
        await p.waitForTimeout(1500 * rate);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const r = await p.evaluate(() => ({ inp: [...window.__inp.values()], refresh: window.__refresh.slice(), long: window.__long.slice(), evt: window.__evt.slice(),
          has: document.querySelector('[data-editor]').innerText.includes('and sit tall in the chair with both feet flat now.') }));
        const label = `${rate}x CPU, ${tab} tab`;
        ok(r.has && r.inp.length === KEYS, `${label}: all ${KEYS} characters arrived (${r.inp.length} input events)`);
        ok(!!st.drafts[SID] && st.drafts[SID].content.includes(TYPED), `${label}: the draft was sent`);
        info(`${label}: input path ${stats(r.inp)}`);
        info(`${label}: debounced refresh ${stats(r.refresh)}`);
        info(`${label}: long tasks over 50 ms: ${r.long.length}${r.long.length ? ` (worst ${Math.max(...r.long).toFixed(0)} ms)` : ''}; key events over 16 ms to next paint: ${r.evt.length}${r.evt.length ? ` (worst ${Math.max(...r.evt).toFixed(0)} ms)` : ''}`);
        if (tab === 'versions') {
          // The panel after typing is exactly what a full render gives.
          const typed = await p.$eval('[data-panel]', (e) => e.innerHTML);
          await p.click('[data-tab="versions"]');
          const full = await p.$eval('[data-panel]', (e) => e.innerHTML);
          ok(typed === full && /Unsaved changes/.test(typed), `${label}: the Versions panel after typing equals a full render`);
        }
      }
    }
  } finally {
    await p.close();
  }
  return log.join('\n');
};
