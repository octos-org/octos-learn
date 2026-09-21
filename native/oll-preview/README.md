# macOS OLL 课程显示验证

这是读取真实 OLL JSONL 的独立原生验证应用，不是完整课程播放器。没有 WebView，也没有把 TypeScript 放进 Octoscript 执行。

## 使用

双击 `dist/Octos OLL Preview.app`，点击“播放 / 暂停”。程序依次创建单位圆、正弦图、显示对应关系，再运行角度动画。动画中可暂停、恢复；“重新开始”清空课程状态。

本次仅内置未经修改的 `OLL examples/unit-circle-sine/lesson.canonical.jsonl`。两个图表的数据均来自课程内容和 Rust 表达式绑定。两个面板的位置是本验证宿主的固定布局，不是通用 OLL 布局引擎。对应关系暂以文字显示；尚未绘制跨面板连接线或焦点高亮。

**范围：** 动作间隔为验证宿主的固定两秒节拍，角度动画时长读取课程声明并按既有 runtime 的 1.8/3.2/5.4 秒映射执行。讲解文字可显示，但正式讲解计时、语音、课后拖拽任务、保存恢复、WASM、公式组件与手写均未接入。不要用此版本验收这些能力或判断最终性能。窗口默认 1200×850，尚未完成任意窗口尺寸的布局适配。

## 构建

同级目录排列为 `octos-learn/`、`oll/`、`makepad/`、`octoscript-makepad/`。Rust 核心在 OLL 仓库 `crates/oll-runtime`。

| 源码 | 本轮版本 |
| --- | --- |
| Octos Learn 分支基点 | b670417d54ac517cb9113db7d331e013b45d84cf |
| OLL 分支基点 | 2b93d67ffc30075edb3d3f34b848f799a46717f2 |
| OLL 本轮实现 | 78080c5 |
| Octoscript-Makepad | b0628d05a89369b0c3bae2750db6da06996a05c2 |
| Makepad（由上述项目指定） | 825dbb422c6d7926e111e2ee7831d697870d8671 |

执行 `native/oll-preview/scripts/package-macos.sh`。脚本使用已缓存依赖的 offline/locked release 构建，收集字体等资源并作本机 ad-hoc 签名；没有开发者发布签名或公证。资源按可执行文件相对路径加载，可以从 Finder 启动。本应用没有使用 Octoscript VM 的业务执行能力；Makepad UI 声明仍使用其自带脚本系统。

## 验证记录

- Rust 表达式与真实课程动画测试通过（OLL 仓库）。
- macOS Metal 实际启动、中文文本、自有 GPU 截图验证。
- 第 4/5 动作动画中暂停，等待一秒后状态保持 `θ=1.454`；恢复后完成 `θ=6.283`。
- 初次检查发现布局声明 `Word` 应为 `Words`，已修正；随后去掉遮挡画面的图例，并调整标签和单位圆等比例区域。
- 不把编译通过等同于完成全部显示验收。首次 Metal 启动日志有系统显示服务的 337ms 延迟记录，不能据此宣称达到性能目标。
