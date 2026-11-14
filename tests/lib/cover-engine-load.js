// Loads js/cover/* for the E16 Part 2 pure tests: Part 1's files (tests/lib/cover-load.js), then the
// font catalog, fonts, the flatten plan, the Typst writer, zip and the picture helpers, and the QA covers.
import { K } from "./cover-load.js";
import "../../js/cover/font-catalog.js";
import "../../js/cover/fonts.js";
import "../../js/cover/flatten.js";
import "../../js/cover/typst.js";
import "../../js/cover/zip.js";
import "../../js/cover/image-prep.js";
import "../fixtures/cover-qa.js";

export { K };
export const QA = globalThis.kdpCoverQa;
export const G6 = { trim: "6x9", pages: 54, paper: "white" };
/** Run fn with the catalog's metrics on, then back to Part 1's table. */
export function withCatalog(fn) {
  K.fonts.install();
  try { return fn(); } finally { K.textlayout.setMetricsSource(null); }
}
