#!/bin/sh
set -eu
# Expected sibling checkouts: octos-learn, oll, makepad, octoscript-makepad, octoscript.
crate_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
checkout_parent=$(CDPATH= cd -- "$crate_dir/../../.." && pwd)
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$crate_dir/target}"
export MAKEPAD_PACKAGE_DIR=../Resources
cargo build --offline --locked --release --manifest-path "$crate_dir/Cargo.toml"
app="$crate_dir/dist/Octos OLL Preview.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/makepad_widgets"
cp "$CARGO_TARGET_DIR/release/octos-oll-preview" "$app/Contents/MacOS/octos-oll-preview"
cp -R "$checkout_parent/makepad/widgets/resources" "$app/Contents/Resources/makepad_widgets/"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>octos-oll-preview</string>
<key>CFBundleIdentifier</key><string>org.octos.oll-preview</string>
<key>CFBundleName</key><string>Octos OLL Preview</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
printf '%s\n' "$app"
