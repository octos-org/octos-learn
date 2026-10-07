#!/usr/bin/env python3
"""Build an independent ARM64 performance APK. Never installs or changes SDKs."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import zipfile

PACKAGE = "cc.pitun.learn.makepadtest"
LABEL = "Octos Learn 原生测试"
VERSION_CODE = "202610071"
VERSION_NAME = "0.1.0-makepad-test-20261007.2"
MAKEPAD_PIN = "825dbb422c6d7926e111e2ee7831d697870d8671"


def run(args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", required=True)
    parser.add_argument("--cargo-makepad", required=True)
    parser.add_argument("--target-dir", required=True)
    parser.add_argument("--archives", required=True)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()
    crate = Path(__file__).resolve().parents[1]
    makepad = crate.parents[2] / "makepad"
    sdk = Path(args.sdk).resolve()
    target = Path(args.target_dir).resolve()
    archives = Path(args.archives).resolve()
    builder = Path(args.cargo_makepad).resolve()
    revision = subprocess.check_output(["git", "-C", str(makepad), "rev-parse", "HEAD"], text=True).strip()
    if revision != MAKEPAD_PIN:
        raise SystemExit(f"Expected pinned Makepad {MAKEPAD_PIN}; found {revision}")
    env = dict(os.environ, CARGO_TARGET_DIR=str(target), CARGO_NET_OFFLINE="true",
               JAVA_HOME=str(sdk / "openjdk"))
    env.pop("MAKEPAD_PACKAGE_DIR", None)
    if not args.skip_build:
        run([builder, "android", "--abi=aarch64", "--min-sdk-version=26",
             f"--sdk-path={sdk}", f"--package-name={PACKAGE}", f"--app-label={LABEL}",
             f"--version-code={VERSION_CODE}", f"--version-name={VERSION_NAME}",
             "--no-icon", "build", "-p", "octos-learn", "--release", "--locked"],
            cwd=crate, env=env)

    build = target / "makepad-android-apk/octos_learn"
    base_apks = [p for p in (build / "apk").glob("*.apk") if not p.name.endswith(".unaligned.apk")]
    if len(base_apks) != 1:
        raise SystemExit(f"Expected one base APK, found {base_apks}")
    java = sdk / "openjdk/bin/java"
    javac = sdk / "openjdk/bin/javac"
    tools = sdk / "build-tools/33.0.1"
    android_jar = sdk / "platforms/android-33-ext4/android.jar"
    output = target.parent / "Octos-Learn-Makepad-Test.apk"
    target.parent.mkdir(parents=True, exist_ok=True)

    # The cached cargo-makepad tool may predate this pin's Java integration.
    # Recompile the Java host from the same pin as Rust, using installed SDK tools.
    # Do not change or rebuild the cached third-party tool or its checkout.
    with tempfile.TemporaryDirectory(prefix="android-test-", dir=target.parent) as temporary:
        work = Path(temporary)
        classes = work / "classes"
        dex = work / "dex"
        classes.mkdir()
        dex.mkdir()
        sources = sorted((makepad / "tools/cargo_makepad/src/android/java/dev/makepad/android").glob("*.java"))
        sources += [build / "tmp/dev/makepad/android/R.java",
                    crate / "resources/android/java/MakepadApp.java"]
        run([javac, "-encoding", "UTF-8", "-source", "1.8", "-target", "1.8",
             "-Xlint:-options", "-classpath", android_jar, "-d", classes, *sources], env=env)
        run([java, "-cp", tools / "lib/d8.jar", "com.android.tools.r8.D8",
             "--release", "--min-api", "26", "--classpath", android_jar,
             "--output", dex, *sorted(classes.rglob("*.class"))], env=env)

        lock_bytes = (crate / "course-packs.lock.json").read_bytes()
        lock = json.loads(lock_bytes)
        entries = []
        course_prefix = "assets/makepad/octos_learn/resources/course-packs"
        unsigned = work / "unsigned.apk"
        with zipfile.ZipFile(unsigned, "w", compression=zipfile.ZIP_DEFLATED) as apk:
            with zipfile.ZipFile(base_apks[0]) as base:
                for member in base.infolist():
                    if member.filename.startswith("META-INF/") or member.filename.endswith(".dex"):
                        continue
                    apk.writestr(member, base.read(member))
            for file in sorted(dex.glob("*.dex")):
                apk.write(file, file.name)
            # These dynamic FontMembers use assets/, which cargo-makepad's
            # normal resources/ collector does not include.
            for file in sorted((crate / "assets").rglob("*")):
                if file.is_file():
                    apk.write(file, f"assets/makepad/octos_learn/assets/{file.relative_to(crate / 'assets').as_posix()}")
            for pin in lock["packs"]:
                archive = archives / f"{pin['packId']}-{pin['version']}.ocpack"
                data = archive.read_bytes()
                if len(data) != pin["archiveBytes"] or hashlib.sha256(data).hexdigest() != pin["archiveSha256"]:
                    raise SystemExit(f"Pinned course archive verification failed: {archive}")
                prefix = f"{course_prefix}/{pin['packId']}/{pin['version']}"
                with zipfile.ZipFile(archive) as course:
                    manifest = json.loads(course.read("manifest.json"))
                    if manifest["packId"] != pin["packId"] or manifest["version"] != pin["version"]:
                        raise SystemExit(f"Course identity mismatch: {archive}")
                    for member in course.infolist():
                        path = PurePosixPath(member.filename)
                        if path.is_absolute() or ".." in path.parts:
                            raise SystemExit(f"Unsafe course path: {member.filename}")
                        if not member.is_dir():
                            apk.writestr(f"{prefix}/{member.filename}", course.read(member))
                manifest.update(archiveSha256=pin["archiveSha256"], embedded=True)
                entries.append(manifest)
            apk.writestr(f"{course_prefix}/catalog.json",
                         json.dumps({"schemaVersion": 1, "packs": entries}, ensure_ascii=False))
            apk.writestr(f"{course_prefix}/build-id.txt", hashlib.sha256(lock_bytes).hexdigest())
        aligned = work / "aligned.apk"
        run([tools / "zipalign", "-f", "4", unsigned, aligned])
        run([java, "-jar", tools / "lib/apksigner.jar", "sign",
             "--ks", makepad / "tools/cargo_makepad/debug.keystore",
             "--ks-pass", "pass:android", "--out", output, aligned], env=env)
        run([java, "-jar", tools / "lib/apksigner.jar", "verify", "--verbose", output], env=env)

    badging = subprocess.check_output([str(tools / "aapt"), "dump", "badging", str(output)], text=True)
    if f"package: name='{PACKAGE}'" not in badging or f"application-label:'{LABEL}'" not in badging:
        raise SystemExit("Final APK package identity or label mismatch")
    (target.parent / "apk-badging.txt").write_text(badging)
    (target.parent / "apk-build.json").write_text(json.dumps({
        "package": PACKAGE, "label": LABEL, "makepad": revision,
        "versionCode": int(VERSION_CODE), "versionName": VERSION_NAME,
        "productHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=crate, text=True).strip(),
        "productDirty": bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=crate, text=True).strip()),
        "rustProfile": "release", "abi": "arm64-v8a", "minSdk": 26,
        "coursePacks": len(entries), "apk": str(output),
        "apkBytes": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "cachedBuildTool": str(builder), "javaHostSource": str(makepad),
    }, ensure_ascii=False, indent=2) + "\n")
    print(f"Verified {len(entries)} pinned course packs; independent test APK: {output}")


if __name__ == "__main__":
    main()
