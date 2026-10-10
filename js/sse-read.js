/* ═══════════════════════════════════════════════════
   KDP Lab — Server-sent events reader (E10.2)
   /js/sse-read.js   (used by js/supabase.js generateStream;
                      tested by tests/sse-read.test.js)

   Generate section streams its text as server-sent events. functions.invoke
   waits for the whole body, so the browser reads the stream itself.
   Same rules as supabase/functions/generate/lib/sse.ts:
   - chunks may split anywhere, even inside a character (TextDecoder stream);
   - lines starting with ":" are comments (the server's keep-alive ping);
   - several "data:" lines are joined with a line break;
   - data that is JSON is parsed, other data is passed on as a string;
   - "\r" is ignored.

   kdpSse.reader(onEvent)          → { push(text), end() }
   kdpSse.read(body, onEvent)      → reads a ReadableStream to the end.
═══════════════════════════════════════════════════ */

(function (root) {
  function reader(onEvent) {
    let buf = '';
    function block(b) {
      let event = 'message';
      const data = [];
      for (const line of b.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const at = line.indexOf(':');
        const field = at < 0 ? line : line.slice(0, at);
        const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (!data.length && event === 'message') return;
      const raw = data.join('\n');
      let parsed = raw;
      try { parsed = JSON.parse(raw); } catch (e) { /* not JSON: the string */ }
      onEvent({ event, data: parsed });
    }
    return {
      push(chunk) {
        buf += String(chunk).replace(/\r/g, '');
        let at;
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const b = buf.slice(0, at);
          buf = buf.slice(at + 2);
          block(b);
        }
      },
      /** The last event when the stream ends without a blank line. */
      end() {
        if (buf.trim()) block(buf);
        buf = '';
      }
    };
  }

  /** Reads a response body to its end. Rejects when the stream breaks or is aborted. */
  async function read(body, onEvent) {
    const r = reader(onEvent);
    const it = body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await it.read();
      if (done) break;
      r.push(dec.decode(value, { stream: true }));
    }
    r.push(dec.decode());
    r.end();
  }

  root.kdpSse = { reader, read };
})(globalThis);
