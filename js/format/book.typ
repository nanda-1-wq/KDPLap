// NicheInk · 08 Format · the print interior (E13.1, template t1).
// /js/format/book.typ, imported by the main.typ that js/format/md2typst.js
// writes. Typst 0.14.2 (typst.ts 0.7.0). From the E13.0 proof template.
//
// Page: the Brief's trim (group A: 5 x 8, 5.25 x 8, 5.5 x 8.5, 6 x 9 in).
// Margins are fixed and mirrored: 0.75 in inside, 0.5 in outside, 0.75 in
// top and bottom. KDP's minimum is 0.375 in inside for 24 to 150 pages and
// 0.25 in outside; 0.75 in inside is enough up to 700 pages.
//
// Order: title page (right-hand), copyright (left-hand), contents (right-hand),
// the body (page 1 is a right-hand page), About the author, Also by.
// Front matter, chapter first pages and blank pages have no header and no
// page number. With "recto start" on, every chapter starts on a right-hand
// page. Running header: the header title (or the book title) on left-hand
// pages, the chapter title on right-hand pages, cut with "…" to fit.
// The page count is made even with one blank page at the end.
// No date in the PDF (`date: none`): the same inputs give the same bytes.
//
// Markers (metadata with a label) let the header, the contents and the
// checks read the layout back:
//   <part-start>  first page of each chapter (value: title, toc, page)
//   <part-end>    end of the front matter and of each chapter (value: page)
//   <content-end> the last page before the even-count padding
//   <last-page>   the final page (the engine's page count)
//   <headings>    every heading: level, page, top position
//   <typst-version> the Typst version that compiled the book

#import "/droplet.typ": dropcap

// The four styles. Sizes and leading are set so the words per page stay
// within 10% of each other (measured in tests/browser/format/t-engine-real.mjs).
// Modern is the E13.0 proof's body (Source Serif 4, 11 pt, 0.62 em).
#let STYLES = (
  classic: (body: "EB Garamond", head: "EB Garamond", size: 12pt, leading: 0.63em, head-weight: "bold"),
  modern: (body: "Source Serif 4", head: "Source Sans 3", size: 11pt, leading: 0.62em, head-weight: "bold"),
  clean: (body: "Literata", head: "Literata", size: 10.5pt, leading: 0.70em, head-weight: "bold"),
  warm: (body: "Lora", head: "Lora", size: 10.5pt, leading: 0.73em, head-weight: "bold"),
)

#let MARGIN = (inside: 0.75in, outside: 0.5in, top: 0.75in, bottom: 0.75in)

// Set once by book(); read by the header, the chapter openings and the drop cap.
#let geo = state("nicheink-geo", (width: 6in, height: 9in, style: STYLES.modern, running: true, header-title: ""))

// Page p (physical) is blank when a part ended before it and the next part starts after it.
#let is-blank(p) = {
  let starts = query(<part-start>).map(m => m.location().page())
  let ends = query(<part-end>).map(m => m.location().page())
  ends.any(e => e < p and starts.filter(s => s > e).all(s => s > p))
}

#let is-front(p) = {
  let front = query(<part-end>)
  front.len() == 0 or p <= front.first().location().page()
}

#let is-part-start(p) = query(<part-start>).any(m => m.location().page() == p)

#let quiet(p) = is-front(p) or is-blank(p) or is-part-start(p)

// The longest start of s (by grapheme) that fits in w, with "…". Needs context.
#let fit(s, w) = {
  if measure(s).width <= w { return s }
  let cs = s.clusters()
  let lo = 0
  let hi = cs.len()
  while lo < hi {
    let mid = calc.quo(lo + hi + 1, 2)
    if measure(cs.slice(0, mid).join().trim(at: end) + "…").width <= w { lo = mid } else { hi = mid - 1 }
  }
  if lo == 0 { "…" } else { cs.slice(0, lo).join().trim(at: end) + "…" }
}

#let header() = context {
  let g = geo.get()
  if not g.running { return none }
  let p = here().page()
  if quiet(p) { return none }
  set text(font: g.style.head, size: 8pt, tracking: 0.08em, hyphenate: false)
  let w = g.width - MARGIN.inside - MARGIN.outside
  if calc.even(p) {
    align(left, fit(upper(g.header-title), w))
  } else {
    let starts = query(<part-start>).filter(m => m.location().page() <= p)
    if starts.len() > 0 { align(right, fit(upper(starts.last().value.title), w)) }
  }
}

#let footer() = context {
  let p = here().page()
  if quiet(p) { return none }
  set text(size: 9pt)
  align(center, counter(page).display("1"))
}

// A chapter (or Introduction, Conclusion, About the author, Also by).
//   label  "Chapter 2", "2" or none (shown above the title)
//   title  the title as markup; plain: the same as a string (header)
//   toc    the contents line as markup, or none (not in the contents)
//   recto  start on a right-hand page
#let chapter(label: none, title: [], plain: "", toc: none, recto: true, body) = {
  pagebreak(to: if recto { "odd" } else { none }, weak: true)
  context [#metadata((title: plain, toc: toc, page: here().page())) <part-start>]
  context {
    let g = geo.get()
    // The chapter title one third down the page.
    v(g.height / 3 - MARGIN.top - 0.3in)
    if label != none {
      align(center, text(font: g.style.head, size: 0.82em, tracking: 0.14em, hyphenate: false, upper(label)))
      v(0.12in)
    }
  }
  heading(level: 1, title)
  body
  context [#metadata(here().page()) <part-end>]
}

// The first paragraph of a chapter with a drop cap (print only). Three lines high.
#let drop(body) = dropcap(height: 3, gap: 0.06in, justify: true, body)

// The paragraph right after a drop cap: Typst does not indent a paragraph that
// follows a block, so its indent is set here (the same 0.25 in as the book).
#let after-drop(body) = par(first-line-indent: (amount: 0.25in, all: true), body)

// Also by: the writer's other books, in print order.
#let also-by-list(books) = {
  set par(first-line-indent: 0pt, justify: false)
  set align(center)
  for b in books {
    block(above: 1.1em, ({
      text(style: "italic", b.title)
      if b.subtitle != none { linebreak(); text(size: 0.85em, b.subtitle) }
    }))
  }
}

