# E2E 修复收尾 — 2026-09-30

四仓修复已合入并推送 main：OLL `067597c`、Learning Coach `2a5fcc5`、课程库 `0781f74`、前端构建提交 `ca4fcef`。OLL 固定提交号保持不变；播放器引用 `067597c`，课程编写引用 `1a46385`。

用户批准同时整合 Android PR [#37](https://github.com/octos-org/octos-learn/pull/37)（播放时笔迹性能）与 [#36](https://github.com/octos-org/octos-learn/pull/36)（内嵌九课与目录布局），两者已合并。内嵌快照为 `curated-e2e-closeout-2026-09-30`，versionCode 从 29 升到 30。

## 课程与发布状态

八门审阅修订的最终课程源和音频已保存在课程库 `courses/`。复用了前次合成的四段音频，本次未调用 TTS。按审阅顺序重放修改、对比 authoring、用 OLL `067597c` 重编译并打包，九包哈希与最后一轮复测完全一致。服务器从这些最终源重建九包，同样全部匹配。详见 [最终数据集](final-dataset.json)。

| 课程 ID | 本地及 APK 版本 | 最低播放器 | 当前公网版本 |
|---|---|---|---|
| linear-intro-and-slope | 0.1.1 | 0.1.0 | 0.1.1 |
| linear-simultaneous-intersections | 0.1.2 | 0.3.0 | 0.1.2 |
| slope-and-intercept | 0.1.8 | 0.1.0 | 0.1.8 |
| surface-paraboloid-level-sets | 0.2.6 | 0.2.0 | 0.2.6 |
| surface-partial-derivative-slice | 0.2.8 | 0.3.0 | 0.2.8 |
| surface-saddle-point-analysis | 0.2.8 | 0.3.0 | 0.2.8 |
| trig-cosine-and-phase-shift | 0.1.4 | 0.1.0 | 0.1.4 |
| trig-quadrants-and-monotonicity | 0.1.4 | 0.1.0 | 0.1.4 |
| trig-unit-circle-to-sine | 0.1.3 | 0.1.0 | 0.1.3 |

兼容旧播放器的五门先上线，抛物面沿用现有版。会议大屏成功覆盖安装新版 APK 并快速验收后，再上线交点、偏导、鞍点三门。当前公网精确列出九门最终课程，与本地复测目录和 APK 内嵌快照一致。

课程目录替换前的备份：`/opt/octos-learn/backups/e2e-closeout-safe-20260930T172012Z`。旧归档保持不可变。服务器私有工作目录 `/home/ubuntu/e2e-closeout-20260930/` 保存重建产物与 `publish-phases.py`；`safe` 和 `final` 均已执行。发布脚本先核对当前目录、备份，再原子替换目录；失败会恢复备份。最后三门发布前另存备份 `/opt/octos-learn/backups/e2e-closeout-final-20260930T174509Z`。详见 [第一阶段发布](safe-publication.json)、[最终发布](final-publication.json) 与 [最终公网校验](final-http-verification.json)。

## 网页与 APK

公网网页已通过项目规定的 `scripts/deploy-public-web.sh` 完整部署；60 项资源可访问性检查通过。网页回滚备份为 `/opt/octos-learn/web.bak-pre-deploy`。本次没有更新 Octos 服务端二进制或服务器敏感配置。

本机最终复测服务已恢复为 HTTPS `https://127.0.0.1:5173/`，使用最终 main 与 `scratch/e2e-closeout-20260930/publication` 九课目录。大屏浏览器模拟检查期间临时切到 Android 模式，检查后恢复网页模式，始终使用 5173。

APK 从干净独立 checkout 的 `main` 构建，避免带入本仓库未跟踪的 `public/demo/`；该目录原样保留。APK 在 `delivery/e2e-closeout-20260930/octos-learn-0.1.0-v30.apk`，96,296,107 字节，SHA-256：`67fcd891edb02d23953b224757c1cc883540d3acdb9f815e5e6813d493a27935`。

APK 中的 build-info 标记源码 `ca4fcef05307149c4ecb15541289f9b36c343b3b`、dirty=false；九门内嵌归档均与最终数据集一致。详见 [APK 校验](apk-verification.json)。APK 已覆盖安装到会议大屏 `192.168.1.63:5555`，versionCode 从 29 升至 30；未卸载、未清空应用数据，保留旧 APK 在 `delivery/e2e-closeout-20260930/previous-v29.apk`。

## 验证与遗留项

- 合并 PR #37 后 1069 项单测通过，整合 PR #36 后 1070 项单测及类型检查通过。
- 课程库 20 项测试通过；全量 ESLint 零错误、35 项警告，定向检查零错误、3 项已有 React refs 警告。
- 九门课在桌面 1984×1286 和 Android 浏览器 960×540、DPR 4 下分别检查目录版本、逐拍推进、结束全景、思考题展开/收起；全部通过，无页面异常、无卡片超出视口。交点课最后的平行状态无交点标注。见 [桌面结果](desktop-result.json)、[大屏浏览器结果](tv-browser-result.json)。这些是逐拍浏览器检查，不是九课完整旁白回放或真机验收。
- 最终公网九包完整下载校验大小、SHA-256、版本及 minimumPlayerVersion 全部通过。公网网页使用真实已部署资源抽查三个 0.3.0 新包，平行交点隐藏、思考题展开/收起及全景边界检查通过；账号 API 使用隔离响应，此检查不覆盖公网邮箱登录。见 [公网网页结果](public-web-result.json)。
- 会议大屏由用户重新联网后回到 `192.168.1.63:5555`，已连接并核实 M3G2 / SKG、Android 13、3840×2160，CSS 视口 960×540、DPR 4；系统密度保持 640，没有更改网络或显示设置。此前 `192.168.3.35` 不可达，用户自己的 `192.168.1.180` 已断开，未安装或修改。
- 实际安装的 APK build-info 与交付文件一致，四门课逐拍快速验收通过：马鞍和偏导思考题默认收起，答案可展开再收起；交点先显示后随平行状态隐藏；抽查结束全景无卡片超出视口。见 [真机结果](native-result.json)；该验收没有宣称完成九门真实旁白回放。
- 发布后在真机用方向键精细调整一次函数滑块，数值依次 -2.00、-1.95、-1.90、-1.85、-1.80，显示宽度一直为 30.4237 CSS px。见 [真机滑块结果](native-slider-result.json)。这是方向键数值检查，不代替手指拖动性能基准。
- 真机联网加载完成后，三个课程集的九张课程卡片均显示最终版本，预览链接可用，公网目录响应 200。App 留在一次函数课程集，方便继续测试；见 [真机目录结果](native-catalog-result.json)。
- Claude 提醒的偏导练习提示“固定 x = 1”仍为遗留项，本次未自行修改课程正文。

大屏模拟截图：[马鞍思考题](tv-surface-saddle-point-analysis.png)、[平行交点](tv-linear-simultaneous-intersections.png)、[偏导思考题](tv-surface-partial-derivative-slice.png)。原 09-28 准备记录已标为历史，不能据其判断当前发布状态。

真机截图：[马鞍答案展开](native-surface-saddle-point-analysis-answer.png)、[平行交点隐藏](native-linear-simultaneous-intersections.png)、[偏导答案展开](native-surface-partial-derivative-slice-answer.png)、[一次函数全景](native-slope-and-intercept.png)。
