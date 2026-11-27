// NicheInk · E17 book parts: shared test fixture (TEST text only, never a real book).
// The shape of book_parts_files() (0035): the parts in the file with their Final text.
// Every part kind and every typed Also by title carries the hostile characters
// (plan C4): # $ @ * _ & < > " '
// Used by tests/format-typst.test.js, tests/format-epub.test.js, tests/export-build.test.js,
// tools/print-fingerprint.mjs (second fingerprint), tools/e17-samples.mjs and
// tests/browser/format/t-parts.mjs.
(function (root) {
  const HOSTILE = `# $ @ * _ & < > " '`;
  const text = (name) => `${name} text. Hostile: ${HOSTILE} and <b>not bold</b> & "quotes" 'single' 5" tall.`;
  const parts = [
    { kind: 'dedication', version_id: 'pv-ded', content: `For my mother.\n${text('Dedication')}` },
    { kind: 'epigraph', version_id: 'pv-epi', content: `*Small steps add up.*\n\n${text('Epigraph')}` },
    { kind: 'foreword', version_id: 'pv-fwd', content: `${text('Foreword')}\n\nA second paragraph with **bold** and *italic*.\n\n## A heading inside\n\n- one\n- two` },
    { kind: 'preface', version_id: 'pv-pre', content: `${text('Preface')} [Verify: no source]\n\nWhy I wrote this book.` },
    { kind: 'acknowledgments', version_id: 'pv-ack', content: `${text('Acknowledgments')}\n\nThank you, readers.` },
    { kind: 'about_author', version_id: 'pv-abo', content: `${text('About')}\nShe lives by the sea.\n\nTwo cats.` },
    { kind: 'review_request', version_id: null, content: null },
    { kind: 'also_by', version_id: null, content: null, entries: [
      { title: `Typed ${HOSTILE}`, subtitle: `Subtitle ${HOSTILE}` },
      { title: 'Chair Yoga for Seniors', subtitle: null },
      { title: `1. Looks like a list`, subtitle: '' }] }
  ];
  root.kdpPartCases = { HOSTILE, parts, all: () => JSON.parse(JSON.stringify(parts)) };
})(globalThis);
