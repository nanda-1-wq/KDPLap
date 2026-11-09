/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the print engine's files (E13.1)
   /js/format/files.js   (used by js/format/typst-run.js, the engine worker
                          and the main thread; checked by
                          tools/check-format-cdn.mjs and
                          tests/browser/format/t-engine-real.mjs)

   Every file is an npm package file at a pinned version, with its sha384
   (SRI). The same bytes are on jsdelivr, on unpkg and in the npm tarball
   (checked Nov 4, 2026). We try jsdelivr, once more after 1 s, then unpkg.
   A file that fails its hash is never used.
   Fonts: the static TTFs of @expo-google-fonts (OFL 1.1; see
   THIRD-PARTY-NOTICES.md). Only the chosen style's fonts are loaded.

   kdpFormatFiles.CDNS             → base URLs, in the order tried
   kdpFormatFiles.ENGINE           → { js, wasm }
   kdpFormatFiles.FONTS            → family key → [{ face, ...file }]
   kdpFormatFiles.STYLE_FAMILIES   → style → family keys (body first)
   kdpFormatFiles.PDFJS            → { js, worker } (the preview and the checks)
   kdpFormatFiles.WIRE             → bytes on the wire: engine, and each style's fonts (the progress line)
   kdpFormatFiles.urls(file)       → the URLs to try, in order
   kdpFormatFiles.styleFonts(style) → the font files of a style
   kdpFormatFiles.ENGINE_ID        → book_exports.engine ("typst 0.14.2 · t1")
═══════════════════════════════════════════════════ */

