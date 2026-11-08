/* ═══════════════════════════════════════════════════
   NicheInk · tests: the Typst converter cases (E13.1, from the E13.0 proof)
   /tests/fixtures/typst-cases.js   (used by tests/format-typst.test.js and
                                     tests/browser/format/t-engine-real.mjs)

   Each case: md (the input), typst (the exact output of
   kdpFormatTypst.blocks), text (what the PDF must print; compared without
   spaces, curly quotes read as straight), and optional checks for the browser:
     bold / italic  a word that must use the Bold / Italic font
     plain          every glyph uses the Regular font
     link           a link annotation with this URL
     glyph          only report what happens (no text check)
   Short made-up strings only, never book text.
═══════════════════════════════════════════════════ */

(function (root) {
  const R = String.raw;
  const BT = '`';

  root.kdpTypstCases = [
    // ── Special characters print as plain text ──
    { name: 'dollar', md: 'save $20', typst: R`save \$20`, text: 'save $20', plain: true },
    { name: 'two dollars (math pair)', md: '$5 and $10', typst: R`\$5 and \$10`, text: '$5 and $10', plain: true },
    { name: 'hash number', md: '#1 habit', typst: R`\#1 habit`, text: '#1 habit', plain: true },
    { name: 'at sign', md: 'email me @home', typst: R`email me \@home`, text: 'email me @home', plain: true },
    { name: 'star and equals', md: '5 * 3 = 15', typst: R`5 \* 3 \= 15`, text: '5 * 3 = 15', plain: true },
    { name: 'underscores', md: 'snake_case_name', typst: R`snake\_case\_name`, text: 'snake_case_name', plain: true },
    { name: 'backslashes', md: R`C:\notes\new`, typst: R`C:\\notes\\new`, text: R`C:\notes\new`, plain: true },
    { name: 'angle tag', md: '<tag>', typst: R`\<tag\>`, text: '<tag>', plain: true },
    { name: 'html tags', md: '<b>hi</b>', typst: R`\<b\>hi\<\/b\>`, text: '<b>hi</b>', plain: true },
    { name: 'footnote brackets', md: '[1]', typst: R`\[1\]`, text: '[1]', plain: true },
    { name: 'brackets in a sentence', md: 'see [note] here', typst: R`see \[note\] here`, text: 'see [note] here', plain: true },
    { name: 'backticks', md: `use ${BT}code${BT} here`, typst: `use \\${BT}code\\${BT} here`, text: `use ${BT}code${BT} here`, plain: true },
    { name: 'code fence', md: `${BT}${BT}${BT}js`, typst: `\\${BT}\\${BT}\\${BT}js`, text: `${BT}${BT}${BT}js`, plain: true },
    { name: 'tilde', md: 'a ~ b', typst: R`a \~ b`, text: 'a ~ b', plain: true },
    { name: 'percent', md: '50% off', typst: '50% off', text: '50% off', plain: true },
    { name: 'line comment', md: 'a // b', typst: R`a \/\/ b`, text: 'a // b', plain: true },
    { name: 'block comment', md: '/* x */', typst: R`\/\* x \*\/`, text: '/* x */', plain: true },
    { name: 'bare URL', md: 'http://example.com', typst: R`http:\/\/example.com`, text: 'http://example.com', plain: true },
    { name: 'caret, braces, pipe', md: 'x^2 and {braces} and a | b', typst: 'x^2 and {braces} and a | b', text: 'x^2 and {braces} and a | b', plain: true },
    { name: 'dashes stay as typed', md: 'wait -- no --- yes', typst: R`wait \-\- no \-\-\- yes`, text: 'wait -- no --- yes', plain: true },
    { name: 'dots stay as typed', md: 'wait... 3.5 x', typst: R`wait\.\.\. 3\.5 x`, text: 'wait... 3.5 x', plain: true },
    { name: 'equals at line start', md: '= not a heading', typst: R`\= not a heading`, text: '= not a heading', plain: true },
    { name: 'plus at line start (app escape)', md: R`\+ not a list`, typst: R`\+ not a list`, text: '+ not a list', plain: true },
    { name: 'slash at line start', md: '/ not a term', typst: R`\/ not a term`, text: '/ not a term', plain: true },
    { name: 'number dot (app escape)', md: R`1\. Not a list`, typst: R`1\. Not a list`, text: '1. Not a list', plain: true },
    { name: 'hyphen (app escape)', md: R`\- not a bullet`, typst: R`\- not a bullet`, text: '- not a bullet', plain: true },
    { name: 'hashes (app escape)', md: R`\## not a heading`, typst: R`\#\# not a heading`, text: '## not a heading', plain: true },
    { name: 'literal star (app escape)', md: R`a \* b`, typst: R`a \* b`, text: 'a * b', plain: true },
    { name: 'escaped stars are not italic', md: R`\*not italic\*`, typst: R`\*not italic\*`, text: '*not italic*', plain: true },
    { name: 'quotes and apostrophes', md: `"Quotes" and it's`, typst: `"Quotes" and it's`, text: `"Quotes" and it's`, plain: true },
    { name: 'quote after a digit (no prime)', md: `5'4" and the 1990's`, typst: String.raw`5\'4\" and the 1990\'s`, text: `5'4" and the 1990's`, plain: true },
    { name: 'unclosed star', md: 'an *unclosed star', typst: R`an \*unclosed star`, text: 'an *unclosed star', plain: true },
    { name: 'unicode', md: 'Unicode: é ü – “ ” …', typst: 'Unicode: é ü – “ ” …', text: 'Unicode: é ü – “ ” …', plain: true },
    { name: 'math pair with spaces', md: '$ x $ math', typst: R`\$ x \$ math`, text: '$ x $ math', plain: true },
    { name: 'unicode escape', md: R`\u{1F600}`, typst: R`\\u{1F600}`, text: R`\u{1F600}`, plain: true },
    { name: 'close and call', md: ']; #panic("x")', typst: R`\]; \#panic("x")`, text: ']; #panic("x")', plain: true },
    { name: 'text after bold', md: '**bold**.next(1)', typst: '#strong[bold];.next(1)', text: 'bold.next(1)', bold: 'bold' },
    { name: 'emoji (no glyph in the font)', md: 'calm 🙂', typst: 'calm 🙂', text: null, glyph: true },

    // ── Hostile Typst code prints as plain text (owner add 1) ──
    { name: 'hostile: read a file', md: '#read("x")', typst: R`\#read("x")`, text: '#read("x")', plain: true },
    { name: 'hostile: endless loop', md: '#while true {}', typst: R`\#while true {}`, text: '#while true {}', plain: true },
    { name: 'hostile: import', md: '#import "x"', typst: R`\#import "x"`, text: '#import "x"', plain: true },
    { name: 'hostile: page size', md: '#set page(width: 1pt)', typst: R`\#set page(width: 1pt)`, text: '#set page(width: 1pt)', plain: true },
    { name: 'hostile: let', md: '#let x = 1', typst: R`\#let x \= 1`, text: '#let x = 1', plain: true },
    { name: 'hostile: huge string', md: '#{ "a" * 99999 }', typst: R`\#{ "a" \* 99999 }`, text: '#{ "a" * 99999 }', plain: true },

    // ── Real Markdown still formats ──
    { name: 'heading 1', md: '# Heading one', typst: '= Heading one', text: 'Heading one', bold: 'Heading' },
    { name: 'heading 2', md: '## Heading two', typst: '== Heading two', text: 'Heading two', bold: 'Heading' },
    { name: 'heading 3', md: '### Heading three', typst: '=== Heading three', text: 'Heading three', bold: 'Heading' },
    { name: 'bold', md: '**bold** text', typst: '#strong[bold]; text', text: 'bold text', bold: 'bold' },
    { name: 'italic', md: '*italic* text', typst: '#emph[italic]; text', text: 'italic text', italic: 'italic' },
    { name: 'bold with italic inside', md: '**bold with *italic* inside**', typst: '#strong[bold with #emph[italic]; inside];', text: 'bold with italic inside', bold: 'bold', italic: 'italic' },
    { name: 'italic with bold inside', md: '*a **b** c*', typst: '#emph[a #strong[b]; c];', text: 'a b c', bold: 'b', italic: 'a' },
    { name: 'bold and italic', md: '***both***', typst: '#emph[#strong[both];];', text: 'both', bold: 'both', italic: 'both' },
    { name: 'bullet list', md: '- one\n- two', typst: '- one\n- two', text: '•one•two' },
    { name: 'star bullet list', md: '* one\n* two', typst: '- one\n- two', text: '•one•two' },
    { name: 'numbered list', md: '1. first\n2. second', typst: '1. first\n2. second', text: '1.first2.second' },
    { name: 'quote', md: '> a quote', typst: '#quote(block: true)[\na quote\n];', text: 'a quote' },
    { name: 'link', md: '[NicheInk](https://nicheink.com)', typst: '#link("https://nicheink.com")[NicheInk];', text: 'NicheInk', link: 'https://nicheink.com' },
    { name: 'mail link', md: '[mail](mailto:a@b.co)', typst: '#link("mailto:a@b.co")[mail];', text: 'mail', link: 'mailto:a@b.co' },
    { name: 'unsafe link stays text', md: '[click](javascript:alert(1))', typst: R`\[click\](javascript:alert(1))`, text: '[click](javascript:alert(1))', plain: true },
    { name: 'mixed paragraph', md: 'Save **$20** on *snake_case* #1', typst: R`Save #strong[\$20]; on #emph[snake\_case]; \#1`, text: 'Save $20 on snake_case #1', bold: '$20', italic: 'snake_case' },
    { name: 'two paragraphs', md: 'one\n\ntwo', typst: 'one\n\ntwo', text: 'onetwo', plain: true },
    { name: 'line break in a paragraph', md: 'line one\nline two', typst: 'line one#linebreak();line two', text: 'line oneline two', plain: true },
  ];

  /**
   * n seeded random one-line strings: printable ASCII plus a few letters and
   * marks the font has. The same seed gives the same strings in Deno and Chrome.
   */
  root.kdpTypstFuzz = function (seed, n) {
    let a = seed >>> 0;
    const rand = () => {   // mulberry32
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const chars = [];
    for (let c = 32; c < 127; c++) chars.push(String.fromCharCode(c));
    chars.push('é', 'ü', 'ß', '–', '“', '”', '‘', '’', '…', '©');
    // Markup characters a second time, so they come up often.
    chars.push(...'#$*_`<>@[]~=-+/\\.:;(){}"\'');
    const out = [];
    for (let i = 0; i < n; i++) {
      const len = 1 + Math.floor(rand() * 60);
      let s = '';
      for (let j = 0; j < len; j++) s += chars[Math.floor(rand() * chars.length)];
      out.push(s);
    }
    return out;
  };
})(globalThis);
