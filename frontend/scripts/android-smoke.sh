#!/usr/bin/env bash
# Launch check for an Android build: installs the APK on the running emulator (or an attached phone), clears its
# data, opens it like a new customer, walks language → Latur → Discover → Home, and fails if the app crashed,
# showed the "Something went wrong" screen, or could not reach a screen. Run it on every APK before anyone else installs it — a web
# check does not catch Android-only failures (module load order, native modules, the press wrapper in src/native/).
#
#   scripts/android-smoke.sh path/to/app.apk [seconds=20] [screenshot.png]
#
# Start an emulator first: "$ANDROID_HOME/emulator/emulator" -avd Pixel_7
# On an emulator a build signed with another key is uninstalled first (its test data goes); on a real phone
# the script stops instead, so nobody's data is wiped.
set -euo pipefail
apk="${1:?usage: android-smoke.sh app.apk [seconds] [screenshot.png]}"; wait_s="${2:-20}"; shot="${3:-}"
pkg=com.proviyaa.onelatur
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"

"$adb" get-state >/dev/null 2>&1 || { echo "FAIL: no emulator or phone attached"; exit 2; }
emulator=$("$adb" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')

if ! out=$("$adb" install -r "$apk" 2>&1); then
  if [[ "$out" == *INSTALL_FAILED_UPDATE_INCOMPATIBLE* && "$emulator" == "1" ]]; then
    "$adb" uninstall "$pkg" >/dev/null; "$adb" install "$apk" >/dev/null
  else echo "FAIL: install: ${out##*$'\n'}"; exit 1; fi
fi
version=$("$adb" shell dumpsys package "$pkg" | grep -m1 -o 'versionCode=[0-9]*')

"$adb" shell am force-stop "$pkg"
# A first launch (intro + language). Only on an emulator: on a real phone this would wipe the person's data.
[[ "$emulator" == "1" ]] && { "$adb" shell pm clear "$pkg" >/dev/null 2>&1 || true; }
"$adb" logcat -c
"$adb" shell am start -n "$pkg/.MainActivity" >/dev/null
sleep "$wait_s"

# Tap the first on-screen element whose text or description is exactly $1 (uiautomator, so no fixed coordinates).
tap_text() {
  "$adb" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 1
  local xy; xy=$("$adb" exec-out cat /sdcard/ui.xml | python3 -c '
import re, sys
want = sys.argv[1]; xml = sys.stdin.read()
for node in re.findall(r"<node [^>]*>", xml):
    if re.search(r"(text|content-desc)=\"%s\"" % re.escape(want), node):
        x1, y1, x2, y2 = map(int, re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", node).groups())
        print((x1 + x2) // 2, (y1 + y2) // 2); break' "$1")
  [[ -n "$xy" ]] || { echo "  (could not find \"$1\" on screen)"; return 1; }
  "$adb" shell input tap $xy; sleep "${2:-5}"
}
# Tap the first element whose testID (Android resource-id) starts with $1.
tap_id() {
  "$adb" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 1
  local xy; xy=$("$adb" exec-out cat /sdcard/ui.xml | python3 -c '
import re, sys
want = sys.argv[1]; xml = sys.stdin.read()
for node in re.findall(r"<node [^>]*>", xml):
    if re.search(r"resource-id=\"%s" % re.escape(want), node):
        x1, y1, x2, y2 = map(int, re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", node).groups())
        print((x1 + x2) // 2, (y1 + y2) // 2); break' "$1")
  [[ -n "$xy" ]] || { echo "  (could not find id \"$1*\" on screen)"; return 1; }
  "$adb" shell input tap $xy; sleep "${2:-5}"
}
# The path a new customer takes, ending by leaving Discover (its videos are released on the way out).
walk="ok"
tap_text "Continue" 5 || walk="incomplete"
tap_text "Latur" 8 || walk="incomplete"
tap_id "tab-reels" 8 || walk="incomplete"   # Discover (the round button; its label is not tappable)
# Scroll Discover down and back up: playing tiles scroll out of view and their video players are released.
# Open a playing reel tile (Discover loses focus, every tile video is released), then come back.
tap_id "discover-tile-" 6 || walk="incomplete"
"$adb" shell input keyevent 4; sleep 4
for dir in up up down down; do
  if [[ $dir == up ]]; then "$adb" shell input swipe 540 1900 540 900 300; else "$adb" shell input swipe 540 900 540 1900 300; fi; sleep 3
done
tap_id "tab-home" 5 || walk="incomplete"

crash=$("$adb" logcat -d -b crash 2>/dev/null | grep -A3 "Process: $pkg" | head -4 || true)
# "Something went wrong" keeps the process alive, so the error boundary's log line counts as a failure too.
boundary=$("$adb" logcat -d 2>/dev/null | grep -m3 -E "ErrorBoundary\]|render crash" || true)
js=$("$adb" logcat -d 2>/dev/null | grep -E "E ReactNativeJS" | head -3 || true)
pid=$("$adb" shell pidof "$pkg" 2>/dev/null | tr -d '\r' || true)
[[ -n "$shot" ]] && "$adb" exec-out screencap -p > "$shot"

if [[ -n "$crash" || -n "$boundary" || -z "$pid" ]]; then
  echo "FAIL: $pkg ($version) crashed, showed the error screen, or closed (walk: $walk)"
  [[ -n "$crash" ]] && echo "$crash"
  [[ -n "$boundary" ]] && echo "$boundary"
  [[ -n "$js" ]] && echo "$js"
  exit 1
fi
[[ "$walk" == "ok" ]] || { echo "FAIL: $pkg ($version) stayed up but the walk could not reach every screen"; exit 1; }
echo "PASS: $pkg ($version) first launch, language, Latur, Discover and back to Home with no crash or error screen"
[[ -n "$js" ]] && { echo "JS errors logged (app kept running):"; echo "$js"; }
exit 0
