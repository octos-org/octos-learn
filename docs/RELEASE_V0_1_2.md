# Octos Learn v0.1.2

本版在 v0.1.1 上包含已合并的 [PR #49](https://github.com/octos-org/octos-learn/pull/49)：新生成的小章鱼辅助卡片首次自动放置时，避开所引用原稿，尤其是原稿靠近屏幕边缘、右侧空间不足的情况。未关联的笔迹不参与避障，已保存的卡片位置不自动迁移。课程取景、TTS 和 TypeSafe/Jev 行为保持不变。

Android 包名 `cc.pitun.learn`，versionName `0.1.2`，versionCode `33`，最低 Android 8.0，沿用既有签名并支持保留数据覆盖升级。九门预制课程及其画面、交互、旁白音频全部内嵌，快照仍为 `curated-e2e-closeout-2026-09-30`。OLL、生成器、课程库和后端依赖不变，详见根目录 `learning-stack-bom.json`。

PR #49 的完整 CI 通过：1128 项单元测试、14 项浏览器检查，lint 零错误、35 项已有警告。独立审查相关测试和额外边界检查共 35 项通过；新增重叠回归在旧代码失败、修复后通过。本版不宣称完成新的九项真实设备人工 E2E，沿用 [v0.1.1 的验证范围与跟踪项 REL-011-E2E](RELEASE_V0_1_1.md)。最终发布附件记录干净 main 提交、APK 哈希、签名与九包校验结果。
