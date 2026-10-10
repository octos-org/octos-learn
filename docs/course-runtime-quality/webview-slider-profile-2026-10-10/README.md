# WebView 滑块拖动性能 profile（2026-10-10）

基线：origin/main `c795064`（OLL `67d1476`，已含 10-03 的 slider-live-performance）。

## 运行

```sh
# 生产模式的 dev server（避免 React dev 构建的 jsxDEV 噪声）
NODE_ENV=production OCTOS_LOCAL_COURSE_PACK_ROOT=<course-pack-publication> \
  pnpm exec vite --mode production --host 127.0.0.1 --port 5187 --strictPort --force
node scripts/profile-slider-drag.mjs --cpu 1,4 --out slider-profile-out
```

`--packs a,b`、`--steps N`、`--width/--height` 可调。每个 课×CPU 降速 输出 JSON，另有 `SUMMARY.md`。
真机/电视请用 Android WebView 的 CDP（参考 `scripts/measure-android-whiteboard.mjs`）抓同一类 profile。

## Mac 基线（`baseline-mac/`，Chromium 无头，1440×900，90 步往返）

- 这些单课白板只有 3–10 张卡，Mac 上 1× 每次更新约 5ms，4× 降速约 20ms；电视再慢一个量级，与 10-03 报告的 render 中位数 ~60–160ms 吻合。
- 4× 降速下一次拖动的 CPU 时间构成（trig-cosine-and-phase-shift，2161ms active）：
  - `(program)`（浏览器原生：样式/布局/绘制/GC）959ms，约 44%；Chrome 计数 275 次 layout、204 次 style recalc / 91 次 input。
  - React 渲染与 commit 约 730ms（`LearningWhiteboard` 每次 emit 都重渲染，effect `oll-lesson-runtime.tsx:2048` 调 `view.render`）。
  - `BoardView.render` 422ms，其中 `syncNodes` 353ms（self 184ms，`offsetWidth` 读取 131ms，属强制同步布局）。
  - `applyManualVariable` 146ms，其中 persist/checkpoint 103ms、IndexedDB 写入 89ms。
  - `structuredClone` 仅 8ms：在这些小白板上不是瓶颈，卡片/笔迹变多后才会放大，需在大白板上复测。
- 首次拖动有一次 ~550ms（4×）的冷启动长帧。

## 待验证

1. 在多卡、多笔迹的白板（电视当前那条 4 卡 64 笔迹记录，或多课程同板）上复测，确认哪些桶随卡片数线性增长。
2. `syncNodes` 对每帧签名变化的卡片（plot）先 `height=auto` 再读 `scrollHeight/offsetWidth`，是否可以对固定尺寸的图卡跳过。
3. 拖动期间是否可以不 persist / 不 IndexedDB 写入，只在 commit 写。
4. 拖动期间是否可绕过 React snapshot 重算与全局 `render`，只更新依赖该变量的卡片。
