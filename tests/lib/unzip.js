// A small reader for .docx (zip) files in tests: no library, Deno or a browser.
// unzip(bytes) → Map(name → text). Stored (0) and deflate (8) entries only,
// which is what a .docx holds. Reads the central directory at the end.
export async function unzip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('unzip: not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('unzip: bad central directory');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(local + 26, true), lExtraLen = view.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + size);
    let raw;
    if (method === 0) raw = data;
    else if (method === 8) raw = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error(`unzip: method ${method} in ${name}`);
    out.set(name, dec.decode(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
