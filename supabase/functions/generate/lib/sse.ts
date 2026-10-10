/* generate lib: server-sent events (E10.2). Reads the Anthropic stream and
   writes ours. Pure; tested in lib.section_write.test.ts. */

export type SseEvent = { event: string; data: unknown };

/**
 * An incremental SSE reader: push text chunks as they come (they may split
 * anywhere), get whole events. Comment lines (":") are skipped, several
 * "data:" lines are joined with a line break, data that is not JSON is
 * passed on as a string. "\r" is ignored.
 */
export function sseReader(onEvent: (e: SseEvent) => void) {
  let buf = "";
  function block(b: string) {
    let event = "message";
    const data: string[] = [];
    for (const line of b.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const at = line.indexOf(":");
      const field = at < 0 ? line : line.slice(0, at);
      const value = at < 0 ? "" : line.slice(at + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (!data.length && event === "message") return;
    const raw = data.join("\n");
    let parsed: unknown = raw;
    try { parsed = JSON.parse(raw); } catch { /* not JSON: the string */ }
    onEvent({ event, data: parsed });
  }
  return {
    push(chunk: string) {
      buf += chunk.replace(/\r/g, "");
      let at: number;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const b = buf.slice(0, at);
        buf = buf.slice(at + 2);
        block(b);
      }
    },
    /** The last event when the stream ends without a blank line. */
    end() {
      if (buf.trim()) block(buf);
      buf = "";
    },
  };
}

/** One of our events for the browser. */
export const sseEvent = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
/** A keep-alive comment (the browser's reader skips it). */
export const ssePing = ": ping\n\n";
