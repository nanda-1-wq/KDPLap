// NicheInk — E13.0 Typst proof: the 6 x 9 in print interior (throwaway).
// /proof/typst/book.typ, imported by the main.typ that md2typst.js writes.
//
// Page: 6 x 9 in, mirrored margins (inside 0.75 in, outside 0.5 in, top and
// bottom 0.75 in). KDP's minimum is 0.375 in inside for 24 to 150 pages and
// 0.25 in outside; 0.75 in inside is enough up to 700 pages.
// Front matter (title, copyright, contents) has no header and no number.
// The body starts at page 1 on a right-hand page. Every chapter starts on a
// right-hand page. Header: the book title on left-hand pages, the chapter
// title on right-hand pages. No header and no number on chapter first pages
// and blank pages. The total page count is made even.
//
// Markers (metadata with a label) let the header, the footer and the proof
// read the layout back:
//   <part-start>  first page of each chapter
//   <part-end>    end of the front matter and of each chapter
//   <content-end> the last page before the even-count padding
//   <last-page>   the final page (the engine's page count)
//   <headings>    every heading: level, page, top position
//   <typst-version> the Typst version that compiled the book

#let body-font = "Source Serif 4"

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

#let header() = context {
  let p = here().page()
  if quiet(p) { return none }
  set text(size: 8.5pt, tracking: 0.04em)
  if calc.even(p) {
    align(left, upper(state("book-title").get()))
  } else {
    let chapters = query(heading.where(level: 1, outlined: true)).filter(h => h.location().page() <= p)
    if chapters.len() > 0 { align(right, upper(chapters.last().body)) }
  }
}

#let footer() = context {
  let p = here().page()
  if quiet(p) { return none }
  set text(size: 9pt)
  align(center, counter(page).display("1"))
}

#let chapter(title, body) = {
  pagebreak(to: "odd", weak: true)
  context [#metadata(here().page()) <part-start>]
  heading(level: 1, title)
  body
  context [#metadata(here().page()) <part-end>]
}

#let book(title: "", subtitle: none, author: none, copyright: [], body) = {
  set document(title: title, author: if author != none { author } else { () })
  set page(
    width: 6in,
    height: 9in,
    margin: (inside: 0.75in, outside: 0.5in, top: 0.75in, bottom: 0.75in),
    binding: left,
    header: header(),
    footer: footer(),
    header-ascent: 35%,
    footer-descent: 35%,
  )
  set text(font: body-font, size: 11pt, lang: "en", hyphenate: true)
  set par(justify: true, leading: 0.62em, spacing: 0.62em, first-line-indent: 0.25in)
  set list(indent: 0.15in, body-indent: 0.5em)
  set enum(indent: 0.15in, body-indent: 0.5em)
  set quote(block: true)
  show quote.where(block: true): it => pad(left: 0.25in, right: 0.25in, top: 0.3em, bottom: 0.3em, it.body)
  show list: set block(spacing: 0.9em)
  show enum: set block(spacing: 0.9em)

  show heading.where(level: 1): it => {
    v(1.1in)
    block(width: 100%, below: 0.45in, align(center, text(size: 19pt, weight: "bold", hyphenate: false, it.body)))
  }
  show heading.where(level: 2): set text(size: 13pt, weight: "bold", hyphenate: false)
  show heading.where(level: 2): set block(above: 1.6em, below: 0.8em)
  show heading.where(level: 3): set text(size: 11.5pt, weight: "bold", style: "italic", hyphenate: false)
  show heading.where(level: 3): set block(above: 1.3em, below: 0.7em)
  show heading.where(level: 4): set text(size: 11pt, weight: "bold", hyphenate: false)
  show heading: set par(justify: false)
  show link: underline

  state("book-title").update(title)

  // ── Front matter: no header, no number ──
  // Title page (recto).
  {
    set par(first-line-indent: 0pt, justify: false)
    v(1.6in)
    align(center, text(size: 24pt, weight: "bold", hyphenate: false, title))
    if subtitle != none {
      v(0.25in)
      align(center, text(size: 12.5pt, style: "italic", hyphenate: false, subtitle))
    }
    if author != none {
      v(1fr)
      align(center, text(size: 13pt, author))
      v(0.6in)
    }
  }
  // Copyright page (verso), text at the foot of the page.
  pagebreak()
  {
    set par(first-line-indent: 0pt, justify: false)
    set text(size: 8.5pt)
    v(1fr)
    copyright
  }
  // Contents (recto). Page numbers are body page numbers.
  pagebreak(to: "odd")
  {
    set par(first-line-indent: 0pt, justify: false)
    show outline.entry: it => block(above: 0.9em, it)
    outline(title: [Contents], depth: 1, indent: 0pt)
  }
  context [#metadata(here().page()) <part-end>]

  // ── Body: page 1 is a right-hand page ──
  pagebreak(to: "odd")
  counter(page).update(1)
  set heading(outlined: true)
  body

  // ── Even page count, then the markers the proof reads ──
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
