// Loads js/cover/* in the browser order (with 08's format-rules for the spine per page)
// and gives the shared helpers for the E16 Part 1 tests.
import "../../js/format-rules.js";
import "../../js/cover/geo.js";
import "../../js/cover/textlayout.js";
import "../../js/cover/shapes.js";
import "../../js/cover/names.js";
import "../../js/cover/model.js";
import "../../js/cover/remap.js";
import "../../js/cover/history.js";
import "../../js/cover/palettes.js";
import "../../js/cover/kindle.js";
import "../../js/cover/checks.js";
import "../../js/cover/layouts.js";
import { designTextH, DESIGN_BOOK, TRIMS, PAGES4, PAPERS } from "./design-cover.js";

export const K = globalThis.kdpCover;
export { designTextH, DESIGN_BOOK, TRIMS, PAGES4, PAPERS };
export const GOLDEN = JSON.parse(Deno.readTextFileSync(new URL("../fixtures/cover-golden.json", import.meta.url)));

// The fixture keeps 4 decimals; a built number must be within half of that.
export const TOL = 6e-5;
export function near(actual, expected, path = "") {
  if (typeof expected === "number") {
    if (typeof actual !== "number" || !(Math.abs(actual - expected) <= TOL)) throw new Error(`${path}: ${actual} ≠ ${expected}`);
    return;
  }
  if (expected === null || typeof expected !== "object") {
    if (actual !== expected) throw new Error(`${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${path}: length ${actual && actual.length} ≠ ${expected.length}`);
    expected.forEach((e, i) => near(actual[i], e, `${path}[${i}]`));
    return;
  }
  if (!actual || typeof actual !== "object") throw new Error(`${path}: not an object`);
  const ka = Object.keys(actual).filter((k) => actual[k] !== undefined).sort(), ke = Object.keys(expected).filter((k) => expected[k] !== undefined).sort();
  if (JSON.stringify(ka) !== JSON.stringify(ke)) throw new Error(`${path}: keys ${ka.join(",")} ≠ ${ke.join(",")}`);
  ke.forEach((k) => near(actual[k], expected[k], `${path}.${k}`));
}

const POS = ["id", "type", "src", "kind", "x", "y", "w", "h", "size", "px", "py", "pw", "ph", "rot"];
export const pos = (l) => Object.fromEntries(POS.filter((k) => l[k] !== undefined).map((k) => [k, l[k]]));
export const chk = (items) => items.map((x) => ({ sev: x.sev, msg: x.msg, id: x.id ?? null }));
export const goldChk = (items) => items.map((x) => ({ sev: x.sev, msg: x.msg, id: x.id ?? null }));
export const fk = (f) => `${f.trim} ${f.pages} ${f.paper}`;
export const G6 = { trim: "6x9", pages: 54, paper: "white" };
