// deno test tests/finding-rules.test.js   (from the repo root)
// The rules of the AI check findings in 06 Write (PRODUCE gate G5, design 22d):
// severity from the type, "Keep as is" matching (a quote across checks, a gap
// for its own check only, timestamps to the microsecond), what the tab shows,
// the Fix major queue (the N rule) and the tab count.
import { assertEquals } from "jsr:@std/assert@1";
import "../js/finding-rules.js";

const R = globalThis.kdpFindingRules;
const TEXT = "Shoulder rolls ease the stiffness. Chair yoga also helps you lose weight fast. Turn your head slowly to the right. If you feel a sharp pain, stop at once and rest. This gentle yet powerful movement serves as a foundation.";
const AT = "2026-10-16T10:00:00.123456+00:00";
const f = (type, message, quote) => ({ type, message, quote });
const DRIFT = f("drift", "Weight loss is not in the Brief.", "Chair yoga also helps you lose weight fast.");
const NECK = f("objective", "This part is about neck turns.", "Turn your head slowly to the right.");
const SAFETY = f("objective", "The safety note comes after the steps.", "If you feel a sharp pain, stop at once and rest.");
const VOICE = f("voice", "Long and formal.", "This gentle yet powerful movement serves as a foundation.");
const GAP = f("objective", "The text never shows the forward roll.", "");
const GAP2 = f("objective", "The section never says how long to rest.", "");
const row = (findings, areas = { objective: "issues", voice: "issues", drift: "issues" }) => ({ findings, areas, checked_at: AT });
const kq = (x, extra = {}) => ({ id: "k-" + x.quote, type: x.type, message: x.message, quote: x.quote, check_at: null, created_at: AT, ...extra });
const kg = (x, at = AT) => ({ id: "g-" + x.message, type: x.type, message: x.message, quote: "", check_at: at, created_at: AT });
const idx = (list) => list.map((x) => x.i);

Deno.test("severity: drift and objective major, voice minor (owner, G4 Q1)", () => {
  assertEquals([R.severity("drift"), R.severity("objective"), R.severity("voice")], ["major", "major", "minor"]);
  assertEquals(R.TYPES, ["objective", "voice", "drift"]);
});

Deno.test("timestamps: compared to the microsecond, never through Date alone", () => {
  assertEquals(R.sameInstant(AT, AT), true);
  // Date would round both to .123 and call them equal.
  assertEquals(R.sameInstant("2026-10-16T10:00:00.123456+00:00", "2026-10-16T10:00:00.123457+00:00"), false);
  assertEquals(new Date("2026-10-16T10:00:00.123456+00:00").getTime() === new Date("2026-10-16T10:00:00.123457+00:00").getTime(), true, "Date loses the microseconds");
  // The same moment written another way.
  assertEquals(R.sameInstant("2026-10-16T10:00:00.1234+00:00", "2026-10-16T10:00:00.123400Z"), true);
  assertEquals(R.sameInstant("2026-10-16T12:00:00.123456+02:00", "2026-10-16T10:00:00.123456+00:00"), true);
  assertEquals(R.sameInstant("2026-10-16 10:00:00.5+00", "2026-10-16T10:00:00.500000+00:00"), true);
  assertEquals(R.sameInstant("2026-10-16T10:00:00+05:30", "2026-10-16T04:30:00Z"), true);
  assertEquals(R.instant(AT), `${Date.UTC(2026, 9, 16, 10) / 1000}.123456`);
  assertEquals([R.sameInstant(null, AT), R.sameInstant(AT, undefined), R.sameInstant("x", "y"), R.instant("not a date")], [false, false, false, null]);
});

Deno.test("keptOf: a quote by type + exact quote; a gap by message on its own check", () => {
  assertEquals(R.keptOf(DRIFT, [kq(DRIFT, { message: "An older wording." })], AT)?.id, "k-" + DRIFT.quote, "the message may change between checks");
  assertEquals(R.keptOf(DRIFT, [kq({ ...DRIFT, type: "voice" })], AT), null, "another type");
  assertEquals(R.keptOf(DRIFT, [kq({ ...DRIFT, quote: DRIFT.quote + " " })], AT), null, "not the exact quote");
  assertEquals(R.keptOf(GAP, [kg(GAP)], AT)?.id, "g-" + GAP.message);
  assertEquals(R.keptOf(GAP, [kg(GAP, "2026-10-16T10:00:00.123457+00:00")], AT), null, "a gap from another check (1 microsecond later)");
  assertEquals(R.keptOf(GAP2, [kg(GAP)], AT), null, "the other gap of the check");
  assertEquals(R.keptOf(GAP, [kq(DRIFT)], AT), null);
});

