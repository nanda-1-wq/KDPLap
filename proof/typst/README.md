# E13.0 Typst proof (throwaway)

This folder proves that Typst can build a KDP 6 x 9 in print interior in the
browser. It lives on the branch `claude/e13-0-typst-proof`. The branch is never
merged. No app file uses it. Results: [RESULTS.md](RESULTS.md). Plan: [PLAN.md](PLAN.md).

## Files

| File | What it does |
|---|---|
| `md2typst.js` | Markdown export to Typst. Every character of the text prints as typed. |
| `cases.js` | 62 converter cases and the seeded fuzz strings (Deno and Chrome use the same ones) |
| `md2typst.test.js` | Deno test: exact Typst output per case, fuzz, the export split |
| `book.typ` | The Typst book template: 6 x 9 in, mirrored margins, header, contents |
| `pdf-check.js` | Reads PDF bytes: page count, page boxes, fonts |
| `engine.js` | Loads typst.ts, the wasm, the fonts and pdf.js from jsdelivr, each with SRI |
| `bench.html`, `bench.js` | Compiles one book, measures it, checks the layout |
| `cases.html`, `cases-page.js` | Prints every converter case and reads the text back |
| `make-sample.js` | Writes two generated books to `input/` |
| `run.mjs` | Drives Chrome and writes `out/results.json` |

`input/` and `out/` are ignored by git. The repo is public: book text never goes in a commit.

## Run it

From the repo root:

```sh
node proof/typst/make-sample.js                     # input/sample.md, input/large.md
deno test proof/typst/md2typst.test.js              # converter tests
node proof/typst/run.mjs                            # every measurement (about 2 minutes)
```

Your own book: export it as `.md` from the Export dialog and save it as
`proof/typst/input/my-book.md`. Then:

```sh
node proof/typst/run.mjs --only=books,checks --books=my-book
```

The PDF is `proof/typst/out/my-book.pdf`. The numbers are in
`proof/typst/out/results.json`. They hold numbers and page numbers only, no book text.

By hand: run `python3 tests/browser/serve.py`, then open
`http://127.0.0.1:5500/proof/typst/bench.html?book=my-book&checks=1`.
The page has a link to download the PDF.

`run.mjs` uses the `playwright-core` inside the global `@playwright/cli` and the
installed Chrome. Set `PLAYWRIGHT_CORE` to use another copy.
