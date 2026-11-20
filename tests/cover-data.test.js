// deno test --allow-read tests/cover-data.test.js   (from the repo root)
// E16 Part 3: the 09 Cover data calls in js/supabase.js, against a recording
// stand-in for supabase-js. Each call must name only tables, columns and
// functions that 0030 (or 0029 for cover_exports) defines, and must keep its
// rules: the rev autosave and its conflict marker, the first-open insert,
// the row-then-file delete, the per-kind export fields, the My layout upsert.
// Nothing here reaches the network; Part 4 drives the calls from the editor.
import { assert, assertEquals } from "jsr:@std/assert@1";

const read = (p) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url));
const SQL30 = read("supabase/migrations/0030_cover_layers.sql");
const SQL29 = read("supabase/migrations/0029_cover.sql");
const SQL31 = read("supabase/migrations/0031_stock.sql");

/** Columns of each "create table public.x (...)" in a migration. */
function tables(sql) {
  const out = {};
  for (const m of sql.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    out[m[1]] = m[2].split("\n").map((l) => l.match(/^\s{2}(\w+)\s+(uuid|text|jsonb|int|boolean|timestamptz|numeric)/)).filter(Boolean).map((x) => x[1]);
  }
  return out;
}
const COLS = Object.assign({}, tables(SQL29), tables(SQL30), tables(SQL31));
delete COLS.book_covers;
delete COLS.cover_images;
// 0031 adds cover_assets.name (E16 Part 7, owner STOP 6 N9).
for (const m of SQL31.matchAll(/alter table public\.(\w+) add column (\w+) /g)) COLS[m[1]].push(m[2]);
const RPCS = [...SQL30.matchAll(/create or replace function public\.(\w+)\(p_book_id uuid/g)].map((m) => m[1]);

// ── The stand-in: records every call, answers with the next queued reply ──
const log = [];
let replies = [];
const reply = () => (replies.length ? replies.shift() : { data: [], error: null, count: 0 });
function builder(table) {
  const q = { table, ops: [] };
  log.push(q);
  const b = {
    then: (ok, bad) => Promise.resolve(reply()).then(ok, bad)
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "order", "in", "maybeSingle"]) {
    b[op] = (...args) => { q.ops.push([op, ...args]); return b; };
  }
  return b;
}
globalThis.window = globalThis;
globalThis.supabase = {
  createClient: () => ({
    from: (t) => builder(t),
    rpc: (name, args) => { log.push({ rpc: name, args }); return Promise.resolve(reply()); },
    storage: { from: (bucket) => ({ remove: (paths) => { log.push({ storage: bucket, remove: paths }); return Promise.resolve(reply()); } }) },
    functions: { invoke: (name, opts) => { log.push({ fn: name, body: opts.body }); const r = reply(); return r.throws ? Promise.reject(new Error("offline")) : Promise.resolve(r); } },
    auth: {}
  })
};
await import("../js/supabase.js");
const kdp = globalThis.kdp;

function reset(...r) { log.length = 0; replies = r; }
/** Every column a recorded table call names exists in that table. */
function checkNames() {
  for (const q of log) {
    if (q.rpc) { assert(RPCS.includes(q.rpc), `rpc ${q.rpc} is not a 0030 function`); continue; }
    if (q.storage) { assertEquals(q.storage, "covers"); continue; }
    if (q.fn) { assertEquals(q.fn, "stock"); continue; }
    const cols = COLS[q.table];
    assert(cols, `table ${q.table} is not in 0029 / 0030`);
    for (const [op, a, b] of q.ops) {
      let names = [];
      if (op === "select" && typeof a === "string") names = a.split(",").map((x) => x.trim()).filter(Boolean);
      if (["insert", "update", "upsert"].includes(op)) names = Object.keys(a);
      if (op === "eq" || op === "order") names = [a];
      if (op === "upsert" && b && b.onConflict) names = names.concat(b.onConflict.split(","));
      for (const n of names) assert(cols.includes(n), `${q.table}.${n} (${op}) is not a column`);
    }
  }
}
const op = (q, name) => q.ops.find((o) => o[0] === name);

Deno.test("0030 tables parsed: the 4 new tables and cover_exports, without the dropped ones", () => {
  for (const t of ["cover_designs", "cover_design_history", "cover_assets", "cover_my_layouts", "cover_exports", "cover_blurbs"]) assert(COLS[t], t);
  assertEquals(COLS.cover_designs, ["book_id", "user_id", "layers", "bg", "fmt", "layout", "last_remap", "rev", "created_at", "updated_at"]);
  assertEquals(RPCS.sort(), ["cover_fmt", "cover_json", "cover_key", "cover_marks"]);
});

