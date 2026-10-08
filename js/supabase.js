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

// The step 03 positioning row, as the book page reads it (migration 0010).
const POSITIONING_COLS = 'one_sentence, reader_promise, approach, lacks, selling_points, focus_tags, drift_flags, drift_checked_at, locked_at, updated_at';
const TITLE_OPTION_COLS = 'id, title, subtitle, reason, keywords, unsourced, shortlisted, created_at';

// "0 rows = not found": an update or select that must hit one row, and a
// delete with count: 'exact'. Both put notFound: true on the error.
const notFound = (msg) => Object.assign(new Error(msg), { notFound: true });
function oneRow(data, error, msg) {
  if (error) return { data: null, error };
  if (!data.length) return { data: null, error: notFound(msg) };
  return { data: data[0], error: null };
}
function counted(error, count, msg) {
  if (error) return { error };
  if (!count) return { error: notFound(msg) };
  return { error: null };
}

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
               book_briefs ( length_range, target_words, topic_text ),
               chapters ( word_target, needs_review )`)
      .order('updated_at', { ascending: false });
  },

  /**
   * One book for the book page, with its Brief, pen name, and source topic.
   * Also the counts step 02 needs for its done mark: all competitors and the
   * research rows of kind 'source' (personal notes do not count), and the
   * step 03 positioning row (null before the first save), and the step 04
   * title fields. Step 05: the outline approval, how many chapters there are
   * and how many are marked "Needs review" (unlock of 03).
   * data is null when the id is not the user's (RLS).
   */
  async getBook(id) {
    return window.sb
      .from('books')
      .select(`id, title, subtitle, status, current_step, updated_at, topic_id, pen_name_id, series_name, series_number,
               title_needs_review, title_examples, outline_approved_at,
               pen_names ( id, name, voice ),
               topics ( id, name, checks_passed ),
               book_briefs ( topic_text, target_reader, reader_problem, promise_draft, book_type, book_type_label,
                             trim_size, length_range, target_words, chapter_count, options, updated_at ),
               competitors ( count ),
               real_sources:research_sources ( count ),
               chapters ( count ),
               review_chapters:chapters ( count ),
               positioning ( ${POSITIONING_COLS} )`)
      .eq('id', id)
      .eq('real_sources.kind', 'source')
      .eq('review_chapters.needs_review', true)
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
    return oneRow(data, error, 'Book not found.');
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
    return oneRow(data, error, 'Book not found.');
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
    return oneRow(data, error, 'Book not found.');
  },

  /** What a delete removes: chapters, section versions, research notes. Two queries. */
  /**
   * What a delete removes, for the Delete dialog. Counts for lists, true/false
   * for one-row parts. The Brief always exists, so it is not counted.
   */
  async getBookCounts(id) {
    const count = (table) => window.sb.from(table).select('book_id', { count: 'exact', head: true }).eq('book_id', id);
    const [chapters, research, competitors, titles, insights, positioning] = await Promise.all([
      // sections and section_versions have two links (section_id, current_version_id); name the one to follow.
      window.sb
        .from('chapters')
        .select('id, sections ( section_versions!section_versions_section_id_fkey ( count ) )')
        .eq('book_id', id),
      count('research_sources'),
      count('competitors'),
      count('title_options'),
      count('research_insights'),
      count('positioning')
    ]);
    const error = [chapters, research, competitors, titles, insights, positioning].map((r) => r.error).find(Boolean);
    if (error) return { data: null, error };
    const versions = chapters.data.reduce((sum, c) =>
      sum + (c.sections || []).reduce((s, sec) => s + ((sec.section_versions && sec.section_versions[0] && sec.section_versions[0].count) || 0), 0), 0);
    return {
      data: {
        chapters: chapters.data.length,
        versions,
        research: research.count || 0,
        competitors: competitors.count || 0,
        titles: titles.count || 0,
        insights: (insights.count || 0) > 0,
        positioning: (positioning.count || 0) > 0
      },
      error: null
    };
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
    return counted(error, count, 'Book not found.');
  },

  /* ── Research (step 02) ───────────────────────── */

  /**
   * The citations of the book's sources (kind 'source', oldest first), for
   * the Brief "Copy from 02 Research" button. Notes are left out.
   */
  async listSourceCitations(bookId) {
    const { data, error } = await window.sb
      .from('research_sources')
      .select('citation')
      .eq('book_id', bookId)
      .eq('kind', 'source')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    return { data: error ? null : (data || []).map((r) => r.citation).filter((c) => typeof c === 'string' && c.trim()), error };
  },

  /**
   * Everything step 02 shows: competitors and sources (oldest first) and the
   * review insights row (null before the first analysis). Three queries.
   */
  async listResearch(bookId) {
    const [comps, sources, insights] = await Promise.all([
      window.sb
        .from('competitors')
        .select('id, title, author, bsr, reviews, rating, toc, low_reviews, high_reviews, is_authority, created_at')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      window.sb
        .from('research_sources')
        .select('id, kind, body, citation, created_at')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      window.sb
        .from('research_insights')
        .select('loves, hates, gaps, analyzed_at, inputs_key, updated_at')
        .eq('book_id', bookId)
        .maybeSingle()
    ]);
    const error = comps.error || sources.error || insights.error;
    if (error) return { data: null, error };
    return { data: { competitors: comps.data, sources: sources.data, insights: insights.data }, error: null };
  },

  /**
   * Adds one competitor. The caller trims and checks the limits; the database
   * checks them too and allows at most 10 per book (migration 0008:
   * error.code 'P0001', message 'competitor_limit').
   */
  async addCompetitor(bookId, fields) {
    const { data, error } = await window.sb
      .from('competitors')
      .insert({ ...fields, book_id: bookId })
      .select('id, title, author, bsr, reviews, rating, toc, low_reviews, high_reviews, is_authority, created_at')
      .single();
    return { data, error };
  },

  /**
   * Copies page-1 books from Topic Lab into the book's competitors in ONE
   * insert (all rows or none). rows: [{ title, author, bsr, reviews, rating }].
   */
  async copyCompetitors(bookId, rows) {
    const { data, error } = await window.sb
      .from('competitors')
      .insert(rows.map((r) => ({ ...r, book_id: bookId })))
      .select('id, title, author, bsr, reviews, rating, toc, low_reviews, high_reviews, is_authority, created_at');
    return { data, error };
  },

  /** Saves a competitor. 0 rows (gone, or not the user's) is an error. */
  async updateCompetitor(id, fields) {
    const { data, error } = await window.sb
      .from('competitors')
      .update(fields)
      .eq('id', id)
      .select('id, title, author, bsr, reviews, rating, toc, low_reviews, high_reviews, is_authority, created_at');
    return oneRow(data, error, 'Competitor not found.');
  },

  async deleteCompetitor(id) {
    const { error, count } = await window.sb
      .from('competitors')
      .delete({ count: 'exact' })
      .eq('id', id);
    return counted(error, count, 'Competitor not found.');
  },

  /** Adds a source or a personal note. A source needs a citation (migration 0008). */
  async addSource(bookId, fields) {
    const { data, error } = await window.sb
      .from('research_sources')
      .insert({ ...fields, book_id: bookId })
      .select('id, kind, body, citation, created_at')
      .single();
    return { data, error };
  },

  async updateSource(id, fields) {
    const { data, error } = await window.sb
      .from('research_sources')
      .update(fields)
      .eq('id', id)
      .select('id, kind, body, citation, created_at');
    return oneRow(data, error, 'Source not found.');
  },

  async deleteSource(id) {
    const { error, count } = await window.sb
      .from('research_sources')
      .delete({ count: 'exact' })
      .eq('id', id);
    return counted(error, count, 'Source not found.');
  },

  /** The included page-1 books of a topic, in page order, for "Copy from Topic Lab". */
  async listTopicPicks(topicId) {
    return window.sb
      .from('topic_page_books')
      .select('id, position, title, author, bsr, reviews, rating, sponsored')
      .eq('topic_id', topicId)
      .eq('included', true)
      .order('position', { ascending: true });
  },

  /**
   * Saves the review insights (one row per book). lists = { loves, hates, gaps },
   * each [{ text, from: [title], edited }] (shape checked by migration 0008).
   * With analyzedAt (a new analysis) the row is created or replaced, with
   * inputsKey: the fingerprint of the reviewed competitors it read (0014,
   * for "Out of date"). Without analyzedAt only the lines change (an edit or
   * a removal) and the fingerprint stays.
   * v3: move the save of a new analysis to the server (generate), so the AI
   * label is set server-side when other users join.
   */
  async saveInsights(bookId, lists, analyzedAt, inputsKey) {
    const row = { loves: lists.loves, hates: lists.hates, gaps: lists.gaps };
    const q = analyzedAt
      ? window.sb.from('research_insights').upsert({ ...row, book_id: bookId, analyzed_at: analyzedAt, inputs_key: inputsKey || null }, { onConflict: 'book_id' })
      : window.sb.from('research_insights').update(row).eq('book_id', bookId);
    const { data, error } = await q.select('loves, hates, gaps, analyzed_at, inputs_key, updated_at');
    return oneRow(data, error, 'Insights not found.');
  },

  /* ── Positioning (step 03) ────────────────────── */

  /** The positioning row, or null before the first save. */
  async getPositioning(bookId) {
    return window.sb
      .from('positioning')
      .select(POSITIONING_COLS)
      .eq('book_id', bookId)
      .maybeSingle();
  },

  /**
   * Saves the given text fields. The first save creates the row (upsert).
   * The caller trims and checks limits; migration 0010 checks them too.
   * A locked row refuses edits: error.code 'P0001', message 'positioning_locked'.
   * Any text change clears drift_checked_at (the returned row shows it).
   */
  async savePositioning(bookId, fields) {
    const { data, error } = await window.sb
      .from('positioning')
      .upsert({ ...fields, book_id: bookId }, { onConflict: 'book_id' })
      .select(POSITIONING_COLS);
    return oneRow(data, error, 'Book not found.');
  },

  /**
   * Keeps a drift flag with a reason (or undoes that). Only status and reason
   * may change; the flags themselves come from the server (migration 0010:
   * 'drift_flags_server_only').
   */
  async saveDriftFlags(bookId, flags) {
    const { data, error } = await window.sb
      .from('positioning')
      .update({ drift_flags: flags })
      .eq('book_id', bookId)
      .select(POSITIONING_COLS);
    return oneRow(data, error, 'Positioning not found.');
  },

  /**
   * Approve and lock. The database checks the required fields, a current
   * drift check and no open flag ('positioning_not_ready', with the reason in
   * error.details), and sets locked_at from its own clock.
   * 0 rows = already locked or gone; the caller reloads.
   */
  async lockPositioning(bookId) {
    const { data, error } = await window.sb
      .from('positioning')
      .update({ locked_at: new Date().toISOString() })
      .eq('book_id', bookId)
      .is('locked_at', null)
      .select(POSITIONING_COLS);
    if (error) return { data: null, error };
    return { data: data[0] || null, error: null };
  },

  /**
   * Unlock (migration 0010, one transaction). Marks the title, every chapter
   * and every written section "Needs review". Nothing is deleted.
   * Returns { title, chapters, written_chapters }. error.code 'P0002' = not locked.
   */
  async unlockPositioning(bookId) {
    return window.sb.rpc('unlock_positioning', { p_book_id: bookId });
  },

  /** What an unlock marks, for the confirm dialog: chapters and chapters with writing. */
  async getUnlockImpact(bookId) {
    const { data, error } = await window.sb
      .from('chapters')
      .select('id, sections ( current_version_id )')
      .eq('book_id', bookId);
    if (error) return { data: null, error };
    const written = data.filter((c) => (c.sections || []).some((s) => s.current_version_id)).length;
    return { data: { chapters: data.length, written }, error: null };
  },

  /* ── Title (step 04) ──────────────────────────── */

  /**
   * What step 04 needs besides the book row: the saved title options (oldest
   * first) and the step 02 competitors for the title checks.
   */
  async getTitleData(bookId) {
    const [options, competitors] = await Promise.all([
      window.sb.from('title_options').select(TITLE_OPTION_COLS).eq('book_id', bookId).order('created_at').order('id'),
      window.sb.from('competitors').select('title, author').eq('book_id', bookId)
    ]);
    const error = options.error || competitors.error;
    if (error) return { data: null, error };
    return { data: { options: options.data, competitors: competitors.data }, error: null };
  },

  /** Star or unstar a title option. Only this field may change (migration 0011). */
  async setShortlisted(id, on) {
    const { data, error } = await window.sb
      .from('title_options')
      .update({ shortlisted: !!on })
      .eq('id', id)
      .select(TITLE_OPTION_COLS);
    return oneRow(data, error, 'Option not found.');
  },

  /** Remove one option. A starred option is never removed: unstar it first. */
  async removeTitleOption(id) {
    const { error, count } = await window.sb
      .from('title_options')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('shortlisted', false);
    return counted(error, count, 'Option not found or starred.');
  },

  /**
   * "Use this title": writes books.title and books.subtitle. clearReview also
   * clears "Needs review"; the database allows that only while the
   * positioning is locked (0011: 'positioning_not_locked'). Combined limit
   * 200 characters (title + ": " + subtitle).
   */
  async useTitle(bookId, title, subtitle, clearReview) {
    const fields = { title, subtitle };
    if (clearReview) fields.title_needs_review = false;
    const { data, error } = await window.sb
      .from('books')
      .update(fields)
      .eq('id', bookId)
      .select('id, title, subtitle, title_needs_review, updated_at');
    return oneRow(data, error, 'Book not found.');
  },

  /* ── Outline (step 05) ────────────────────────── */

  /**
   * The book's outline: chapters in order (Introduction first, Conclusion
   * last), each with its sections in order. One call (migration 0016
   * outline_json, under RLS). [] before the first chapter.
   */
  async getOutline(bookId) {
    const { data, error } = await window.sb.rpc('outline_json', { p_book_id: bookId });
    return { data: error ? null : (data || []), error };
  },

  /** Writes chapter fields (title, objective, include_examples, include_exercise). 0 rows is an error. */
  async updateChapter(id, fields) {
    const { data, error } = await window.sb
      .from('chapters')
      .update(fields)
      .eq('id', id)
      .select('id, updated_at');
    return oneRow(data, error, 'Chapter not found.');
  },

  /** Writes section fields (title, word_target). 0 rows is an error. */
  async updateSection(id, fields) {
    const { data, error } = await window.sb
      .from('sections')
      .update(fields)
      .eq('id', id)
      .select('id, updated_at');
    return oneRow(data, error, 'Section not found.');
  },

  /**
   * Adds an untitled chapter with one section before the Conclusion (0016;
   * on an empty book also the Introduction and the Conclusion). Returns the
   * new chapter id. error.message 'outline_full' = 30 chapters.
   */
  async addChapter(bookId) {
    return window.sb.rpc('add_chapter', { p_book_id: bookId });
  },

  /** Adds an empty section at the end of a chapter. error.message 'sections_full' = 12 already. */
  async addSection(chapterId, position) {
    const { data, error } = await window.sb
      .from('sections')
      .insert({ chapter_id: chapterId, position })
      .select('id, position, title, word_target, status, needs_review, current_version_id');
    return oneRow(data, error, 'Chapter not found.');
  },

  /** Deletes a chapter and its sections. error.message 'has_writing' when a section has writing. */
  async deleteChapter(id) {
    const { error, count } = await window.sb.from('chapters').delete({ count: 'exact' }).eq('id', id);
    return counted(error, count, 'Chapter not found.');
  },

  /** Deletes one section. error.message 'has_writing' when it has writing. */
  async deleteSection(id) {
    const { error, count } = await window.sb.from('sections').delete({ count: 'exact' }).eq('id', id);
    return counted(error, count, 'Section not found.');
  },

  /**
   * Saves the order of the chapters (ids of kind 'chapter', in the new
   * order). The Introduction stays first, the Conclusion last (0016).
   * error.message 'outline_changed' when the chapters changed meanwhile.
   */
  async reorderChapters(bookId, ids) {
    return window.sb.rpc('reorder_chapters', { p_book_id: bookId, p_ids: ids });
  },

  /**
   * The last AI outline check (0017 outline_checks, written by the generate
   * function only): { findings, inputs_key, checked_at }, or null before the first.
   */
  async getOutlineCheck(bookId) {
    const { data, error } = await window.sb
      .from('outline_checks')
      .select('findings, inputs_key, checked_at')
      .eq('book_id', bookId)
      .maybeSingle();
    return { data: error ? null : data, error };
  },

  /** The outline approval time (null = not approved). Read again after an edit that may have changed nothing. */
  async getOutlineApproval(bookId) {
    const { data, error } = await window.sb
      .from('books')
      .select('outline_approved_at')
      .eq('id', bookId)
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) return { data: null, error: { notFound: true, message: 'Book not found.' } };
    return { data: data.outline_approved_at, error: null };
  },

  /**
   * Approve the outline (0017 approve_outline): step 05 done. Returns the time.
   * error.message: 'positioning_not_locked', 'outline_empty', 'chapter_untitled'
   * (error.details names the chapter) or 'book_not_found'.
   */
  async approveOutline(bookId) {
    return window.sb.rpc('approve_outline', { p_book_id: bookId });
  },

  /** The Research gaps (step 02 insights) for "Copy gaps from Research". [] before an analysis. */
  async getResearchGaps(bookId) {
    const { data, error } = await window.sb
      .from('research_insights')
      .select('gaps')
      .eq('book_id', bookId)
      .maybeSingle();
    if (error) return { data: null, error };
    const gaps = data && Array.isArray(data.gaps) ? data.gaps : [];
    return { data: gaps.map((g) => (g && typeof g.text === 'string' ? g.text.trim() : '')).filter(Boolean), error: null };
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
    return oneRow(data, error, 'Topic not found.');
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
    return counted(error, count, 'Topic not found.');
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
    return oneRow(data, error, 'Pen name not found.');
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
    return counted(error, count, 'Pen name not found.');
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
    if (!data.length) return { data: null, error: notFound('Settings not found.') };
    return { data: data[0].default_pen_name_id, error: null };
  },

  /* ── AI (Edge Function "generate") ────────────── */

  /**
   * Run one AI stage on the server. Only ids go up; prompts live server-side.
   * Returns { data, error }. error.code is a short code from the function
   * (not_enough_facts, monthly_limit, rate_limited, ai_unavailable, ai_stopped,
   * ai_declined, not_amazon_page, not_enough_books, nothing_to_check,
   * positioning_locked, positioning_changed, positioning_not_locked,
   * options_full, has_writing, unauthorized, not_found,
   * bad_request, server_error) or 'network' when the function could not be reached.
   * Input: { stage: 'bio', penNameId }, { stage: 'amazon_import', topicId, text },
   * { stage: 'brief_help', bookId }, { stage: 'review_insights', bookId },
   * { stage: 'positioning_help', bookId[, field] }, { stage: 'drift_check', bookId }
   * or { stage: 'title_ideas', bookId } (the server saves the options and returns them),
   * or { stage: 'outline_ideas', bookId, sectionsPerChapter } (the server saves the outline and returns it),
   * or { stage: 'outline_check', bookId } (the server saves the check and returns { findings, inputs_key, checked_at }).
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
          return { data: null, error: { code: body.error, missing: typeof body.missing === 'string' ? body.missing : '', have: Number.isInteger(body.have) ? body.have : null } };
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
