// deno test --allow-read tests/user-name.test.js   (from the repo root)
// The sidebar name (js/shell.js kdpShell.nameOf, E11, owner rule 2026-10-25):
// the Settings name, else the Google profile name, else "Your account".
// Never the email.
import { assertEquals } from "jsr:@std/assert@1";

// shell.js is a browser file: give it the little it touches when it loads.
globalThis.window = globalThis;
globalThis.document = { addEventListener() {} };
(0, eval)(Deno.readTextFileSync(new URL("../js/shell.js", import.meta.url)));
const nameOf = globalThis.kdpShell.nameOf;

const user = (meta = {}) => ({ id: "u", email: "adnan@example.com", user_metadata: meta });

Deno.test("the Settings name first", () => {
  assertEquals(nameOf({ display_name: "Adnan K" }, user({ full_name: "Adnan Google" })), { name: "Adnan K", fallback: false });
});

Deno.test("then the Google profile name (full_name, then name)", () => {
  assertEquals(nameOf({ display_name: null }, user({ full_name: "Adnan Google" })), { name: "Adnan Google", fallback: false });
  assertEquals(nameOf(null, user({ name: "Adnan N" })), { name: "Adnan N", fallback: false });
  assertEquals(nameOf({ display_name: "   " }, user({ full_name: " Adnan " })), { name: "Adnan", fallback: false });
});

Deno.test("then \"Your account\"; never the email", () => {
  assertEquals(nameOf({ display_name: null }, user()), { name: "Your account", fallback: true });
  assertEquals(nameOf(null, { id: "u", email: "adnan@example.com" }), { name: "Your account", fallback: true });
  assertEquals(nameOf(null, null), { name: "Your account", fallback: true });
  for (const v of [nameOf(null, user()), nameOf({}, user({ full_name: "" }))]) assertEquals(v.name.includes("@"), false);
});
