//! Course pack discovery and loading for the native product shell.
//! Packs are pre-extracted from .ocpack archives at package time; the bytes
//! are verified against android/embedded-course-packs.json before staging.
use serde_json::Value;
use std::path::PathBuf;

pub fn pack_root() -> PathBuf {
    if let Ok(dir) = std::env::var("OCTOS_LEARN_PACK_DIR") {
        return PathBuf::from(dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        let bundled = exe
            .parent()
            .map(|p| p.join("../Resources/course-packs"))
            .unwrap_or_default();
        if bundled.join("catalog.json").is_file() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("course-packs")
}

pub fn catalog(root: &std::path::Path) -> Result<Vec<Value>, String> {
    let raw = std::fs::read_to_string(root.join("catalog.json"))
        .map_err(|e| format!("无法读取课程目录：{e}"))?;
    let catalog: Value = serde_json::from_str(&raw).map_err(|e| format!("课程目录损坏：{e}"))?;
    catalog["packs"]
        .as_array()
        .cloned()
        .ok_or_else(|| "课程目录缺少 packs".to_string())
}

pub fn load_source(root: &std::path::Path, pack_id: &str, version: &str) -> Result<String, String> {
    let dir = root.join(pack_id).join(version);
    let manifest_raw = std::fs::read_to_string(dir.join("manifest.json"))
        .map_err(|e| format!("无法读取课程包清单：{e}"))?;
    let manifest: Value =
        serde_json::from_str(&manifest_raw).map_err(|e| format!("课程包清单损坏：{e}"))?;
    if manifest["packId"].as_str() != Some(pack_id) || manifest["version"].as_str() != Some(version)
    {
        return Err("课程包清单与请求不一致".into());
    }
    let entry = manifest["entry"].as_str().unwrap_or("course.oll.jsonl");
    std::fs::read_to_string(dir.join(entry)).map_err(|e| format!("无法读取课程内容：{e}"))
}
