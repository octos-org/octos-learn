# Apple 表情捕捉伴侣：工程验证说明

状态：Xcode 工程源码已创建。纯参数模块与网页格式已验证；完整 iOS 应用未编译、未签名、未上机，原因是本机没有 iOS SDK。

## 目的与当前范围

使用原生 ARKit 获取用户的表情和头部姿态，在本机校准并导出最长 60 秒参数文件，导入电脑的头像试验室，验证相同角色的另一种驱动来源。

当前不传真实视频，不请求麦克风，不包含网络连接、角色模型或实时手机→电视功能。

## 工程

路径：`native/avatar-capture-ios/AvatarCapture.xcodeproj`。

- 目标 iOS/iPadOS 17.0 及以上，实际能力通过 `ARFaceTrackingConfiguration.isSupported` 判断。
- `AvatarCaptureApp.swift`：开启/停止、校准、参数录制和主动分享文件。
- `FaceCaptureModel.swift`：相机授权与 ARSession 生命周期；在相机坐标系中计算脸部姿态。
- `AvatarPerformance.swift`：52 通道兼容清单、稳定处理、限时限频参数记录与 JSON 格式。
- `Tests/main.swift`：可在 macOS 验证的纯数据契约，不依赖 ARKit 或 iOS SDK。

## 需要的环境

1. 安装完整 Xcode，使用其 iOS SDK。当前仅有 Command Line Tools。
2. 一台受支持的 iPhone/iPad；初轮优先选择经实测的 TrueDepth 设备。
3. 在 Xcode 中选择本人开发团队、真机和签名设置；设备如提示信任/开发者设置，由设备持有人按提示完成。

不通过网页冒充原生 ARKit；本工程是真机原生捕捉。

## 上机步骤

1. 用 Xcode 打开工程，配置 Signing & Capabilities 中的 Team。
2. 连接手机，选择真机运行；按手机提示授权摄像头。
3. 点击“开启摄像头捕捉”，确认出现“正在捕捉表情”和非零通道数量。
4. 自然看镜头、闭嘴放松，点击校准。
5. 录一段包含开口、闭唇、眨眼、微笑、抬眉和转头的表情，点击结束。
6. 点击“导出表情 JSON”，由用户主动将文件传到电脑。
7. 打开 `https://127.0.0.1:5173/teach/avatar-lab`，使用“导入表情片段”回放。
8. 记录设备型号/系统、佩戴眼镜、光线、拍摄距离和跟随质量。分享文件不包含摄像头视频，但参数仍按个人数据管理。

## 无 iOS SDK 时可完成的验证

在应用根目录运行：

```sh
./node_modules/.bin/vite-node scripts/check-avatar-native-contract.ts
swiftc -frontend -parse native/avatar-capture-ios/AvatarCaptureApp.swift native/avatar-capture-ios/FaceCaptureModel.swift native/avatar-capture-ios/AvatarPerformance.swift
plutil -lint native/avatar-capture-ios/Info.plist native/avatar-capture-ios/AvatarCapture.xcodeproj/project.pbxproj
```

第一项实际编译/运行原生参数模块，并用网页解析器检查输出。后两项只做语法/结构检查，不能代替完整 iOS 构建。

## 后续实时路线

原生参数文件验证通过后，再增加短期凭据配对、传输、时钟同步、过期帧丢弃、断开与重连；与电视音频采集方式一起测量端到端延迟。实时配对尚未实施。
