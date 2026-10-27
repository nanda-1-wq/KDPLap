// deno test --allow-read tests/usage-rules.test.js   (from the repo root)
// AI usage this month (js/usage-rules.js, E11 Settings, design 25b): percent,
// the never-above-the-limit number, the 80% and 100% levels, the cost
// estimate, the stage table with "Other (…)", sections left, the reset date
// and the "Last calls" rows (Not counted, Stopped by you, where a call ran).
import { assertEquals } from "jsr:@std/assert@1";
import "../js/usage-rules.js";

const U = globalThis.kdpUsage;
const M = "claude-sonnet-5-5";
const row = (stage, calls, input, output, model = M) => ({ stage, model, calls, input, output });
const usage = (tokens, by, limit = 2_000_000) => ({ tokens, limit, month_start: "2026-10-01T00:00:00+00:00", resets: "2026-11-01T00:00:00+00:00", by_stage: by });

Deno.test("levels: none, ok, warn at 80%, full at 100%; the number never shows above the limit", () => {
  assertEquals(U.summary(usage(0, [])).level, "none");
  const ok = U.summary(usage(412_380, [row("section_write", 38, 200_000, 212_380)]));
  assertEquals([ok.level, ok.pct, ok.shown, ok.resets], ["ok", 21, 412_380, "November 1"]);
  assertEquals(U.summary(usage(1_599_999, [row("bio", 1, 1, 1)])).level, "ok");
  assertEquals(U.summary(usage(1_600_000, [row("bio", 1, 1, 1)])).level, "warn");
  const full = U.summary(usage(2_004_000, [row("section_write", 1, 1, 1)]));
  assertEquals([full.level, full.pct, full.shown, full.left], ["full", 100, 2_000_000, 0]);
});

Deno.test("cost: Sonnet 5.5 at $2 in and $10 out per million; an unknown model gives no estimate", () => {
  const s = U.summary(usage(1_200_000, [row("section_write", 10, 1_000_000, 200_000)]));
  assertEquals(s.cost, 4);
  assertEquals(U.costText(s.cost), "About $4.00");
  assertEquals(U.costText(0), "$0.00");
  assertEquals(U.costText(0.004), "Under $0.01");
  assertEquals(U.summary(usage(10, [row("bio", 1, 5, 5, "some-other-model")])).cost, null);
  assertEquals(U.costText(null), "No estimate");
  assertEquals(U.PRICES[M], { in: 2, out: 10 });
});

Deno.test("stages: merged across models, most tokens first, top 5 then Other (…)", () => {
  const by = [row("section_write", 30, 200_000, 60_000), row("section_write", 8, 6_000, 2_400, "claude-x"),
    row("section_improve", 41, 40_000, 21_200), row("section_check", 22, 30_000, 9_800), row("outline_ideas", 3, 10_000, 8_900),
    row("title_ideas", 4, 8_000, 4_600), row("positioning_help", 5, 5_000, 1_000), row("brief_help", 3, 3_000, 480), row("drift_check", 1, 1_000, 0)];
  const s = U.summary(usage(412_380, by));
  assertEquals(s.stages.map((r) => [r.name, r.calls, r.tokens]), [
    ["Write section", 38, 268_400], ["Improve", 41, 61_200], ["AI check", 22, 39_800], ["Outline ideas", 3, 18_900], ["Title ideas", 4, 12_600],
    ["Other (positioning, Brief, drift)", 9, 10_480]]);
  // Six stages or fewer: no Other row.
  assertEquals(U.summary(usage(1, by.slice(0, 6))).stages.length, 5);
});

Deno.test("sections left: tokens left ÷ this month's average Write section call", () => {
  const s = U.summary(usage(1_702_450, [row("section_write", 10, 50_000, 22_000), row("bio", 1, 1_000_000, 630_450)]));
  assertEquals(s.left, 297_550);
  assertEquals(s.sectionsLeft, Math.floor(297_550 / 7_200));
  assertEquals(U.summary(usage(1_700_000, [row("bio", 1, 1_700_000, 0)])).sectionsLeft, null);
});

