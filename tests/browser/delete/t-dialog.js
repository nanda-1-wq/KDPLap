const test = async (page) => {
  const SB = 'https://hmtxnbgfzwqawfulwwrg.supabase.co';
  const U = '00000000-0000-4000-8000-000000000001';
  const B1 = 'b1b1b1b1-0000-4000-8000-000000000001', B2 = 'b2b2b2b2-0000-4000-8000-000000000002';
  const ctx = page.context();
  await ctx.unrouteAll();
  await ctx.addInitScript(([U]) => {
    const user = { id: U, email: 'test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
    localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, user }));
  }, [U]);
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/**', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript' }));
  let failCounts = false;
  const counts = { [B1]: { research_sources: 4, competitors: 3, title_options: 1, research_insights: 1, positioning: 1 }, [B2]: {} };
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  await ctx.route(SB + '/**', async (r) => {
    const url = r.request().url();
    const json = (status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(body) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/auth/v1/user')) return json(200, { id: U, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' });
    const m = url.match(/rest\/v1\/(\w+)/); const t = m && m[1];
    const book = (url.match(/book_id=eq\.([\w-]+)/) || [])[1];
    if (t === 'user_settings') return json(200, { user_id: U, monthly_token_limit: 2000000, default_trim: '6x9' });
    if (t === 'ai_usage') return json(200, []);
    if (t === 'books') return json(200, [
      { id: B1, title: 'Full Book', subtitle: null, status: 'in_progress', current_step: 4, updated_at: '2026-10-04T10:00:00Z', topic_id: null, pen_names: null, book_briefs: { length_range: null, topic_text: 'x' }, chapters: [] },
      { id: B2, title: 'Empty Book', subtitle: null, status: 'in_progress', current_step: 1, updated_at: '2026-10-03T10:00:00Z', topic_id: null, pen_names: null, book_briefs: { length_range: null, topic_text: 'y' }, chapters: [] }]);
    if (t === 'chapters') {
      if (failCounts) return json(500, { message: 'boom' });
      return json(200, book === B1 ? [{ id: 'c1', sections: [{ section_versions: [{ count: 5 }] }, { section_versions: [{ count: 2 }] }] }, { id: 'c2', sections: [] }] : []);
    }
    if (counts[book] && t in { research_sources: 1, competitors: 1, title_options: 1, research_insights: 1, positioning: 1 }) {
      const n = counts[book][t] || 0;
      return r.fulfill({ status: 200, headers: { ...cors, 'content-range': '*/' + n }, body: '' });
    }
    return json(200, []);
  });
  const perr = []; page.on('pageerror', (e) => perr.push(e.message));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('http://localhost:5500/app/dashboard.html', { waitUntil: 'domcontentloaded' });
  const out = [];
  const openDel = async (title) => {
    const card = page.locator('.book-card, [data-book-id]', { hasText: title }).first();
    await card.waitFor({ timeout: 10000 });
    await card.locator('[aria-haspopup="menu"], .card-menu-btn, [data-menu]').first().click();
    await page.locator('[data-action="delete"]:visible').click();
    await page.locator('#delDesc ul').waitFor({ timeout: 5000 });
    const lines = await page.locator('#delDesc li').allTextContents();
    const text = (await page.locator('#delDesc').innerText()).replace(/\n+/g, ' / ');
    return { lines, text };
  };
  const a = await openDel('Full Book');
  out.push('FULL: ' + JSON.stringify(a.lines));
  out.push('TEXT: ' + a.text);
  await page.screenshot({ path: `${SHOTS}/del-full.png`, timeout: 8000 }).catch(() => out.push('shot timeout'));
  await page.keyboard.press('Escape');
  const b = await openDel('Empty Book');
  out.push('EMPTY: ' + JSON.stringify(b.lines));
  await page.keyboard.press('Escape');
  failCounts = true;
  const c = await openDel('Full Book');
  out.push('FAIL: ' + JSON.stringify(c.lines));
  await page.setViewportSize({ width: 375, height: 800 });
  await page.screenshot({ path: `${SHOTS}/del-fail-phone.png`, timeout: 8000 }).catch(() => out.push('shot timeout'));
  const ok = JSON.stringify(a.lines) === JSON.stringify(['The Brief', '3 competitors', '4 research notes', 'Review insights', 'Positioning', '1 title idea', '2 chapters and 7 versions'])
    && JSON.stringify(b.lines) === JSON.stringify(['The Brief'])
    && c.lines.length === 7 && c.lines[6] === 'Chapters and their versions'
    && a.text.includes('Your topic and pen name are kept. This cannot be undone.');
  out.push(ok ? 'PASS delete dialog list' : 'FAIL delete dialog list');
  if (perr.length) out.push('PAGEERR ' + perr.join(' | '));
  return out.join('\n');
};
