// A strict XML 1.0 well-formedness checker for tests (E13.3 Part 1): the stand-in
// for the browser's DOMParser in tests/epub-check.test.js and tools/epubcheck.mjs.
// Written apart from kdpEpubCheck.parseXml on purpose, so the module is never
// checked by its own reader. Checks: legal characters (XML 1.0 Char, no lone
// surrogates), an optional XML declaration first, at most a plain DOCTYPE,
// names, quoted and unique attributes, references (the 5 XML entities and
// numeric references to legal characters only), no "]]>" in text, comments
// without "--", balanced tags, one root, and every namespace prefix declared.
// wellFormed(name, text) -> true, or a reason (string).

const CHAR_BAD = /[^\u0009\u000A\u000D -\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const NAME_START = "A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
const NAME = new RegExp(`^[${NAME_START}:][${NAME_START}:.\\-0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*`);
const REF = /&(?:(amp|lt|gt|quot|apos)|#([0-9]+)|#x([0-9a-fA-F]+));/y;

function legalCode(cp) {
  return cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

/** Text or an attribute value: "&" only as a legal reference. Returns a reason or null. */
function refs(s, where) {
  for (let i = s.indexOf("&"); i >= 0; i = s.indexOf("&", i + 1)) {
    REF.lastIndex = i;
    const m = REF.exec(s);
    if (!m) return `a bare "&" in ${where}`;
    if (m[2] || m[3]) {
      const cp = m[2] ? parseInt(m[2], 10) : parseInt(m[3], 16);
      if (!legalCode(cp)) return `a reference to an illegal character in ${where}`;
    }
  }
  return null;
}

export function wellFormed(name, text) {
  const s = String(text);
  if (CHAR_BAD.test(s)) return "an illegal character";
  let i = 0;
  if (s.startsWith("<?xml")) {
    const e = s.indexOf("?>");
    if (e < 0 || !/^<\?xml version="1\.0"( encoding="UTF-8")?\?>$/.test(s.slice(0, e + 2))) return "a bad XML declaration";
    i = e + 2;
  } else if (s.includes("<?xml")) return "the XML declaration is not first";
  const stack = [];          // [{ name, ns: Map(prefix \u2192 uri) }]
  let roots = 0;
  let sawDoctype = false;
  const nsIn = (prefix) => prefix === "xml" || prefix === "xmlns" || stack.some((f) => f.ns.has(prefix));
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const text = s.slice(i, lt < 0 ? s.length : lt);
    if (text) {
      if (!stack.length && text.trim()) return "text outside the root element";
      if (text.includes("]]>")) return 'a "]]>" in text';
      const r = refs(text, "text");
      if (r) return r;
    }
    if (lt < 0) break;
    i = lt;
    if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i + 4);
      if (e < 0) return "an open comment";
      if (s.slice(i + 4, e).includes("--") || s[e - 1] === "-") return 'a "--" in a comment';
      i = e + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      if (!stack.length) return "CDATA outside the root";
      const e = s.indexOf("]]>", i);
      if (e < 0) return "an open CDATA section";
      i = e + 3;
      continue;
    }
    if (s.startsWith("<!DOCTYPE", i)) {
      if (sawDoctype || roots || stack.length) return "a misplaced DOCTYPE";
      const e = s.indexOf(">", i);
      if (e < 0 || !/^<!DOCTYPE html>$/.test(s.slice(i, e + 1))) return "a DOCTYPE other than <!DOCTYPE html>";
      sawDoctype = true;
      i = e + 1;
      continue;
    }
    if (s.startsWith("<?", i)) return "a processing instruction";
    if (s.startsWith("</", i)) {
      const m = NAME.exec(s.slice(i + 2));
      if (!m) return "a bad end tag";
      const after = s.slice(i + 2 + m[0].length);
      const close = /^\s*>/.exec(after);
      if (!close) return `a bad end tag </${m[0]}`;
      const top = stack.pop();
      if (!top || top.name !== m[0]) return `</${m[0]}> does not close <${top ? top.name : "nothing"}>`;
      i += 2 + m[0].length + close[0].length;
      continue;
    }
    // A start tag.
    const m = NAME.exec(s.slice(i + 1));
    if (!m) return `a bad tag at ${i}`;
    if (!stack.length && roots++) return "more than one root element";
    const el = m[0];
    i += 1 + m[0].length;
    const attrs = new Map();
    let selfClose = false;
    for (;;) {
      const ws = /^\s*/.exec(s.slice(i))[0];
      i += ws.length;
      if (s.startsWith("/>", i)) { i += 2; selfClose = true; break; }
      if (s[i] === ">") { i += 1; break; }
      if (!ws) return `no space before an attribute in <${el}>`;
      const a = NAME.exec(s.slice(i));
      if (!a) return `a bad attribute name in <${el}>`;
      i += a[0].length;
      const eq = /^\s*=\s*/.exec(s.slice(i));
      if (!eq) return `attribute ${a[0]} has no value in <${el}>`;
      i += eq[0].length;
      const q = s[i];
      if (q !== '"' && q !== "'") return `attribute ${a[0]} is not quoted in <${el}>`;
      const e = s.indexOf(q, i + 1);
      if (e < 0) return `attribute ${a[0]} is not closed in <${el}>`;
      const val = s.slice(i + 1, e);
      if (val.includes("<")) return `a "<" in attribute ${a[0]}`;
      const r = refs(val, `attribute ${a[0]}`);
      if (r) return r;
      if (attrs.has(a[0])) return `attribute ${a[0]} twice in <${el}>`;
      attrs.set(a[0], val);
      i = e + 1;
    }
    const ns = new Map();
    for (const [k, v] of attrs) if (k.startsWith("xmlns:")) ns.set(k.slice(6), v);
    stack.push({ name: el, ns });
    const prefixes = [el, ...attrs.keys()].filter((n) => n.includes(":") && !n.startsWith("xmlns:")).map((n) => n.split(":")[0]);
    const undeclared = prefixes.find((p) => !nsIn(p));
    if (undeclared) return `the prefix ${undeclared}: is not declared (in <${el}>)`;
    if (selfClose) stack.pop();
  }
  if (stack.length) return `<${stack[stack.length - 1].name}> is not closed`;
  if (roots !== 1) return "no root element";
  return true;
}
