/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the raster renderer (E16 Part 2, plan §1)
   /js/cover/render.js   (browser; needs geo, textlayout, shapes, model,
                          flatten and fonts; driven by js/cover/export.js and,
                          from Part 4, by the canvas view)

   One renderer paints a cover at any scale: the screen, the 300 DPI flatten
   patches, the full image, the Kindle cover, thumbnails. It draws what the
   finals draw with CSS (design 58, plan §1), with canvas calls:
   - text: the lines and widths of kdpCover.textlayout (the one line breaker),
     the baseline from the font's hhea metrics (the CSS line box), letter
     spacing by placing each character at the width of the text before it
     (kerning kept, no ligatures, as CSS letter-spacing);
   - effects: the 9 styles of the design's fxCss() (shadow, lift, glow,
     outline, hollow, 3D, echo, background), canvas shadows with their offsets
     turned with the layer;
   - curved text: the design's curveChars() places;
   - distortion: the layer is drawn flat, then warped onto its 4 corners with
     a mesh (the design's matrix3d), 24 × 24 cells;
   - shapes: the design's shapePath() as a Path2D, even-odd fill, gradient,
     border with dash and dot;
   - pictures: crop, flip, our own pixel filters (brightness, contrast,
     saturation, blur, black and white, sepia; Safari's ctx.filter is not
     reliable, R6), darken, mask (rounded, circle, arch), border;
   - opacity: the layer is drawn on its own canvas, then laid down once
     (group opacity, as CSS).
   Never drawn: the KDP template, guides, selection, hidden or excluded layers.

   kdpCover.render.paint(ctx, cover, view)
       view: { scale (device px per board px), x0, y0 (board px at the canvas top left),
               images(layer) → CanvasImageSource | null, upTo (index in the printable layers, inclusive),
               effectOnly (a text layer id: its effect without the letters), bg (default true),
               ids (only these layers; default all printable) }
   kdpCover.render.canvas(w, h)               → an OffscreenCanvas (or a page canvas)
   kdpCover.render.region(cover, box, view)   → a canvas of the grid box (300 DPI px) with everything up to view.upTo
   kdpCover.render.tiles(cover, scale, size, cb) → paints the cover tile by tile: cb(canvas, x, y) in device px
   kdpCover.render.filterPixels(data, l, sigmaPx) → the picture filters on RGBA data (exported for tests)
   kdpCover.render.MAX_CANVAS                 → the area this code uses for one canvas (tiles above it)
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const PT = 70 / 72;
  const MAX_CANVAS = 4096 * 4096;    // one canvas at most (Safari's documented cap on iOS; macOS measured at STOP 2)
  const MESH = 24;

  function canvas(w, h) {
    const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
    if (root.OffscreenCanvas) return new root.OffscreenCanvas(W, H);
    const c = root.document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }
  const rgba = (hex, a) => {
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  /** The current transform applied to a vector (shadow offsets do not follow the transform in canvas). */
  function devVec(ctx, dx, dy) {
    const m = ctx.getTransform();
    return [m.a * dx + m.c * dy, m.b * dx + m.d * dy];
  }
  const devScale = (ctx) => { const m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); };

  /* ── Text ── */

  function fontCss(l, ctx) {
    const F = C.fonts;
    const f = F && F.face(l.font, l.weight);
    const name = f && F.loaded(f) ? `"${F.canvasName(f)}"` : 'serif';
    ctx.font = `${l.size * PT}px ${name}`;
    ctx.fontKerning = 'normal';
    return f;
  }

  /** Glyph runs of a plain (not curved) text: [{ s, x, y (baseline) }] in box px. */
  function plainRuns(l) {
    const TL = C.textlayout;
    const px = l.size * PT, lh = TL.lineH(l), m = TL.metricsOf(l.font, l.weight);
    const base = (lh - (m.asc + m.desc) * px) / 2 + m.asc * px;
    return TL.lines(l).map((ln, i) => {
      const x = l.align === 'center' ? (l.w - ln.width) / 2 : l.align === 'right' ? l.w - ln.width : 0;
      return { s: ln.text.replace(/ +$/, ''), x, y: i * lh + base };
    });
  }

  /** Draw one run: whole, or character by character at the measured widths when there is letter spacing. */
  function drawRun(ctx, l, r, how) {
    const go = (s, x) => (how === 'stroke' ? ctx.strokeText(s, x, r.y) : ctx.fillText(s, x, r.y));
    if (!l.ls) { go(r.s, r.x); return; }
    const TL = C.textlayout, px = l.size * PT, chars = Array.from(r.s);
    let pre = '';
    chars.forEach((ch, i) => {
      go(ch, r.x + TL.measure(l.font, l.weight, px, pre) + i * l.ls * px);
      pre += ch;
    });
  }

  /** Every glyph of the layer, at (dx, dy) box px: plain lines, or the curve's characters. */
  function eachGlyphs(ctx, l, dx, dy, how) {
    if (l.curve) {
      const TL = C.textlayout, cv = TL.curve(l), lh = TL.lineH(l), px = l.size * PT, m = TL.metricsOf(l.font, l.weight);
      const base = (lh - (m.asc + m.desc) * px) / 2 + m.asc * px;
      for (const c of cv.list) {
        const ox = c.x + c.w / 2, oy = c.top + (c.origin === 'bottom' ? lh : 0);
        ctx.save();
        ctx.translate(ox + dx, oy + dy);
        ctx.rotate(c.rot);
        const r = { s: c.ch, x: -c.w / 2, y: (c.origin === 'bottom' ? -lh : 0) + base };
        drawRun(ctx, { ...l, ls: 0 }, r, how);
        ctx.restore();
      }
      return;
    }
    for (const r of plainRuns(l)) drawRun(ctx, l, { ...r, x: r.x + dx, y: r.y + dy }, how);
  }

  /**
   * The letters and the effect of a text layer, in its box (0, 0)–(w, h), no
   * rotation (the caller turns the context). part: 'all' | 'effect' | 'letters'.
   */
  function textBody(ctx, l, part) {
    fontCss(l, ctx);
    const fx = l.fx || { style: 'none' };
    const a = fx.int / 100;
    const rad = fx.dir * Math.PI / 180, ox = Math.cos(rad) * fx.dist, oy = Math.sin(rad) * fx.dist;
    const h = C.textlayout.height(l);
    const wantFx = part !== 'letters', wantLetters = part !== 'effect';
    // A canvas shadow without its letters: the letters go far away, the shadow is moved back.
    const shadowOnly = (dx, dy, blur, color) => {
      const far = 1e5;
      ctx.save();
      const [sx, sy] = devVec(ctx, dx + far, dy);
      ctx.shadowColor = color;
      ctx.shadowOffsetX = sx; ctx.shadowOffsetY = sy;
      ctx.shadowBlur = blur * devScale(ctx);
      ctx.fillStyle = '#000000';
      eachGlyphs(ctx, l, -far, 0, 'fill');
      ctx.restore();
    };
    const letters = () => { ctx.fillStyle = l.color; eachGlyphs(ctx, l, 0, 0, 'fill'); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.miterLimit = 2;
    switch (fx.style) {
      case 'shadow':
        if (wantFx) shadowOnly(ox, oy, fx.blur, rgba(fx.color, a));
        break;
      case 'lift':
        if (wantFx) shadowOnly(0, fx.dist * 0.6, Math.max(4, fx.blur * 2), rgba(fx.color, a * 0.7));
        break;
      case 'glow':
        if (wantFx) { shadowOnly(0, 0, fx.blur * 2, rgba(fx.color, a * 0.8)); shadowOnly(0, 0, fx.blur, rgba(fx.color, a)); }
        break;
      case 'outline':
        if (wantFx) { ctx.strokeStyle = fx.color; ctx.lineWidth = fx.width * 2; eachGlyphs(ctx, l, 0, 0, 'stroke'); }
        break;
      case '3d':
        if (wantFx) { ctx.fillStyle = fx.color; for (let i = fx.depth; i >= 1; i--) eachGlyphs(ctx, l, Math.cos(rad) * i, Math.sin(rad) * i, 'fill'); }
        break;
      case 'echo':
        if (wantFx) { ctx.strokeStyle = fx.color; ctx.lineWidth = Math.max(1, fx.width * 0.6); eachGlyphs(ctx, l, ox, oy, 'stroke'); }
        break;
      case 'bg':
        // D18 (owner STOP 2): the plate is outside the box (pad left and right, half pad above and below), the lines unchanged.
        if (wantFx) {
          ctx.fillStyle = rgba(fx.color, Math.max(0.15, a));
          ctx.beginPath();
          roundRect(ctx, -fx.pad, -fx.pad * 0.5, l.w + 2 * fx.pad, h + fx.pad, fx.round);
          ctx.fill();
        }
        break;
      default: break;
    }
    if (!wantLetters) return;
    if (fx.style === 'hollow') { ctx.strokeStyle = l.color; ctx.lineWidth = fx.width; eachGlyphs(ctx, l, 0, 0, 'stroke'); return; }
    letters();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * Distortion: the flat layer on its own canvas, warped onto the 4 corners
   * (the design's matrix3d on the text block) with a mesh of triangles.
   */
  function warpText(ctx, l, part) {
    const h = C.textlayout.height(l);
    const s = Math.max(1, devScale(ctx)) * 1.5;           // a little supersampling for the warp
    const r = C.flatten.fxReach(l.fx), ink = l.size * PT * 0.5 + 2;
    const m = Math.max(r.l, r.r, r.t, r.b) + ink;
    const fw = l.w + 2 * m, fh = h + 2 * m;
    const k = Math.min(s, Math.sqrt(MAX_CANVAS / (fw * fh)));
    const src = canvas(fw * k, fh * k);
    const g = src.getContext('2d');
    g.setTransform(k, 0, 0, k, m * k, m * k);
    textBody(g, l, part);
    const H = C.geo.homography(l.w, h, C.geo.quadOf(l, h));
    const N = MESH;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u0 = -m + fw * i / N, u1 = -m + fw * (i + 1) / N, v0 = -m + fh * j / N, v1 = -m + fh * (j + 1) / N;
        const P = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        const D = P.map(([u, v]) => H.map(u, v));
        const S = P.map(([u, v]) => [(u + m) * k, (v + m) * k]);
        tri(ctx, src, [S[0], S[1], S[2]], [D[0], D[1], D[2]]);
        tri(ctx, src, [S[0], S[2], S[3]], [D[0], D[2], D[3]]);
      }
    }
  }

  /** Draw a source triangle onto a target triangle (affine), clipped and grown a little against seams. */
  function tri(ctx, img, s, d) {
    const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
    const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (Math.abs(den) < 1e-9) return;
    const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
    const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
    const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
    const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
    const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
    const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
    const cx = (u0 + u1 + u2) / 3, cy = (v0 + v1 + v2) / 3, grow = 0.6 / Math.max(1e-6, devScale(ctx));
    const out = (u, v) => { const dx = u - cx, dy = v - cy, n = Math.hypot(dx, dy) || 1; return [u + dx / n * grow, v + dy / n * grow]; };
    ctx.save();
    ctx.beginPath();
    const p0 = out(u0, v0), p1 = out(u1, v1), p2 = out(u2, v2);
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, dd, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function drawText(ctx, l, part) {
    const h = C.textlayout.height(l);
    ctx.save();
    ctx.translate(l.x + l.w / 2, l.y + h / 2);
    if (l.rot) ctx.rotate(l.rot * Math.PI / 180);
    ctx.translate(-l.w / 2, -h / 2);
    if (l.dist && l.dist.on) warpText(ctx, l, part);
    else textBody(ctx, l, part);
    ctx.restore();
  }

  /* ── Shapes ── */

  function drawShape(ctx, l) {
    ctx.save();
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
    if (l.rot) ctx.rotate(l.rot * Math.PI / 180);
    if (l.flipH || l.flipV) ctx.scale(l.flipH ? -1 : 1, l.flipV ? -1 : 1);
    ctx.translate(-l.w / 2, -l.h / 2);
    const p = new root.Path2D(C.shapes.path(l));
    if (l.kind !== 'line' && l.fillMode !== 'none') {
      if (l.fillMode === 'grad') {
        // The design's SVG gradient: from (gx1, gy1) to (gx2, gy2), shares of the box.
        const a = (l.gAngle - 90) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
        const gr = ctx.createLinearGradient((0.5 - 0.5 * cs) * l.w, (0.5 - 0.5 * sn) * l.h, (0.5 + 0.5 * cs) * l.w, (0.5 + 0.5 * sn) * l.h);
        gr.addColorStop(0, l.fill); gr.addColorStop(1, l.fill2);
        ctx.fillStyle = gr;
      } else ctx.fillStyle = l.fill;
      ctx.fill(p, 'evenodd');
    }
    if (l.sw > 0) {
      const lw = l.sw * PT;
      ctx.lineWidth = lw; ctx.strokeStyle = l.scolor; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(l.dash === 'dash' ? [lw * 3, lw * 2] : l.dash === 'dot' ? [0, lw * 2] : []);
      ctx.stroke(p);
    }
    ctx.restore();
  }

  /* ── Pictures ── */

  /** The 4 corner radii [rx, ry] of a mask (CSS border-radius of the design's maskRadius()), scaled as CSS does. */
  function maskRadii(mask, w, h) {
    let r;
    if (mask === 'circle') r = [[w / 2, h / 2], [w / 2, h / 2], [w / 2, h / 2], [w / 2, h / 2]];
    else if (mask === 'rounded') r = [[0.12 * w, 0.12 * h], [0.12 * w, 0.12 * h], [0.12 * w, 0.12 * h], [0.12 * w, 0.12 * h]];
    else if (mask === 'arch') r = [[w / 2, 0.32 * h], [w / 2, 0.32 * h], [0, 0], [0, 0]];
    else r = [[0, 0], [0, 0], [0, 0], [0, 0]];
    // CSS: if two radii on one side add up to more than the side, all are scaled down.
    const f = Math.min(1, w / Math.max(1e-9, r[0][0] + r[1][0]), w / Math.max(1e-9, r[3][0] + r[2][0]), h / Math.max(1e-9, r[0][1] + r[3][1]), h / Math.max(1e-9, r[1][1] + r[2][1]));
    return r.map(([x, y]) => [x * f, y * f]);
  }

  /** A rounded box with elliptical corners (TL, TR, BR, BL), added to the current path. */
  function radiiPath(ctx, x, y, w, h, R) {
    const [tl, tr, br, bl] = R;
    ctx.moveTo(x + tl[0], y);
    ctx.lineTo(x + w - tr[0], y);
    if (tr[0] > 0 && tr[1] > 0) ctx.ellipse(x + w - tr[0], y + tr[1], tr[0], tr[1], 0, -Math.PI / 2, 0); else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - br[1]);
    if (br[0] > 0 && br[1] > 0) ctx.ellipse(x + w - br[0], y + h - br[1], br[0], br[1], 0, 0, Math.PI / 2); else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + bl[0], y + h);
    if (bl[0] > 0 && bl[1] > 0) ctx.ellipse(x + bl[0], y + h - bl[1], bl[0], bl[1], 0, Math.PI / 2, Math.PI); else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + tl[1]);
    if (tl[0] > 0 && tl[1] > 0) ctx.ellipse(x + tl[0], y + tl[1], tl[0], tl[1], 0, Math.PI, Math.PI * 1.5); else ctx.lineTo(x, y);
    ctx.closePath();
  }

  /**
   * The picture filters on RGBA pixels, in the design's order (brightness,
   * contrast, saturate, blur, then black and white or sepia), as the CSS
   * filter functions do (sRGB values, clamped after each step).
   */
  function filterPixels(img, l, sigma) {
    const d = img.data, n = d.length;
    const bri = l.bri / 100, con = l.con / 100, sat = l.sat / 100;
    const doColor = bri !== 1 || con !== 1 || sat !== 1;
    if (doColor) {
      const S = [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat, 0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat, 0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat];
      const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
      for (let i = 0; i < n; i += 4) {
        let r = cl(d[i] * bri), g = cl(d[i + 1] * bri), b = cl(d[i + 2] * bri);
        r = cl((r - 127.5) * con + 127.5); g = cl((g - 127.5) * con + 127.5); b = cl((b - 127.5) * con + 127.5);
        if (sat !== 1) {
          const r2 = S[0] * r + S[1] * g + S[2] * b, g2 = S[3] * r + S[4] * g + S[5] * b, b2 = S[6] * r + S[7] * g + S[8] * b;
          r = cl(r2); g = cl(g2); b = cl(b2);
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    if (sigma > 0.3) blurRGBA(img, sigma);
    if (l.look === 'bw' || l.look === 'sepia') {
      const M = l.look === 'bw' ? [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722]
        : (() => { const a = 0.85, q = 1 - a; return [0.393 + 0.607 * q, 0.769 - 0.769 * q, 0.189 - 0.189 * q, 0.349 - 0.349 * q, 0.686 + 0.314 * q, 0.168 - 0.168 * q, 0.272 - 0.272 * q, 0.534 - 0.534 * q, 0.131 + 0.869 * q]; })();
      for (let i = 0; i < n; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = M[0] * r + M[1] * g + M[2] * b; d[i + 1] = M[3] * r + M[4] * g + M[5] * b; d[i + 2] = M[6] * r + M[7] * g + M[8] * b;
      }
    }
    return img;
  }

  /** Gaussian blur, 3 box passes each way (sigma in pixels), alpha premultiplied while blurring. */
  function blurRGBA(img, sigma) {
    const { width: W, height: H, data: d } = img;
    const boxes = (() => {
      const n = 3, wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
      let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
      const wu = wl + 2, mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4), m = Math.round(mIdeal);
      return [0, 1, 2].map((i) => (i < m ? wl : wu));
    })();
    const f = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const a = d[i * 4 + 3] / 255; f[i * 4] = d[i * 4] * a; f[i * 4 + 1] = d[i * 4 + 1] * a; f[i * 4 + 2] = d[i * 4 + 2] * a; f[i * 4 + 3] = d[i * 4 + 3]; }
    const tmp = new Float32Array(W * H * 4);
    const pass = (src, dst, r, horiz) => {
      const len = horiz ? W : H, lines = horiz ? H : W, step = horiz ? 4 : W * 4;
      const iarr = 1 / (r + r + 1);
      for (let line = 0; line < lines; line++) {
        const start = horiz ? line * W * 4 : line * 4;
        for (let c = 0; c < 4; c++) {
          const first = src[start + c], last = src[start + (len - 1) * step + c];
          let acc = (r + 1) * first;
          for (let k = 0; k < r; k++) acc += src[start + Math.min(k, len - 1) * step + c];
          for (let k = 0; k < len; k++) {
            acc += src[start + Math.min(k + r, len - 1) * step + c] - (k - r - 1 >= 0 ? src[start + (k - r - 1) * step + c] : first);
            dst[start + k * step + c] = acc * iarr;
          }
          void last;
        }
      }
    };
    for (const b of boxes) { const r = (b - 1) / 2; pass(f, tmp, r, true); pass(tmp, f, r, false); }
    for (let i = 0; i < W * H; i++) {
      const a = f[i * 4 + 3], k = a > 0 ? 255 / a : 0;
      d[i * 4] = f[i * 4] * k; d[i * 4 + 1] = f[i * 4 + 1] * k; d[i * 4 + 2] = f[i * 4 + 2] * k; d[i * 4 + 3] = a;
    }
  }

  /** A stand-in when the picture is not there (Part 6 designs the real one). */
  function placeholder(ctx, x, y, w, h) {
    ctx.fillStyle = '#D9D9D6';
    ctx.fillRect(x, y, w, h);
  }

  function drawImage(ctx, l, view) {
    ctx.save();
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
    if (l.rot) ctx.rotate(l.rot * Math.PI / 180);
    ctx.translate(-l.w / 2, -l.h / 2);
    const bw = (l.bw || 0) * PT;
    const outer = maskRadii(l.mask, l.w, l.h);
    const inner = outer.map(([rx, ry]) => [Math.max(0, rx - bw), Math.max(0, ry - bw)]);
    const ix = bw, iy = bw, iw = Math.max(0, l.w - 2 * bw), ih = Math.max(0, l.h - 2 * bw);
    // The visible part of the padding box on this canvas, in the layer's own px.
    const inv = ctx.getTransform().inverse();
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const corners = [[0, 0], [cw, 0], [cw, ch], [0, ch]].map(([x, y]) => [inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f]);
    const vx0 = Math.max(ix, Math.min(...corners.map((p) => p[0]))), vy0 = Math.max(iy, Math.min(...corners.map((p) => p[1])));
    const vx1 = Math.min(ix + iw, Math.max(...corners.map((p) => p[0]))), vy1 = Math.min(iy + ih, Math.max(...corners.map((p) => p[1])));
    ctx.save();
    ctx.beginPath();
    radiiPath(ctx, ix, iy, iw, ih, inner);
    ctx.clip();
    const src = view.images ? view.images(l) : null;
    if (vx1 > vx0 && vy1 > vy0) {
      if (!src) placeholder(ctx, ix, iy, iw, ih);
      else {
        const s = devScale(ctx);
        const sigma = (l.blur || 0) * s;
        const margin = sigma > 0 ? Math.ceil(3 * sigma / s) + 1 : 1;
        const rx = Math.max(ix + l.px - 0, vx0 - margin), ry = Math.max(iy + l.py, vy0 - margin);
        const rw = Math.min(ix + l.px + l.pw, vx1 + margin) - rx, rh = Math.min(iy + l.py + l.ph, vy1 + margin) - ry;
        if (rw > 0 && rh > 0) {
          let k = s;
          if (rw * rh * k * k > MAX_CANVAS) k = Math.sqrt(MAX_CANVAS / (rw * rh));
          const off = canvas(rw * k, rh * k);
          const g = off.getContext('2d');
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.setTransform(k, 0, 0, k, -rx * k, -ry * k);
          g.translate(ix + l.px + l.pw / 2, iy + l.py + l.ph / 2);
          g.scale(l.flipH ? -1 : 1, l.flipV ? -1 : 1);
          g.drawImage(src, -l.pw / 2, -l.ph / 2, l.pw, l.ph);
          const plain = l.bri === 100 && l.con === 100 && l.sat === 100 && !(l.blur > 0) && (l.look || 'none') === 'none';
          if (!plain) {
            const data = g.getImageData(0, 0, off.width, off.height);
            filterPixels(data, l, (l.blur || 0) * k);
            g.putImageData(data, 0, 0);
          }
          ctx.drawImage(off, rx, ry, off.width / k, off.height / k);
          if (off.width) off.width = 0;
        }
      }
      if (l.dark > 0) { ctx.fillStyle = `rgba(0,0,0,${l.dark / 100})`; ctx.fillRect(ix, iy, iw, ih); }
    }
    ctx.restore();
    if (bw > 0) {
      ctx.beginPath();
      radiiPath(ctx, 0, 0, l.w, l.h, outer);
      radiiPath(ctx, ix, iy, iw, ih, inner);
      ctx.fillStyle = l.bcolor;
      ctx.fill('evenodd');
    }
    ctx.restore();
  }

  /* ── Layers and the cover ── */

  function drawDirect(ctx, l, view, part) {
    if (l.type === 'text') drawText(ctx, l, part);
    else if (l.type === 'shape') drawShape(ctx, l);
    else if (l.type === 'image') drawImage(ctx, l, view);
  }

  /** One layer, with group opacity: drawn on its own canvas at the device scale, then laid down once. */
  function drawLayer(ctx, l, view, part) {
    if (!(l.op < 100)) { drawDirect(ctx, l, view, part); return; }
    const m = ctx.getTransform();
    const e = C.flatten.extent(l);
    // The layer's box in device px, cut to the canvas.
    const pts = [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
    const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...pts.map((p) => p[0])))), y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    if (x1 <= x0 || y1 <= y0) return;
    const off = canvas(x1 - x0, y1 - y0);
    const g = off.getContext('2d');
    g.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    drawDirect(g, l, view, part);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = l.op / 100;
    ctx.drawImage(off, x0, y0);
    ctx.restore();
    off.width = 0;
  }

  function paint(ctx, cover, view) {
    const v = view || {};
    const s = v.scale || 1, x0 = v.x0 || 0, y0 = v.y0 || 0;
    const g = C.geo.geo(cover.fmt);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (v.bg !== false) { ctx.fillStyle = cover.bg; ctx.fillRect(-1, -1, g.W + 2, g.H + 2); }
    const layers = C.flatten.printable(cover.layers);
    const upTo = v.upTo == null ? layers.length - 1 : v.upTo;
    for (let i = 0; i <= upTo && i < layers.length; i++) {
      const l = layers[i];
      if (v.ids && !v.ids.includes(l.id)) continue;
      const part = v.effectOnly != null && l.id === v.effectOnly ? 'effect' : 'all';
      drawLayer(ctx, l, v, part);
    }
    ctx.restore();
  }

  /** A canvas of one grid box (300 DPI px) with the cover painted up to view.upTo, opaque. */
  function region(cover, box, view) {
    const k = C.flatten.DPI / C.geo.I;
    const cv = canvas(box.x1 - box.x0, box.y1 - box.y0);
    const ctx = cv.getContext('2d', { alpha: false });
    paint(ctx, cover, Object.assign({}, view, { scale: k, x0: box.x0 / k, y0: box.y0 / k }));
    return cv;
  }

  /** The whole cover at a scale, tile by tile (tiles of size × size device px). cb(canvas, x, y) may be async. */
  async function tiles(cover, scale, size, cb, view) {
    const g = C.geo.geo(cover.fmt);
    const W = Math.ceil(g.W * scale - 1e-9), H = Math.ceil(g.H * scale - 1e-9);
    const T = size || 2048;
    for (let y = 0; y < H; y += T) {
      for (let x = 0; x < W; x += T) {
        const cv = canvas(Math.min(T, W - x), Math.min(T, H - y));
        const ctx = cv.getContext('2d', { alpha: false });
        paint(ctx, cover, Object.assign({}, view, { scale, x0: x / scale, y0: y / scale }));
        await cb(cv, x, y, W, H);
        cv.width = 0;
      }
    }
    return { W, H };
  }

  C.render = { MAX_CANVAS, MESH, canvas, paint, region, tiles, filterPixels, blurRGBA, maskRadii, plainRuns };
})(globalThis);
