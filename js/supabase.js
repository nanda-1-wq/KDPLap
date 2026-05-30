/* ═══════════════════════════════════════════════════
   KDP Lab — Supabase Client & Auth Helpers
   /js/supabase.js

   Load AFTER the supabase-js UMD bundle:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="<depth>/js/supabase.js"></script>
═══════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://hmtxnbgfzwqawfulwwrg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdHhuYmdmendxYXdmdWx3d3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDM2NjYsImV4cCI6MjA5NTcxOTY2Nn0.VsVQF4YymMAr5d_P709Zw8C2-5gr3FSggbIbcc3zh4I';

// Shared client — accessible as window.sb if needed
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.kdp = {

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

  async signOut() {
    await window.sb.auth.signOut();
  },

  async resetPassword(email) {
    const redirectTo = `${location.origin}/login.html`;
    return window.sb.auth.resetPasswordForEmail(email, { redirectTo });
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

  async saveBook({ title, type, content }) {
    const session = await this.getSession();
    if (!session) throw new Error('Not authenticated');
    return window.sb
      .from('books')
      .insert({ user_id: session.user.id, title, type, content });
  },

  async listBooks() {
    return window.sb
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });
  },

  async deleteBook(id) {
    return window.sb.from('books').delete().eq('id', id);
  }
};
