// G3 P9: runs the generate function's own rule (selectionInText) on the
// Improve requests the real editor built in tests/browser/write/t-selection.js.
//   tests/browser/run.sh write t-selection.js | deno run tests/browser/write/selection-check.ts
// Prints the browser test's lines, then one PASS or FAIL per case, and exits 1
// on any FAIL or when no case was read.
import { selectionInText } from "../../../supabase/functions/generate/lib/section_improve.ts";

const input = await new Response(Deno.stdin.readable).text();
let pass = 0, fail = 0;
for (const line of input.split("\n")) {
  const m = line.match(/^"?P9CASE (\S+?)"?$/);
  if (!m) {
    if (line.trim()) console.log(line);
    continue;
  }
  const bin = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  const c = JSON.parse(new TextDecoder().decode(bin));
  const okCase = selectionInText([c.stored.draft, c.stored.version], c.body.selection, c.body.before, c.body.after);
  console.log(`${okCase ? "PASS" : "FAIL"} server rule (selectionInText): ${c.name}`);
  okCase ? pass++ : fail++;
}
console.log(`selection-check: ${pass} pass, ${fail} fail`);
if (fail || !pass) Deno.exit(1);
