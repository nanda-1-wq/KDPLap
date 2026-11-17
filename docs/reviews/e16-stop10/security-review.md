# E16 STOP 10 · Security review (branch `e16-09-cover-design` + the uncommitted Part 10 work)

Date: Nov 16, 2026. Scope: only the security paths, because the full diff (348 files, about 100,000 lines of generated and design files) is the likely reason the last run did not finish. Covered:
- migrations 0029, 0030, 0031;
- the Edge Functions `stock` and `generate` (the `cover_blurb` stage);
- `js/supabase.js`;
- `js/cover/*.js`, except the generated `icon-set.js` and `font-catalog.js`;
- `js/book.js` and `app/book.html`.

Out of scope: tests, design files, docs and CSS. No files were changed and nothing went to the network.

**Result: no finding met the bar** (confidence above 80% that it can really be exploited), so the false-positive step had nothing to filter.

## Checked

**Migrations**
- **RLS:** every new table has RLS with own-row (`auth.uid()`) policies. Each insert policy also checks that the caller owns the book (or the origin book). Update and delete are revoked where a table is meant to be read-and-add only.
- **SECURITY DEFINER triggers:** `cover_blurbs_guard`, `cover_design_history_guard`, `cover_exports_guard` and `stock_calls_purge`.
  - All four set `search_path = ''`, and EXECUTE is revoked.
  - Each deletes rows only after checking that the book's owner is `auth.uid()`.
  - The export guard checks that every printed picture's row belongs to the same user.
- **No dynamic SQL:** there is no `EXECUTE` or `format()`.
- **Read helpers:** they run under the caller's own RLS, and anon cannot call them.
- **Storage, bucket `covers`:**
  - The bucket is private.
  - Select and delete are limited to the user's own folder.
  - Insert is limited to `<uid>/assets/<uuid>.(jpg|png)`.
  - There is no update policy.

**Edge Function `stock`**
- It refuses a request without a Bearer token, then confirms the user with `auth.getUser`.
- Every call uses the caller's JWT. There is no service-role key.
- Input is size-capped and checked against allowlists.
- **SSRF:** each outbound URL is fixed or passes `safeUrl` (https only, a host on an exact allowlist, no credentials or port).
  - Redirects are followed manually: each target is checked again, 3 hops at most.
  - The Unsplash key goes only to `api.unsplash.com`.
- **Cache:** cached rows are checked again before use.
- **Storage path:** built on the server from the user ID and a UUID it makes.

**Edge Function `generate`, stage `cover_blurb`**
- The input is strictly parsed.
- The book is read with the caller's client, under RLS.
- The stage saves nothing and makes no other fetch.

**`js/supabase.js` (Part 10 calls)**
- `recordCoverExports`, `coverAssetUse` and `sweepCoverAssets` all run under RLS and the storage policies.
- The sweep touches only `<uid>/assets/<uuid>.(jpg|png)`.

**DOM XSS**
- Some text comes from outsiders: Pixabay tags and usernames, and Unsplash names and descriptions. It reaches `cover_assets.name`, `credit` and the layer names.
- Every innerHTML sink traced escapes that text with `esc()`. That includes Part 10's `export-dialog.js` and the Uploads remove question.
- Credit links must match `^https://(pixabay|unsplash)\.com/`.
- Unsplash image links must match `^https://images\.unsplash\.com/` and are fetched with `credentials: 'omit'`.

## Seen, not reported (only the user's own data)
- Some raw layer fields go into `style` attributes, for example the text color in `text.js` and the boxes in `view.js`. They come only from the user's own rows, under RLS.
- A user can write their own stock rows or cache rows. That affects only that user. Credit links are checked again in the browser, and cached rows on the server.

## Not reviewed in depth
- The escaping in `typst.js` (the user's own text, run in the user's own browser).
- The prompt text in `cover_blurb.ts`.
- `render.js`, `flatten.js` and `image-prep.js` (pdf.js is pinned at 6.4.299).
