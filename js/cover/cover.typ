// NicheInk · 09 Cover · the layer cover (E16 Part 2, template c2).
// /js/cover/cover.typ, imported by the main.typ that js/cover/typst.js writes.
// Typst 0.14.2 (typst.ts 0.7.0). Plan: docs/reviews/2026-11-13-e16-plan.md §1.
//
// This file only draws. Every place, line break and size comes from
// js/cover (textlayout, flatten) through main.typ, in board px (70 a inch):
// Typst never breaks, aligns or fits a line, so the vector letters land on
// the same pixels as the 300 DPI patches drawn by the canvas renderer.
//
// Rules (KDP, coverChecks; E15 proved them on Typst 0.14.2):
// - Every color is rgb() from main.typ. No luma(), no named color, no default
//   stroke, no gradient (a /Pattern color space), no alpha: Typst would write a
//   second color space or transparency.
// - A line's top and bottom edges are its baseline: main.typ gives the
//   baseline place, so the letters sit exactly where the canvas draws them.
// - Pictures, see-through parts and gradients are not drawn here: they are
//   opaque 300 DPI JPEG patches (js/cover/flatten.js), placed by main.typ.
//
// Markers (metadata with the label <cover-fit>), one per plain line drawn:
//   (id: layer id as text, i: line number, w: the line's width in pt as Typst sets it)
//   js/cover/export.js compares w with the screen's width (plan R4: within 0.5%).

#let PX = 72pt / 70

// A layer's box at (x, y), w × h board px, turned rot degrees around its center.
#let layer(x, y, w, h, rot, body) = place(top + left, dx: x * PX, dy: y * PX,
  rotate(rot * 1deg, reflow: false, box(width: w * PX, height: h * PX, body)))

// A shape's box, also flipped (the design: rotate, then scale, both around the center).
#let shape-box(x, y, w, h, rot, fx, fy, body) = place(top + left, dx: x * PX, dy: y * PX,
  rotate(rot * 1deg, reflow: false, scale(x: fx * 100%, y: fy * 100%, reflow: false, box(width: w * PX, height: h * PX, body))))

// One run of text with its baseline at (x, y) in the box. font, weight and stretch are what Typst
// selects a face by: the family name Typst gives the file and its own weight and width classes.
#let run(x, y, font, weight, size, fill, tracking, s, stroke: none, stretch: 100%) = place(top + left, dx: x * PX, dy: y * PX,
  text(font: font, weight: weight, stretch: stretch, size: size * 1pt, fill: fill, stroke: stroke, tracking: tracking * 1pt,
    ligatures: tracking == 0, top-edge: "baseline", bottom-edge: "baseline", s))

// The width marker of one line.
#let fit(id, i, font, weight, size, tracking, s, stretch: 100%) = context {
  let w = measure(text(font: font, weight: weight, stretch: stretch, size: size * 1pt, tracking: tracking * 1pt, ligatures: tracking == 0, s)).width
  [#metadata((id: id, i: i, w: w.pt())) <cover-fit>]
}

// One character of curved text: its box (w × lh) turned around its foot (up) or its head.
#let curve-char(x, y, w, lh, base, rad, up, font, weight, size, fill, s, stroke: none, stretch: 100%) = place(top + left, dx: x * PX, dy: y * PX,
  rotate(rad * 1rad, origin: (if up { bottom } else { top }) + center, reflow: false,
    box(width: w * PX, height: lh * PX, place(top + left, dx: 0pt, dy: base * PX,
      text(font: font, weight: weight, stretch: stretch, size: size * 1pt, fill: fill, stroke: stroke, top-edge: "baseline", bottom-edge: "baseline", s)))))

// A filled rounded box (the opaque background effect).
#let plate(x, y, w, h, r, fill) = place(top + left, dx: x * PX, dy: y * PX,
  rect(width: w * PX, height: h * PX, radius: r * PX, fill: fill, stroke: none))

// An opaque 300 DPI patch at whole grid pixels.
#let patch(path, x0, y0, x1, y1) = place(top + left, dx: x0 * 1in / 300, dy: y0 * 1in / 300,
  image(path, width: (x1 - x0) * 1in / 300, height: (y1 - y0) * 1in / 300))
