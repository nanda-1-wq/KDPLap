// node proof/typst/make-sample.js   (from the repo root)
// E13.0 Typst proof (throwaway): writes two generated books in the export's
// shape (js/export-build.js toMarkdown) to proof/typst/input/:
//   sample.md  about 60 pages, every tricky character from cases.js in the text
//   large.md   about 400 pages, to measure compile time and memory
// The words are placeholder text from a fixed seed, not a real book.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'input');
fs.mkdirSync(DIR, { recursive: true });

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const WORDS = ('calm body breath habit study minute focus small daily simple notice tension morning evening quiet ' +
  'routine practice gentle steady learn reader page note plan time short clear step return begin rest ' +
  'shoulder jaw hands walk water light window chair table write read review choose start finish keep').split(' ');
const TRICKY = ['save $20', 'the #1 habit', 'email me @home', '5 * 3 = 15', 'snake_case', 'C:\\notes', '<tag>', '[1]',
  '`code`', 'a ~ b', '50% off', 'a // b', 'wait -- no', 'it\'s "fine"', '#read("x")', '#let x = 1', '$5 and $10'];

function sentence() {
  const n = 8 + Math.floor(rand() * 14);
  const w = Array.from({ length: n }, () => pick(WORDS));
  if (rand() < 0.15) w.splice(Math.floor(rand() * n), 0, pick(TRICKY));
  if (rand() < 0.08) w.splice(Math.floor(rand() * n), 0, `**${pick(WORDS)} ${pick(WORDS)}**`);
  if (rand() < 0.08) w.splice(Math.floor(rand() * n), 0, `*${pick(WORDS)}*`);
  const s = w.join(' ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}
const paragraph = () => Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(' ');
const title = (n) => Array.from({ length: n }, () => pick(WORDS)).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function section() {
  const out = [`## ${title(3 + Math.floor(rand() * 3))}`];
  const paras = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < paras; i++) {
    out.push(paragraph());
    if (i === 1 && rand() < 0.5) out.push(Array.from({ length: 3 }, () => `- ${sentence()}`).join('\n'));
    if (i === 2 && rand() < 0.4) out.push(Array.from({ length: 3 }, (_, k) => `${k + 1}. ${sentence()}`).join('\n'));
    if (i === 2 && rand() < 0.3) out.push(`### ${title(2)}`);   // always followed by a paragraph
    if (i === 3 && rand() < 0.2) out.push(`> ${sentence()}`);
  }
  return out.join('\n\n');
}

function book({ name, chapters, sections }) {
  const titles = ['Introduction', ...Array.from({ length: chapters }, (_, i) => `Chapter ${i + 1}: ${title(3)}`), 'Conclusion'];
  const out = [
    `# ${name}`,
    '*A Generated Sample With $ Signs, #Tags and @Marks for the Typst Proof*',
    'by Sample Author',
    'Copyright © 2026 Sample Author. All rights reserved. No part of this book may be reproduced without written permission from the author, except for short quotes in reviews.',
    '# Contents',
    [...titles, 'About the author'].map((t) => `- ${t}`).join('\n'),
  ];
  for (const t of titles) {
    out.push(`# ${t}`);
    const n = t === 'Introduction' || t === 'Conclusion' ? 1 : sections;
    for (let i = 0; i < n; i++) out.push(section());
  }
  out.push('# About the author', paragraph());
  return `${out.join('\n\n')}\n`;
}

const files = {
  'sample.md': book({ name: 'Sample Book: $20 #1 Habits', chapters: 8, sections: 3 }),
  'large.md': book({ name: 'Large Sample Book', chapters: 30, sections: 10 }),
};
for (const [f, text] of Object.entries(files)) {
  fs.writeFileSync(path.join(DIR, f), text);
  console.log(f, text.split(/\s+/).length, 'words');
}
