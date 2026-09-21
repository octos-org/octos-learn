use makepad_plot::{LinePlot, LineStyle, MarkerStyle, Series};
pub use makepad_widgets;
use makepad_widgets::*;
use oll_runtime::{expression::evaluate, preview::Preview, session::Session};
use serde_json::Value;
use std::time::Instant;
pub mod board_view;
pub mod formula_view;
mod platform_services;
use platform_services::Events as PlatformEvents;
pub mod progress_store;
pub mod spatial_board;
app_main!(App);
const FORMULAS: &str = include_str!("../courses/formulas.json");
const QUADRATIC: &str = include_str!("../courses/quadratic.jsonl");
const QUADRATIC_V2: &str = include_str!("../courses/quadratic-v2.jsonl");
const ENGLISH: &str = include_str!("../courses/english-relative-clause.jsonl");
const COURSE: &str = include_str!("../courses/unit-circle-sine.jsonl");
script_mod! {
    use mod.prelude.widgets.*
    use mod.widgets.*
    use mod.plot.*
    startup() do #(App::script_component(vm)) {
        ui: Root {
            main_window := Window {
                window.inner_size: vec2(1200, 850)
                body +: {
                    flow: Down spacing: 12 padding: 20
                    title := Label { text: "OLL · Makepad" draw_text.text_style.font_size: 24 }
                    Label { text: "原生课程验证 · Android 录音接口测试 · 完整语音对话尚未接入" }
                    View { width: Fill height: Fit flow: Right spacing: 16
                        switch_course := Button { text: "切换课程" }
                        play := Button { text: "播放 / 暂停" }
                        reset := Button { text: "重新开始" }
                        formulas := Button { text: "课程 / 公式" }
                        next_formulas := Button { text: "下一组公式" }
                        status := Label { text: "准备就绪" }
                    }
                    navigation := View {width:Fill height:Fit flow:Right spacing:12
                        overview := Button {text:"全览"}
                        zoom_in := Button {text:"放大"}
                        zoom_out := Button {text:"缩小"}
                        follow := Button {text:"跟随教学"}
                        Label {text:"拖动白板移动 · 滚轮缩放 · 新的教学目标到来时恢复跟随" draw_text.text_style.font_size:10}
                    }
                    service_controls := View {width:Fill height:Fit flow:Right spacing:12
                        save_progress := Button {text:"保存课程进度"}
                        restore_progress := Button {text:"恢复进度"}
                        ink_mode := Button {text:"书写 / 浏览"}
                        ink_undo := Button {text:"撤销笔迹"}
                        ink_redo := Button {text:"重做笔迹"}
                        audio_start := Button {text:"测试录音"}
                        audio_stop := Button {text:"停止录音"}
                        progress_status := Label {text:"进度尚未保存" draw_text.text_style.font_size:10}
                    }
                    service_status := Label {width:Fill text:"书写测试可用；Android 原生录音需在设备上验证" draw_text.text_style.font_size:10}
                    spatial := SpatialBoard {width:Fill height:360}
                    board_cues := Label { width:Fill height:Fit draw_text.wrap:Words text:"" draw_text.text_style.font_size:11 }
                    formula_panel := View { visible: false width: Fill height: 490 flow: Down spacing: 12
                        View { width: Fill height: 224 flow: Down spacing: 6
                            source_0 := Label { width: Fill text: "" draw_text.text_style.font_size: 10 }
                            tex_0 := Label { width: Fill text: "" draw_text.text_style.font_size: 10 }
                            math_0 := View { width: Fit height: Fit flow: Right align: Align{y: 0.5} }
                        }
                        View { width: Fill height: 224 flow: Down spacing: 6
                            source_1 := Label { width: Fill text: "" draw_text.text_style.font_size: 10 }
                            tex_1 := Label { width: Fill text: "" draw_text.text_style.font_size: 10 }
                            math_1 := View { width: Fit height: Fit flow: Right align: Align{y: 0.5} }
                        }


                    }
                    mapping := Label { width: Fill height:Fit draw_text.wrap:Words draw_text.text_style.font_size:10 text: "" }
                    narration := Label { width: Fill height: Fit draw_text.wrap: Words text: "点击播放，按 OLL 顺序生成画面。" }
                    summary := Label { width: Fill height: Fit draw_text.wrap: Words text: "" }
                }
            }
        }
    }
}
#[derive(Script, ScriptHook)]
pub struct App {
    #[live]
    ui: WidgetRef,
    #[rust]
    platform_events: PlatformEvents,
    #[rust]
    drawing: bool,
    #[rust]
    store: Option<progress_store::Store>,
    #[rust]
    pending_save: Option<progress_store::Request>,
    #[rust]
    last_save: Option<Instant>,
    #[rust]
    player: Option<Session>,
    #[rust]
    timer: Timer,
    #[rust]
    last_tick: Option<Instant>,
    #[rust]
    error: String,
    #[rust]
    formula_mode: bool,
    #[rust]
    course_index: usize,
    #[rust]
    formula_page: usize,
    #[rust]
    formula_sources: [Option<String>; 2],
    #[rust]
    formula_errors: [String; 2],
}
impl App {
    fn course_source(&self) -> &'static str {
        [COURSE, QUADRATIC, QUADRATIC_V2, ENGLISH][self.course_index]
    }
    fn course_key(&self) -> String {
        [
            "unit-circle-sine",
            "quadratic",
            "quadratic-v2",
            "english-relative-clause",
        ][self.course_index]
            .into()
    }
    fn save_progress(&mut self, cx: &mut Cx) {
        if let Some(p) = &self.player {
            match p.checkpoint() {
                Ok(value) => {
                    self.pending_save =
                        Some(progress_store::Request::Save(self.course_key(), value));
                    self.last_save = Some(Instant::now());
                }
                Err(e) => self.ui.label(cx, ids!(progress_status)).set_text(cx, &e),
            }
        }
    }
    fn poll_storage(&mut self, cx: &mut Cx) {
        if let Some(store) = &self.store {
            if let Some(request) = self.pending_save.take() {
                if let Err(request) = store.send(request) {
                    self.pending_save = Some(request);
                }
            }
        }
        while let Some(reply) = self.store.as_ref().and_then(|s| s.poll()) {
            match reply {
                progress_store::Reply::Saved(key) => {
                    if key == self.course_key() {
                        self.ui
                            .label(cx, ids!(progress_status))
                            .set_text(cx, "进度已保存");
                    }
                }
                progress_store::Reply::Loaded(key, saved) => {
                    if key != self.course_key() {
                        continue;
                    }
                    if let Some(saved) = saved {
                        match Session::restore(self.course_source(), &saved) {
                            Ok(player) => {
                                let w = self.ui.widget(cx, ids!(spatial));
                                if let Some(mut b) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                                    b.clear(cx);
                                }
                                self.player = Some(player);
                                self.drawing = false;
                                self.formula_mode = false;
                                self.error.clear();
                                self.refresh(cx);
                                self.ui
                                    .label(cx, ids!(progress_status))
                                    .set_text(cx, "进度已恢复（暂停），点击播放继续");
                            }
                            Err(e) => self
                                .ui
                                .label(cx, ids!(progress_status))
                                .set_text(cx, &format!("无法恢复，原文件保留：{e}")),
                        }
                    } else {
                        self.ui
                            .label(cx, ids!(progress_status))
                            .set_text(cx, "这门课程尚无保存的进度");
                    }
                }
                progress_store::Reply::Failed(e) => self
                    .ui
                    .label(cx, ids!(progress_status))
                    .set_text(cx, &format!("进度存储失败：{e}")),
            }
        }
    }

    fn reset(&mut self, cx: &mut Cx) {
        self.formula_mode = false;
        self.drawing = false;
        self.error.clear();
        let w = self.ui.widget(cx, ids!(spatial));
        if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
            board.clear(cx);
        };
        match Session::load(self.course_source()) {
            Ok(p) => self.player = Some(p),
            Err(e) => self.error = e,
        }
        self.refresh(cx);
    }
    fn refresh(&mut self, cx: &mut Cx) {
        self.ui
            .widget(cx, ids!(service_controls))
            .set_visible(cx, !self.formula_mode);
        self.ui
            .widget(cx, ids!(service_status))
            .set_visible(cx, !self.formula_mode);
        self.ui
            .widget(cx, ids!(spatial))
            .set_visible(cx, !self.formula_mode);
        self.ui
            .widget(cx, ids!(navigation))
            .set_visible(cx, !self.formula_mode);
        self.ui
            .widget(cx, ids!(formula_panel))
            .set_visible(cx, self.formula_mode);
        self.ui
            .widget(cx, ids!(board_cues))
            .set_visible(cx, !self.formula_mode);
        if self.formula_mode {
            let samples: Vec<Value> =
                serde_json::from_str(FORMULAS).expect("embedded formula corpus");
            self.ui
                .label(cx, ids!(title))
                .set_text(cx, "原生数学公式显示检查");
            self.ui.label(cx, ids!(status)).set_text(
                cx,
                &format!(
                    "公式 {}/{} 组",
                    self.formula_page + 1,
                    samples.len().div_ceil(2)
                ),
            );
            for (row, (source, tex, math)) in [
                (ids!(source_0), ids!(tex_0), ids!(math_0)),
                (ids!(source_1), ids!(tex_1), ids!(math_1)),
            ]
            .into_iter()
            .enumerate()
            {
                let sample = samples.get(self.formula_page * 2 + row);
                self.ui
                    .widget(cx, source)
                    .set_text(cx, sample.map(|v| text(v, "source")).unwrap_or(""));
                self.ui
                    .widget(cx, tex)
                    .set_text(cx, sample.map(|v| text(v, "latex")).unwrap_or(""));
                let latex = sample.map(|v| text(v, "latex")).unwrap_or("");
                if self.formula_sources[row].as_deref() != Some(latex) {
                    self.formula_errors[row] =
                        formula_view::set_formula(cx, &self.ui.widget(cx, math), latex)
                            .err()
                            .unwrap_or_default();
                    self.formula_sources[row] = Some(latex.into());
                }
            }
            self.ui
                .label(cx, ids!(mapping))
                .set_text(cx, "上方为原始公式字符串，下方为原生数学与中文混合排版。");
            self.ui.label(cx, ids!(narration)).set_text(
                cx,
                "课程公式保留原文；补充排版测试单独标注。此页暂不验证公式片段强调和课程动作。",
            );
            self.ui.label(cx, ids!(summary)).set_text(
                cx,
                &self
                    .formula_errors
                    .iter()
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("；"),
            );
            self.ui.redraw(cx);
            return;
        }

        if let Some(session) = &self.player {
            let p = &session.board;
            self.ui.label(cx, ids!(title)).set_text(cx, &p.title);
            let status = format!(
                "{} · 动作 {}/{}{} · {}",
                if session.complete() {
                    "播放完成"
                } else if session.playing {
                    "播放中"
                } else {
                    "已暂停"
                },
                p.cursor,
                p.action_count(),
                p.variables
                    .get("theta")
                    .map(|v| format!(" · θ = {v:.3}"))
                    .unwrap_or_default(),
                if p.animating() {
                    "变量动画"
                } else if !p.narration.is_empty() {
                    "讲解中"
                } else {
                    "课程阶段切换"
                }
            );
            self.ui.label(cx, ids!(status)).set_text(
                cx,
                if self.error.is_empty() {
                    &status
                } else {
                    &self.error
                },
            );
            self.ui
                .label(cx, ids!(narration))
                .set_text(cx, &p.narration);
            self.ui
                .label(cx, ids!(summary))
                .set_text(cx, if session.complete() { &p.summary } else { "" });
            let labels = p
                .connections
                .iter()
                .map(|c| {
                    if self.course_index != 0 {
                        format!(
                            "{} → {}：{}",
                            board_view::target_name(p, &c["from"]),
                            board_view::target_name(p, &c["to"]),
                            text(c, "label")
                        )
                    } else {
                        text(c, "label").to_owned()
                    }
                })
                .collect::<Vec<_>>()
                .join("；");
            let focus = p
                .focus
                .iter()
                .map(|id| board_view::name(p, id))
                .collect::<Vec<_>>()
                .join("、");
            // Full relationships are retained in runtime; show the latest one here
            // so narration remains readable within the review window.
            let relation = if self.course_index != 0 {
                p.connections
                    .last()
                    .map(|c| {
                        format!(
                            "关系：{} → {}：{}",
                            board_view::target_name(p, &c["from"]),
                            board_view::target_name(p, &c["to"]),
                            text(c, "label")
                        )
                    })
                    .unwrap_or_default()
            } else {
                labels
            };
            self.ui.label(cx, ids!(mapping)).set_text(
                cx,
                &format!(
                    "{relation}{}",
                    if focus.is_empty() {
                        String::new()
                    } else {
                        format!(" · 当前关注：{focus}")
                    }
                ),
            );
            let action = session.operations[..session.cursor]
                .iter()
                .rev()
                .find(|op| op["type"] == "action.apply")
                .map(|op| &op["action"]);
            let w = self.ui.widget(cx, ids!(spatial));
            if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                if let Err(e) = board.set_state(cx, p, action) {
                    self.error = e;
                }
            };
            self.ui
                .label(cx, ids!(board_cues))
                .set_text(cx, "黄色：重点 · 绿色：辅助强调 · 蓝灰边框：课程分组");
        }
        self.ui.redraw(cx);
    }
}
pub fn num(v: &Value, k: &str) -> Result<f64, String> {
    v[k].as_f64()
        .ok_or_else(|| format!("Missing coordinate {k}"))
}
pub fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
pub fn items<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    v[k].as_array().map(Vec::as_slice).unwrap_or(&[])
}
/// Tone palette for geometry polygons, matching the web renderer
/// (oll web-runtime styles.css `.geometry-polygon-<tone>`).
/// Returns (fill, stroke).
pub fn polygon_tone(tone: &str) -> (Vec4, Vec4) {
    match tone {
        "secondary" => (
            vec4(79. / 255., 132. / 255., 181. / 255., 0.18),
            vec4(79. / 255., 132. / 255., 181. / 255., 1.0),
        ),
        "accent" => (
            vec4(215. / 255., 154. / 255., 41. / 255., 0.22),
            vec4(199. / 255., 131. / 255., 46. / 255., 1.0),
        ),
        "neutral" => (
            vec4(82. / 255., 107. / 255., 103. / 255., 0.12),
            vec4(82. / 255., 107. / 255., 103. / 255., 1.0),
        ),
        // "primary" and any unknown tone fall back to the primary teal.
        _ => (
            vec4(35. / 255., 135. / 255., 124. / 255., 0.18),
            vec4(35. / 255., 135. / 255., 124. / 255., 1.0),
        ),
    }
}
/// Resolve a point id to coordinates within a geometry/plot content object.
fn point_coords(c: &Value, id: &str) -> Result<(f64, f64), String> {
    let v = items(c, "points")
        .iter()
        .find(|v| v["id"] == id)
        .ok_or_else(|| format!("Unknown point {id}"))?;
    Ok((num(v, "x")?, num(v, "y")?))
}
/// Resolve a polygon's point-id list to vertex coordinates.
pub fn polygon_vertices(c: &Value, polygon: &Value) -> Result<Vec<(f64, f64)>, String> {
    let ids = items(polygon, "points");
    if ids.len() < 3 {
        return Err("多边形至少需要 3 个顶点".into());
    }
    ids.iter()
        .map(|id| point_coords(c, id.as_str().ok_or("多边形顶点不是点 id")?))
        .collect()
}
/// Decompose a polygon into an x-monotone band (x, y_lo, y_hi) sampled at
/// every vertex x, so `LinePlot::fill_between` can fill it. Exact for convex
/// polygons (all course polygons are rectangles); non-convex self-intersecting
/// shapes fill their vertical envelope, recorded as a known difference.
pub fn polygon_bands(vertices: &[(f64, f64)]) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let mut xs: Vec<f64> = vertices.iter().map(|v| v.0).collect();
    xs.sort_by(f64::total_cmp);
    xs.dedup();
    let mut lo = Vec::with_capacity(xs.len());
    let mut hi = Vec::with_capacity(xs.len());
    for &x in &xs {
        let mut ys = Vec::new();
        for i in 0..vertices.len() {
            let (x1, y1) = vertices[i];
            let (x2, y2) = vertices[(i + 1) % vertices.len()];
            if (x2 - x1).abs() < 1e-12 {
                if (x - x1).abs() < 1e-9 {
                    ys.push(y1);
                    ys.push(y2);
                }
                continue;
            }
            let t = (x - x1) / (x2 - x1);
            if (-1e-9..=1.0 + 1e-9).contains(&t) {
                ys.push(y1 + t.clamp(0.0, 1.0) * (y2 - y1));
            }
        }
        ys.sort_by(f64::total_cmp);
        lo.push(ys.first().copied().unwrap_or(0.0));
        hi.push(ys.last().copied().unwrap_or(0.0));
    }
    (xs, lo, hi)
}
/// formatPointLabel equivalent (oll web-runtime plot.ts:238): `{x}`/`{y}`/
/// `{coords}` placeholders, values rounded to 3 decimals, -0 rendered as "0".
pub fn format_point_label(raw: &str, x: f64, y: f64) -> String {
    fn format_num(n: f64) -> String {
        if !n.is_finite() {
            return String::new();
        }
        let rounded = (n * 1000.).round() / 1000.;
        if rounded == 0. {
            "0".into()
        } else {
            format!("{rounded}")
        }
    }
    raw.replace("{x}", &format_num(x))
        .replace("{y}", &format_num(y))
        .replace("{coords}", &format!("({}, {})", format_num(x), format_num(y)))
}
pub struct SecantMeasurement {
    pub dx: f64,
    pub dy: f64,
    pub slope: f64,
}
/// secantMeasurement equivalent (plot.ts:215): undefined when the two x
/// coordinates coincide (within relative 1e-9) or values are non-finite.
pub fn secant_measurement(a: (f64, f64), b: (f64, f64)) -> Option<SecantMeasurement> {
    let dx = b.0 - a.0;
    let dy = b.1 - a.1;
    if ![a.0, a.1, b.0, b.1, dx, dy].iter().all(|v| v.is_finite()) {
        return None;
    }
    if dx.abs() <= 1e-9 * 1.0f64.max(a.0.abs()).max(b.0.abs()) {
        return None;
    }
    let slope = dy / dx;
    slope.is_finite().then_some(SecantMeasurement { dx, dy, slope })
}
/// Number(n.toPrecision(5)).toString() equivalent for measurement text.
pub fn precision5(n: f64) -> String {
    if !n.is_finite() {
        return String::new();
    }
    if n == 0. {
        return "0".into();
    }
    let decimals = 4. - n.abs().log10().floor();
    if decimals < 0. {
        let magnitude = 10f64.powf(-decimals);
        let v = (n / magnitude).round() * magnitude;
        return format!("{v:.0}");
    }
    let decimals = decimals.min(15.) as usize;
    let s = format!("{n:.decimals$}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" { "0".into() } else { s.into() }
}
/// Letterbox equal-unit plots by widening the range of the less-constrained
/// axis instead of shrinking the frame (plot.ts plotFrame:225 adapted to a
/// fixed plot area). Returns adjusted ((xmin, xmax), (ymin, ymax)).
pub fn equal_scale_ranges(
    xmin: f64,
    xmax: f64,
    ymin: f64,
    ymax: f64,
    w_px: f64,
    h_px: f64,
) -> ((f64, f64), (f64, f64)) {
    let (xr, yr) = (xmax - xmin, ymax - ymin);
    if xr <= 0. || yr <= 0. || w_px <= 0. || h_px <= 0. {
        return ((xmin, xmax), (ymin, ymax));
    }
    let scale = (w_px / xr).min(h_px / yr);
    let (xmid, ymid) = ((xmin + xmax) / 2., (ymin + ymax) / 2.);
    let (xw, yh) = (w_px / scale / 2., h_px / scale / 2.);
    ((xmid - xw, xmid + xw), (ymid - yh, ymid + yh))
}
/// Caption text rendered below a chart card: geometry captions verbatim;
/// secant measurement for plot cards (board-view.ts:663 wording).
pub fn chart_caption(node: &Value) -> String {
    let c = &node["content"];
    if node["kind"] == "plot" && text(c, "measurement") == "secant" {
        let pts = items(c, "points");
        if pts.len() == 2 {
            if let (Ok(a), Ok(b)) = (
                num(&pts[0], "x").and_then(|x| num(&pts[0], "y").map(|y| (x, y))),
                num(&pts[1], "x").and_then(|x| num(&pts[1], "y").map(|y| (x, y))),
            ) {
                return match secant_measurement(a, b) {
                    Some(m) => format!(
                        "Δx = {} · Δy = {} · 割线斜率 ≈ {}",
                        precision5(m.dx),
                        precision5(m.dy),
                        precision5(m.slope)
                    ),
                    None => "两点横坐标重合或过近，不能用 Δy/Δx 计算斜率。".into(),
                };
            }
        }
        return String::new();
    }
    c["caption"].as_str().unwrap_or("").into()
}
/// plot_px estimates the plot area in pixels (card size minus margins); it is
/// only used to letterbox equal_scale axes, mirroring the web plotFrame.
pub fn render(
    plot: &mut LinePlot,
    node: &Value,
    p: &Preview,
    plot_px: (f64, f64),
) -> Result<(), String> {
    let c = &node["content"];
    let blue = vec4(0.20, 0.65, 1.0, 1.0);
    let gold = vec4(1.0, 0.65, 0.15, 1.0);
    plot.set_title(
        c["title"]
            .as_str()
            .or_else(|| items(c, "curves").first().and_then(|v| v["label"].as_str()))
            .unwrap_or(""),
    );
    plot.set_xlabel(text(&c["axes"]["x"], "label"));
    plot.set_ylabel(text(&c["axes"]["y"], "label"));
    let xmin = num(&c["axes"]["x"], "min")?;
    let xmax = num(&c["axes"]["x"], "max")?;
    let ymin = num(&c["axes"]["y"], "min")?;
    let ymax = num(&c["axes"]["y"], "max")?;
    let ((xmin, xmax), (ymin, ymax)) = if c["axes"]["equal_scale"] == true {
        equal_scale_ranges(xmin, xmax, ymin, ymax, plot_px.0, plot_px.1)
    } else {
        ((xmin, xmax), (ymin, ymax))
    };
    plot.set_xlim(xmin, xmax);
    plot.set_ylim(ymin, ymax);
    plot.set_show_points(false);
    plot.set_legend(makepad_plot::LegendPosition::None);
    let points = items(c, "points");
    let point = |id: &str| point_coords(c, id);
    // Polygons fill first so segments/curves/points draw above them.
    for polygon in items(c, "polygons") {
        let Ok(vertices) = polygon_vertices(c, polygon) else {
            // Web parity: unresolvable polygons are skipped, not fatal.
            continue;
        };
        let (fill, stroke) = polygon_tone(text(polygon, "tone"));
        let (bx, blo, bhi) = polygon_bands(&vertices);
        plot.fill_between(bx, bhi, blo, fill);
        let mut ox: Vec<f64> = vertices.iter().map(|v| v.0).collect();
        let mut oy: Vec<f64> = vertices.iter().map(|v| v.1).collect();
        ox.push(vertices[0].0);
        oy.push(vertices[0].1);
        plot.add_series(
            Series::new("")
                .with_data(ox, oy)
                .with_color(stroke)
                .with_line_width(2.2),
        );
        let label = text(polygon, "label");
        if !label.is_empty() {
            let (cx, cy) = vertices
                .iter()
                .fold((0., 0.), |(sx, sy), v| (sx + v.0, sy + v.1));
            let n = vertices.len() as f64;
            plot.annotate(label, cx / n, cy / n, stroke, 10.0);
        }
    }
    for key in ["circles", "arcs"] {
        for circle in items(c, key) {
            let (cx, cy) = point(text(circle, "center"))?;
            let r = num(circle, "radius")?;
            let (start, end) = if key == "arcs" {
                (num(circle, "start_angle")?, num(circle, "end_angle")?)
            } else {
                (0.0, std::f64::consts::TAU)
            };
            let (xs, ys) = (0..=120)
                .map(|i| {
                    let a = start + (end - start) * i as f64 / 120.0;
                    (cx + r * a.cos(), cy + r * a.sin())
                })
                .unzip();
            plot.add_series(
                Series::new(text(circle, "label"))
                    .with_data(xs, ys)
                    .with_color(blue),
            );
        }
    }
    for segment in items(c, "segments") {
        let (x1, y1) = point(text(segment, "from"))?;
        let (x2, y2) = point(text(segment, "to"))?;
        plot.add_series(
            Series::new(text(segment, "label"))
                .with_data(vec![x1, x2], vec![y1, y2])
                .with_color(gold)
                .with_line_style(
                    if matches!(text(segment, "style"), "projection" | "dashed") {
                        LineStyle::Dashed
                    } else {
                        LineStyle::Solid
                    },
                ),
        );
    }
    for curve in items(c, "curves") {
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        let mut vars = p.variables.clone();
        for i in 0..=180 {
            let x = xmin + (xmax - xmin) * i as f64 / 180.0;
            vars.insert("x".into(), x);
            xs.push(x);
            ys.push(evaluate(text(curve, "expression"), &vars)?);
        }
        for (xs, ys) in clip_curve(
            &xs,
            &ys,
            num(&c["axes"]["y"], "min")?,
            num(&c["axes"]["y"], "max")?,
        ) {
            plot.add_series(
                Series::new(text(curve, "label"))
                    .with_data(xs, ys)
                    .with_color(blue),
            );
        }
    }
    for guide in items(c, "guides") {
        if text(guide, "kind") == "vertical_line" {
            let x = num(guide, "value")?;
            plot.add_series(
                Series::new(text(guide, "label"))
                    .with_data(
                        vec![x, x],
                        vec![num(&c["axes"]["y"], "min")?, num(&c["axes"]["y"], "max")?],
                    )
                    .with_color(gold)
                    .with_line_style(LineStyle::Dashed),
            );
            plot.annotate(
                text(guide, "label"),
                x + 0.25,
                num(&c["axes"]["y"], "max")? - 1.0,
                gold,
                10.0,
            );
        }
    }
    // Secant measurement: dashed secant connector plus Δx/Δy guide lines
    // (board-view.ts:650-661). The measurement text itself is rendered as the
    // card caption by board_view/spatial_board (chart_caption).
    if node["kind"] == "plot" && text(c, "measurement") == "secant" && points.len() == 2 {
        let a = (num(&points[0], "x")?, num(&points[0], "y")?);
        let b = (num(&points[1], "x")?, num(&points[1], "y")?);
        if secant_measurement(a, b).is_some() {
            let guide = |xs: Vec<f64>, ys: Vec<f64>| {
                Series::new("")
                    .with_data(xs, ys)
                    .with_color(gold)
                    .with_line_style(LineStyle::Dashed)
            };
            plot.add_series(guide(vec![a.0, b.0], vec![a.1, b.1]));
            plot.add_series(guide(vec![a.0, b.0], vec![a.1, a.1]));
            plot.add_series(guide(vec![b.0, b.0], vec![a.1, b.1]));
        }
    }
    for pt in points {
        // Points with visible:false only serve as polygon/segment endpoints.
        if pt["visible"] == false {
            continue;
        }
        let x = num(pt, "x")?;
        let y = num(pt, "y")?;
        plot.add_series(
            Series::new(text(pt, "label"))
                .with_data(vec![x], vec![y])
                .with_marker(MarkerStyle::Circle)
                .with_marker_size(7.0)
                .with_color(gold),
        );
        let bound = items(c, "bindings")
            .iter()
            .any(|b| text(b, "target").starts_with(&format!("{}.", text(pt, "id"))));
        let offset = if bound && node["kind"] == "plot" {
            -0.17
        } else {
            0.10
        };
        let label = format_point_label(text(pt, "label"), x, y);
        if !label.is_empty() {
            plot.annotate(label, x, y + offset, gold, 10.0);
        }
    }
    Ok(())
}
// Clip each sampled segment to the declared y range. Separate visible runs
// avoid joining across invisible sections or drawing a false line on the bound.
fn clip_curve(xs: &[f64], ys: &[f64], min: f64, max: f64) -> Vec<(Vec<f64>, Vec<f64>)> {
    let mut result = Vec::new();
    let mut xrun = Vec::new();
    let mut yrun = Vec::new();
    for i in 1..xs.len() {
        let (a, b) = (ys[i - 1], ys[i]);
        let (lo, hi) = if a == b {
            if a < min || a > max {
                (1.0, 0.0)
            } else {
                (0.0, 1.0)
            }
        } else {
            let t1 = (min - a) / (b - a);
            let t2 = (max - a) / (b - a);
            (t1.min(t2).max(0.0), t1.max(t2).min(1.0))
        };
        if lo <= hi {
            if xrun.is_empty() {
                xrun.push(xs[i - 1] + (xs[i] - xs[i - 1]) * lo);
                yrun.push(a + (b - a) * lo);
            }
            xrun.push(xs[i - 1] + (xs[i] - xs[i - 1]) * hi);
            yrun.push(a + (b - a) * hi);
        }
        if (lo > hi || hi < 1.0) && !xrun.is_empty() {
            result.push((std::mem::take(&mut xrun), std::mem::take(&mut yrun)));
        }
    }
    if !xrun.is_empty() {
        result.push((xrun, yrun));
    }
    result
}
#[cfg(test)]
mod plot_tests {
    use serde_json::json;
    #[test]
    fn clipping_does_not_join_separated_runs_or_clamp_to_a_false_plateau() {
        let runs = super::clip_curve(&[0., 1., 2., 3., 4.], &[0., 2., 2., 2., 0.], -1., 1.);
        assert_eq!(
            runs,
            vec![(vec![0., 0.5], vec![0., 1.]), (vec![3.5, 4.], vec![1., 0.])]
        );
        assert!(super::clip_curve(&[0., 1.], &[2., 2.], -1., 1.).is_empty());
    }
    #[test]
    fn point_label_templates_round_to_three_decimals_and_normalize_negative_zero() {
        assert_eq!(super::format_point_label("P(0, {y})", 0., -0.), "P(0, 0)");
        assert_eq!(super::format_point_label("{x}", 1.23456, 0.), "1.235");
        assert_eq!(
            super::format_point_label("{coords}", 0.30000000000000004, -2.),
            "(0.3, -2)"
        );
        assert_eq!(super::format_point_label("静态", 1., 2.), "静态");
        assert_eq!(super::format_point_label("", 1., 2.), "");
    }
    #[test]
    fn polygon_vertices_resolve_point_ids_and_reject_bad_references() {
        let c = json!({"points":[{"id":"a","x":0,"y":0},{"id":"b","x":4,"y":0},{"id":"c","x":4,"y":3},{"id":"d","x":0,"y":3}]});
        let polygon = json!({"points":["a","b","c","d"]});
        assert_eq!(
            super::polygon_vertices(&c, &polygon).unwrap(),
            vec![(0., 0.), (4., 0.), (4., 3.), (0., 3.)]
        );
        assert!(super::polygon_vertices(&c, &json!({"points":["a","b","missing"]})).is_err());
        assert!(super::polygon_vertices(&c, &json!({"points":["a","b"]})).is_err());
    }
    #[test]
    fn polygon_bands_cover_rectangles_exactly() {
        let (xs, lo, hi) =
            super::polygon_bands(&[(0., 0.), (4., 0.), (4., 3.), (0., 3.)]);
        assert_eq!(xs, vec![0., 4.]);
        assert_eq!(lo, vec![0., 0.]);
        assert_eq!(hi, vec![3., 3.]);
        let (xs, lo, hi) = super::polygon_bands(&[(0., 0.), (2., 2.), (4., 0.)]);
        assert_eq!(xs, vec![0., 2., 4.]);
        assert_eq!(lo, vec![0., 0., 0.]);
        assert_eq!(hi, vec![0., 2., 0.]);
    }
    #[test]
    fn polygon_tones_match_the_web_palette() {
        let (fill, stroke) = super::polygon_tone("primary");
        assert!((fill.w - 0.18).abs() < 1e-6);
        assert!((stroke.y - 135. / 255.).abs() < 1e-6);
        assert_eq!(super::polygon_tone("unknown"), super::polygon_tone("primary"));
        assert_ne!(super::polygon_tone("accent"), super::polygon_tone("primary"));
    }
    #[test]
    fn secant_measurement_matches_the_web_guard() {
        let m = super::secant_measurement((0., 1.), (1., 3.)).unwrap();
        assert_eq!((m.dx, m.dy, m.slope), (1., 2., 2.));
        assert!(super::secant_measurement((1., 1.), (1., 5.)).is_none());
        assert!(super::secant_measurement((0., f64::NAN), (1., 5.)).is_none());
    }
    #[test]
    fn precision5_trims_like_js_to_precision() {
        assert_eq!(super::precision5(2.), "2");
        assert_eq!(super::precision5(0.30000000000000004), "0.3");
        assert_eq!(super::precision5(-2.), "-2");
        assert_eq!(super::precision5(1.0 / 3.0), "0.33333");
        assert_eq!(super::precision5(123456.), "123460");
    }
    #[test]
    fn equal_scale_widens_only_the_less_constrained_axis() {
        // Plot area 372x314 (plot card), x range 8, y range 12: y is the
        // limiting axis, x widens symmetrically to keep units square.
        let ((x0, x1), (y0, y1)) = super::equal_scale_ranges(-4., 4., -6., 6., 372., 314.);
        assert!((y0 - -6.).abs() < 1e-9 && (y1 - 6.).abs() < 1e-9);
        let scale = 314. / 12.;
        let half = 372. / scale / 2.;
        assert!((x0 - -half).abs() < 1e-9 && (x1 - half).abs() < 1e-9);
        // Degenerate inputs pass through unchanged.
        assert_eq!(
            super::equal_scale_ranges(0., 0., -1., 1., 372., 314.),
            ((0., 0.), (-1., 1.))
        );
    }
    #[test]
    fn chart_caption_uses_geometry_caption_or_secant_measurement() {
        let geometry = json!({"kind":"geometry","content":{"caption":"每个小方格面积为 1"}});
        assert_eq!(super::chart_caption(&geometry), "每个小方格面积为 1");
        let plot = json!({"kind":"plot","content":{"measurement":"secant","points":[{"x":0,"y":1},{"x":1,"y":3}]}});
        assert_eq!(
            super::chart_caption(&plot),
            "Δx = 1 · Δy = 2 · 割线斜率 ≈ 2"
        );
        let degenerate = json!({"kind":"plot","content":{"measurement":"secant","points":[{"x":1,"y":1},{"x":1,"y":3}]}});
        assert!(super::chart_caption(&degenerate).contains("重合"));
        let plain = json!({"kind":"plot","content":{}});
        assert_eq!(super::chart_caption(&plain), "");
    }
}
impl AppMain for App {
    fn script_mod(vm: &mut ScriptVm) -> ScriptValue {
        makepad_widgets::script_mod(vm);
        makepad_plot::script_mod(vm);
        spatial_board::script_mod(vm);
        self::script_mod(vm)
    }
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
        if matches!(event, Event::Startup) {
            match progress_store::Store::start(cx) {
                Ok(store) => self.store = Some(store),
                Err(e) => self.ui.label(cx, ids!(progress_status)).set_text(cx, &e),
            }
            self.reset(cx);
            self.last_tick = Some(Instant::now());
            self.timer = cx.start_interval(1.0 / 60.0);
        }
        if let Event::AndroidIntegration { channel, payload } = event {
            match self.platform_events.receive(channel, payload) {
                Ok(Some((channel, payload))) => {
                    if channel == "ink" {
                        let w = self.ui.widget(cx, ids!(spatial));
                        if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                            if let Err(e) = board.ink_batch(cx, &payload) {
                                self.ui.label(cx, ids!(service_status)).set_text(cx, &e);
                                cx.android_integration("oll.ink",&serde_json::json!({"op":"cancel","pointerId":payload["pointerId"]}).to_string());
                            }
                        };
                    } else if channel == "ink.lifecycle" {
                        self.drawing = false;
                        let w = self.ui.widget(cx, ids!(spatial));
                        if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                            board.set_drawing(cx, false);
                        };
                    } else if channel == "audio" {
                        let message = if let Some(wav) = payload["wavBase64"].as_str() {
                            format!(
                                "已收到原生录音片段：{} 个 Base64 字符，{} Hz",
                                wav.len(),
                                payload["sampleRate"]
                            )
                        } else {
                            payload["message"]
                                .as_str()
                                .unwrap_or("收到原生音频事件")
                                .into()
                        };
                        self.ui
                            .label(cx, ids!(service_status))
                            .set_text(cx, &message);
                    }
                }
                Ok(None) => (),
                Err(e) => self.ui.label(cx, ids!(service_status)).set_text(cx, &e),
            }
        }
        self.poll_storage(cx);
        let mut skip_autosave = false;
        let control_event = matches!(event, Event::Actions(_));
        let was_playing = self.player.as_ref().is_some_and(|s| s.playing);
        if self.timer.is_event(event).is_some() || control_event {
            let now = Instant::now();
            let dt = self
                .last_tick
                .replace(now)
                .map(|t| now.duration_since(t).as_secs_f64())
                .unwrap_or(0.0);
            let w = self.ui.widget(cx, ids!(spatial));
            if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                if was_playing {
                    board.advance(cx, dt);
                }
            };
            if let Some(session) = &mut self.player {
                if let Err(e) = session.tick(dt) {
                    self.error = e;
                }
            }
        }
        if let Event::Actions(actions) = event {
            let w = self.ui.widget(cx, ids!(spatial));
            if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                if self.ui.button(cx, ids!(overview)).clicked(actions) {
                    board.overview(cx);
                }
                if self.ui.button(cx, ids!(zoom_in)).clicked(actions) {
                    board.zoom(cx, 1.2);
                }
                if self.ui.button(cx, ids!(zoom_out)).clicked(actions) {
                    board.zoom(cx, 1. / 1.2);
                }
                if self.ui.button(cx, ids!(follow)).clicked(actions) {
                    board.follow(cx);
                }
            };

            if self.ui.button(cx, ids!(ink_mode)).clicked(actions) {
                self.drawing = !self.drawing;
                if let Some(player) = &mut self.player {
                    player.pause();
                }
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.set_drawing(cx, self.drawing);
                };
                self.ui.label(cx, ids!(service_status)).set_text(
                    cx,
                    if self.drawing {
                        "书写模式：课程暂停，拖动可写字"
                    } else {
                        "浏览模式：拖动可移动白板"
                    },
                );
            }
            {
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    if self.ui.button(cx, ids!(ink_undo)).clicked(actions) {
                        board.undo_ink(cx);
                    }
                    if self.ui.button(cx, ids!(ink_redo)).clicked(actions) {
                        board.redo_ink(cx);
                    }
                };
            }
            if self.ui.button(cx, ids!(audio_start)).clicked(actions) {
                #[cfg(target_os = "android")]
                cx.android_integration("oll.audio", r#"{"op":"start"}"#);
                #[cfg(not(target_os = "android"))]
                self.ui.label(cx, ids!(service_status)).set_text(
                    cx,
                    "此按钮验证复用的 Android 录音服务，请在 Android 验证包中使用",
                );
            }
            if self.ui.button(cx, ids!(audio_stop)).clicked(actions) {
                #[cfg(target_os = "android")]
                cx.android_integration("oll.audio", r#"{"op":"stop"}"#);
            }
            if self.ui.button(cx, ids!(save_progress)).clicked(actions) {
                self.save_progress(cx);
            }
            if self.ui.button(cx, ids!(restore_progress)).clicked(actions) {
                skip_autosave = true;
                self.ui
                    .label(cx, ids!(progress_status))
                    .set_text(cx, "正在恢复进度…");
                if let Some(player) = &mut self.player {
                    player.pause();
                }
                if let Some(store) = &self.store {
                    if store
                        .send(progress_store::Request::Load(self.course_key()))
                        .is_err()
                    {
                        self.ui
                            .label(cx, ids!(progress_status))
                            .set_text(cx, "存储队列忙，请稍后重试恢复");
                    }
                }
            }
            if self.ui.button(cx, ids!(switch_course)).clicked(actions) {
                skip_autosave = true;
                self.course_index = (self.course_index + 1) % 4;
                self.reset(cx);
            }
            if self.ui.button(cx, ids!(formulas)).clicked(actions) {
                self.formula_mode = !self.formula_mode;
                if let Some(session) = &mut self.player {
                    session.pause();
                }
            }
            if self.ui.button(cx, ids!(next_formulas)).clicked(actions) {
                let count = serde_json::from_str::<Vec<Value>>(FORMULAS)
                    .expect("embedded corpus")
                    .len()
                    .div_ceil(2);
                self.formula_page = (self.formula_page + 1) % count;
                self.formula_mode = true;
                if let Some(session) = &mut self.player {
                    session.pause();
                }
            }
            if self.formula_mode && self.drawing {
                self.drawing = false;
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.set_drawing(cx, false);
                };
            }
            if self.ui.button(cx, ids!(reset)).clicked(actions) {
                skip_autosave = true;
                self.reset(cx);
            }
            if self.ui.button(cx, ids!(play)).clicked(actions) {
                if self.drawing {
                    self.drawing = false;
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.set_drawing(cx, false);
                    };
                }
                self.formula_mode = false;
                if self.player.as_ref().is_some_and(Session::complete) {
                    self.reset(cx);
                }
                if let Some(session) = &mut self.player {
                    if session.playing {
                        session.pause();
                    } else if let Err(e) = session.play() {
                        self.error = e;
                    }
                }
                self.last_tick = Some(Instant::now());
            }
        }
        if !skip_autosave
            && self.player.as_ref().is_some_and(|s| s.cursor > 0)
            && was_playing
            && (self
                .last_save
                .is_none_or(|t| t.elapsed().as_secs_f64() >= 1.)
                || self.player.as_ref().is_some_and(|s| !s.playing))
        {
            self.save_progress(cx);
        }
        self.poll_storage(cx);
        if (self.timer.is_event(event).is_some() && was_playing) || control_event {
            self.refresh(cx);
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
    }
}
