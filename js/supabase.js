/* ═══════════════════════════════════════════════════
   KDP Lab — Supabase Client & Auth Helpers
   /js/supabase.js

   Load AFTER the supabase-js UMD bundle:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="<depth>/js/supabase.js"></script>
═══════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://hmtxnbgfzwqawfulwwrg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdHhuYmdmendxYXdmdWx3d3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDM2NjYsImV4cCI6MjA5NTcxOTY2Nn0.VsVQF4YymMAr5d_P709Zw8C2-5gr3FSggbIbcc3zh4I';

// Show the "Continue with Google" button (provider enabled in Supabase).
const GOOGLE_ENABLED = true;

// Shared client — accessible as window.sb if needed
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Where each topic count came from, and when (migration 0006).
const TOPIC_SOURCES = 'winning_source, winning_set_at, dead_source, dead_set_at, authority_source, authority_set_at';

window.kdp = {

  googleEnabled: GOOGLE_ENABLED,

  /* ── Auth ─────────────────────────────────────── */

  async signUp(name, email, password) {
    return window.sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
  },

  async signIn(email, password) {
    return window.sb.auth.signInWithPassword({ email, password });
  },

  async signInWithGoogle(redirectTo) {
    return window.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  },

  async signOut() {
    await window.sb.auth.signOut();
  },

  async resendConfirmation(email) {
    return window.sb.auth.resend({ type: 'signup', email });
  },

  async resetPassword(email) {
    // Resolved against the current page, so it also works under a sub-path (GitHub Pages).
    const redirectTo = new URL('reset-password.html', location.href).href;
    return window.sb.auth.resetPasswordForEmail(email, { redirectTo });
  },

  async updatePassword(password) {
    return window.sb.auth.updateUser({ password });
  },

  /** Subscribe to auth events (e.g. PASSWORD_RECOVERY). Returns the subscription. */
  onAuthChange(callback) {
    const { data } = window.sb.auth.onAuthStateChange(callback);
    return data.subscription;
  },

  async getSession() {
    const { data } = await window.sb.auth.getSession();
    return data.session;
  },

  async getUser() {
    const { data } = await window.sb.auth.getUser();
    return data.user;
  },

  /**
   * Guard a page: if no active session, redirect to loginPath.
   * Returns the user object if authenticated.
   * Usage: const user = await kdp.requireAuth('../login.html');
   */
  async requireAuth(loginPath) {
    const session = await this.getSession();
    if (!session) {
      location.replace(loginPath);
      return null;
    }
    return session.user;
  },

  /* ── Books ────────────────────────────────────── */

  // Puzzle books (parked generators) have no table since the E2 data model.
  // `notice` marks this as expected, so pages show it calmly, not as a failure.
  async saveBook() {
    const error = new Error('Saving puzzle books returns in a later version.');
    error.notice = true;
    return { error };
  },

  /** Books for the Books page, with pen name, brief length, and chapter targets. One query. */
  async listBooks() {
    return window.sb
      .from('books')
      .select(`id, title, subtitle, status, current_step, updated_at, topic_id,
               pen_names ( name ),
               book_briefs ( length_range, topic_text ),
               chapters ( word_target, needs_review )`)
      .order('updated_at', { ascending: false });
  },

  /**
   * One book for the book page, with its Brief, pen name, and source topic.
   * data is null when the id is not the user's (RLS).
   */
  async getBook(id) {
    return window.sb
      .from('books')
      .select(`id, title, status, current_step, updated_at, topic_id, pen_name_id, series_name, series_number,
               pen_names ( id, name, voice ),
               topics ( id, name, checks_passed ),
               book_briefs ( topic_text, target_reader, reader_problem, promise_draft, book_type,
                             trim_size, length_range, chapter_count, options, updated_at )`)
      .eq('id', id)
      .maybeSingle();
  },

  /**
   * Writes the given Brief fields (step 01). The caller trims and sends null
   * for an empty field; the database checks lengths and options (migration 0007).
   * RLS hides other users' rows, so an update that matches no row is an error.
   */
  async updateBrief(bookId, fields) {
    const { data, error } = await window.sb
      .from('book_briefs')
      .update(fields)
      .eq('book_id', bookId)
      .select('book_id, updated_at');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: Object.assign(new Error('Book not found.'), { notFound: true }) };
    return { data: data[0], error: null };
  },

  /**
   * Writes the given books fields from the Brief (pen_name_id, series_name, series_number).
   * RLS checks the pen name is the user's own. 0 rows is an error.
   */
  async updateBook(id, fields) {
    const { data, error } = await window.sb
      .from('books')
      .update(fields)
      .eq('id', id)
      .select('id, updated_at');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: Object.assign(new Error('Book not found.'), { notFound: true }) };
    return { data: data[0], error: null };
  },

  /**
   * Records the furthest step reached. Only moves forward: a book already at
   * this step or later is left alone (0 rows is not an error here).
   */
  async setCurrentStep(id, step) {
    const { error } = await window.sb
      .from('books')
      .update({ current_step: step })
      .eq('id', id)
      .lt('current_step', step);
    return { error };
  },

  /** Pen names for the Brief's picker. */
  async listPenNameOptions() {
    return window.sb
      .from('pen_names')
      .select('id, name, voice')
      .order('name', { ascending: true });
  },

  /** Creates a book and its Brief in one transaction (supabase/migrations/0002). Returns the new id. */
  async createBook(topicId, topicText) {
    return window.sb.rpc('create_book', {
      p_topic_id: topicId || null,
      p_topic_text: topicText || null
    });
  },

  /**
   * Sets books.title (the working title; step 04 writes the same field).
   * The caller trims it; the database allows 1 to 200 characters (migration 0003).
   * RLS hides other users' rows, so an update that matches no row is an error.
   */
  async renameBook(id, title) {
    const { data, error } = await window.sb
      .from('books')
      .update({ title })
      .eq('id', id)
      .select('id, title, updated_at');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: Object.assign(new Error('Book not found.'), { notFound: true }) };
    return { data: data[0], error: null };
  },

  /** What a delete removes: chapters, section versions, research notes. Two queries. */
  async getBookCounts(id) {
    const [chapters, research] = await Promise.all([
      // sections and section_versions have two links (section_id, current_version_id); name the one to follow.
      window.sb
        .from('chapters')
        .select('id, sections ( section_versions!section_versions_section_id_fkey ( count ) )')
        .eq('book_id', id),
      window.sb
        .from('research_sources')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', id)
    ]);
    const error = chapters.error || research.error;
    if (error) return { data: null, error };
    const versions = chapters.data.reduce((sum, c) =>
      sum + (c.sections || []).reduce((s, sec) => s + ((sec.section_versions && sec.section_versions[0] && sec.section_versions[0].count) || 0), 0), 0);
    return { data: { chapters: chapters.data.length, versions, research: research.count || 0 }, error: null };
  },

  /**
   * Deletes the book row. Every child table cascades (supabase/migrations/0001).
   * RLS hides other users' rows, so a delete that removes nothing is an error.
   */
  async deleteBook(id) {
    const { error, count } = await window.sb
      .from('books')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) return { error };
    if (!count) return { error: Object.assign(new Error('Book not found.'), { notFound: true }) };
    return { error: null };
  },

  /* ── Topics ───────────────────────────────────── */

  /** Validated topics for the New Book dialog, most market checks first. */
  async listValidatedTopics() {
    return window.sb
      .from('topics')
      .select('id, name, checks_passed')
      .eq('status', 'validated')
      .order('checks_passed', { ascending: false })
      .order('updated_at', { ascending: false });
  },

  /** All topics for Topic Lab, with their book ids (for "Open book"). One query. */
  async listTopics() {
    return window.sb
      .from('topics')
      .select(`id, name, status, checks_passed, excitement, updated_at,
               winning_count, dead_count, authority_count, results_match, is_specific,
               books ( id, updated_at )`)
      .order('updated_at', { ascending: false });
  },

  /**
   * One topic for the detail page, with its saved page-1 books in page order.
   * data is null when the id is not the user's (RLS).
   */
  async getTopic(id) {
    return window.sb
      .from('topics')
      .select(`id, name, status, winning_count, dead_count, authority_count, monthly_searches,
               results_match, is_specific, excitement, author_fit, notes, checks_passed, updated_at,
               ${TOPIC_SOURCES},
               books ( id, updated_at ),
               topic_page_books ( position, title, author, bsr, reviews, rating, sponsored, included, created_at )`)
      .eq('id', id)
      .order('position', { referencedTable: 'topic_page_books' })
      .maybeSingle();
  },

  /** New topic with status 'idea'. The caller trims; the database allows 1 to 200 characters (migration 0004). */
  async createTopic(name, notes) {
    const { data, error } = await window.sb
      .from('topics')
      .insert({ name, notes: notes || null })
      .select('id');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: new Error('Topic not created.') };
    return { data: data[0], error: null };
  },

  /**
   * Writes the given topic fields. Returns the saved row with the new checks_passed.
   * RLS hides other users' rows, so an update that matches no row is an error.
   */
  async updateTopic(id, fields) {
    const { data, error } = await window.sb
      .from('topics')
      .update(fields)
      .eq('id', id)
      .select(`id, name, status, checks_passed, updated_at, ${TOPIC_SOURCES}`);
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: Object.assign(new Error('Topic not found.'), { notFound: true }) };
    return { data: data[0], error: null };
  },

  /**
   * Deletes the topic row. Its books stay: books.topic_id is set to null
   * (supabase/migrations/0001), and the Books page shows "Unvalidated topic".
   */
  async deleteTopic(id) {
    const { error, count } = await window.sb
      .from('topics')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) return { error };
    if (!count) return { error: Object.assign(new Error('Topic not found.'), { notFound: true }) };
    return { error: null };
  },

  /* ── Pen names ────────────────────────────────── */

  /** All pen names for the Pen Names page, with how many books use each. One query. */
  async listPenNames() {
    return window.sb
      .from('pen_names')
      .select('id, name, niche, bio_text, voice, updated_at, books ( count )')
      .order('name', { ascending: true });
  },

  /** One pen name for the detail page, with its books. data is null when the id is not the user's (RLS). */
  async getPenName(id) {
    return window.sb
      .from('pen_names')
      .select(`id, name, niche, bio_facts, bio_text, voice, updated_at,
               books ( id, title, current_step, updated_at, book_briefs ( topic_text ), chapters ( needs_review ) )`)
      .eq('id', id)
      .maybeSingle();
  },

  /** Books that use a pen name (for the delete dialog). */
  async listPenNameBooks(id) {
    return window.sb
      .from('books')
      .select('id, title, book_briefs ( topic_text )')
      .eq('pen_name_id', id)
      .order('updated_at', { ascending: false });
  },

  /** New pen name. The caller trims; the database allows 1 to 100 characters (migrations 0001, 0005). */
  async createPenName(name, niche) {
    const { data, error } = await window.sb
      .from('pen_names')
      .insert({ name, niche: niche || null })
      .select('id');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: new Error('Pen name not created.') };
    return { data: data[0], error: null };
  },

  /**
   * Writes the given pen name fields (name, niche, bio_facts, bio_text, voice).
   * RLS hides other users' rows, so an update that matches no row is an error.
   */
  async updatePenName(id, fields) {
    const { data, error } = await window.sb
      .from('pen_names')
      .update(fields)
      .eq('id', id)
      .select('id, name, updated_at');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: Object.assign(new Error('Pen name not found.'), { notFound: true }) };
    return { data: data[0], error: null };
  },

  /**
   * Deletes the pen name row. The database refuses (foreign key, code 23503)
   * while a book uses it (books.pen_name_id is "on delete restrict"), and it
   * clears user_settings.default_pen_name_id itself ("on delete set null").
   */
  async deletePenName(id) {
    const { error, count } = await window.sb
      .from('pen_names')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) return { error };
    if (!count) return { error: Object.assign(new Error('Pen name not found.'), { notFound: true }) };
    return { error: null };
  },

  /** The default pen name id for new books, or null. Reads only; no row means no default. */
  async getDefaultPenNameId() {
    const { data, error } = await window.sb
      .from('user_settings')
      .select('default_pen_name_id')
      .maybeSingle();
    return { data: data ? data.default_pen_name_id : null, error };
  },

  /** Sets (or with null, clears) the default pen name for new books. 0 rows is an error. */
  async setDefaultPenName(userId, penNameId) {
    const settings = await this.ensureUserSettings(userId);
    if (settings.error) return { data: null, error: settings.error };
    const { data, error } = await window.sb
      .from('user_settings')
      .update({ default_pen_name_id: penNameId })
      .eq('user_id', userId)
      .select('default_pen_name_id');
    if (error) return { data: null, error };
    if (!data.length) return { data: null, error: Object.assign(new Error('Settings not found.'), { notFound: true }) };
    return { data: data[0].default_pen_name_id, error: null };
  },

  /* ── AI (Edge Function "generate") ────────────── */

  /**
   * Run one AI stage on the server. Only ids go up; prompts live server-side.
   * Returns { data, error }. error.code is a short code from the function
   * (not_enough_facts, monthly_limit, rate_limited, ai_unavailable, ai_stopped,
   * ai_declined, not_amazon_page, unauthorized, not_found, bad_request,
   * server_error) or 'network' when the function could not be reached.
   * Input: { stage: 'bio', penNameId }, { stage: 'amazon_import', topicId, text },
   * or { stage: 'brief_help', bookId }.
   */
  async generate(input) {
    let res;
    try {
      res = await window.sb.functions.invoke('generate', { body: input });
    } catch (err) {
      return { data: null, error: { code: 'network' } };
    }
    if (!res.error) return { data: res.data, error: null };
    // A non-2xx reply carries { error: code } in the Response on error.context.
    const ctx = res.error.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body && typeof body.error === 'string') {
          return { data: null, error: { code: body.error, missing: typeof body.missing === 'string' ? body.missing : '' } };
        }
      } catch (err) { /* not JSON */ }
      if (ctx.status === 401) return { data: null, error: { code: 'unauthorized' } };
      return { data: null, error: { code: 'server_error' } };
    }
    return { data: null, error: { code: 'network' } };
  },

  /**
   * Save an import: the page-1 books and the counts our rules make from them,
   * in one transaction (migration 0006). Manual counts stay unless replaceManual.
   * books: [{ title, author, bsr, reviews, rating, sponsored, included }] in page order.
   * Returns { data: the saved topic row, error }. error.code 'P0002' = topic gone.
   */
  async saveTopicImport(topicId, books, replaceManual) {
    const { data, error } = await window.sb.rpc('save_topic_import', {
      p_topic_id: topicId,
      p_books: books,
      p_replace_manual: !!replaceManual
    });
    return { data: data || null, error };
  },

  /** Tokens used since the 1st of this month, UTC, like the server (counted AI calls only). */
  async getMonthUsage() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { data, error } = await window.sb
      .from('ai_usage')
      .select('input_tokens, output_tokens')
      .eq('counted', true)
      .gte('created_at', monthStart);
    if (error) return { tokens: 0, error };
    const tokens = data.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
    return { tokens, error: null };
  },

  /** The user's settings row. Created with defaults on first visit. */
  async ensureUserSettings(userId) {
    const read = () => window.sb.from('user_settings').select('*').maybeSingle();
    const { data, error } = await read();
    if (error || data) return { data, error };
    // Missing: insert a row with the table defaults. If another tab created it
    // first (duplicate key 23505), just read it again.
    const ins = await window.sb.from('user_settings').insert({ user_id: userId });
    if (ins.error && ins.error.code !== '23505') return { data: null, error: ins.error };
    return read();
  }
};