Deno.test("getCover: cover_json; a null reply is not found", async () => {
  reset({ data: { design: null }, error: null }, { data: null, error: null });
  assertEquals((await kdp.getCover("b1")).data, { design: null });
  assertEquals(log[0], { rpc: "cover_json", args: { p_book_id: "b1" } });
  assert((await kdp.getCover("b1")).error.notFound);
  checkNames();
});

Deno.test("ensureCoverDesign: inserts on the first open, accepts 23505, skips when the row exists", async () => {
  const fmt = { trim: "6x9", pages: 54, paper: "white" };
  reset({ data: { design: null }, error: null }, { data: null, error: null }, { data: { design: { rev: 1 } }, error: null });
  const r = await kdp.ensureCoverDesign("b1", { fmt, layers: [{ id: 1, type: "text", text: "T" }], bg: "#1F3A5F", layout: "band" });
  assertEquals(r.data.design.rev, 1);
  assertEquals(log[1].table, "cover_designs");
  assertEquals(op(log[1], "insert")[1], { book_id: "b1", fmt, layers: [{ id: 1, type: "text", text: "T" }], bg: "#1F3A5F", layout: "band" });
  checkNames();
  reset({ data: { design: null }, error: null }, { data: null, error: { code: "23505" } }, { data: { design: { rev: 1 } }, error: null });
  assertEquals((await kdp.ensureCoverDesign("b1", { fmt })).error, null);
  reset({ data: { design: null }, error: null }, { data: null, error: { code: "23514" } });
  assertEquals((await kdp.ensureCoverDesign("b1", { fmt })).error.code, "23514");
  reset({ data: { design: { rev: 4 } }, error: null });
  assertEquals((await kdp.ensureCoverDesign("b1", { fmt })).data.design.rev, 4);
  assertEquals(log.length, 1);
});

Deno.test("saveCoverDesign: where book_id and rev; only design fields; 0 rows is a conflict, not notFound", async () => {
  reset({ data: [{ rev: 3, updated_at: "t" }], error: null });
  const r = await kdp.saveCoverDesign("b1", 2, { layers: [], bg: "#FFFFFF", rev: 99, user_id: "x", last_remap: null });
  assertEquals(r.data, { rev: 3, updated_at: "t" });
  assertEquals(op(log[0], "update")[1], { layers: [], bg: "#FFFFFF", last_remap: null });
  assertEquals(log[0].ops.filter((o) => o[0] === "eq"), [["eq", "book_id", "b1"], ["eq", "rev", 2]]);
  assertEquals(op(log[0], "select")[1], "rev, updated_at");
  checkNames();
  reset({ data: [], error: null });
  const c = await kdp.saveCoverDesign("b1", 2, { bg: "#FFFFFF" });
  assertEquals(c.error.conflict, true);
  assertEquals(c.error.notFound, undefined);
  reset();
  assertEquals((await kdp.saveCoverDesign("b1", 2, { rev: 5 })).error.message, "Nothing to save.");
  assertEquals(log.length, 0);
});

Deno.test("snapshots: add, list without layers, one with layers", async () => {
  const fmt = { trim: "6x9", pages: 54, paper: "white" };
  reset({ data: [{ id: "h1", created_at: "t" }], error: null }, { data: [], error: null }, { data: [{ id: "h1", layers: [] }], error: null }, { data: [], error: null });
  assertEquals((await kdp.addCoverSnapshot("b1", "visit", { layers: [], bg: "#FFFFFF", fmt })).data.id, "h1");
  assertEquals(op(log[0], "insert")[1], { book_id: "b1", reason: "visit", layers: [], bg: "#FFFFFF", fmt, layout: null });
  await kdp.listCoverHistory("b1");
  assert(!op(log[1], "select")[1].includes("layers"));
  assertEquals((await kdp.getCoverSnapshot("h1")).data.id, "h1");
  assert(op(log[2], "select")[1].includes("layers"));
  assert((await kdp.getCoverSnapshot("h2")).error.notFound);
  checkNames();
});

