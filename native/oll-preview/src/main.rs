use makepad_plot::{LinePlot, LineStyle, MarkerStyle, Series};
pub use makepad_widgets;
use makepad_widgets::*;
use oll_runtime::{expression::evaluate, preview::Preview, session::Session};
use serde_json::Value;
use std::time::Instant;
mod formula_view;
app_main!(App);
const FORMULAS: &str = include_str!("../courses/formulas.json");
const COURSE: &str = include_str!("../courses/unit-circle-sine.jsonl");
script_mod! {
    use mod.prelude.widgets.*
    use mod.plot.*
    startup() do #(App::script_component(vm)) {
        ui: Root {
            main_window := Window {
                window.inner_size: vec2(1200, 850)
                body +: {
                    flow: Down spacing: 12 padding: 20
                    title := Label { text: "OLL · Makepad" draw_text.text_style.font_size: 24 }
                    Label { text: "macOS 原生验证 · OLL 讲解阶段调度 · 暂未接入语音与课后交互" }
                    View { width: Fill height: Fit flow: Right spacing: 16
                        play := Button { text: "播放 / 暂停" }
                        reset := Button { text: "重新开始" }
                        formulas := Button { text: "课程 / 公式" }
                        next_formulas := Button { text: "下一组公式" }
                        status := Label { text: "准备就绪" }
                    }
                    charts := View { width: Fill height: 490 flow: Right spacing: 20
                        circle := LinePlot { width: 490 height: 490 plot_margin: Inset{left: 52 right: 16 top: 28 bottom: 40} demo_data: false interactive: false }
                        wave := LinePlot { width: Fill height: Fill demo_data: false interactive: false }
                    }
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
                    mapping := Label { width: Fill text: "" }
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
    formula_page: usize,
    #[rust]
    formula_sources: [Option<String>; 2],
    #[rust]
    formula_errors: [String; 2],
}
impl App {
    fn reset(&mut self, cx: &mut Cx) {
        self.formula_mode = false;
        self.error.clear();
        match Session::load(COURSE) {
            Ok(p) => self.player = Some(p),
            Err(e) => self.error = e,
        }
        self.refresh(cx);
    }
    fn refresh(&mut self, cx: &mut Cx) {
        self.ui
            .widget(cx, ids!(charts))
            .set_visible(cx, !self.formula_mode);
        self.ui
            .widget(cx, ids!(formula_panel))
            .set_visible(cx, self.formula_mode);
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
                "{} · 动作 {}/{} · θ = {:.3} · {}",
                if session.complete() {
                    "播放完成"
                } else if session.playing {
                    "播放中"
                } else {
                    "已暂停"
                },
                p.cursor,
                p.action_count(),
                p.variables.get("theta").copied().unwrap_or(0.0),
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
                .filter_map(|c| c["label"].as_str())
                .collect::<Vec<_>>()
                .join(" → ");
            self.ui.label(cx, ids!(mapping)).set_text(
                cx,
                &format!(
                    "{}{}",
                    labels,
                    if p.focus.is_empty() {
                        ""
                    } else {
                        "  · 当前关注：单位圆与正弦图"
                    }
                ),
            );
            for (id, kind) in [(ids!(circle), "geometry"), (ids!(wave), "plot")] {
                let widget = self.ui.widget(cx, id);
                if let Some(mut plot) = widget.borrow_mut::<LinePlot>() {
                    plot.clear();
                    if let Some(node) = p.nodes.iter().find(|n| n["kind"] == kind) {
                        if let Err(e) = render(&mut plot, node, p) {
                            self.error = e;
                        }
                    } else {
                        plot.set_title("等待课程动作");
                    }
                };
            }
        }
        self.ui.redraw(cx);
    }
}
fn num(v: &Value, k: &str) -> Result<f64, String> {
    v[k].as_f64()
        .ok_or_else(|| format!("Missing coordinate {k}"))
}
fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
fn items<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    v[k].as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn render(plot: &mut LinePlot, node: &Value, p: &Preview) -> Result<(), String> {
    let c = &node["content"];
    let blue = vec4(0.20, 0.65, 1.0, 1.0);
    let gold = vec4(1.0, 0.65, 0.15, 1.0);
    plot.set_title(text(c, "title"));
    plot.set_xlabel(text(&c["axes"]["x"], "label"));
    plot.set_ylabel(text(&c["axes"]["y"], "label"));
    let xmin = num(&c["axes"]["x"], "min")?;
    let xmax = num(&c["axes"]["x"], "max")?;
    plot.set_xlim(xmin, xmax);
    plot.set_ylim(num(&c["axes"]["y"], "min")?, num(&c["axes"]["y"], "max")?);
    plot.set_show_points(false);
    plot.set_legend(makepad_plot::LegendPosition::None);
    let points = items(c, "points");
    let point = |id: &str| -> Result<(f64, f64), String> {
        let v = points
            .iter()
            .find(|v| v["id"] == id)
            .ok_or_else(|| format!("Unknown point {id}"))?;
        Ok((num(v, "x")?, num(v, "y")?))
    };
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
                .with_line_style(if text(segment, "style") == "projection" {
                    LineStyle::Dashed
                } else {
                    LineStyle::Solid
                }),
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
        plot.add_series(
            Series::new(text(curve, "label"))
                .with_data(xs, ys)
                .with_color(blue),
        );
    }
    for pt in points {
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
        plot.annotate(text(pt, "label"), x, y + offset, gold, 10.0);
    }
    Ok(())
}
impl AppMain for App {
    fn script_mod(vm: &mut ScriptVm) -> ScriptValue {
        makepad_widgets::script_mod(vm);
        makepad_plot::script_mod(vm);
        self::script_mod(vm)
    }
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
        if matches!(event, Event::Startup) {
            self.reset(cx);
            self.last_tick = Some(Instant::now());
            self.timer = cx.start_interval(1.0 / 60.0);
        }
        let control_event = matches!(event, Event::Actions(_));
        let was_playing = self.player.as_ref().is_some_and(|s| s.playing);
        if self.timer.is_event(event).is_some() || control_event {
            let now = Instant::now();
            let dt = self
                .last_tick
                .replace(now)
                .map(|t| now.duration_since(t).as_secs_f64())
                .unwrap_or(0.0);
            if let Some(session) = &mut self.player {
                if let Err(e) = session.tick(dt) {
                    self.error = e;
                }
            }
        }
        if let Event::Actions(actions) = event {
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
            if self.ui.button(cx, ids!(reset)).clicked(actions) {
                self.reset(cx);
            }
            if self.ui.button(cx, ids!(play)).clicked(actions) {
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
        if (self.timer.is_event(event).is_some() && was_playing) || control_event {
            self.refresh(cx);
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
    }
}
