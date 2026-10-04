#!/bin/bash
# Standalone Android SDK build; no Gradle, Node, WebView, or OctoSense rebuild.
set -euo pipefail
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK_REPO="$(cd "$TASK_DIR/../../.." && pwd)"
TASK_SDK="${OCTOS_DRAWER_SDK_ROOT:-$TASK_REPO/../makepad/tools/cargo_makepad/android_33_macos_aarch64}"
TASK_BUILD_TOOLS="$TASK_SDK/build-tools/33.0.1"
TASK_ANDROID_JAR="$TASK_SDK/platforms/android-33-ext4/android.jar"
TASK_JAVA="${OCTOS_DRAWER_JAVA_ROOT:-$TASK_SDK/openjdk}"
TASK_KEYSTORE="${OCTOS_DRAWER_KEYSTORE:-$TASK_REPO/../makepad/tools/cargo_makepad/debug.keystore}"
TASK_OUT="${OCTOS_DRAWER_OUTPUT:-$TASK_REPO/delivery/horion-app-drawer}"
for TASK_REQUIRED in "$TASK_BUILD_TOOLS/aapt2" "$TASK_ANDROID_JAR" "$TASK_JAVA/bin/javac" "$TASK_KEYSTORE"; do
    if [ ! -f "$TASK_REQUIRED" ]; then
        echo "Missing build dependency: $TASK_REQUIRED" >&2
        exit 1
    fi
done
mkdir -p "$TASK_OUT/classes" "$TASK_OUT/generated" "$TASK_OUT/dex"
"$TASK_BUILD_TOOLS/aapt2" compile --dir "$TASK_DIR/res" -o "$TASK_OUT/resources.zip"
"$TASK_BUILD_TOOLS/aapt2" link -o "$TASK_OUT/unsigned.apk" -I "$TASK_ANDROID_JAR" \
    --manifest "$TASK_DIR/AndroidManifest.xml" --java "$TASK_OUT/generated" "$TASK_OUT/resources.zip"
TASK_SOURCES=()
while IFS= read -r TASK_FILE; do TASK_SOURCES+=("$TASK_FILE"); done < <(find "$TASK_DIR/src" "$TASK_OUT/generated" -name '*.java')
"$TASK_JAVA/bin/javac" -source 8 -target 8 -nowarn -encoding UTF-8 \
    -classpath "$TASK_ANDROID_JAR" -d "$TASK_OUT/classes" "${TASK_SOURCES[@]}"
TASK_CLASSES=()
while IFS= read -r TASK_FILE; do TASK_CLASSES+=("$TASK_FILE"); done < <(find "$TASK_OUT/classes" -name '*.class')
"$TASK_JAVA/bin/java" -cp "$TASK_BUILD_TOOLS/lib/d8.jar" com.android.tools.r8.D8 \
    --min-api 26 --classpath "$TASK_ANDROID_JAR" --output "$TASK_OUT/dex" "${TASK_CLASSES[@]}"
(cd "$TASK_OUT/dex" && zip -q "$TASK_OUT/unsigned.apk" classes.dex)
"$TASK_BUILD_TOOLS/zipalign" -f 4 "$TASK_OUT/unsigned.apk" "$TASK_OUT/aligned.apk"
"$TASK_JAVA/bin/java" -jar "$TASK_BUILD_TOOLS/lib/apksigner.jar" sign \
    -ks "$TASK_KEYSTORE" --ks-key-alias androiddebugkey --ks-pass pass:android \
    --out "$TASK_OUT/Octos-All-Apps.apk" "$TASK_OUT/aligned.apk"
"$TASK_JAVA/bin/java" -jar "$TASK_BUILD_TOOLS/lib/apksigner.jar" verify "$TASK_OUT/Octos-All-Apps.apk"
echo "Built: $TASK_OUT/Octos-All-Apps.apk"
