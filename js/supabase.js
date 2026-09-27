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
      .select(`id, title, subtitle, status, current_step, updated_at,
               pen_names ( name ),
               book_briefs ( length_range ),
               chapters ( word_target, needs_review )`)
      .order('updated_at', { ascending: false });
  },

  /** Tokens used since the 1st of this month (counted AI calls only). */
  async getMonthUsage() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
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
  },

  async deleteBook(id) {
    return window.sb.from('books').delete().eq('id', id);
  }
};
