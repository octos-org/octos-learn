import ARKit
import AVFoundation
import Combine
import Foundation
import simd

/// Delegate callbacks and UI actions run on the main queue. No networking or video files.
final class FaceCaptureModel: NSObject, ObservableObject, ARSessionDelegate {
    @Published private(set) var running = false
    @Published private(set) var tracking = false
    @Published private(set) var recording = false
    @Published private(set) var status = "准备好了"
    @Published private(set) var exportURL: URL?
    @Published private(set) var channelCount = 0
    private let session = ARSession()
    private let recorder = AvatarTrackRecorder()
    private var filter = AvatarExpressionFilter()
    private var lastFrame: AvatarPerformanceFrame?
    private var wantsRunning = false
    private var lastStatusTime = 0.0

    override init() {
        super.init()
        session.delegate = self
        session.delegateQueue = .main
    }
    func start() {
        guard ARFaceTrackingConfiguration.isSupported else { status = "这台设备不支持 ARKit 面部捕捉。"; return }
        wantsRunning = true
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: beginSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self = self, self.wantsRunning else { return }
                    if granted { self.beginSession() } else { self.status = "摄像头权限未开启。" }
                }
            }
        default: status = "请在系统设置中允许摄像头访问。"
        }
    }
    private func beginSession() {
        guard wantsRunning else { return }
        let configuration = ARFaceTrackingConfiguration()
        configuration.maximumNumberOfTrackedFaces = 1
        filter.reset()
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        running = true; tracking = false; status = "请自然地面对摄像头。"
    }
    func stop() {
        wantsRunning = false
        if recording { finishRecording() }
        session.pause(); running = false; tracking = false; status = "捕捉已停止。"
    }
    func calibrate() { if let frame = lastFrame, frame.tracked { filter.calibrate(frame); status = "自然表情已校准。" } }
    func beginRecording() {
        guard running, tracking, let frame = lastFrame else { return }
        recorder.begin(at: frame.timeMs); exportURL = nil; recording = true; status = "正在记录表情，最长 60 秒。"
    }
    func finishRecording() {
        guard recording else { return }
        recording = false
        let value = recorder.finish(at: lastFrame?.timeMs ?? 0)
        guard !value.frames.isEmpty else { status = "没有可导出的表情。"; return }
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(value)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("avatar-performance.json")
            try data.write(to: url, options: .atomic)
            exportURL = url; status = "片段已准备好，可以导出到电脑试验室。"
        } catch { status = "表情片段未能保存，请重试。" }
    }
    private func receive(_ anchor: ARFaceAnchor) {
        guard running, let arFrame = session.currentFrame else { return }
        let transform = simd_inverse(arFrame.camera.transform) * anchor.transform
        let rotation = [
            asin(min(1, max(-1, Double(-transform.columns.2.y)))),
            atan2(Double(transform.columns.2.x), Double(transform.columns.2.z)),
            atan2(Double(transform.columns.0.y), Double(transform.columns.1.y))
        ]
        let channels = anchor.blendShapes.reduce(into: [String: Double]()) { output, item in
            if AvatarChannels.names.contains(item.key.rawValue) { output[item.key.rawValue] = item.value.doubleValue }
        }
        let raw = AvatarPerformanceFrame(timeMs: arFrame.timestamp * 1000, tracked: anchor.isTracked, channels: channels, rotation: rotation)
        lastFrame = raw
        if tracking != raw.tracked { tracking = raw.tracked }
        if channelCount != channels.count { channelCount = channels.count }
        let displayed = filter.apply(raw)
        if recording {
            if !recorder.append(displayed) { finishRecording() }
        } else if arFrame.timestamp - lastStatusTime > 0.2 {
            lastStatusTime = arFrame.timestamp
            status = raw.tracked ? "正在捕捉表情，画面只在本机处理。" : "暂时看不到整张脸，请调整位置。"
        }
    }
    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) { if let face = anchors.compactMap({ $0 as? ARFaceAnchor }).first { receive(face) } }
    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) { if let face = anchors.compactMap({ $0 as? ARFaceAnchor }).first { receive(face) } }
    func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        guard anchors.contains(where: { $0 is ARFaceAnchor }), running else { return }
        tracking = false
        if let frame = session.currentFrame {
            let missing = AvatarPerformanceFrame(timeMs: frame.timestamp * 1000, tracked: false, channels: [:], rotation: [0, 0, 0])
            lastFrame = missing
            if recording, !recorder.append(filter.apply(missing)) { finishRecording() }
        }
        status = "暂时看不到整张脸，请调整位置。"
    }
    func session(_ session: ARSession, didFailWithError error: Error) { stop(); status = "面部捕捉中断，请重新开启。" }
    func sessionWasInterrupted(_ session: ARSession) { stop(); status = "面部捕捉暂停，请重新开启。" }
}