Deno.test("assets: list, add (the tick sends a time; the server sets its own), delete row then file", async () => {
  reset({ data: [], error: null }, { data: [{ id: "a1" }], error: null }, { data: [{ id: "a2" }], error: null });
  await kdp.listCoverAssets();
  await kdp.addCoverAsset({ id: "a1", source: "upload", mime: "image/png", path: "u/assets/a1.png", width: 10, height: 10, bytes: 9, transparent: true, rightsTicked: true, originBookId: "b1" });
  const row = op(log[1], "insert")[1];
  assertEquals(typeof row.rights_at, "string");
  assertEquals([row.id, row.origin_book_id, row.transparent, row.credit, row.remote], ["a1", "b1", true, null, null]);
  await kdp.addCoverAsset({ source: "unsplash", mime: "image/jpeg", width: 6000, height: 4000, remote: { url: "https://images.unsplash.com/x" }, credit: { id: "x", author: "B", authorUrl: "u", pageUrl: "p" } });
  const u = op(log[2], "insert")[1];
  assertEquals([u.rights_at, u.path, u.bytes, "id" in u], [null, null, null, false]);
  checkNames();
  reset({ data: [{ path: "u/assets/a1.png" }], error: null }, { data: null, error: null });
  assertEquals(await kdp.deleteCoverAsset("a1"), { error: null, fileLeft: null });
  assertEquals(log[0].table, "cover_assets");
  assertEquals(op(log[0], "delete").length, 1);
  assertEquals(log[1], { storage: "covers", remove: ["u/assets/a1.png"] });
  reset({ data: [{ path: "u/assets/a1.png" }], error: null }, { data: null, error: { message: "down" } });
  assertEquals((await kdp.deleteCoverAsset("a1")).fileLeft, "u/assets/a1.png");
  reset({ data: [{ path: null }], error: null });
  assertEquals(await kdp.deleteCoverAsset("a4"), { error: null, fileLeft: null });
  assertEquals(log.length, 1);   // an Unsplash link has no file
  reset({ data: [], error: null });
  assert((await kdp.deleteCoverAsset("a9")).error.notFound);
  checkNames();
});

Deno.test("My layouts: get with layers, (0032) a plain insert (up to 5 per book), remove", async () => {
  const fmt = { trim: "6x9", pages: 54, paper: "white" };
  reset({ data: [{ id: "m1", layers: [] }], error: null }, { data: [{ id: "m1", exported_at: "t" }], error: null }, { data: null, error: null, count: 1 }, { data: null, error: null, count: 0 });
  assertEquals((await kdp.getMyLayout("m1")).data.id, "m1");
  await kdp.saveMyLayout({ bookId: "b1", name: "Chair Yoga", fromTitle: "Chair Yoga for Seniors", fmt, bg: "#FFFFFF", layers: [], thumb: "data:image/jpeg;base64,x" });
  assert(!op(log[1], "upsert"), "(0032) no upsert: 0032 drops the unique (user_id, from_book_id)");
  const ins = op(log[1], "insert");
  assertEquals(ins[1], { from_book_id: "b1", name: "Chair Yoga", from_title: "Chair Yoga for Seniors", fmt, bg: "#FFFFFF", layers: [], thumb: "data:image/jpeg;base64,x" });
  assertEquals(ins.length, 2);   // no options: no onConflict
  assertEquals(op(log[1], "select")[1], "id, exported_at");
  assertEquals((await kdp.removeMyLayout("m1")).error, null);
  assert((await kdp.removeMyLayout("m1")).error.notFound);
  checkNames();
});

Deno.test("recordCoverExport: print sends inches and the thumbnail; image and kindle send px only", async () => {
  reset({ data: [{ id: "e1" }], error: null }, { data: [{ id: "e2" }], error: null }, { data: [{ id: "e3" }], error: null });
  await kdp.recordCoverExport({ bookId: "b1", kind: "print", settingsKey: "k", engine: "e", widthIn: 12.3716, heightIn: 9.25, spineIn: 0.1216, widthPx: 1, thumb: "data:image/jpeg;base64,x" });
  assertEquals(op(log[0], "insert")[1], { book_id: "b1", kind: "print", settings_key: "k", engine: "e", width_in: 12.3716, height_in: 9.25, spine_in: 0.1216, thumb: "data:image/jpeg;base64,x" });
  await kdp.recordCoverExport({ bookId: "b1", kind: "image", settingsKey: "k", engine: "e", widthPx: 3712, heightPx: 2775, widthIn: 1, thumb: "x" });
  assertEquals(op(log[1], "insert")[1], { book_id: "b1", kind: "image", settings_key: "k", engine: "e", width_px: 3712, height_px: 2775 });
  await kdp.recordCoverExport({ bookId: "b1", kind: "kindle", settingsKey: "k", engine: "e", widthPx: 1600, heightPx: 2560 });
  assertEquals(op(log[2], "insert")[1].width_px, 1600);
  checkNames();
});

Deno.test("cover_marks and cover_key: one book or all", async () => {
  reset({ data: [{ book_id: "b1" }], error: null }, { data: null, error: null }, { data: "abc", error: null });
  assertEquals((await kdp.listCoverMarks("b1")).data.length, 1);
  assertEquals(log[0], { rpc: "cover_marks", args: { p_book_id: "b1" } });
  assertEquals((await kdp.listCoverMarks()).data, []);
  assertEquals(log[1], { rpc: "cover_marks", args: {} });
  assertEquals((await kdp.getCoverKey("b1")).data, "abc");
  checkNames();
});

