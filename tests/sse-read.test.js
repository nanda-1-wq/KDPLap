// deno test tests/sse-read.test.js   (from the repo root)
// The browser's SSE reader (js/sse-read.js). Same cases as the server's
// reader in supabase/functions/generate/lib.section_write.test.ts.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import "../js/sse-read.js";

const S = globalThis.kdpSse;

Deno.test("sse: chunks split anywhere, comments, several data lines, CRLF", () => {
  const got = [];
  const r = S.reader((e) => got.push(e));
  const text = ": ping\r\n\r\nevent: a\r\ndata: {\"x\":\r\ndata: 1}\r\n\r\nevent: b\ndata: line1\ndata: line2\n\nevent: c\ndata: {\"t\":\"é\"}";
  for (let i = 0; i < text.length; i += 3) r.push(text.slice(i, i + 3));
  r.end();
  assertEquals(got, [{ event: "a", data: { x: 1 } }, { event: "b", data: "line1\nline2" }, { event: "c", data: { t: "é" } }]);
});

Deno.test("sse: a body split inside a character, as the server sends it", async () => {
  const bytes = new TextEncoder().encode('event: text\ndata: {"t":"Café, naïve — résumé"}\n\nevent: done\ndata: {"reason":"complete"}\n\n');
  const body = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 5) c.enqueue(bytes.slice(i, i + 5)); c.close(); } });
  const got = [];
  await S.read(body, (e) => got.push(e));
  assertEquals(got, [{ event: "text", data: { t: "Café, naïve — résumé" } }, { event: "done", data: { reason: "complete" } }]);
});

Deno.test("sse: a broken stream rejects (the caller shows the lost-connection state)", async () => {
  let n = 0;
  const body = new ReadableStream({
    pull(c) {
      if (n++ === 0) c.enqueue(new TextEncoder().encode("event: start\ndata: {}\n\n"));
      else c.error(new TypeError("network"));
    },
  });
  const got = [];
  await assertRejects(() => S.read(body, (e) => got.push(e)), TypeError);
  assertEquals(got, [{ event: "start", data: {} }]);
});
