// generate lib tests: the number rule (E12 step 2, M1). One table of phrases
// runs through every stage's own path: the Write and Improve markers
// (markUnsourced), Brief help, Positioning, Title, Outline, the outline check
// and the AI section check. Every path gives the same answer.
import { assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { anthropic, OUTLINE_OUT, outlineCheckCtx, outlineCtx, titleCtx } from "./test_fakes.ts";

const body = (out: unknown) => anthropic("end_turn", out).json();

// [phrase, the unsourced numbers]. No number here is in the fake Brief or Research.
const TABLE: [string, string[]][] = [
  ["A 12-minute routine for stiff knees.", []],                 // a small plain count
  ["For women over 50 who sit all day.", []],
  ["Hold a 9 lb weight in each hand.", []],                     // a unit with no result word (owner decision 1)
  ["Hold the pose for 120 seconds.", []],                       // 100 or more, counting book parts
  ["Rest for 2.5 minutes between rounds.", []],                 // a decimal, counting book parts
  ["Lose 17 pounds in the first months.", ["17"]],               // a unit with a result word
  ["Since 2019 chair classes have grown.", ["2019"]],            // a year
  ["About 40% of adults sit too long.", ["40"]],
  ["A class costs $25 a week.", ["25"]],
  ["Nearly 7 in 10 readers sit too long.", ["7 in 10"]],
  ["Falls are 2.5 times more likely at night.", ["2.5"]],        // "times" is not a book part
  ["Studies show 11 weeks of practice helps.", ["11"]],          // a claim word makes small numbers claims
  ["It is proven to work in 13 days.", ["13"]],
  ["Work 9-to-5? Stretch 24/7.", []],                           // figures of speech
];

Deno.test("number rule: the shared table, unsourcedNumbers and markUnsourced", () => {
  for (const [phrase, want] of TABLE) {
    assertEquals(L.unsourcedNumbers(phrase, ""), want, phrase);
    assertEquals(L.markUnsourced(phrase, "").flagged, want.length ? 1 : 0, phrase);
  }
});

Deno.test("number rule: Brief help, Positioning and Title give the same answer", async () => {
  const brief = { result: "ok", target_reader: "Adults", reader_problem: "x", promise_draft: "After this book, the reader can sit tall.", stance: "Slow is fine.", standout: "Seated only.", missing: "" };
  for (const [phrase, want] of TABLE) {
    const b = L.interpretBriefHelp(true, await body({ ...brief, reader_problem: phrase }), "");
    assertEquals(b.unsourced?.reader_problem ?? [], want, `brief: ${phrase}`);
    const p = L.interpretPositioningHelp(true, await body({ result: "ok", approach: phrase, missing: "" }), ["approach"], "");
    assertEquals(p.unsourced?.approach ?? [], want, `positioning: ${phrase}`);
    const t = L.interpretTitleIdeas(true, await body({ options: [{ title: "Calm Seated Yoga", subtitle: phrase.replace(/[.?]+$/, ""), reason: "r", keywords: [] }] }), titleCtx(), 1);
    assertEquals(t.titles![0].unsourced, want, `title: ${phrase}`);
  }
});

Deno.test("number rule: Outline, the outline check and the AI section check give the same answer", async () => {
  const ctx = outlineCtx();
  const job = { ctx, per: 3, target: L.outlineTarget(ctx.plan), chapters: ctx.plan.chapter_count };
  const check = outlineCheckCtx();
  const chapters = check.outline.filter((c) => c.kind === "chapter");
  for (const [phrase, want] of TABLE) {
    // Outline: the phrase is chapter 1's objective; its title and sections have no numbers.
    const reply = structuredClone(OUTLINE_OUT);
    reply.chapters[0] = { title: "Safe seated basics", objective: phrase, sections: [{ title: "Sit tall", words: 300 }, { title: "Breathe out", words: 300 }, { title: "Rest", words: 300 }] };
    const o = L.interpretOutline(true, await body(reply), job, "");
    assertEquals(o.outline!.chapters[0].unsourced, want, `outline: ${phrase}`);
    const oc = L.interpretOutlineCheck(true, await body({ findings: [{ kind: "drift", chapters: [2], quote: "", why: phrase }] }), chapters, "", "");
    assertEquals(oc.findings![0].unsourced, want, `outline check: ${phrase}`);
    const sc = L.interpretSectionCheck(true, await body({ findings: [{ type: "objective", message: phrase, quote: "" }] }), "Some text.", true, "");
    assertEquals(sc.check!.findings[0].unsourced ?? [], want, `section check: ${phrase}`);
  }
});

Deno.test("number rule: a source with the number or the same ratio clears it", () => {
  assertEquals(L.unsourcedNumbers("About 40% of adults sit too long.", "CDC: 40% of adults sit too long."), []);
  assertEquals(L.unsourcedNumbers("Nearly 7 in 10 readers sit too long.", "7 out of 10 readers"), []);
  assertEquals(L.unsourcedNumbers("Nearly 7 in 10 readers sit too long.", "7 readers, 10 books"), ["7 in 10"]);
  assertEquals(L.unsourcedNumbers("Lose 17 pounds in the first months.", "readers lost 17 pounds"), []);
});

Deno.test("number rule: unsourcedList keeps at most 10 numbers of at most 20 characters", () => {
  const many = `Studies show ${Array.from({ length: 12 }, (_, i) => 41 + i).join(", ")} and 123456789012345678901.`;
  assertEquals(L.unsourcedList(many, ""), ["41", "42", "43", "44", "45", "46", "47", "48", "49", "50"]);
  assertEquals(L.unsourcedList("Studies show 123456789012345678901 and 7.", ""), ["7"]);
});
