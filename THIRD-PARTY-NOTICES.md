# Third-party notices

NicheInk uses the software and fonts below. This file lists each one, its
license and where it comes from. Added in E13.1 (08 Format, the print engine).
It closes E13.0 proof risk 8 (the engine's wasm ships with no license file).

None of these files are in this repository except droplet (vendored, below).
The others load from jsdelivr or unpkg at pinned versions, each checked
against its sha384 hash (`js/format/files.js`).

## Print engine

### typst.ts 0.7.0 (`@myriaddreamin/typst.ts`, `@myriaddreamin/typst-ts-web-compiler`)
- License: Apache License 2.0.
- Source: https://github.com/Myriad-Dreamin/typst.ts
- Files: `dist/esm/main.bundle.js`, `pkg/typst_ts_web_compiler_bg.wasm`.

### Typst 0.14.2 (inside the typst.ts wasm)
- License: Apache License 2.0.
- Source: https://github.com/typst/typst
- The wasm package has no license or NOTICE file of its own. It is built
  from typst.ts and Typst, and it includes their Rust dependencies, each
  under its own permissive license (MIT, Apache-2.0 or similar); see the
  `Cargo.lock` of typst.ts 0.7.0 for the full list.

### pdf.js 6.4.299 (`pdfjs-dist`)
- License: Apache License 2.0.
- Source: https://github.com/mozilla/pdf.js
- Files: `build/pdf.min.mjs`, `build/pdf.worker.min.mjs` (the print preview and the PDF checks).

The full Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0

### droplet 0.3.1 (vendored as `js/format/droplet.typ`)
- License: MIT. Source: https://github.com/EpicEricEE/typst-droplet (Typst Universe package `@preview/droplet:0.3.1`).
- Used for the drop cap (print only). The package's five files are joined
  into one; nothing else is changed.

```
MIT License

Copyright (c) 2023 Eric Biedert

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Fonts (SIL Open Font License 1.1)

Loaded from the npm packages `@expo-google-fonts/*` (static TTF files). The
chosen style's fonts are embedded (as subsets) in the Print PDF a writer
makes, which the license allows.

| Style | Family | Package | Copyright |
|---|---|---|---|
| Classic | EB Garamond | `@expo-google-fonts/eb-garamond@0.4.3` | Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12) |
| Modern (text) | Source Serif 4 | `@expo-google-fonts/source-serif-4@0.4.2` | Copyright 2014 The Source Serif 4 Project Authors (https://github.com/adobe-fonts/source-serif) |
| Modern (headings) | Source Sans 3 | `@expo-google-fonts/source-sans-3@0.4.2` | Copyright 2010-2020 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. All Rights Reserved. Source is a trademark of Adobe in the United States and/or other countries. |
| Clean | Literata | `@expo-google-fonts/literata@0.4.3` | Copyright 2017 The Literata Project Authors (https://github.com/googlefonts/literata) |
| Warm | Lora | `@expo-google-fonts/lora@0.4.2` | Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora". |

The style sample images in `app/format/style-*.png` show "Aa" set in these
fonts (made by `tools/make-style-samples.mjs`).

The license, as shipped in each package (`LICENSE_FONT`):

```
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