Deno.test("view: major in text order, gaps last; minor apart; kept hidden", () => {
  const r = row([VOICE, SAFETY, GAP, DRIFT, NECK]);
  const v = R.view(r, [], TEXT, false);
  assertEquals(idx(v.major), [3, 4, 1, 2]);
  assertEquals(idx(v.minor), [0]);
  assertEquals(v.major[0].at, TEXT.indexOf(DRIFT.quote));
  // A quote no longer in the text goes after the ones in the text, before the gaps.
  const moved = R.view(row([GAP, { ...NECK, quote: "Gone from the text." }, DRIFT]), [], TEXT, false);
  assertEquals(idx(moved.major), [2, 1, 0]);
  const kept = R.view(r, [kq(DRIFT), kg(GAP), kq(VOICE)], TEXT, false);
  assertEquals([idx(kept.major), idx(kept.minor), kept.hidden.map((x) => x.i).sort()], [[4, 1], [], [0, 2, 3]]);
  assertEquals(kept.kept.length, 3);
});

Deno.test("view: the kept list holds every kept quote and only this check's gaps", () => {
  const v = R.view(row([DRIFT]), [kq(NECK), kg(GAP), kg(GAP2, "2026-10-15T09:00:00.000001+00:00")], TEXT, false);
  assertEquals(v.kept.map((k) => k.id), ["k-" + NECK.quote, "g-" + GAP.message]);
  assertEquals(R.view(null, [kq(NECK)], TEXT, false).kept.length, 1, "no check yet: the kept quotes still list");
});

Deno.test("view: pass rows (the AI said pass, or every finding of a type kept) and No open AI findings", () => {
  // 22d, 3a and 4: the drift is kept, so "No drift found" shows (owner, G5 STOP 1).
  const r = row([DRIFT, VOICE], { objective: "pass", voice: "issues", drift: "issues" });
  const v = R.view(r, [kq(DRIFT)], TEXT, false);
  assertEquals(v.pass, ["objective", "drift"]);
  assertEquals(v.noneOpen, false);
  // An area with issues and an open finding: no pass row.
  assertEquals(R.view(r, [], TEXT, false).pass, ["objective"]);
  // 22d, 12: every finding kept.
  const all = R.view(r, [kq(DRIFT), kq(VOICE)], TEXT, false);
  assertEquals([all.noneOpen, all.pass], [true, ["objective", "voice", "drift"]]);
  // Nothing found at all: the pass rows, not the one line.
  assertEquals(R.view(row([], { objective: "pass", voice: "pass", drift: "pass" }), [], TEXT, false).noneOpen, false);
  // unclear and skipped never become pass rows.
  assertEquals(R.view(row([], { objective: "unclear", voice: "skipped", drift: "pass" }), [], TEXT, false).pass, ["drift"]);
});

Deno.test("fixMajor: major, a quote in the text, not kept, a current check", () => {
  const r = row([VOICE, SAFETY, GAP, DRIFT, NECK, { ...NECK, message: "Gone.", quote: "Not in the text at all." }]);
  assertEquals(idx(R.fixMajor(r, [], TEXT, false)), [3, 4, 1], "text order; no voice, no gap, no missing quote");
  assertEquals(idx(R.fixMajor(r, [kq(NECK)], TEXT, false)), [3, 1], "a kept finding is out");
  assertEquals(R.fixMajor(r, [], TEXT, true), [], "out of date: none");
  assertEquals(R.fixMajor(null, [], TEXT, false), []);
  assertEquals(R.QUEUE_MIN, 2);
  assertEquals(R.fixMajor(row([DRIFT, VOICE, GAP]), [], TEXT, false).length < R.QUEUE_MIN, true, "1 major with a quote: no button (22d, 6)");
});

Deno.test("tabCount: code warnings + open major of a current check", () => {
  const r = row([DRIFT, VOICE, VOICE, GAP]);
  const v = R.view(r, [], TEXT, false);
  assertEquals(R.tabCount(2, v, false), 4, "2 warnings + drift + gap; minor never counts");
  assertEquals(R.tabCount(2, R.view(r, [kq(DRIFT)], TEXT, false), false), 3, "a kept finding leaves the count");
  assertEquals(R.tabCount(2, v, true), 2, "out of date: warnings only");
  assertEquals(R.tabCount(0, null, false), 0);
  assertEquals(R.KEPT_MAX, 50);
});
