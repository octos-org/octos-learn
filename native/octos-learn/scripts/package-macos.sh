#!/bin/sh
set -eu
# Package Octos Learn as a macOS .app. Expected sibling checkouts:
# octos-learn, oll, makepad, octoscript-makepad, octoscript.
# Requires python3 (SHA-256 verification + catalog assembly; hashlib performs
# the same check as `shasum -a 256`). Does not install or launch the app.
crate_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
checkout_parent=$(CDPATH= cd -- "$crate_dir/../../.." && pwd)
repo_root=$(CDPATH= cd -- "$crate_dir/../.." && pwd)
archives_dir="${OCTOS_PACK_ARCHIVES:-$checkout_parent/course-packs}"
pins="$repo_root/android/embedded-course-packs.json"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$crate_dir/target}"
export MAKEPAD_PACKAGE_DIR=../Resources
cargo build --offline --locked --release --manifest-path "$crate_dir/Cargo.toml"
app="$crate_dir/dist/Octos Learn.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/makepad_widgets" \
    "$app/Contents/Resources/course-packs"
cp "$CARGO_TARGET_DIR/release/octos-learn" "$app/Contents/MacOS/octos-learn"
cp -R "$checkout_parent/makepad/widgets/resources" "$app/Contents/Resources/makepad_widgets/"

# Course packs: verify every pinned archive's SHA-256 against
# android/embedded-course-packs.json, then unpack into Resources/course-packs
# and assemble catalog.json from the verified manifests.
python3 - "$pins" "$archives_dir" "$app/Contents/Resources/course-packs" <<'PY'
import hashlib, json, pathlib, sys, zipfile

pins_path, archives_dir, out_dir = (
    sys.argv[1],
    pathlib.Path(sys.argv[2]),
    pathlib.Path(sys.argv[3]),
)
pins = json.load(open(pins_path))["packs"]
entries = []
for pin in pins:
    archive = archives_dir / f"{pin['packId']}-{pin['version']}.ocpack"
    if not archive.is_file():
        sys.exit(f"missing course pack archive: {archive}")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != pin["archiveSha256"]:
        sys.exit(
            f"SHA-256 mismatch for {archive.name}: {digest} != pinned {pin['archiveSha256']}"
        )
    target = out_dir / pin["packId"] / pin["version"]
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(target)
    manifest = json.loads((target / "manifest.json").read_text())
    if manifest["packId"] != pin["packId"] or manifest["version"] != pin["version"]:
        sys.exit(f"manifest identity mismatch in {archive.name}")
    manifest["archiveSha256"] = pin["archiveSha256"]
    manifest["embedded"] = True
    entries.append(manifest)
(out_dir / "catalog.json").write_text(
    json.dumps({"schemaVersion": 1, "packs": entries}, ensure_ascii=False, indent=1)
)
print(f"verified and unpacked {len(entries)} course pack(s)")
PY

cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>octos-learn</string>
<key>CFBundleIdentifier</key><string>cc.pitun.learn</string>
<key>CFBundleName</key><string>Octos Learn</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
printf '%s\n' "$app"
