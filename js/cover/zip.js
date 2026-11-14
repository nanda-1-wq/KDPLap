/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the zip writer and CRC-32 (E16 Part 2, plan §5)
   /js/cover/zip.js   (pure, no DOM; tested by tests/cover-zip.test.js)

   "Download all (.zip)": our own store-only zip (no compression, no
   library). The files are a PDF, a PNG or JPG and a JPG, all compressed
   already, so storing loses almost nothing. Names are UTF-8 (flag bit 11).
   Classic zip only (no zip64): each file and the whole zip stay under 4 GB,
   far above a cover's files.

   kdpCover.zip.crc32(bytes, crc)  → the CRC-32 (IEEE) of the bytes (crc: carry on from an earlier part)
   kdpCover.zip.make(files, date)  → Uint8Array, files: [{ name, bytes }], date: a Date for every entry
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes, crc) {
    let c = crc == null ? 0xffffffff : (crc ^ 0xffffffff) >>> 0;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** DOS time and date of a Date (local time, 2-second steps, 1980 to 2107). */
  function dos(d) {
    const y = Math.min(2107, Math.max(1980, d.getFullYear()));
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }

  function make(files, date) {
    const enc = new TextEncoder();
    const when = dos(date || new Date());
    const parts = [], central = [];
    let offset = 0;
    const seen = new Set();
    for (const f of files) {
      const name = enc.encode(String(f.name));
      if (!name.length || name.length > 0xffff) throw new Error('zip: bad file name');
      if (seen.has(f.name)) throw new Error(`zip: the name ${f.name} is used twice`);
      seen.add(f.name);
      const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
      if (data.length >= 0xffffffff || offset >= 0xffffffff) throw new Error('zip: too large');
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, when.time, true); local.setUint16(12, when.date, true); local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
      cd.setUint16(12, when.time, true); cd.setUint16(14, when.date, true); cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true);
      cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of all) { out.set(p, at); at += p.length; }
    return out;
  }

  C.zip = { crc32, make };
})(globalThis);