#let contents(sections: false) = context {
  let g = geo.get()
  set par(first-line-indent: 0pt, justify: false)
  v(g.height / 3 - MARGIN.top - 0.3in)
  align(center, text(font: g.style.head, size: 1.45em, weight: g.style.head-weight, hyphenate: false, [Contents]))
  v(0.3in)
  let items = query(selector(<part-start>).or(heading.where(level: 2)))
  for it in items {
    let page = counter(page).at(it.location()).first()
    let line(body, indent) = block(above: if indent == 0pt { 0.85em } else { 0.45em }, pad(left: indent,
      box(width: 100%)[#body #box(width: 1fr, repeat[.#h(3pt)]) #str(page)]))
    if it.func() == metadata {
      if it.value.toc != none { line(it.value.toc, 0pt) }
    } else if sections {
      line(text(size: 0.92em, it.body), 0.25in)
    }
  }
}

#let book(
  style: "modern",
  trim: (w: 6, h: 9),
  title: [], plain-title: "", subtitle: none, author: none, plain-author: none,
  copyright: [], isbn: none,
  title-page: true, copyright-page: true, contents-page: true, contents-sections: false,
  running-header: true, header-title: none,
  about: none, about-recto: true,
  also-by: (), also-by-title: [Also by], also-by-plain: "Also by",
  body,
) = {
  let st = STYLES.at(style)
  let width = trim.w * 1in
  let height = trim.h * 1in
  set document(title: plain-title, author: if plain-author != none { plain-author } else { () }, date: none)
  set page(
    width: width,
    height: height,
    margin: MARGIN,
    binding: left,
    header: header(),
    footer: footer(),
    header-ascent: 35%,
    footer-descent: 35%,
  )
  set text(font: st.body, size: st.size, lang: "en", hyphenate: true)
  set par(justify: true, leading: st.leading, spacing: st.leading, first-line-indent: 0.25in)
  set list(indent: 0.15in, body-indent: 0.5em)
  set enum(indent: 0.15in, body-indent: 0.5em)
  set quote(block: true)
  show quote.where(block: true): it => pad(left: 0.25in, right: 0.25in, top: 0.3em, bottom: 0.3em, it.body)
  show list: set block(spacing: 0.9em)
  show enum: set block(spacing: 0.9em)

  show heading: set text(font: st.head, weight: st.head-weight, hyphenate: false)
  show heading: set par(justify: false, first-line-indent: 0pt)
  show heading.where(level: 1): it => block(width: 100%, below: 0.42in, align(center, text(size: 1.7em, it.body)))
  show heading.where(level: 2): set text(size: 1.16em)
  show heading.where(level: 2): set block(above: 1.6em, below: 0.8em)
  show heading.where(level: 3): set text(size: 1.04em, style: "italic")
  show heading.where(level: 3): set block(above: 1.3em, below: 0.7em)
  show heading.where(level: 4): set text(size: 1em)
  show link: underline

  geo.update((width: width, height: height, style: st, running: running-header,
    header-title: if header-title != none { header-title } else { plain-title }))

  // ── Front matter: no header, no number ──
  let front = false
  if title-page {
    set par(first-line-indent: 0pt, justify: false)
    v(height * 0.18)
    align(center, text(font: st.head, size: 24pt, weight: st.head-weight, hyphenate: false, title))
    if subtitle != none {
      v(0.25in)
      align(center, text(size: 12.5pt, style: "italic", hyphenate: false, subtitle))
    }
    if author != none {
      v(1fr)
      align(center, text(font: st.head, size: 13pt, author))
      v(0.6in)
    }
    front = true
  }
  // Copyright page (left-hand when the title page is on), text at the foot.
  if copyright-page {
    if front { pagebreak() }
    set par(first-line-indent: 0pt, justify: false)
    set text(size: 8.5pt)
    v(1fr)
    copyright
    if isbn != none { parbreak(); [ISBN #isbn] }
    front = true
  }
  // Contents (right-hand). Page numbers are body page numbers.
  if contents-page {
    if front { pagebreak(to: "odd") }
    contents(sections: contents-sections)
    front = true
  }
  context [#metadata(here().page()) <part-end>]

  // ── Body: page 1 is a right-hand page ──
  if front { pagebreak(to: "odd") }
  counter(page).update(1)
  set heading(outlined: true)
  body

  // ── Back matter ──
  if about != none {
    chapter(title: [About the author], plain: "About the author", toc: [About the author], recto: about-recto, {
      set par(first-line-indent: 0pt)
      about
    })
  }
  if also-by.len() > 0 {
    chapter(title: also-by-title, plain: also-by-plain, toc: none, recto: about-recto, also-by-list(also-by))
  }

  // ── Even page count, then the markers the checks read ──
  context [#metadata(here().page()) <content-end>]
  // Test the marker's page, not here(): here() would move to the new page
  // once the break is added, and the odd page would then confirm itself.
  context {
    let end = query(<content-end>)
    if end.len() > 0 and calc.odd(end.first().location().page()) { pagebreak() }
  }
  context [#metadata(here().page()) <last-page>]
  context [#metadata(query(heading).map(h => (
    level: h.level,
    page: h.location().page(),
    y: h.location().position().y.pt(),
  ))) <headings>]
  [#metadata(str(sys.version)) <typst-version>]
}
