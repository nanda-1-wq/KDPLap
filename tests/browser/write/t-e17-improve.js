// Step 06 Write, E17 Part 6: Improve on book parts (stage part_improve). About the author: the request
// (part id, base, no sectionId), the suggestion card, Accept (apply_part_suggestion: a new current version
// with source = the action, the suggestion used), Reject (nothing written), a stale base at the request
// (version_conflict: the newest text loads) and at Accept (no version written), offline (the network
// error with Try again), the new codes (ai_new_facts, part_no_improve), the save error at Accept, and the
// epigraph with Improve off (no button, no floating button, Alt+Enter does nothing, no request).
// Run: tests/browser/run.sh write t-e17-improve.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const g = (fn, arg) => page.evaluate(fn, arg);
  const until = async (fn, arg, ms = 4000) => { try { await page.waitForFunction(([src, a]) => { try { return (0, eval)(`(${src})`)(a); } catch (e) { return false; } }, [fn.toString(), arg], { timeout: ms }); return true; } catch (e) { return false; } };
  const part = (k) => st.partOf(W1, k);
  const versionsOf = (k) => st.parts.versions.filter((v) => v.part_id === part(k).id).sort((a, b) => a.version_no - b.version_no);
  const writes = (t) => st.writes.filter((w) => w.table === t || w.fn === t);
  const text = (sel) => g((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const edText = () => text('[data-editor]');
  const live = () => g(() => [...document.querySelectorAll('[data-live], [aria-live]')].map((e) => e.textContent).join(' | '));
  const imps = () => g(() => window.__imp.requests.map((r) => r.body));
  const reply = (status, body) => g(([s, b]) => window.__imp.reply(s, b), [status, body]);
  const cardKind = () => g(() => (document.querySelector('[data-imp-card]') || { dataset: {} }).dataset.impCard || '');
  const waitCard = (k) => until((k) => (document.querySelector('[data-imp-card]') || {}).dataset?.impCard === k, k);
  const cardText = () => text('[data-imp-card]');
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  globalThis.__modes.parts = 1;
  const open = async (k) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6&part=${part(k).id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-editor]', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
  };
  /** Selects the whole editor text (the selection events Improve listens to). */
  const selectAll = () => g(() => {
    const ed = document.querySelector('[data-editor]');
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(ed);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const ask = async (act = 'improve') => {
    const n = (await imps()).length;
    await selectAll();
    await page.waitForTimeout(250);
    await page.click('[data-imp-open]');
    await page.waitForSelector('[data-imp-menu]', { timeout: 3000 });
    await page.click(`[data-imp-act="${act}"]`);
    await until((n) => window.__imp.requests.length === n + 1, n);
    return (await imps()).slice(-1)[0];
  };
  let sgn = 0;
  /** A suggestion: saved in the mock's part_suggestions (for apply_part_suggestion), then sent as the reply. */
  const suggest = async (req, output) => {
    const id = `5c000000-0000-4000-8000-${String(++sgn).padStart(12, '0')}`;
    st.parts.suggestions[id] = { id, part_id: req.partId, action: req.action, selection: req.selection, output, base_version_id: req.baseVersionId, used_at: null, created_at: new Date().toISOString() };
    await reply(200, { stage: 'part_improve', suggestionId: id, action: req.action, text: output, words: { before: st.count(req.selection), after: st.count(output) }, flagged: 0, notes: { markersLost: 0, newNames: [], structureChanged: null } });
    await waitCard('review');
    return id;
  };
  /** Another tab saves a new current version of the part. */
  const otherTab = (k, content) => {
    const x = part(k);
    const v = { id: `8ff00000-0000-4000-8000-${String(Date.now() % 1e12).padStart(12, '0')}`, part_id: x.id, version_no: versionsOf(k).length + 1, content, word_count: st.count(content), source: 'manual', label: null, partial: false, created_at: new Date().toISOString() };
    st.parts.versions.push(v);
    x.current_version_id = v.id;
    return v;
  };

  /* ══ About the author: Accept ══ */
  part('about_author').enabled = true;
  await open('about_author');
  await until(() => document.querySelector('[data-editor]').textContent.includes('chair yoga'));
  const v1 = versionsOf('about_author').slice(-1)[0];
  const BIO = v1.content;
  const req1 = await ask('improve');
  ok(req1.stage === 'part_improve' && req1.partId === part('about_author').id && !('sectionId' in req1) && req1.baseVersionId === v1.id && req1.action === 'improve' && req1.selection === BIO,
    `request: part_improve, part id, base v${v1.version_no}, the passage (${req1.stage}, ${req1.baseVersionId === v1.id})`);
  ok(!Object.keys(req1).some((k) => /limit|budget|token|max/i.test(k)), `request: no limit or budget keys (${Object.keys(req1).join(',')})`);
  ok(await cardKind() === 'loading', 'loading card while the call runs');
  const OUT1 = 'Nora Hale teaches chair yoga to adults over 60. She lives in Ohio with her two dogs, who join every class.';
  const s1 = await suggest(req1, OUT1);
  ok(/Accept/.test(await cardText()) && /Reject/.test(await cardText()), 'review card: Accept and Reject');
  await page.click('[data-imp-accept]');
  await until(() => !document.querySelector('[data-imp-card]'));
  await until((t) => document.querySelector('[data-editor]').textContent.includes(t), 'who join every class');
  const aw = writes('apply_part_suggestion');
  const vNew = versionsOf('about_author').slice(-1)[0];
  ok(aw.length === 1 && aw[0].body.p_suggestion_id === s1 && aw[0].body.p_base_version_id === v1.id && aw[0].body.p_full_text === OUT1, `Accept: apply_part_suggestion with the suggestion, base and full text (${aw.length})`);
  ok(vNew.source === 'improve' && vNew.content === OUT1 && part('about_author').current_version_id === vNew.id && !!st.parts.suggestions[s1].used_at, `Accept: v${vNew.version_no} current, source improve, suggestion used`);
  ok((await edText()).includes('who join every class') && writes('apply_suggestion').length === 0, 'Accept: the editor shows the new text; never the section RPC');
  ok(/Saved as version \d+ · Improved\./.test(await live()), `Accept: announced (${((await live()).match(/Saved as version[^|]*/) || [''])[0].trim()})`);

  /* ══ Reject ══ */
  const before2 = versionsOf('about_author').length;
  const req2 = await ask('shorten');
  ok(req2.baseVersionId === vNew.id, 'second request: the new base');
  const s2 = await suggest(req2, 'Nora Hale teaches chair yoga to adults over 60.');
  await page.click('[data-imp-reject]');
  await until(() => !document.querySelector('[data-imp-card]'));
  ok(versionsOf('about_author').length === before2 && !st.parts.suggestions[s2].used_at && writes('apply_part_suggestion').length === 1, 'Reject: nothing written, the suggestion unused');
  ok(await edText() === OUT1.replace(/\s+/g, ' ') && /Suggestion rejected\. Your text did not change\./.test(await live()), 'Reject: the text unchanged, announced');

  /* ══ Stale base at the request: version_conflict loads the newest text ══ */
  await ask('improve');
  const OTHER = 'Nora Hale teaches gentle chair yoga. She lives in Ohio.';
  otherTab('about_author', OTHER);
  await reply(409, { error: 'version_conflict' });
  await until((t) => document.querySelector('[data-editor]').textContent.includes(t), 'teaches gentle chair yoga');
  ok(!(await cardKind()) && (await edText()) === OTHER && /This part was updated in another tab\. The newest text is shown\./.test(await live()), `stale base: card closed, the newest text, part wording (${(await live()).slice(-70)})`);

  /* ══ Stale base at Accept: no version written ══ */
  const req4 = await ask('improve');
  const s4 = await suggest(req4, 'Nora Hale teaches gentle chair yoga at home. She lives in Ohio.');
  const n4 = versionsOf('about_author').length;
  otherTab('about_author', 'Nora Hale teaches chair yoga online now. She lives in Ohio.');
  await page.click('[data-imp-accept]');
  await until(() => /online now/.test(document.querySelector('[data-editor]').textContent), null, 6000);
  ok(versionsOf('about_author').length === n4 + 1 && versionsOf('about_author').slice(-1)[0].source === 'manual' && !st.parts.suggestions[s4].used_at, 'stale at Accept: only the other tab\'s version, the suggestion unused');
  ok((await edText()).includes('online now'), 'stale at Accept: the newest text shows');

  // As sections: the card stays open on the old suggestion; the writer closes it.
  ok(['review', 'changed'].includes(await cardKind()), `stale at Accept: the card stays (${await cardKind()})`);
  await page.click((await page.$('[data-imp-reject]')) ? '[data-imp-reject]' : '[data-imp-close]');
  await until(() => !document.querySelector('[data-imp-card]'));

  /* ══ Offline: the network error with Try again; nothing changes ══ */
  const t5 = await edText();
  await ask('improve');
  await g(() => window.__imp.fail());
  await waitCard('error');
  ok(/We couldn’t reach NicheInk\. Check your connection\./.test(await cardText()) && !!(await page.$('[data-imp-retry]')), `offline: the network line and Try again (${(await cardText()).slice(0, 60)})`);
  ok(await edText() === t5, 'offline: the text unchanged');
  // Try again sends the same passage and action.
  await page.click('[data-imp-retry]');
  await until(() => window.__imp.requests.length >= 1 && window.__imp.pending.length === 1);
  const again = (await imps()).slice(-1)[0];
  ok(again.stage === 'part_improve' && again.selection === t5, 'Try again: the same part and passage');

  /* ══ New codes: ai_new_facts (Try again), part_no_improve (no retry) ══ */
  await reply(502, { error: 'ai_new_facts' });
  await waitCard('error');
  ok(/The suggestion added facts that are not in your text, so we didn’t show it\./.test(await cardText()) && /not counted/.test(await cardText()) && !!(await page.$('[data-imp-retry]')), `ai_new_facts: the line, not counted, Try again (${(await cardText()).slice(0, 90)})`);
  await page.click('[data-imp-retry]');
  await until(() => window.__imp.pending.length === 1);
  await reply(422, { error: 'part_no_improve' });
  await waitCard('error');
  ok(/Improve is off for this part\./.test(await cardText()) && !(await page.$('[data-imp-retry]')), 'part_no_improve: the line, no Try again');
  await page.click('[data-imp-close]');
  await until(() => !document.querySelector('[data-imp-card]'));

  /* ══ The save fails at Accept: the error with Try again; Try again saves ══ */
  const req7 = await ask('improve');
  const s7 = await suggest(req7, (await edText()).replace('She lives in Ohio.', 'She lives and teaches in Ohio.'));
  globalThis.__modes.applyError = 1;
  await page.click('[data-imp-accept]');
  await waitCard('error');
  ok(/We couldn’t save the change\. Your text is safe\./.test(await cardText()), 'save error: the line');
  delete globalThis.__modes.applyError;
  await page.click('[data-imp-retry]');
  await until(() => !document.querySelector('[data-imp-card]'), null, 6000);
  ok(!!st.parts.suggestions[s7].used_at && versionsOf('about_author').slice(-1)[0].source === 'improve', 'save error: Try again applies it');

  /* ══ Epigraph: Improve off ══ */
  part('epigraph').enabled = true;
  await open('epigraph');
  await page.click('[data-editor]');
  await page.keyboard.type('The body benefits from movement, and the mind benefits from stillness.');
  const n8 = (await imps()).length;
  await selectAll();
  await page.waitForTimeout(400);
  const E = await g(() => ({ btn: !!document.querySelector('[data-imp-open]'), float: !!document.querySelector('[data-imp-float]'), hint: (document.querySelector('[data-quote-hint]') || {}).textContent || '' }));
  ok(!E.btn && !E.float && /Improve is off for quotes\./.test(E.hint), `epigraph: no Improve button, no floating button, the hint (${E.hint.trim().slice(0, 40)})`);
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(300);
  ok(!(await page.$('[data-imp-menu]')) && (await imps()).length === n8, 'epigraph: Alt+Enter opens no menu, no request');

  ok(errs.length === 0, `no page errors (${errs.join(' | ').slice(0, 200)})`);
  return log.join('\n');
};
