//! Fails the build when the pinned Makepad checkout lacks the local patches
//! this app needs (see native/patches/ and NATIVE_MACOS_PROGRESS.md).
use std::path::Path;

fn main() {
    let makepad = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../makepad");
    let checks = [(
        "makepad-825dbb4-vector-color-unorm8.patch",
        "platform/src/draw_shader.rs",
        "pub fn f32_buffer_compatible",
    )];
    for (patch, file, marker) in checks {
        let path = makepad.join(file);
        println!("cargo:rerun-if-changed={}", path.display());
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        if !text.contains(marker) {
            panic!(
                "Makepad checkout {} is missing native/patches/{patch}; apply it with \
                 `git -C <makepad> apply <octos-learn>/native/patches/{patch}`",
                makepad.display()
            );
        }
    }
}
