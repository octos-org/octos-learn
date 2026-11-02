import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FACE_CHANNELS } from "../src/learning/avatar/face-frame";
import { parseAvatarTrack } from "../src/learning/avatar/performance-track";

const root = process.cwd();
const native = path.join(root, "native/avatar-capture-ios");
const output = mkdtempSync(path.join(tmpdir(), "octos-avatar-native-"));
const source = readFileSync(path.join(native, "AvatarPerformance.swift"), "utf8");
const names = source.match(/static let names = Set\("""([\s\S]*?)"""/u)?.[1]?.trim().split(/\s+/u).sort();
if (JSON.stringify(names) !== JSON.stringify([...FACE_CHANNELS].sort())) throw new Error("Swift/browser face channel lists differ");
execFileSync("swiftc", ["-module-cache-path", path.join(output, "module-cache"), path.join(native, "AvatarPerformance.swift"), path.join(native, "Tests/main.swift"), "-o", path.join(output, "contract-check")], { stdio: "pipe" });
const result = JSON.parse(execFileSync(path.join(output, "contract-check"), { encoding: "utf8" }));
const track = parseAvatarTrack(result);
if (track.frames[0]?.source !== "arkit" || track.frames[0]?.channels.jawOpen !== .1257 || track.frames[1]?.tracked !== false || track.frames[1]?.channels.jawOpen !== .1) throw new Error("Native track did not survive browser validation");
console.log("Swift parameter recorder compiled and passed browser track validation (52 matching channels). iOS ARKit runtime was not compiled or tested.");
