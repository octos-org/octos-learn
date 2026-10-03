#!/bin/bash
# Installs the drawer, then rebinds the native slot (Horion resets it on APK update).
set -euo pipefail
if [ "$#" -ne 1 ]; then
    echo "Usage: bash install-horion.sh <adb-device-serial>" >&2
    exit 1
fi
TASK_DEVICE="$1"
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK_REPO="$(cd "$TASK_DIR/../../.." && pwd)"
TASK_OUT="${OCTOS_DRAWER_OUTPUT:-$TASK_REPO/delivery/horion-app-drawer}"
TASK_ADB="${OCTOS_DRAWER_ADB:-$(command -v adb || true)}"
if [ -z "$TASK_ADB" ]; then
    TASK_ADB="/opt/homebrew/share/android-commandlinetools/platform-tools/adb"
fi
if [ ! -x "$TASK_ADB" ] || [ ! -f "$TASK_OUT/Octos-All-Apps.apk" ]; then
    echo "ADB or built APK missing. Run build.sh first." >&2
    exit 1
fi
TASK_CUSTOMER="$("$TASK_ADB" -s "$TASK_DEVICE" shell getprop ro.build.soft.customer | tr -d '\r')"
if [ "$TASK_CUSTOMER" != "HORION" ]; then
    echo "Refusing to change sidebar settings on a non-Horion device." >&2
    exit 1
fi
TASK_BACKUP="$TASK_OUT/before-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TASK_BACKUP"
"$TASK_ADB" -s "$TASK_DEVICE" shell settings get global personal_horionbar_app2 > "$TASK_BACKUP/app2.txt"
"$TASK_ADB" -s "$TASK_DEVICE" shell getprop persist.sys.horion.personal.mode > "$TASK_BACKUP/personal-mode.txt"
"$TASK_ADB" -s "$TASK_DEVICE" install --no-incremental -r "$TASK_OUT/Octos-All-Apps.apk"
"$TASK_ADB" -s "$TASK_DEVICE" shell pm path cc.pitun.appdrawer
"$TASK_ADB" -s "$TASK_DEVICE" shell settings put global personal_horionbar_app2 cc.pitun.appdrawer
"$TASK_ADB" -s "$TASK_DEVICE" shell su 0 setprop persist.sys.horion.personal.mode true
"$TASK_ADB" -s "$TASK_DEVICE" shell am broadcast -a com.horion.horionSettionMenu.personal.modeChange -p com.horion.horionbar
echo "Installed and bound to native sidebar slot 2. Previous configuration: $TASK_BACKUP"
