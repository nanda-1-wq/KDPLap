// The stage table (lib/stages.ts). Run with the other generate tests.
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { anthropic } from "./test_fakes.ts";

Deno.test("stage table: one entry per stage, nothing else", () => {
  assertEquals(Object.keys(L.STAGE_TABLE).sort(), [...L.STAGES].sort());
  for (const s of L.STAGES) {
    const d = L.stageDef(s);
    for (const k of ["read", "check", "prompt", "interpret", "reply"] as const) assertEquals(typeof d[k], "function", `${s}.${k}`);
  }
  // Only the stages that save their own results have a save step.
  assertEquals(L.STAGES.filter((s) => L.stageDef(s).save), ["drift_check", "title_ideas", "outline_ideas", "outline_check"]);
  // E10.2: only section_write streams; it never goes through buildRequest or interpret.
  assertEquals(L.STAGES.filter((s) => L.stageDef(s).stream), ["section_write"]);
  assertThrows(() => L.buildRequest({ stage: "section_write" } as unknown as L.Job), Error, "generate: section_write streams, use writeRequest");
  assertThrows(() => L.stageDef("section_write").interpret({} as never, true, {}), Error, "generate: section_write streams, use lib/write_run.ts");
});

Deno.test("stage table: an unknown stage fails clearly", () => {
  for (const s of ["nope", "", "toString", "__proto__", "constructor"]) {
    assertThrows(() => L.stageDef(s), Error, `generate: unknown stage ${s}`);
  }
  assertThrows(() => L.buildRequest({ stage: "nope" } as unknown as L.Job), Error, "generate: unknown stage nope");
  assertThrows(() => L.interpretJob({ stage: "nope" } as unknown as L.Job, true, {}), Error, "generate: unknown stage nope");
  assertThrows(() => L.interpretResponse("nope" as L.Stage, true, {}), Error, "generate: unknown stage nope");
});

Deno.test("interpretResponse: the stages that need their job throw instead of using the Brief parser", async () => {
  // This reply is a valid Brief answer. Before B1 these three stages fell into the Brief parser.
  const brief = await anthropic("end_turn", { result: "ok", target_reader: "A", reader_problem: "B", promise_draft: "C", stance: "D", standout: "E", missing: "" }).json();
  for (const s of ["positioning_help", "drift_check", "title_ideas", "competitor_import", "outline_ideas", "outline_check"] as const) {
    assertThrows(() => L.interpretResponse(s, true, brief), Error, `generate: ${s} needs its job, use interpretJob`);
  }
  assertEquals(L.interpretResponse("brief_help", true, brief).code, null);
});

Deno.test("interpretResponse: brief_help without the job treats every number as unsourced", async () => {
  const body = await anthropic("end_turn", { result: "ok", target_reader: "Adults over 60", reader_problem: "B", promise_draft: "C", stance: "D", standout: "E", missing: "" }).json();
  assertEquals(L.interpretResponse("brief_help", true, body).unsourced, { target_reader: ["60"] });
});

Deno.test("isFail tells a check error from a job", () => {
  assertEquals(L.isFail({ fail: "options_full" }), true);
  assertEquals(L.isFail({ stage: "amazon_import", text: "x" }), false);
});
