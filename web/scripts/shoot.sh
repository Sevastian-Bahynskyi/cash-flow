#!/bin/sh
# Headless screenshots of the demo app (NEXT_PUBLIC_DEMO=1 dev server): phone 390 and desktop 1280, light and dark.
# Usage: scripts/shoot.sh <out-dir> [base-url] [paths...]   e.g. scripts/shoot.sh /tmp/shots http://localhost:3217 / /budgets
set -e
OUT=$1; BASE=${2:-http://localhost:3217}; shift 2 2>/dev/null || shift $#
PATHS=${*:-"/ /budgets /where /transactions /people /shared /bank /categories /rules /profile"}
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"
for p in $PATHS; do
  name=$(echo "$p" | sed 's#^/##; s#[/?=&]#-#g'); [ -z "$name" ] && name=cycle
  for t in light dark; do
    PROF=$(mktemp -d)
    FLAG="--blink-settings=preferredColorScheme=1"; [ $t = dark ] && FLAG="--blink-settings=preferredColorScheme=0"
    # Chrome headless will not make a window narrower than ~500px, so the phone is a 390px iframe in a tall page.
    printf '<body style="margin:0;background:#777"><iframe src="%s%s" style="width:390px;height:1700px;border:0;display:block"></iframe></body>' "$BASE" "$p" > "$PROF/phone.html"
    "$CH" --headless=new --hide-scrollbars $FLAG --user-data-dir="$PROF" --virtual-time-budget=6000 --window-size=390,1700 --screenshot="$OUT/$name-$t-phone.png" "file://$PROF/phone.html" >/dev/null 2>&1
    "$CH" --headless=new --hide-scrollbars $FLAG --user-data-dir="$PROF" --virtual-time-budget=6000 --window-size=1280,900 --screenshot="$OUT/$name-$t-desktop.png" "$BASE$p" >/dev/null 2>&1
    rm -rf "$PROF"
  done
done
echo "$OUT"