(function (root) {
  const CDNS = ['https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/'];
  const f = (pkg, path, bytes, sri) => ({ pkg, path, bytes, sri });

  const ENGINE = {
    js: f('@myriaddreamin/typst.ts@0.7.0', 'dist/esm/main.bundle.js', 153398,
      'sha384-ti3p6Aop/bL76GOJxe8C3WL2Imx9nlAeSVcGjghEO++WVj/4Yzg38goFRlWWIick'),
    wasm: f('@myriaddreamin/typst-ts-web-compiler@0.7.0', 'pkg/typst_ts_web_compiler_bg.wasm', 28325178,
      'sha384-YB32Rpk4pOvEGytOZweRBgdbuwNueLVpzJUQojjit/A8AveMWxDW8eT9ROz98jDo')
  };

  const face = (pkg, base, name, bytes, sri) => ({ face: name, ...f(`@expo-google-fonts/${pkg}`, `${name}/${base}_${name}.ttf`, bytes, sri) });

  const FONTS = {
    'eb-garamond': [
      face('eb-garamond@0.4.3', 'EBGaramond', '400Regular', 489640, 'sha384-5SsOQIglZY3bIvSHZiSkvkyA4JG57vKUQVpSod34dlFpdYsTLV2+QYfSLLI9TaJI'),
      face('eb-garamond@0.4.3', 'EBGaramond', '400Regular_Italic', 440240, 'sha384-cnhxA7bWegDydd2Tpc2CFdS7emnunJToicyxMfGjX6Lb6mmV9pBH6HjwcXOuJNuq'),
      face('eb-garamond@0.4.3', 'EBGaramond', '700Bold', 492280, 'sha384-fjtvB1gogc0hIDTovpWfD4nXqqHsjCuQJ7Hjj6ZLgV727fNXqnTBhQeNLmvAKIEN'),
      face('eb-garamond@0.4.3', 'EBGaramond', '700Bold_Italic', 443560, 'sha384-J9ar8Vg+3PMcb0wKx4+Lo9kyZJyr4kdTdOPHnuR83tDZP01DmY6KWZmpjVDGsODu')
    ],
    'source-serif-4': [
      face('source-serif-4@0.4.2', 'SourceSerif4', '400Regular', 329948, 'sha384-Jlt+K7yeFCc67xw3+C+XDZSmk/5NVYJzzuqiHf9FEn7EYjxW4k7CtsAY3nLz/znC'),
      face('source-serif-4@0.4.2', 'SourceSerif4', '400Regular_Italic', 208212, 'sha384-Y6peJRFDO0JNUXW9tDh0KdoPI0bCyQcAdDGWASLNjeyESYn0fIOf9Z6W0yv4t1t1'),
      face('source-serif-4@0.4.2', 'SourceSerif4', '700Bold', 330208, 'sha384-9p3FI88EsdgXkS/uWM6PZC6fR6VDQSoJbqlUcmsc7YcFUXIA7Tinsc9j1aNvj+6p'),
      face('source-serif-4@0.4.2', 'SourceSerif4', '700Bold_Italic', 208300, 'sha384-GAZZ4PPQdHyCqej4dJn6MHk8u7cfiatViSSRmye4zudmAZvlsYgcb0v7YE9gxpvj')
    ],
    'source-sans-3': [
      face('source-sans-3@0.4.2', 'SourceSans3', '400Regular', 381020, 'sha384-ldJskhwmcg0XK7knfekgYZggwSG37FlV8K1DqRwPrVMP2ptAVdvFWWZ/NNYCyOND'),
      face('source-sans-3@0.4.2', 'SourceSans3', '700Bold', 380864, 'sha384-LAKGkPxGHxAvcd3HYc5xBJEDNx1QzcGa6TO1IULGT5dvQUXUzIr1MSVwT8qne/fA')
    ],
    literata: [
      face('literata@0.4.3', 'Literata', '400Regular', 255252, 'sha384-XgKRDqQouSvX2Gk7VPHv+x5gLJvguF2IAfwYvVSI04PDsUww3tQ8wYZtXXv6S295'),
      face('literata@0.4.3', 'Literata', '400Regular_Italic', 248156, 'sha384-lkESwcpsPlawnWwbMkorqtnLWMwBySPE20lps8PJnY1HD/S/tmYLrRiTTVoRNT9o'),
      face('literata@0.4.3', 'Literata', '700Bold', 260884, 'sha384-5hFh+TXB0CjKlQwb6TAcrhPcAju1vHepTw4SI8IyFlnM1qeYsiiwv3xflrFA3EQH'),
      face('literata@0.4.3', 'Literata', '700Bold_Italic', 253840, 'sha384-fHymyAll5htcoqrNesfq0xaVplsdnTsSFm0XbdE4etzh5MXKS2KKckI7fbnu8Dra')
    ],
    lora: [
      face('lora@0.4.2', 'Lora', '400Regular', 133888, 'sha384-zxI51+pMERzyfpMDX67MpYPV6SC00LyDlBhjJjb4KbeN9MODOP9WRV5j++e7kBsf'),
      face('lora@0.4.2', 'Lora', '400Regular_Italic', 139328, 'sha384-4prDJdrcBMttGjIdt1bdAOQFlIN8pBjX1L2DDJquYWgyoMi4iFVQktTCv6VdDXrf'),
      face('lora@0.4.2', 'Lora', '700Bold', 133828, 'sha384-DO2l+1eE/H0Nn9G9mqmT7vicT+l/gRde5X15S51aKBC/FtaEOPE5h8FSFlBkgcNI'),
      face('lora@0.4.2', 'Lora', '700Bold_Italic', 140332, 'sha384-APXF66nHQ+sZbjelRDPaMFynwctZps8JE7N/jVkxepx9jNwsOA24lhh7dZRzlgg5')
    ]
  };

  // Body family first. Modern: Source Serif 4 text, Source Sans 3 headings and header.
  const STYLE_FAMILIES = {
    classic: ['eb-garamond'],
    modern: ['source-serif-4', 'source-sans-3'],
    clean: ['literata'],
    warm: ['lora']
  };

  const PDFJS = {
    js: f('pdfjs-dist@6.4.299', 'build/pdf.min.mjs', 458904,
      'sha384-QCvhu/UPp22U/TNLVbQNONL82ES2yY717GAiqP9VVu37Y7+m9VPKvadGx9XlFvcp'),
    worker: f('pdfjs-dist@6.4.299', 'build/pdf.worker.min.mjs', 1264342,
      'sha384-NfW/OTMWezITv4oaALvfH7MFLwzPxEvpySmDpoALa1mtTY8MC200l0ZNFD+SOlrM')
  };

  const urls = (file) => CDNS.map((c) => `${c}${file.pkg}/${file.path}`);
  const styleFonts = (style) => (STYLE_FAMILIES[style] || STYLE_FAMILIES.classic).flatMap((k) => FONTS[k]);
  const all = () => [ENGINE.js, ENGINE.wasm, ...Object.values(FONTS).flat(), PDFJS.js, PDFJS.worker];

  // Bytes on the wire (jsdelivr, compressed), measured in Part 2 (Nov 4). The
  // download counts decoded bytes; 08 shows the share of these as MB.
  const WIRE = { engine: 24346 + 9117552, classic: 708145, modern: 326883 + 228045, clean: 372278, warm: 223917 };

  root.kdpFormatFiles = {
    CDNS, ENGINE, FONTS, STYLE_FAMILIES, PDFJS, WIRE, urls, styleFonts, all,
    TYPST_VERSION: '0.14.2', TEMPLATE: 't1', ENGINE_ID: 'typst 0.14.2 · t1'
  };
})(globalThis);