Deno.test("assets: the name (0031) is cleaned, capped at 200 characters, or left to the database", async () => {
  reset({ data: [{ id: "a1" }], error: null }, { data: [{ id: "a2" }], error: null }, { data: [{ id: "a3" }], error: null });
  await kdp.addCoverAsset({ id: "a1", source: "upload", mime: "image/jpeg", path: "u/assets/a1.jpg", width: 1, height: 1, bytes: 1, rightsTicked: true, name: "  desk\tsunrise\n.jpg " });
  await kdp.addCoverAsset({ id: "a2", source: "upload", mime: "image/jpeg", path: "u/assets/a2.jpg", width: 1, height: 1, bytes: 1, rightsTicked: true, name: "é".repeat(250) });
  await kdp.addCoverAsset({ id: "a3", source: "pdf", mime: "image/jpeg", path: "u/assets/a3.jpg", width: 1, height: 1, bytes: 1, rightsTicked: true, name: "   " });
  assertEquals(op(log[0], "insert")[1].name, "desk sunrise .jpg");
  assertEquals([...op(log[1], "insert")[1].name].length, 200);
  assertEquals(op(log[2], "insert")[1].name, null);
  assert(op(log[0], "select")[1].split(", ").includes("name"));
  checkNames();
});

Deno.test("stock: search and pick call the function \"stock\" with the action; errors come back as codes", async () => {
  const filters = { type: "all", color: "transparent", editors: false, safe: true };
  reset({ data: { results: [], total: 0 }, error: null });
  assertEquals((await kdp.stockSearch({ source: "pixabay", q: "leaf", page: 2, filters })).data.total, 0);
  assertEquals(log[0], { fn: "stock", body: { action: "search", source: "pixabay", q: "leaf", page: 2, filters } });
  reset({ data: { asset: { id: "a1" } }, error: null });
  assertEquals((await kdp.stockPick({ source: "unsplash", id: "Ab1", bookId: "b1" })).data.asset.id, "a1");
  assertEquals(log[0].body, { action: "pick", source: "unsplash", id: "Ab1", bookId: "b1" });
  const http = (status, body) => ({ data: null, error: { context: { status, json: () => (body === undefined ? Promise.reject(new Error("x")) : Promise.resolve(body)) } } });
  reset(http(503, { error: "not_configured" }), http(429, { error: "rate_limited" }), http(401), http(500), { data: null, error: { message: "fetch failed" } }, { throws: true });
  assertEquals((await kdp.stockSearch({ source: "pixabay", q: "a", filters })).error, { code: "not_configured" });
  assertEquals((await kdp.stockPick({ source: "pixabay", id: "1" })).error, { code: "rate_limited" });
  assertEquals((await kdp.stockSearch({ source: "unsplash", q: "a" })).error, { code: "unauthorized" });
  assertEquals((await kdp.stockSearch({ source: "unsplash", q: "a" })).error, { code: "server_error" });
  assertEquals((await kdp.stockSearch({ source: "unsplash", q: "a" })).error, { code: "network" });
  assertEquals((await kdp.stockSearch({ source: "unsplash", q: "a" })).error, { code: "network" });
  // only ids and words go up: never a link
  assert(log.every((q) => !JSON.stringify(q.body).includes("http")));
  checkNames();
});

Deno.test("stock (E16.2): a busy pick passes retry_after_s (1 to 120) only when it is a whole number in range", async () => {
  const http = (body) => ({ data: null, error: { context: { status: 503, json: () => Promise.resolve(body) } } });
  const cases = [
    [{ error: "stock_busy", retry_after_s: 20 }, { code: "stock_busy", retry_after_s: 20 }],
    [{ error: "stock_busy", retry_after_s: 1 }, { code: "stock_busy", retry_after_s: 1 }],
    [{ error: "stock_busy", retry_after_s: 120 }, { code: "stock_busy", retry_after_s: 120 }],
    [{ error: "stock_busy" }, { code: "stock_busy" }],                              // stock v1
    [{ error: "stock_busy", retry_after_s: 0 }, { code: "stock_busy" }],
    [{ error: "stock_busy", retry_after_s: 121 }, { code: "stock_busy" }],
    [{ error: "stock_busy", retry_after_s: 2.5 }, { code: "stock_busy" }],
    [{ error: "stock_busy", retry_after_s: "20" }, { code: "stock_busy" }],
    [{ error: "stock_busy", retry_after_s: -5 }, { code: "stock_busy" }],
    [{ error: "stock_busy", retry_after_s: null }, { code: "stock_busy" }],
  ];
  reset(...cases.map(([b]) => http(b)));
  for (const [, want] of cases) assertEquals((await kdp.stockPick({ source: "pixabay", id: "1", bookId: "b1" })).error, want);
  checkNames();
});

