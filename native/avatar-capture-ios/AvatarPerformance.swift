import Foundation

enum AvatarChannels {
    static let names = Set("""
    browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight
    cheekPuff cheekSquintLeft cheekSquintRight eyeBlinkLeft eyeBlinkRight
    eyeLookDownLeft eyeLookDownRight eyeLookInLeft eyeLookInRight eyeLookOutLeft eyeLookOutRight
    eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight
    jawForward jawLeft jawOpen jawRight mouthClose mouthDimpleLeft mouthDimpleRight
    mouthFrownLeft mouthFrownRight mouthFunnel mouthLeft mouthLowerDownLeft mouthLowerDownRight
    mouthPressLeft mouthPressRight mouthPucker mouthRight mouthRollLower mouthRollUpper
    mouthShrugLower mouthShrugUpper mouthSmileLeft mouthSmileRight mouthStretchLeft mouthStretchRight
    mouthUpperUpLeft mouthUpperUpRight noseSneerLeft noseSneerRight tongueOut
    """.split(whereSeparator: { $0.isWhitespace }).map(String.init))
}

struct AvatarPerformanceFrame: Codable {
    var timeMs: Double
    var source = "arkit"
    var tracked: Bool
    var channels: [String: Double]
    var rotation: [Double]
}

struct AvatarPerformanceTrack: Codable {
    var schema = "octos.avatar-performance.v1"
    var durationMs: Double
    var frames: [AvatarPerformanceFrame]
}

/// Bounded parameter-only recording, compatible with the browser lab importer.
final class AvatarTrackRecorder {
    private var origin: Double?
    private var frames: [AvatarPerformanceFrame] = []
    func begin(at timeMs: Double) { origin = timeMs; frames = [] }
    @discardableResult func append(_ input: AvatarPerformanceFrame) -> Bool {
        guard let origin = origin, input.timeMs.isFinite else { return false }
        let time = input.timeMs - origin
        guard time >= 0, time <= 60_000, frames.count < 1801 else { return false }
        if let previous = frames.last, time - previous.timeMs < 1000.0 / 30.0 { return true }
        let channels = input.channels.reduce(into: [String: Double]()) { output, item in
            if AvatarChannels.names.contains(item.key), item.value.isFinite {
                output[item.key] = (min(1, max(0, item.value)) * 10_000).rounded() / 10_000
            }
        }
        let rotation = input.rotation.count == 3 ? input.rotation.map { value in
            value.isFinite ? (min(1.25, max(-1.25, value)) * 10_000).rounded() / 10_000 : 0
        } : [0, 0, 0]
        frames.append(AvatarPerformanceFrame(timeMs: time, tracked: input.tracked, channels: channels, rotation: rotation))
        return true
    }
    func finish(at timeMs: Double) -> AvatarPerformanceTrack {
        let duration = min(60_000, max(frames.last?.timeMs ?? 0, timeMs - (origin ?? timeMs)))
        origin = nil
        return AvatarPerformanceTrack(durationMs: duration, frames: frames)
    }
}

struct AvatarExpressionFilter {
    private var previous: AvatarPerformanceFrame?
    private var neutral: AvatarPerformanceFrame?
    mutating func calibrate(_ frame: AvatarPerformanceFrame) { if frame.tracked { neutral = frame } }
    mutating func reset() { previous = nil; neutral = nil }
    mutating func apply(_ input: AvatarPerformanceFrame) -> AvatarPerformanceFrame {
        let delta = min(100, max(0, input.timeMs - (previous?.timeMs ?? input.timeMs - 100)))
        var output = input
        let names = Set(input.channels.keys).union(previous.map { Array($0.channels.keys) } ?? [])
        output.channels = names.reduce(into: [String: Double]()) { values, key in
            let baseline = min(0.3, neutral?.channels[key] ?? 0)
            let target = input.tracked ? min(1, max(0, ((input.channels[key] ?? 0) - baseline) / (1 - baseline))) : 0
            let tau = !input.tracked ? 180.0 : (key.hasPrefix("mouth") || key.hasPrefix("jaw") || key == "tongueOut") ? 22.0 : 65.0
            let old = previous?.channels[key] ?? 0
            values[key] = old + (1 - exp(-delta / tau)) * (target - old)
        }
        output.rotation = (0..<3).map { index in
            let value = input.rotation.count == 3 ? input.rotation[index] : 0
            let target = input.tracked ? min(1, max(-1, value - (neutral?.rotation[index] ?? 0))) : 0
            let old = previous?.rotation[index] ?? 0
            return old + (1 - exp(-delta / (input.tracked ? 65 : 180))) * (target - old)
        }
        // Preserve the channel decay on loss for the test renderer. The tracked
        // flag still allows a reader to choose its own neutral transition.
        previous = output
        return output
    }
}
