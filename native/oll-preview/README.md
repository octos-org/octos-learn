# macOS OLL 课程显示验证

这是读取真实 OLL JSONL 的独立原生验证应用，不是完整课程播放器。没有 WebView，也没有把 TypeScript 放进 Octoscript 执行。

## 使用

双击 `dist/Octos OLL Preview.app`，点击“播放 / 暂停”。程序依次创建单位圆、正弦图、显示对应关系，再运行角度动画。动画中可暂停、恢复；“重新开始”清空课程状态。

本次仅内置未经修改的 `OLL examples/unit-circle-sine/lesson.canonical.jsonl`。两个图表的数据均来自课程内容和 Rust 表达式绑定。两个面板的位置是本验证宿主的固定布局，不是通用 OLL 布局引擎。对应关系暂以文字显示；尚未绘制跨面板连接线或焦点高亮。

**范围：** 已替换固定两秒节拍，由 Rust Session 按 OLL 操作边界、动作间隔、估算讲解时间和变量动画时长调度。支持 1 倍速、暂停恢复、重置；尚未接入真实语音起止同步、课后任务、保存恢复、WASM、手写。窗口默认 1200×850，通用布局及任意尺寸适配仍待完成。

## 构建

同级目录排列为 `octos-learn/`、`oll/`、`makepad/`、`octoscript-makepad/`。Rust 核心在 OLL 仓库 `crates/oll-runtime`。

| 源码 | 本轮版本 |
| --- | --- |
| Octos Learn 分支基点 | b670417d54ac517cb9113db7d331e013b45d84cf |
| OLL 分支基点 | 2b93d67ffc30075edb3d3f34b848f799a46717f2 |
| OLL 本轮实现 | 0acaf5e |
| Octoscript-Makepad | b0628d05a89369b0c3bae2750db6da06996a05c2 |
| Makepad（由上述项目指定） | 825dbb422c6d7926e111e2ee7831d697870d8671 |

执行 `native/oll-preview/scripts/package-macos.sh`。脚本使用已缓存依赖的 offline/locked release 构建，收集字体等资源并作本机 ad-hoc 签名；没有开发者发布签名或公证。资源按可执行文件相对路径加载，可以从 Finder 启动。本应用没有使用 Octoscript VM 的业务执行能力；Makepad UI 声明仍使用其自带脚本系统。

## 验证记录

- Rust 表达式与真实课程动画测试通过（OLL 仓库）。
- macOS Metal 实际启动、中文文本、自有 GPU 截图验证。
- 第 4/5 动作动画中暂停，等待一秒后状态保持 `θ=1.454`；恢复后完成 `θ=6.283`。
- 初次检查发现布局声明 `Word` 应为 `Words`，已修正；随后去掉遮挡画面的图例，并调整标签和单位圆等比例区域。
- 不把编译通过等同于完成全部显示验收。首次 Metal 启动日志有系统显示服务的 337ms 延迟记录，不能据此宣称达到性能目标。


## 第二轮验证：调度与原生公式

用户已确认首轮图像、动画及播放控制无问题。现在增加“课程 / 公式”“下一组公式”：13 条去重的真实课程公式加 3 条明确标注的补充样本，每页 2 条，共 8 页。进入公式页暂停课程；点击播放返回课程并继续。此页仅验证完整公式排版，不等于 math 节点动作、片段强调与通用布局已完成。

Metal 截图检查发现：代数、几何符号、分式、根号、积分及矩阵样本可显示；含 `\text{ 平分 }` 的实际课程公式丢失中文，页面明确标注未通过。源码中 MathView 的布局和轮廓取自单一数学字体，尚未解决中文回退。不得因此宣称公式全覆盖。首版公式页行高导致的分式裁切已修复。

核心 9 项测试通过；与现有 TypeScript 对照了 19 个操作、7 条多语言讲解计时、执行时间线和最终节点内容。时间线差异限定在 Web 动画的一帧（16ms）以内；不是对真实设备帧率的性能承诺。现有 Web 对估算讲解时间的处理不扣除变量动画时长，Rust 本轮保留此行为。

重建样本：`python3 native/oll-preview/scripts/collect-formulas.py`。GPU 与交互验证：`python3 native/oll-preview/scripts/verify-macos.py 'native/oll-preview/dist/Octos OLL Preview.app' /absolute/evidence/path`。脚本只控制自己启动的实例，结束会退出。
