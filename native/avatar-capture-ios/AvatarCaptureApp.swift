import SwiftUI

@main
struct AvatarCaptureApp: App {
    @StateObject private var model = FaceCaptureModel()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: 22) {
                Text("星狐表情捕捉").font(.largeTitle.bold())
                Text("技术验证 · ARKit 参数导出").foregroundStyle(.secondary)
                Text("用于验证苹果设备的面部捕捉。导出文件只含表情和头部动作，不含照片、视频或声音。")
                Label(model.status, systemImage: model.tracking ? "face.smiling" : "person.crop.rectangle")
                    .frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial).clipShape(RoundedRectangle(cornerRadius: 16))
                Text("当前表情通道：\(model.channelCount)").monospacedDigit()
                Button(model.running ? "停止捕捉" : "开启摄像头捕捉") { if model.running { model.stop() } else { model.start() } }
                    .buttonStyle(.borderedProminent)
                Button("以自然表情校准") { model.calibrate() }.disabled(!model.tracking || model.recording)
                Button(model.recording ? "结束表情片段" : "录一段表情（最长 60 秒）") {
                    if model.recording { model.finishRecording() } else { model.beginRecording() }
                }.buttonStyle(.bordered).disabled(!model.running || (!model.tracking && !model.recording))
                if let url = model.exportURL { ShareLink("导出表情 JSON", item: url).buttonStyle(.borderedProminent) }
                Text("导出后，在电脑的“动态头像试验室”选择“导入表情片段”回放。这版尚未实现手机与电视的实时连接。")
                    .font(.footnote).foregroundStyle(.secondary)
                Spacer()
            }
            .padding(28)
            .onChange(of: phase) { _, next in if next == .background { model.stop() } }
        }
    }
}
