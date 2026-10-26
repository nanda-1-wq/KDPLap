// shared: e11
// Pen name detail (E12 H2): the shared E11 mock, plus one pen name with its
// facts and voice, read by id and saved by the page's autosave.
const PEN = {
  id: E11.PA, name: 'Elena Vance', niche: 'Somatic self-regulation for women', bio_text: '', updated_at: '2026-10-20T10:00:00+00:00', books: [],
  bio_facts: { background: 'Wellness practitioner. Over a decade of community work with women.', credentials: '', personal: 'Enjoys yoga and nature walks.' },
  voice: { tones: ['warm', 'practical'], reading_level: 'general', perspective: 'third', sentences: 'short', paragraphs: 'medium', sample: '' }
};
const setup = async (page) => {
  await setupE11(page);
  globalThis.__store.pen = JSON.parse(JSON.stringify(PEN));
  globalThis.__store.penPatches = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  // Registered after the shared mock, so it answers first; anything else falls back to it.
  await page.context().route('https://hmtxnbgfzwqawfulwwrg.supabase.co/rest/v1/pen_names**', async (r) => {
    const req = r.request();
    if (!/[?&]id=eq\./.test(req.url())) return r.fallback();
    const pen = globalThis.__store.pen;
    const json = (body) => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'GET') return json(/vnd\.pgrst\.object/.test(req.headers()['accept'] || '') ? pen : [pen]);
    if (req.method() === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}');
      globalThis.__store.penPatches.push(patch);
      Object.assign(pen, patch, { updated_at: new Date().toISOString() });
      return json([{ id: pen.id, name: pen.name, updated_at: pen.updated_at }]);
    }
    return r.fallback();
  });
};
