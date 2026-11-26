#!/bin/sh
# Headless screenshots of one direction: every screen, light and dark, phone (390x844) and desktop (1280x800).
# Never opens a visible browser. Usage: docs/redesign/tools/shoot.sh <id> [out-dir]
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
ID=$1; OUT=${2:-"$DIR/directions/$ID/shots"}
[ -f "$DIR/directions/$ID/app.html" ] || { echo "no $DIR/directions/$ID/app.html"; exit 1; }
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF=$(mktemp -d)
mkdir -p "$OUT"
for s in home add transactions budget analytics; do for t in light dark; do
  APP="file://$DIR/directions/$ID/app.html?screen=$s&theme=$t"
  # Chrome headless will not make a window narrower than ~500px, so the phone is an iframe of 390px.
  printf '<body style="margin:0;background:#777"><iframe src="%s" style="width:390px;height:844px;border:0;display:block"></iframe></body>' "$APP" > "$PROF/phone.html"
  "$CH" --headless=new --hide-scrollbars --allow-file-access-from-files --user-data-dir="$PROF" --virtual-time-budget=2500 --window-size=390,844 --screenshot="$OUT/$s-$t-phone.png" "file://$PROF/phone.html" >/dev/null 2>&1
  "$CH" --headless=new --hide-scrollbars --allow-file-access-from-files --user-data-dir="$PROF" --virtual-time-budget=2500 --window-size=1280,800 --screenshot="$OUT/$s-$t-desktop.png" "$APP" >/dev/null 2>&1
done; done
rm -rf "$PROF"
echo "$OUT"