Deno.test("last calls: when, name, where, tokens, tag", () => {
  const now = new Date(2026, 9, 25, 15, 0);
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
  const r = (o) => ({ stage: "section_write", input_tokens: 4000, output_tokens: 2840, status: "ok", counted: true, book_id: "b", books: { title: "Chair Yoga" }, created_at: at(25, 14, 32), ...o });
  assertEquals(U.call(r({}), now), { when: "Today 14:32", name: "Write section", where: "Chair Yoga", tokens: 6840, tag: "" });
  assertEquals(U.call(r({ created_at: at(24, 9, 0), status: "failed", counted: false }), now).tag, "Not counted");
  assertEquals(U.call(r({ created_at: at(24, 9, 0) }), now).when, "Yesterday");
  assertEquals(U.call(r({ status: "stopped" }), now).tag, "Stopped by you");
  assertEquals(U.call(r({ status: "stopped", counted: false }), now).tag, "Not counted", "a server stop is not counted");
  assertEquals(U.call(r({ created_at: at(23, 9, 0) }), now).when, "Oct 23");
  assertEquals(U.call(r({ stage: "bio", book_id: null, books: null }), now).where, "Pen Names");
  assertEquals(U.call(r({ stage: "amazon_import", book_id: null, books: null }), now).where, "Topic Lab");
  assertEquals(U.call(r({ book_id: null, books: null }), now).where, "Deleted book");
  assertEquals(U.call(r({ books: [{ title: "As array" }] }), now).where, "As array");
});

Deno.test("every server stage has a plain name", () => {
  const src = Deno.readTextFileSync(new URL("../supabase/functions/generate/lib/limits.ts", import.meta.url));
  const stages = [...src.match(/export const STAGES = \[([^\]]*)\]/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  for (const s of stages) assertEquals(typeof U.STAGE_NAMES[s], "string", s);
  assertEquals(Object.keys(U.STAGE_NAMES).sort(), [...stages].sort());
});

/* ── E12 fix batch 2: the Generate chapter cost line (design 23b) ── */

Deno.test("chapterEstimate: this month's average Write input, targets × 1.7 output, Sonnet prices", () => {
  const u = { limit: 2_000_000, tokens: 790_000, resets: "2026-11-01T00:00:00Z",
    by_stage: [{ stage: "section_write", model: "claude-sonnet-5-5", calls: 10, input: 84_000, output: 6_000 }, { stage: "section_check", model: "claude-sonnet-5-5", calls: 4, input: 20_000, output: 900 }] };
  const e = U.chapterEstimate(u, [300, 300, 400]);
  assertEquals([e.calls, e.words, e.input, e.output, e.tokens], [3, 1000, 25_200, 1_700, 26_900]);
  assertEquals(Math.round(e.cost * 1e4) / 1e4, 0.0674);   // 25,200 × $2 + 1,700 × $10 a million
  assertEquals([e.left, e.over, e.none, e.resets], [1_210_000, false, false, "November 1"]);
  assertEquals([U.costText(e.cost), U.tokensText(e.tokens), U.tokensText(e.left)], ["About $0.07", "27,000", "1.21M"]);
});

Deno.test("chapterEstimate: no Write call yet, no target, near and at the limit, no usage", () => {
  const none = { limit: 2_000_000, tokens: 0, by_stage: [] };
  const e = U.chapterEstimate(none, [0, null]);
  assertEquals([e.input, e.words, e.output], [2 * U.WRITE_INPUT_DEFAULT, 1000, 1700]);   // 6,500 each; 500 words for no target, as Generate
  const near = U.chapterEstimate({ ...none, tokens: 1_980_000 }, [300, 300, 400]);
  assertEquals([near.left, near.over, near.none], [20_000, true, false]);
  const at = U.chapterEstimate({ ...none, tokens: 2_000_050 }, [300]);
  assertEquals([at.left, at.over, at.none], [0, true, true]);
  // Usage could not be read: the default input, nothing said about what is left.
  const unknown = U.chapterEstimate(null, [300]);
  assertEquals([unknown.input, unknown.left, unknown.over, unknown.none], [U.WRITE_INPUT_DEFAULT, null, false, false]);
  assertEquals([U.tokensText(950), U.tokensText(27_400), U.tokensText(1_219_999)], ["950", "27,000", "1.21M"]);
});
