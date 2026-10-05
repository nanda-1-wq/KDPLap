// deno test tests/title-checks.test.js   (from the repo root)
// The browser file sets globalThis.kdpTitleChecks; Deno runs the same code.
import { assert, assertEquals } from "jsr:@std/assert@1";
import "../js/title-checks.js";

const C = globalThis.kdpTitleChecks;
const COMPETITORS = [
  { title: "The Complete Chair Yoga Handbook: Seated Poses for Every Body", author: "R. Palmer" },
  { title: "Gentle Chair Yoga for Beginners: Easy Seated Stretches for Seniors", author: "Mara Quinn & Dev Shah" },
];
const codes = (r) => r.warnings.map((w) => w.code);

Deno.test("length: title + \": \" + subtitle, as design 19 shows (113); over 200 says how many", () => {
  const r = C.check("Chair Yoga for Seniors Over 60", "Gentle 15-Minute Routines to Improve Balance, Flexibility, and Confidence at Home", COMPETITORS);
  assertEquals([r.length, r.over], [113, 0]);
  assertEquals(codes(r), []);
  assertEquals(r.passes.map((p) => p.text), ["No sales claims found", "No competitor author names", "Not close to a competitor title", "No word repeated"]);
  const long = C.check("Chair Yoga for Seniors Over 60", "Gentle 15-Minute Routines to Improve Balance, Flexibility, Strength, and Confidence at Home, With Clear Photos, Large Print, and a Simple Plan for Stiff Joints, Sore Hips, and Knees.", []);
  assertEquals([long.length, long.over], [214, 14]);   // design 21: 214 / 200, "Remove 14"
  assertEquals(C.check("Chair Yoga", "", []).length, 10);
});

Deno.test("sales: hyphenated Pain-Free and Stress-Free pass; Free Bonus Inside warns", () => {
  assertEquals(codes(C.check("Pain-Free Movement", "Gentle Chair Routines for Stiff Knees and Hips", [])), []);
  assertEquals(codes(C.check("Stress-Free Chair Yoga", "A Calm 10-Minute Practice for Busy Seniors", [])), []);
  const r = C.check("Chair Yoga for Seniors", "Free Bonus Inside", []);
  assertEquals(r.warnings, [{ code: "sales", text: 'Sales claim: "Free", "Bonus"' }]);
  assertEquals(C.check("The #1 Chair Yoga Guide", "", []).warnings[0].text, 'Sales claim: "#1"');
  assertEquals(C.check("Chair Yoga", "The Best-Selling Plan for Seniors", []).warnings[0].text, 'Sales claim: "Best-Selling"');
  assertEquals(C.check("Chair Yoga", "A Best Seller for Seniors", []).warnings[0].text, 'Sales claim: "best seller"');
  assertEquals(codes(C.check("Salesforce Basics", "Wholesale Pricing for Beginners", [])), []);   // whole words only
});

Deno.test("author: a full competitor author name warns; one shared word does not", () => {
  assertEquals(C.check("Chair Yoga With R. Palmer", "Seated Poses for Seniors", COMPETITORS).warnings.find((w) => w.code === "author").text, 'Competitor author: "R. Palmer"');
  assertEquals(C.check("Seated Strength", "The Dev Shah Method for Balance After 60", COMPETITORS).warnings.find((w) => w.code === "author").text, 'Competitor author: "Dev Shah"');
  assert(!codes(C.check("Palmer Park Walking Guide", "Easy Routes for Seniors", COMPETITORS)).includes("author"));
});

Deno.test("close: main titles that share most words warn (design 19); different ones pass", () => {
  const r = C.check("The Complete Chair Yoga Book", "Everything Seniors Need to Stretch, Strengthen, and Stay Steady", COMPETITORS);
  assertEquals(r.warnings.find((w) => w.code === "close").text, 'Close to "The Complete Chair Yoga Handbook: Seated Poses for Every Body"');
  assert(!codes(C.check("Chair Yoga for Seniors Over 60", "Gentle Routines at Home", COMPETITORS)).includes("close"));
  assert(!codes(C.check("Seated Yoga Made Simple", "A 4-Week Plan for Seniors With Stiff Joints and Limited Mobility", COMPETITORS)).includes("close"));
  assert(codes(C.check("Gentle chair yoga for beginners", "", COMPETITORS)).includes("close"));   // same main title, any case
});

Deno.test("repeat: a word used twice warns, small words and plurals handled", () => {
  assertEquals(C.check("Chair Yoga for Seniors", "Easy Chair Routines for Every Senior", []).warnings, [{ code: "repeat", text: 'Repeated word: "chair", "senior"' }]);
  assertEquals(codes(C.check("Chair Yoga for Seniors Over 60", "Gentle 15-Minute Routines to Improve Balance, Flexibility, and Confidence at Home", [])), []);
});

Deno.test("repeat: words inside a hyphenated compound are not counted (step-by-step, Pain-Free)", () => {
  // Option 10 from the E8.2 live check.
  assertEquals(codes(C.check("Easy Chair Yoga at Home", "Warm, step-by-step seated routines for adults over 60, with gentler options for sore knees and shoulders", [])), []);
  assertEquals(codes(C.check("Pain-Free Hips", "Gentle Moves to Ease Pain at Home", [])), []);
  // The whole compound used twice still warns, and so does a plain repeat next to a compound.
  assertEquals(C.check("Step-by-Step Chair Yoga", "A Step-by-Step Plan for Seniors", []).warnings, [{ code: "repeat", text: 'Repeated word: "step-by-step"' }]);
  assertEquals(C.check("Sit and Stretch Yoga Plan", "A ready weekly plan of short chair routines", []).warnings, [{ code: "repeat", text: 'Repeated word: "plan"' }]);
});
