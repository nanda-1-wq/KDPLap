#!/bin/zsh
# Mocked browser checks (no sign-in, no real data). Needs the static server on
# port 5500 and playwright-cli. Every Supabase call is answered by the mock.
#   tests/browser/run.sh <suite> <test.js>
#   tests/browser/run.sh title t1.js
# Suites: brief (step 01), research (step 02), positioning (step 03),
# title (step 04), delete (Delete book dialog).
# A suite's mock.js defines setup(page); each test file defines test(page).
set -euo pipefail
HERE=${0:A:h}
ROOT=${HERE:h:h}
SUITE=${1:?suite}; FILE=${2:?test file}
CACHE=$HERE/.cache; SHOTS=$HERE/shots/$SUITE
mkdir -p "$CACHE" "$SHOTS"

# supabase-js 2.49.4, checked against the SRI hash the app pages use (jsdelivr is slow in the test browser).
SB=$CACHE/supabase-2.49.4.js
if [[ ! -s $SB ]]; then
  curl -fsSL https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js -o "$SB"
fi
WANT=$(grep -A1 'supabase-js@2.49.4/dist/umd/supabase.js' "$ROOT/app/topic-lab.html" | grep -o 'sha384-[^"]*')
GOT="sha384-$(openssl dgst -sha384 -binary "$SB" | base64)"
[[ $GOT == "$WANT" ]] || { rm -f "$SB"; echo "run.sh: supabase-js hash mismatch"; exit 1; }

# Old file versions some tests load to prove a fixed bug (from git, never edited).
[[ -s $CACHE/old-book-positioning.js ]] || git -C "$ROOT" show 32f9dfa:js/book-positioning.js > "$CACHE/old-book-positioning.js"
[[ -s $CACHE/old-book-brief.js ]] || git -C "$ROOT" show 32f9dfa:js/book-brief.js > "$CACHE/old-book-brief.js"

MOCK=""; [[ -f $HERE/$SUITE/mock.js ]] && MOCK=$(cat "$HERE/$SUITE/mock.js")
CODE="async page => { const CACHE = '$CACHE'; const SHOTS = '$SHOTS';
$MOCK
$(cat "$HERE/$SUITE/$FILE")
globalThis.__modes = {}; const perr = []; page.on('pageerror', (e) => perr.push(e.message));
if (typeof setup === 'function') await setup(page);
try { const out = await test(page); return out + (perr.length ? '\nPAGEERR ' + perr.join(' | ') : ''); }
catch (e) { return (globalThis.__log || []).join('\n') + '\nERR ' + e.message + ' @ ' + page.url() + (perr.length ? '\nPAGEERR ' + perr.join(' | ') : ''); } }"
playwright-cli list 2>/dev/null | grep -q "kdp-$SUITE" || playwright-cli -s="kdp-$SUITE" open >/dev/null
playwright-cli -s="kdp-$SUITE" run-code "$CODE" 2>&1 | sed -n '/### Result/,/### Ran/p' | sed 's/\\n/\n/g'
