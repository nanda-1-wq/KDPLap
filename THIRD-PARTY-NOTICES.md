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

<!-- cover-fonts:start (written by tools/cover-fonts.mjs) -->
## Cover fonts (09 Cover, E16)

300 font families for the cover editor (plan §8). Each is under the
SIL Open Font License 1.1 or the Apache License 2.0 (the `license` field of
its google/fonts METADATA.pb). The static TTFs load from jsdelivr or unpkg at
the pinned `@expo-google-fonts` versions, each checked against its sha384
(`js/cover/font-catalog.js`). Only the fonts a cover uses are embedded in its
PDF (as subsets), which both licences allow, also on books that are sold.
OFL 1.1: https://openfontlicense.org. Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0

- ABeeZee: SIL Open Font License 1.1; `@expo-google-fonts/abeezee@0.4.1`, weights 400; https://fonts.google.com/specimen/ABeeZee
- Abel: SIL Open Font License 1.1; `@expo-google-fonts/abel@0.4.0`, weights 400; https://fonts.google.com/specimen/Abel
- Abril Fatface: SIL Open Font License 1.1; `@expo-google-fonts/abril-fatface@0.4.1`, weights 400; https://fonts.google.com/specimen/Abril+Fatface
- Acme: SIL Open Font License 1.1; `@expo-google-fonts/acme@0.4.2`, weights 400; https://fonts.google.com/specimen/Acme
- Advent Pro: SIL Open Font License 1.1; `@expo-google-fonts/advent-pro@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Advent+Pro
- Alata: SIL Open Font License 1.1; `@expo-google-fonts/alata@0.4.1`, weights 400; https://fonts.google.com/specimen/Alata
- Albert Sans: SIL Open Font License 1.1; `@expo-google-fonts/albert-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Albert+Sans
- Alegreya: SIL Open Font License 1.1; `@expo-google-fonts/alegreya@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Alegreya
- Alegreya Sans: SIL Open Font License 1.1; `@expo-google-fonts/alegreya-sans@0.4.2`, weights 400, 700; https://fonts.google.com/specimen/Alegreya+Sans
- Aleo: SIL Open Font License 1.1; `@expo-google-fonts/aleo@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Aleo
- Alex Brush: SIL Open Font License 1.1; `@expo-google-fonts/alex-brush@0.4.1`, weights 400; https://fonts.google.com/specimen/Alex+Brush
- Alexandria: SIL Open Font License 1.1; `@expo-google-fonts/alexandria@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Alexandria
- Alfa Slab One: SIL Open Font License 1.1; `@expo-google-fonts/alfa-slab-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Alfa+Slab+One
- Allura: SIL Open Font License 1.1; `@expo-google-fonts/allura@0.4.2`, weights 400; https://fonts.google.com/specimen/Allura
- Almarai: SIL Open Font License 1.1; `@expo-google-fonts/almarai@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Almarai
- Amaranth: SIL Open Font License 1.1; `@expo-google-fonts/amaranth@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Amaranth
- Amatic SC: SIL Open Font License 1.1; `@expo-google-fonts/amatic-sc@0.4.2`, weights 400, 700; https://fonts.google.com/specimen/Amatic+SC
- Amiri: SIL Open Font License 1.1; `@expo-google-fonts/amiri@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Amiri
- Andada Pro: SIL Open Font License 1.1; `@expo-google-fonts/andada-pro@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Andada+Pro
- Anek Telugu: SIL Open Font License 1.1; `@expo-google-fonts/anek-telugu@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Anek+Telugu
- Antic Slab: SIL Open Font License 1.1; `@expo-google-fonts/antic-slab@0.4.1`, weights 400; https://fonts.google.com/specimen/Antic+Slab
- Anton: SIL Open Font License 1.1; `@expo-google-fonts/anton@0.4.2`, weights 400; https://fonts.google.com/specimen/Anton
- Antonio: SIL Open Font License 1.1; `@expo-google-fonts/antonio@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Antonio
- Architects Daughter: SIL Open Font License 1.1; `@expo-google-fonts/architects-daughter@0.4.1`, weights 400; https://fonts.google.com/specimen/Architects+Daughter
- Archivo: SIL Open Font License 1.1; `@expo-google-fonts/archivo@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Archivo
- Arimo: SIL Open Font License 1.1; `@expo-google-fonts/arimo@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Arimo
- Arvo: SIL Open Font License 1.1; `@expo-google-fonts/arvo@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Arvo
- Asap: SIL Open Font License 1.1; `@expo-google-fonts/asap@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Asap
- Assistant: SIL Open Font License 1.1; `@expo-google-fonts/assistant@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Assistant
- Atkinson Hyperlegible: SIL Open Font License 1.1; `@expo-google-fonts/atkinson-hyperlegible@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Atkinson+Hyperlegible
- Audiowide: SIL Open Font License 1.1; `@expo-google-fonts/audiowide@0.4.1`, weights 400; https://fonts.google.com/specimen/Audiowide
- Bai Jamjuree: SIL Open Font License 1.1; `@expo-google-fonts/bai-jamjuree@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Bai+Jamjuree
- Baloo 2: SIL Open Font License 1.1; `@expo-google-fonts/baloo-2@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Baloo+2
- Bangers: SIL Open Font License 1.1; `@expo-google-fonts/bangers@0.4.1`, weights 400; https://fonts.google.com/specimen/Bangers
- Barlow: SIL Open Font License 1.1; `@expo-google-fonts/barlow@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Barlow
- Barlow Condensed: SIL Open Font License 1.1; `@expo-google-fonts/barlow-condensed@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Barlow+Condensed
- Barlow Semi Condensed: SIL Open Font License 1.1; `@expo-google-fonts/barlow-semi-condensed@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Barlow+Semi+Condensed
- Baskervville: SIL Open Font License 1.1; `@expo-google-fonts/baskervville@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Baskervville
- Be Vietnam Pro: SIL Open Font License 1.1; `@expo-google-fonts/be-vietnam-pro@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Be+Vietnam+Pro
- Bebas Neue: SIL Open Font License 1.1; `@expo-google-fonts/bebas-neue@0.4.1`, weights 400; https://fonts.google.com/specimen/Bebas+Neue
- Biryani: SIL Open Font License 1.1; `@expo-google-fonts/biryani@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Biryani
- Bitter: SIL Open Font License 1.1; `@expo-google-fonts/bitter@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Bitter
- Black Ops One: SIL Open Font License 1.1; `@expo-google-fonts/black-ops-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Black+Ops+One
- Bodoni Moda: SIL Open Font License 1.1; `@expo-google-fonts/bodoni-moda@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Bodoni+Moda
- Bree Serif: SIL Open Font License 1.1; `@expo-google-fonts/bree-serif@0.4.1`, weights 400; https://fonts.google.com/specimen/Bree+Serif
- Bricolage Grotesque: SIL Open Font License 1.1; `@expo-google-fonts/bricolage-grotesque@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Bricolage+Grotesque
- Bungee: SIL Open Font License 1.1; `@expo-google-fonts/bungee@0.4.1`, weights 400; https://fonts.google.com/specimen/Bungee
- Cabin: SIL Open Font License 1.1; `@expo-google-fonts/cabin@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Cabin
- Cairo: SIL Open Font License 1.1; `@expo-google-fonts/cairo@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Cairo
- Cantarell: SIL Open Font License 1.1; `@expo-google-fonts/cantarell@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Cantarell
- Cardo: SIL Open Font License 1.1; `@expo-google-fonts/cardo@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Cardo
- Carlito: SIL Open Font License 1.1; `@expo-google-fonts/carlito@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Carlito
- Catamaran: SIL Open Font License 1.1; `@expo-google-fonts/catamaran@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Catamaran
- Caveat: SIL Open Font License 1.1; `@expo-google-fonts/caveat@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Caveat
- Chakra Petch: SIL Open Font License 1.1; `@expo-google-fonts/chakra-petch@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Chakra+Petch
- Changa: SIL Open Font License 1.1; `@expo-google-fonts/changa@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Changa
- Changa One: SIL Open Font License 1.1; `@expo-google-fonts/changa-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Changa+One
- Chelsea Market: SIL Open Font License 1.1; `@expo-google-fonts/chelsea-market@0.4.1`, weights 400; https://fonts.google.com/specimen/Chelsea+Market
- Chivo: SIL Open Font License 1.1; `@expo-google-fonts/chivo@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Chivo
- Cinzel: SIL Open Font License 1.1; `@expo-google-fonts/cinzel@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Cinzel
- Cinzel Decorative: SIL Open Font License 1.1; `@expo-google-fonts/cinzel-decorative@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Cinzel+Decorative
- Comfortaa: SIL Open Font License 1.1; `@expo-google-fonts/comfortaa@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Comfortaa
- Comic Neue: SIL Open Font License 1.1; `@expo-google-fonts/comic-neue@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Comic+Neue
- Commissioner: SIL Open Font License 1.1; `@expo-google-fonts/commissioner@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Commissioner
- Cormorant: SIL Open Font License 1.1; `@expo-google-fonts/cormorant@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Cormorant
- Cormorant Garamond: SIL Open Font License 1.1; `@expo-google-fonts/cormorant-garamond@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Cormorant+Garamond
- Courgette: SIL Open Font License 1.1; `@expo-google-fonts/courgette@0.4.1`, weights 400; https://fonts.google.com/specimen/Courgette
- Courier Prime: SIL Open Font License 1.1; `@expo-google-fonts/courier-prime@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Courier+Prime
- Creepster: SIL Open Font License 1.1; `@expo-google-fonts/creepster@0.4.0`, weights 400; https://fonts.google.com/specimen/Creepster
- Crete Round: SIL Open Font License 1.1; `@expo-google-fonts/crete-round@0.4.1`, weights 400; https://fonts.google.com/specimen/Crete+Round
- Crimson Pro: SIL Open Font License 1.1; `@expo-google-fonts/crimson-pro@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Crimson+Pro
- Crimson Text: SIL Open Font License 1.1; `@expo-google-fonts/crimson-text@0.4.0`, weights 400, 600, 700; https://fonts.google.com/specimen/Crimson+Text
- Dancing Script: SIL Open Font License 1.1; `@expo-google-fonts/dancing-script@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Dancing+Script
- Delius: SIL Open Font License 1.1; `@expo-google-fonts/delius@0.4.1`, weights 400; https://fonts.google.com/specimen/Delius
- Didact Gothic: SIL Open Font License 1.1; `@expo-google-fonts/didact-gothic@0.4.1`, weights 400; https://fonts.google.com/specimen/Didact+Gothic
- DM Mono: SIL Open Font License 1.1; `@expo-google-fonts/dm-mono@0.4.2`, weights 400; https://fonts.google.com/specimen/DM+Mono
- DM Sans: SIL Open Font License 1.1; `@expo-google-fonts/dm-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/DM+Sans
- DM Serif Display: SIL Open Font License 1.1; `@expo-google-fonts/dm-serif-display@0.4.2`, weights 400; https://fonts.google.com/specimen/DM+Serif+Display
- DM Serif Text: SIL Open Font License 1.1; `@expo-google-fonts/dm-serif-text@0.4.1`, weights 400; https://fonts.google.com/specimen/DM+Serif+Text
- Domine: SIL Open Font License 1.1; `@expo-google-fonts/domine@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Domine
- Dosis: SIL Open Font License 1.1; `@expo-google-fonts/dosis@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Dosis
- EB Garamond: SIL Open Font License 1.1; `@expo-google-fonts/eb-garamond@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/EB+Garamond
- Encode Sans: SIL Open Font License 1.1; `@expo-google-fonts/encode-sans@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Encode+Sans
- Encode Sans Condensed: SIL Open Font License 1.1; `@expo-google-fonts/encode-sans-condensed@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Encode+Sans+Condensed
- Epilogue: SIL Open Font License 1.1; `@expo-google-fonts/epilogue@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Epilogue
- Exo: SIL Open Font License 1.1; `@expo-google-fonts/exo@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Exo
- Exo 2: SIL Open Font License 1.1; `@expo-google-fonts/exo-2@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Exo+2
- Faustina: SIL Open Font License 1.1; `@expo-google-fonts/faustina@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Faustina
- Figtree: SIL Open Font License 1.1; `@expo-google-fonts/figtree@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Figtree
- Fira Code: SIL Open Font License 1.1; `@expo-google-fonts/fira-code@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Fira+Code
- Fira Sans: SIL Open Font License 1.1; `@expo-google-fonts/fira-sans@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Fira+Sans
- Fira Sans Condensed: SIL Open Font License 1.1; `@expo-google-fonts/fira-sans-condensed@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Fira+Sans+Condensed
- Fjalla One: SIL Open Font License 1.1; `@expo-google-fonts/fjalla-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Fjalla+One
- Forum: SIL Open Font License 1.1; `@expo-google-fonts/forum@0.4.1`, weights 400; https://fonts.google.com/specimen/Forum
- Francois One: SIL Open Font License 1.1; `@expo-google-fonts/francois-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Francois+One
- Frank Ruhl Libre: SIL Open Font License 1.1; `@expo-google-fonts/frank-ruhl-libre@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Frank+Ruhl+Libre
- Fraunces: SIL Open Font License 1.1; `@expo-google-fonts/fraunces@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Fraunces
- Fredoka: SIL Open Font License 1.1; `@expo-google-fonts/fredoka@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Fredoka
- Fugaz One: SIL Open Font License 1.1; `@expo-google-fonts/fugaz-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Fugaz+One
- Gabarito: SIL Open Font License 1.1; `@expo-google-fonts/gabarito@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Gabarito
- Geist: SIL Open Font License 1.1; `@expo-google-fonts/geist@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Geist
- Geist Mono: SIL Open Font License 1.1; `@expo-google-fonts/geist-mono@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Geist+Mono
- Geologica: SIL Open Font License 1.1; `@expo-google-fonts/geologica@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Geologica
- Gilda Display: SIL Open Font License 1.1; `@expo-google-fonts/gilda-display@0.4.2`, weights 400; https://fonts.google.com/specimen/Gilda+Display
- Gloria Hallelujah: SIL Open Font License 1.1; `@expo-google-fonts/gloria-hallelujah@0.4.1`, weights 400; https://fonts.google.com/specimen/Gloria+Hallelujah
- Golos Text: SIL Open Font License 1.1; `@expo-google-fonts/golos-text@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Golos+Text
- Google Sans Code: SIL Open Font License 1.1; `@expo-google-fonts/google-sans-code@0.4.4`, weights 400, 600, 700; https://fonts.google.com/specimen/Google+Sans+Code
- Google Sans Flex: SIL Open Font License 1.1; `@expo-google-fonts/google-sans-flex@0.4.7`, weights 400, 600, 700; https://fonts.google.com/specimen/Google+Sans+Flex
- Gravitas One: SIL Open Font License 1.1; `@expo-google-fonts/gravitas-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Gravitas+One
- Great Vibes: SIL Open Font License 1.1; `@expo-google-fonts/great-vibes@0.4.1`, weights 400; https://fonts.google.com/specimen/Great+Vibes
- Gruppo: SIL Open Font License 1.1; `@expo-google-fonts/gruppo@0.4.2`, weights 400; https://fonts.google.com/specimen/Gruppo
- Hammersmith One: SIL Open Font License 1.1; `@expo-google-fonts/hammersmith-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Hammersmith+One
- Hanken Grotesk: SIL Open Font License 1.1; `@expo-google-fonts/hanken-grotesk@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Hanken+Grotesk
- Heebo: SIL Open Font License 1.1; `@expo-google-fonts/heebo@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Heebo
- Hind: SIL Open Font License 1.1; `@expo-google-fonts/hind@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Hind
- Hind Madurai: SIL Open Font License 1.1; `@expo-google-fonts/hind-madurai@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Hind+Madurai
- Hind Siliguri: SIL Open Font License 1.1; `@expo-google-fonts/hind-siliguri@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Hind+Siliguri
- Homemade Apple: Apache License 2.0; `@expo-google-fonts/homemade-apple@0.4.1`, weights 400; https://fonts.google.com/specimen/Homemade+Apple
- IBM Plex Mono: SIL Open Font License 1.1; `@expo-google-fonts/ibm-plex-mono@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/IBM+Plex+Mono
- IBM Plex Sans: SIL Open Font License 1.1; `@expo-google-fonts/ibm-plex-sans@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/IBM+Plex+Sans
- IBM Plex Sans Arabic: SIL Open Font License 1.1; `@expo-google-fonts/ibm-plex-sans-arabic@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic
- IBM Plex Sans Condensed: SIL Open Font License 1.1; `@expo-google-fonts/ibm-plex-sans-condensed@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/IBM+Plex+Sans+Condensed
- IBM Plex Sans Thai: SIL Open Font License 1.1; `@expo-google-fonts/ibm-plex-sans-thai@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/IBM+Plex+Sans+Thai
- IBM Plex Serif: SIL Open Font License 1.1; `@expo-google-fonts/ibm-plex-serif@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/IBM+Plex+Serif
- Inconsolata: SIL Open Font License 1.1; `@expo-google-fonts/inconsolata@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Inconsolata
- Indie Flower: SIL Open Font License 1.1; `@expo-google-fonts/indie-flower@0.4.1`, weights 400; https://fonts.google.com/specimen/Indie+Flower
- Instrument Sans: SIL Open Font License 1.1; `@expo-google-fonts/instrument-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Instrument+Sans
- Instrument Serif: SIL Open Font License 1.1; `@expo-google-fonts/instrument-serif@0.4.1`, weights 400; https://fonts.google.com/specimen/Instrument+Serif
- Inter: SIL Open Font License 1.1; `@expo-google-fonts/inter@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Inter
- Inter Tight: SIL Open Font License 1.1; `@expo-google-fonts/inter-tight@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Inter+Tight
- JetBrains Mono: SIL Open Font License 1.1; `@expo-google-fonts/jetbrains-mono@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/JetBrains+Mono
- Josefin Sans: SIL Open Font License 1.1; `@expo-google-fonts/josefin-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Josefin+Sans
- Josefin Slab: SIL Open Font License 1.1; `@expo-google-fonts/josefin-slab@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Josefin+Slab
- Jost: SIL Open Font License 1.1; `@expo-google-fonts/jost@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Jost
- Kalam: SIL Open Font License 1.1; `@expo-google-fonts/kalam@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Kalam
- Kanit: SIL Open Font License 1.1; `@expo-google-fonts/kanit@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Kanit
- Karla: SIL Open Font License 1.1; `@expo-google-fonts/karla@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Karla
- Kaushan Script: SIL Open Font License 1.1; `@expo-google-fonts/kaushan-script@0.4.1`, weights 400; https://fonts.google.com/specimen/Kaushan+Script
- Khand: SIL Open Font License 1.1; `@expo-google-fonts/khand@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Khand
- Kumbh Sans: SIL Open Font License 1.1; `@expo-google-fonts/kumbh-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Kumbh+Sans
- Lato: SIL Open Font License 1.1; `@expo-google-fonts/lato@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Lato
- League Gothic: SIL Open Font License 1.1; `@expo-google-fonts/league-gothic@0.4.2`, weights 400; https://fonts.google.com/specimen/League+Gothic
- League Spartan: SIL Open Font License 1.1; `@expo-google-fonts/league-spartan@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/League+Spartan
- Lexend: SIL Open Font License 1.1; `@expo-google-fonts/lexend@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Lexend
- Lexend Deca: SIL Open Font License 1.1; `@expo-google-fonts/lexend-deca@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Lexend+Deca
- Lexend Giga: SIL Open Font License 1.1; `@expo-google-fonts/lexend-giga@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Lexend+Giga
- Libre Barcode 39: SIL Open Font License 1.1; `@expo-google-fonts/libre-barcode-39@0.4.3`, weights 400; https://fonts.google.com/specimen/Libre+Barcode+39
- Libre Baskerville: SIL Open Font License 1.1; `@expo-google-fonts/libre-baskerville@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Libre+Baskerville
- Libre Caslon Text: SIL Open Font License 1.1; `@expo-google-fonts/libre-caslon-text@0.4.0`, weights 400, 700; https://fonts.google.com/specimen/Libre+Caslon+Text
- Libre Franklin: SIL Open Font License 1.1; `@expo-google-fonts/libre-franklin@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Libre+Franklin
- Lilita One: SIL Open Font License 1.1; `@expo-google-fonts/lilita-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Lilita+One
- Literata: SIL Open Font License 1.1; `@expo-google-fonts/literata@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Literata
- Lobster: SIL Open Font License 1.1; `@expo-google-fonts/lobster@0.4.1`, weights 400; https://fonts.google.com/specimen/Lobster
- Lobster Two: SIL Open Font License 1.1; `@expo-google-fonts/lobster-two@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Lobster+Two
- Londrina Solid: SIL Open Font License 1.1; `@expo-google-fonts/londrina-solid@0.4.1`, weights 400; https://fonts.google.com/specimen/Londrina+Solid
- Lora: SIL Open Font License 1.1; `@expo-google-fonts/lora@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Lora
- Luckiest Guy: Apache License 2.0; `@expo-google-fonts/luckiest-guy@0.4.1`, weights 400; https://fonts.google.com/specimen/Luckiest+Guy
- M PLUS 1p: SIL Open Font License 1.1; `@expo-google-fonts/m-plus-1p@0.4.2`, weights 400, 700; https://fonts.google.com/specimen/M+PLUS+1p
- Manrope: SIL Open Font License 1.1; `@expo-google-fonts/manrope@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Manrope
- Marcellus: SIL Open Font License 1.1; `@expo-google-fonts/marcellus@0.4.1`, weights 400; https://fonts.google.com/specimen/Marcellus
- Martel: SIL Open Font License 1.1; `@expo-google-fonts/martel@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Martel
- Maven Pro: SIL Open Font License 1.1; `@expo-google-fonts/maven-pro@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Maven+Pro
- Merriweather: SIL Open Font License 1.1; `@expo-google-fonts/merriweather@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Merriweather
- Merriweather Sans: SIL Open Font License 1.1; `@expo-google-fonts/merriweather-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Merriweather+Sans
- Montserrat: SIL Open Font License 1.1; `@expo-google-fonts/montserrat@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Montserrat
- Montserrat Alternates: SIL Open Font License 1.1; `@expo-google-fonts/montserrat-alternates@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Montserrat+Alternates
- Mukta: SIL Open Font License 1.1; `@expo-google-fonts/mukta@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Mukta
- Mulish: SIL Open Font License 1.1; `@expo-google-fonts/mulish@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Mulish
- Nanum Gothic: SIL Open Font License 1.1; `@expo-google-fonts/nanum-gothic@0.4.0`, weights 400, 700; https://fonts.google.com/specimen/Nanum+Gothic
- Nanum Gothic Coding: SIL Open Font License 1.1; `@expo-google-fonts/nanum-gothic-coding@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Nanum+Gothic+Coding
- Neuton: SIL Open Font License 1.1; `@expo-google-fonts/neuton@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Neuton
- News Cycle: SIL Open Font License 1.1; `@expo-google-fonts/news-cycle@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/News+Cycle
- Newsreader: SIL Open Font License 1.1; `@expo-google-fonts/newsreader@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Newsreader
- Noticia Text: SIL Open Font License 1.1; `@expo-google-fonts/noticia-text@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Noticia+Text
- Noto Kufi Arabic: SIL Open Font License 1.1; `@expo-google-fonts/noto-kufi-arabic@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Kufi+Arabic
- Noto Naskh Arabic: SIL Open Font License 1.1; `@expo-google-fonts/noto-naskh-arabic@0.4.5`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Naskh+Arabic
- Noto Nastaliq Urdu: SIL Open Font License 1.1; `@expo-google-fonts/noto-nastaliq-urdu@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Nastaliq+Urdu
- Noto Sans: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans
- Noto Sans Arabic: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-arabic@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Arabic
- Noto Sans Bengali: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-bengali@0.4.4`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Bengali
- Noto Sans Devanagari: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-devanagari@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Devanagari
- Noto Sans Display: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-display@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Display
- Noto Sans Hebrew: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-hebrew@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Hebrew
- Noto Sans Khmer: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-khmer@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Khmer
- Noto Sans Mono: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-mono@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Mono
- Noto Sans Tamil: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-tamil@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Tamil
- Noto Sans Telugu: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-telugu@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Telugu
- Noto Sans Thai: SIL Open Font License 1.1; `@expo-google-fonts/noto-sans-thai@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Sans+Thai
- Noto Serif: SIL Open Font License 1.1; `@expo-google-fonts/noto-serif@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Noto+Serif
- Nunito: SIL Open Font License 1.1; `@expo-google-fonts/nunito@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Nunito
- Nunito Sans: SIL Open Font License 1.1; `@expo-google-fonts/nunito-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Nunito+Sans
- Old Standard TT: SIL Open Font License 1.1; `@expo-google-fonts/old-standard-tt@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Old+Standard+TT
- Oleo Script: SIL Open Font License 1.1; `@expo-google-fonts/oleo-script@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Oleo+Script
- Onest: SIL Open Font License 1.1; `@expo-google-fonts/onest@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Onest
- Open Sans: SIL Open Font License 1.1; `@expo-google-fonts/open-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Open+Sans
- Orbitron: SIL Open Font License 1.1; `@expo-google-fonts/orbitron@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Orbitron
- Oswald: SIL Open Font License 1.1; `@expo-google-fonts/oswald@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Oswald
- Outfit: SIL Open Font License 1.1; `@expo-google-fonts/outfit@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Outfit
- Overpass: SIL Open Font License 1.1; `@expo-google-fonts/overpass@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Overpass
- Oxanium: SIL Open Font License 1.1; `@expo-google-fonts/oxanium@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Oxanium
- Oxygen: SIL Open Font License 1.1; `@expo-google-fonts/oxygen@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Oxygen
- Pacifico: SIL Open Font License 1.1; `@expo-google-fonts/pacifico@0.4.1`, weights 400; https://fonts.google.com/specimen/Pacifico
- Parisienne: SIL Open Font License 1.1; `@expo-google-fonts/parisienne@0.4.1`, weights 400; https://fonts.google.com/specimen/Parisienne
- Passion One: SIL Open Font License 1.1; `@expo-google-fonts/passion-one@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Passion+One
- Patrick Hand: SIL Open Font License 1.1; `@expo-google-fonts/patrick-hand@0.4.1`, weights 400; https://fonts.google.com/specimen/Patrick+Hand
- Patua One: SIL Open Font License 1.1; `@expo-google-fonts/patua-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Patua+One
- Paytone One: SIL Open Font License 1.1; `@expo-google-fonts/paytone-one@0.4.2`, weights 400; https://fonts.google.com/specimen/Paytone+One
- Permanent Marker: Apache License 2.0; `@expo-google-fonts/permanent-marker@0.4.0`, weights 400; https://fonts.google.com/specimen/Permanent+Marker
- Philosopher: SIL Open Font License 1.1; `@expo-google-fonts/philosopher@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Philosopher
- Pinyon Script: SIL Open Font License 1.1; `@expo-google-fonts/pinyon-script@0.4.1`, weights 400; https://fonts.google.com/specimen/Pinyon+Script
- Play: SIL Open Font License 1.1; `@expo-google-fonts/play@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Play
- Playball: SIL Open Font License 1.1; `@expo-google-fonts/playball@0.4.2`, weights 400; https://fonts.google.com/specimen/Playball
- Playfair: SIL Open Font License 1.1; `@expo-google-fonts/playfair@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Playfair
- Playfair Display: SIL Open Font License 1.1; `@expo-google-fonts/playfair-display@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Playfair+Display
- Playfair Display SC: SIL Open Font License 1.1; `@expo-google-fonts/playfair-display-sc@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Playfair+Display+SC
- Plus Jakarta Sans: SIL Open Font License 1.1; `@expo-google-fonts/plus-jakarta-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Plus+Jakarta+Sans
- Poppins: SIL Open Font License 1.1; `@expo-google-fonts/poppins@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Poppins
- Prata: SIL Open Font License 1.1; `@expo-google-fonts/prata@0.4.1`, weights 400; https://fonts.google.com/specimen/Prata
- Press Start 2P: SIL Open Font License 1.1; `@expo-google-fonts/press-start-2p@0.4.1`, weights 400; https://fonts.google.com/specimen/Press+Start+2P
- Prompt: SIL Open Font License 1.1; `@expo-google-fonts/prompt@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Prompt
- PT Mono: SIL Open Font License 1.1; `@expo-google-fonts/pt-mono@0.4.1`, weights 400; https://fonts.google.com/specimen/PT+Mono
- PT Sans: SIL Open Font License 1.1; `@expo-google-fonts/pt-sans@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/PT+Sans
- PT Sans Caption: SIL Open Font License 1.1; `@expo-google-fonts/pt-sans-caption@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/PT+Sans+Caption
- PT Sans Narrow: SIL Open Font License 1.1; `@expo-google-fonts/pt-sans-narrow@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/PT+Sans+Narrow
- PT Serif: SIL Open Font License 1.1; `@expo-google-fonts/pt-serif@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/PT+Serif
- Public Sans: SIL Open Font License 1.1; `@expo-google-fonts/public-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Public+Sans
- Quantico: SIL Open Font License 1.1; `@expo-google-fonts/quantico@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Quantico
- Quattrocento: SIL Open Font License 1.1; `@expo-google-fonts/quattrocento@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Quattrocento
- Quattrocento Sans: SIL Open Font License 1.1; `@expo-google-fonts/quattrocento-sans@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Quattrocento+Sans
- Questrial: SIL Open Font License 1.1; `@expo-google-fonts/questrial@0.4.1`, weights 400; https://fonts.google.com/specimen/Questrial
- Quicksand: SIL Open Font License 1.1; `@expo-google-fonts/quicksand@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Quicksand
- Radio Canada: SIL Open Font License 1.1; `@expo-google-fonts/radio-canada@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Radio+Canada
- Rajdhani: SIL Open Font License 1.1; `@expo-google-fonts/rajdhani@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Rajdhani
- Raleway: SIL Open Font License 1.1; `@expo-google-fonts/raleway@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Raleway
- Ramabhadra: SIL Open Font License 1.1; `@expo-google-fonts/ramabhadra@0.4.1`, weights 400; https://fonts.google.com/specimen/Ramabhadra
- Rammetto One: SIL Open Font License 1.1; `@expo-google-fonts/rammetto-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Rammetto+One
- Readex Pro: SIL Open Font License 1.1; `@expo-google-fonts/readex-pro@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Readex+Pro
- Red Hat Display: SIL Open Font License 1.1; `@expo-google-fonts/red-hat-display@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Red+Hat+Display
- Red Hat Text: SIL Open Font License 1.1; `@expo-google-fonts/red-hat-text@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Red+Hat+Text
- Rethink Sans: SIL Open Font License 1.1; `@expo-google-fonts/rethink-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Rethink+Sans
- Righteous: SIL Open Font License 1.1; `@expo-google-fonts/righteous@0.4.1`, weights 400; https://fonts.google.com/specimen/Righteous
- Roboto: SIL Open Font License 1.1; `@expo-google-fonts/roboto@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Roboto
- Roboto Flex: SIL Open Font License 1.1; `@expo-google-fonts/roboto-flex@0.4.2`, weights 400; https://fonts.google.com/specimen/Roboto+Flex
- Roboto Mono: SIL Open Font License 1.1; `@expo-google-fonts/roboto-mono@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Roboto+Mono
- Roboto Serif: SIL Open Font License 1.1; `@expo-google-fonts/roboto-serif@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Roboto+Serif
- Roboto Slab: Apache License 2.0; `@expo-google-fonts/roboto-slab@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Roboto+Slab
- Rokkitt: SIL Open Font License 1.1; `@expo-google-fonts/rokkitt@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Rokkitt
- Rowdies: SIL Open Font License 1.1; `@expo-google-fonts/rowdies@0.4.2`, weights 400, 700; https://fonts.google.com/specimen/Rowdies
- Rubik: SIL Open Font License 1.1; `@expo-google-fonts/rubik@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Rubik
- Rubik Mono One: SIL Open Font License 1.1; `@expo-google-fonts/rubik-mono-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Rubik+Mono+One
- Russo One: SIL Open Font License 1.1; `@expo-google-fonts/russo-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Russo+One
- Sacramento: SIL Open Font License 1.1; `@expo-google-fonts/sacramento@0.4.1`, weights 400; https://fonts.google.com/specimen/Sacramento
- Saira: SIL Open Font License 1.1; `@expo-google-fonts/saira@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Saira
- Saira Condensed: SIL Open Font License 1.1; `@expo-google-fonts/saira-condensed@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Saira+Condensed
- Saira Extra Condensed: SIL Open Font License 1.1; `@expo-google-fonts/saira-extra-condensed@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Saira+Extra+Condensed
- Sanchez: SIL Open Font License 1.1; `@expo-google-fonts/sanchez@0.4.1`, weights 400; https://fonts.google.com/specimen/Sanchez
- Sarabun: SIL Open Font License 1.1; `@expo-google-fonts/sarabun@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Sarabun
- Satisfy: Apache License 2.0; `@expo-google-fonts/satisfy@0.4.1`, weights 400; https://fonts.google.com/specimen/Satisfy
- Sawarabi Gothic: SIL Open Font License 1.1; `@expo-google-fonts/sawarabi-gothic@0.4.3`, weights 400; https://fonts.google.com/specimen/Sawarabi+Gothic
- Schibsted Grotesk: SIL Open Font License 1.1; `@expo-google-fonts/schibsted-grotesk@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Schibsted+Grotesk
- Sen: SIL Open Font License 1.1; `@expo-google-fonts/sen@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Sen
- Shadows Into Light: SIL Open Font License 1.1; `@expo-google-fonts/shadows-into-light@0.4.1`, weights 400; https://fonts.google.com/specimen/Shadows+Into+Light
- Shantell Sans: SIL Open Font License 1.1; `@expo-google-fonts/shantell-sans@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Shantell+Sans
- Share Tech: SIL Open Font License 1.1; `@expo-google-fonts/share-tech@0.4.1`, weights 400; https://fonts.google.com/specimen/Share+Tech
- Share Tech Mono: SIL Open Font License 1.1; `@expo-google-fonts/share-tech-mono@0.4.1`, weights 400; https://fonts.google.com/specimen/Share+Tech+Mono
- Signika: SIL Open Font License 1.1; `@expo-google-fonts/signika@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Signika
- Slabo 27px: SIL Open Font License 1.1; `@expo-google-fonts/slabo-27px@0.4.1`, weights 400; https://fonts.google.com/specimen/Slabo+27px
- Smooch Sans: SIL Open Font License 1.1; `@expo-google-fonts/smooch-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Smooch+Sans
- Sofia Sans: SIL Open Font License 1.1; `@expo-google-fonts/sofia-sans@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Sofia+Sans
- Sora: SIL Open Font License 1.1; `@expo-google-fonts/sora@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Sora
- Source Code Pro: SIL Open Font License 1.1; `@expo-google-fonts/source-code-pro@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Source+Code+Pro
- Source Sans 3: SIL Open Font License 1.1; `@expo-google-fonts/source-sans-3@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Source+Sans+3
- Source Serif 4: SIL Open Font License 1.1; `@expo-google-fonts/source-serif-4@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Source+Serif+4
- Space Grotesk: SIL Open Font License 1.1; `@expo-google-fonts/space-grotesk@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Space+Grotesk
- Space Mono: SIL Open Font License 1.1; `@expo-google-fonts/space-mono@0.4.2`, weights 400, 700; https://fonts.google.com/specimen/Space+Mono
- Special Elite: Apache License 2.0; `@expo-google-fonts/special-elite@0.4.1`, weights 400; https://fonts.google.com/specimen/Special+Elite
- Spectral: SIL Open Font License 1.1; `@expo-google-fonts/spectral@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Spectral
- STIX Two Text: SIL Open Font License 1.1; `@expo-google-fonts/stix-two-text@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/STIX+Two+Text
- Syne: SIL Open Font License 1.1; `@expo-google-fonts/syne@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Syne
- Tajawal: SIL Open Font License 1.1; `@expo-google-fonts/tajawal@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Tajawal
- Tangerine: SIL Open Font License 1.1; `@expo-google-fonts/tangerine@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Tangerine
- Teko: SIL Open Font License 1.1; `@expo-google-fonts/teko@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Teko
- Tenor Sans: SIL Open Font License 1.1; `@expo-google-fonts/tenor-sans@0.4.1`, weights 400; https://fonts.google.com/specimen/Tenor+Sans
- Tinos: SIL Open Font License 1.1; `@expo-google-fonts/tinos@0.4.2`, weights 400, 700; https://fonts.google.com/specimen/Tinos
- Titan One: SIL Open Font License 1.1; `@expo-google-fonts/titan-one@0.4.1`, weights 400; https://fonts.google.com/specimen/Titan+One
- Titillium Web: SIL Open Font License 1.1; `@expo-google-fonts/titillium-web@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Titillium+Web
- Unbounded: SIL Open Font License 1.1; `@expo-google-fonts/unbounded@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Unbounded
- Unna: SIL Open Font License 1.1; `@expo-google-fonts/unna@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Unna
- Urbanist: SIL Open Font License 1.1; `@expo-google-fonts/urbanist@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Urbanist
- Varela Round: SIL Open Font License 1.1; `@expo-google-fonts/varela-round@0.4.1`, weights 400; https://fonts.google.com/specimen/Varela+Round
- Vazirmatn: SIL Open Font License 1.1; `@expo-google-fonts/vazirmatn@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Vazirmatn
- Viga: SIL Open Font License 1.1; `@expo-google-fonts/viga@0.4.1`, weights 400; https://fonts.google.com/specimen/Viga
- Vollkorn: SIL Open Font License 1.1; `@expo-google-fonts/vollkorn@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Vollkorn
- VT323: SIL Open Font License 1.1; `@expo-google-fonts/vt323@0.4.1`, weights 400; https://fonts.google.com/specimen/VT323
- Work Sans: SIL Open Font License 1.1; `@expo-google-fonts/work-sans@0.4.2`, weights 400, 600, 700; https://fonts.google.com/specimen/Work+Sans
- Yanone Kaffeesatz: SIL Open Font License 1.1; `@expo-google-fonts/yanone-kaffeesatz@0.4.3`, weights 400, 600, 700; https://fonts.google.com/specimen/Yanone+Kaffeesatz
- Yantramanav: SIL Open Font License 1.1; `@expo-google-fonts/yantramanav@0.4.1`, weights 400, 700; https://fonts.google.com/specimen/Yantramanav
- Yellowtail: Apache License 2.0; `@expo-google-fonts/yellowtail@0.4.1`, weights 400; https://fonts.google.com/specimen/Yellowtail
- Zeyada: SIL Open Font License 1.1; `@expo-google-fonts/zeyada@0.4.1`, weights 400; https://fonts.google.com/specimen/Zeyada
- Zilla Slab: SIL Open Font License 1.1; `@expo-google-fonts/zilla-slab@0.4.1`, weights 400, 600, 700; https://fonts.google.com/specimen/Zilla+Slab
<!-- cover-fonts:end -->
