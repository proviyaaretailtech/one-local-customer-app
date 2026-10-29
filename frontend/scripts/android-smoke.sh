#!/usr/bin/env bash
# Launch check for an Android build: installs the APK on the running emulator (or an attached phone), opens it,
# waits, and fails if the app crashed or died. Run it on every APK before anyone else installs it — a web
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

"$adb" shell am force-stop "$pkg"; "$adb" logcat -c
"$adb" shell am start -n "$pkg/.MainActivity" >/dev/null
sleep "$wait_s"

crash=$("$adb" logcat -d -b crash 2>/dev/null | grep -A3 "Process: $pkg" | head -4 || true)
js=$("$adb" logcat -d 2>/dev/null | grep -E "E ReactNativeJS" | head -3 || true)
pid=$("$adb" shell pidof "$pkg" 2>/dev/null | tr -d '\r' || true)
[[ -n "$shot" ]] && "$adb" exec-out screencap -p > "$shot"

if [[ -n "$crash" || -z "$pid" ]]; then
  echo "FAIL: $pkg ($version) crashed or closed within ${wait_s}s"
  [[ -n "$crash" ]] && echo "$crash"
  [[ -n "$js" ]] && echo "$js"
  exit 1
fi
echo "PASS: $pkg ($version) opened and is still running after ${wait_s}s"
[[ -n "$js" ]] && { echo "JS errors logged (app kept running):"; echo "$js"; }
exit 0
