use makepad_plot::{LinePlot, LineStyle, MarkerStyle, Series};
pub use makepad_widgets;
use makepad_widgets::*;
use oll_runtime::{expression::evaluate, preview::Preview};
use serde_json::Value;
use std::time::Instant;
app_main!(App);
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
                    Label { text: "macOS 原生验证 · 固定节拍预览 · 暂未接入语音与课后交互" }
                    View { width: Fill height: Fit flow: Right spacing: 16
                        play := Button { text: "播放 / 暂停" }
                        reset := Button { text: "重新开始" }
                        status := Label { text: "准备就绪" }
                    }
                    View { width: Fill height: 490 flow: Right spacing: 20
                        circle := LinePlot { width: 490 height: 490 plot_margin: Inset{left: 52 right: 16 top: 28 bottom: 40} demo_data: false interactive: false }
                        wave := LinePlot { width: Fill height: Fill demo_data: false interactive: false }
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
    player: Option<Preview>,
    #[rust]
    timer: Timer,
    #[rust]
    last_tick: Option<Instant>,
    #[rust]
    playing: bool,
    #[rust]
    wait: f64,
    #[rust]
    error: String,
}
impl App {
    fn reset(&mut self, cx: &mut Cx) {
        self.playing = false;
        self.wait = 0.0;
        self.error.clear();
        match Preview::load(COURSE) {
            Ok(p) => self.player = Some(p),
            Err(e) => self.error = e,
        }
        self.refresh(cx);
    }
    fn refresh(&mut self, cx: &mut Cx) {
        if let Some(p) = &self.player {
            self.ui.label(cx, ids!(title)).set_text(cx, &p.title);
            let status = format!(
                "{} · 动作 {}/{} · θ = {:.3}",
                if p.complete() {
                    "播放完成"
                } else if self.playing {
                    "播放中"
                } else {
                    "已暂停"
                },
                p.cursor,
                p.action_count(),
                p.variables.get("theta").copied().unwrap_or(0.0)
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
                .set_text(cx, if p.complete() { &p.summary } else { "" });
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
                            self.playing = false;
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
        if let Event::Actions(actions) = event {
            if self.ui.button(cx, ids!(reset)).clicked(actions) {
                self.reset(cx);
            }
            if self.ui.button(cx, ids!(play)).clicked(actions) {
                if self.player.as_ref().is_some_and(Preview::complete) {
                    self.reset(cx);
                }
                self.playing = !self.playing;
                self.last_tick = Some(Instant::now());
                self.refresh(cx);
            }
        }
        if self.timer.is_event(event).is_some() {
            let now = Instant::now();
            let dt = self
                .last_tick
                .replace(now)
                .map(|t| now.duration_since(t).as_secs_f64())
                .unwrap_or(0.0);
            if self.playing {
                if let Some(p) = &mut self.player {
                    let result = if p.animating() {
                        p.tick(dt)
                    } else {
                        self.wait -= dt;
                        if self.wait <= 0.0 {
                            self.wait = 2.0;
                            p.advance()
                        } else {
                            Ok(())
                        }
                    };
                    if let Err(e) = result {
                        self.error = e;
                        self.playing = false;
                    }
                    if p.complete() {
                        self.playing = false;
                    }
                }
                self.refresh(cx);
            }
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
    }
}
