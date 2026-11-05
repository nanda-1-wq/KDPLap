// The structure 0028 asks of qc_runs.results, as code: qc_results_ok, qc_item_ok,
// qc_source_ok, qc_count_ok, qc_uuid_ok and the size check. tests/limits-parity.test.js
// reads the numbers and rule ids from 0028, so this copy cannot drift from it.
const keys = (o) => Object.keys(o).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const chars = (s) => [...s].length;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const blank = (s) => /^[ \t\n\r\f\v]*$/.test(s);
const uuidOk = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const countOk = (v) => Number.isInteger(v) && v >= 0 && v <= 999999999;
const GROUPS = ["1", "2", "3", "4", "5", "7"];

/** Why an item fails, or null. */
export function itemProblem(e, rules) {
  if (!isObj(e)) return "not an object";
  if (!same(keys(e), ["end", "g", "key", "message", "quote", "rule", "section_id", "start", "version_id"])) return `keys ${keys(e)}`;
  if (!GROUPS.includes(String(e.g)) || typeof e.g !== "number") return "g";
  if (!rules.includes(e.rule)) return `rule ${e.rule}`;
  if (typeof e.key !== "string" || chars(e.key) < 1 || chars(e.key) > 300) return "key";
  if (typeof e.message !== "string" || chars(e.message) < 1 || chars(e.message) > 300 || blank(e.message)) return "message";
  if (typeof e.quote !== "string" || chars(e.quote) > 300) return "quote";
  if (e.section_id !== null && !uuidOk(e.section_id)) return "section_id";
  if (e.version_id !== null && !uuidOk(e.version_id)) return "version_id";
  if (e.start === null) return e.end === null ? null : "end without start";
  if (!countOk(e.start) || !countOk(e.end) || e.start > e.end) return "offsets";
  return null;
}

/** Why results fail, or null. text: what results::text adds to JSON is at most one space per : and ,. */
export function resultsProblem(r, rules) {
  if (!isObj(r) || !same(keys(r), ["items", "more", "notes", "sources"])) return "top keys";
  if (!Array.isArray(r.items) || !isObj(r.more) || !isObj(r.notes) || !Array.isArray(r.sources)) return "top types";
  if (r.items.length > 400) return "over 400 items";
  if (r.sources.length > 50) return "over 50 sources";
  for (const e of r.items) { const p = itemProblem(e, rules); if (p) return `item ${e && e.rule}: ${p}`; }
  for (const [k, v] of Object.entries(r.more)) if (!GROUPS.includes(k) || !countOk(v)) return `more ${k}`;
  for (const s of r.sources) {
    if (!isObj(s) || !same(keys(s), ["citation", "sections"])) return "source keys";
    if (typeof s.citation !== "string" || chars(s.citation) < 1 || chars(s.citation) > 200) return "citation";
    if (!Array.isArray(s.sections) || s.sections.length > 400 || !s.sections.every(uuidOk)) return "source sections";
  }
  if (!same(keys(r.notes), ["running", "unsaved"]) || !countOk(r.notes.unsaved) || !countOk(r.notes.running)) return "notes";
  const json = JSON.stringify(r);
  if (!json.isWellFormed()) return "a lone surrogate";
  const spaces = (json.match(/[:,]/g) || []).length;
  if (new TextEncoder().encode(json).length + spaces > 400000) return "over the size check";
  return null;
}
