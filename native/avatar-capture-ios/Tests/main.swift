import Foundation

precondition(AvatarChannels.names.count == 52)
let recorder = AvatarTrackRecorder()
recorder.begin(at: 1000)
precondition(recorder.append(AvatarPerformanceFrame(timeMs: 1000, tracked: true, channels: ["jawOpen": 0.125678, "private": 1], rotation: [0, 0.2, 0])))
precondition(recorder.append(AvatarPerformanceFrame(timeMs: 1050, tracked: false, channels: ["jawOpen": 0.1], rotation: [0, 0.1, 0])))
precondition(!recorder.append(AvatarPerformanceFrame(timeMs: 62_000, tracked: true, channels: [:], rotation: [0, 0, 0])))
let track = recorder.finish(at: 1100)
precondition(track.frames.count == 2 && track.durationMs == 100)
precondition(track.frames[0].channels["private"] == nil)
precondition(track.frames[1].channels["jawOpen"] == 0.1)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
print(String(data: try encoder.encode(track), encoding: .utf8)!)
