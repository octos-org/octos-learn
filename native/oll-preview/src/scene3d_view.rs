//! Native `.scene3d-runtime` panel (web-runtime scene3d.ts + styles.css):
//! radial-gradient panel, the projected scene in the 420x270 viewBox, the
//! 等轴/正视/俯视/复位 control bar, the static fallback line and the
//! octos-learn "拖动画面旋转 · 滚动缩放" hint badge.
//! Board cards receive no events, so SpatialBoard routes pointer input here
//! through `button_at` / `scene_contains` in board world coordinates.
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;
use oll_runtime::expression::Variables;
use oll_runtime::scene3d::{self, Prim, TextStyle, View};
use serde_json::Value;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.Scene3dView = set_type_default() do #(Scene3dView::register_widget(vm)) {
        width: Fill height: Fill
        draw_panel +: {draw_depth: 0.0}
        draw_scene +: {draw_depth: 0.0}
        draw_top +: {draw_depth: 0.0}
        draw_text +: {color: #3f5e58 text_style: theme.font_regular{font_size: 7.5}}
        draw_bold +: {color: #3f5e58 text_style: theme.font_bold{font_size: 7.5}}
    }
}

const HINT: &str = "拖动画面旋转 · 滚动缩放";
const CONTROLS: [&str; 4] = ["等轴", "正视", "俯视", "复位"];
/// Web px → Makepad points.
const PT: f64 = 0.75;
const CONTROLS_HEIGHT: f64 = 29.;
const FALLBACK_HEIGHT: f64 = 24.5;

#[derive(Script, ScriptHook, Widget)]
pub struct Scene3dView {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_panel: DrawVector,
    #[live]
    draw_scene: DrawVector,
    #[live]
    draw_top: DrawVector,
    #[live]
    draw_text: DrawText,
    #[live]
    draw_bold: DrawText,
    #[rust]
    content: Value,
    #[rust]
    variables: Variables,
    #[rust]
    view: Option<View>,
    #[rust]
    error: Option<String>,
    #[rust]
    rect: Rect,
    #[rust]
    scene_rect: Rect,
    #[rust]
    buttons: Vec<Rect>,
}

fn rgb(hex: u32) -> (f32, f32, f32) {
    (
        ((hex >> 16) & 0xff) as f32 / 255.,
        ((hex >> 8) & 0xff) as f32 / 255.,
        (hex & 0xff) as f32 / 255.,
    )
}
fn set(v: &mut DrawVector, hex: u32, alpha: f64) {
    let (r, g, b) = rgb(hex);
    v.set_color(r, g, b, alpha as f32);
}
fn path(v: &mut DrawVector, points: &[(f64, f64)], closed: bool) {
    let Some(first) = points.first() else {
        return;
    };
    v.move_to(first.0 as f32, first.1 as f32);
    for p in &points[1..] {
        v.line_to(p.0 as f32, p.1 as f32);
    }
    if closed {
        v.close();
    }
}
/// SVG stroke-dasharray along a polyline, restarting nowhere (one pattern
/// across the whole outline, as SVG does).
fn dashed(v: &mut DrawVector, points: &[(f64, f64)], closed: bool, dash: (f64, f64), width: f32) {
    let mut pts = points.to_vec();
    if closed {
        if let Some(first) = points.first() {
            pts.push(*first);
        }
    }
    let period = dash.0 + dash.1;
    let mut phase = 0.0f64;
    for w in pts.windows(2) {
        let (a, b) = (w[0], w[1]);
        let len = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
        let mut t = 0.;
        while t < len {
            let in_period = phase % period;
            let (on, left) = if in_period < dash.0 {
                (true, dash.0 - in_period)
            } else {
                (false, period - in_period)
            };
            let step = left.min(len - t);
            if on {
                let p = |s: f64| (a.0 + (b.0 - a.0) * s / len, a.1 + (b.1 - a.1) * s / len);
                let (s, e) = (p(t), p(t + step));
                v.move_to(s.0 as f32, s.1 as f32);
                v.line_to(e.0 as f32, e.1 as f32);
                v.stroke_opts(width, LineCap::Butt, LineJoin::Miter, 4., 1.);
            }
            t += step;
            phase += step;
        }
    }
}

impl Scene3dView {
    /// Content is the runtime-bound node content (section values already
    /// follow lesson variables); surfaces also read the variables directly.
    pub fn set_content(&mut self, cx: &mut Cx, content: &Value, variables: &Variables) {
        if &self.content != content || &self.variables != variables {
            self.content = content.clone();
            self.variables = variables.clone();
            self.redraw(cx);
        }
    }
    pub fn view(&self) -> View {
        self.view.unwrap_or_else(|| View::initial(&self.content))
    }
    pub fn set_view(&mut self, cx: &mut Cx, view: Option<View>) {
        let view = view.map(View::normalized);
        if self.view != view {
            self.view = view;
            self.redraw(cx);
        }
    }
    /// Index into [等轴, 正视, 俯视, 复位] under a board-world point.
    pub fn button_at(&self, p: DVec2) -> Option<usize> {
        self.buttons.iter().position(|r| r.contains(p))
    }
    pub fn scene_contains(&self, p: DVec2) -> bool {
        self.scene_rect.contains(p)
    }
    /// The view a control button applies (复位 = authored camera).
    pub fn control_view(&self, index: usize) -> View {
        scene3d::PRESETS
            .get(index)
            .map(|p| p.1)
            .unwrap_or_else(|| View::initial(&self.content))
    }
    fn text(&mut self, bold: bool) -> &mut DrawText {
        if bold {
            &mut self.draw_bold
        } else {
            &mut self.draw_text
        }
    }
    fn text_width(&mut self, cx: &mut Cx2d, text: &str, px: f64, bold: bool) -> f64 {
        let t = self.text(bold);
        t.text_style.font_size = (px * PT) as f32;
        t.prepare_single_line_run(cx, text)
            .map_or(0., |r| r.width_in_lpxs as f64)
    }
    fn draw_label(
        &mut self,
        cx: &mut Cx2d,
        at: DVec2,
        text: &str,
        px: f64,
        color: Vec4,
        bold: bool,
    ) {
        let t = self.text(bold);
        t.text_style.font_size = (px * PT) as f32;
        t.color = color;
        t.draw_abs(cx, at, text);
    }
}

fn hex4(hex: u32, alpha: f32) -> Vec4 {
    let (r, g, b) = rgb(hex);
    vec4(r, g, b, alpha)
}

impl Widget for Scene3dView {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let rect = cx.walk_turtle(walk);
        self.rect = rect;
        let (x, y, w, h) = (rect.pos.x, rect.pos.y, rect.size.x, rect.size.y);
        if w < 40. || h < 80. {
            return DrawStep::done();
        }
        cx.begin_turtle(
            Walk {
                abs_pos: Some(rect.pos),
                width: Size::Fixed(w),
                height: Size::Fixed(h),
                ..Default::default()
            },
            Layout::default(),
        );
        // Panel: radial-gradient(circle at 50% 42%, rgba(255,255,255,.95),
        // rgba(228,239,235,.78)), radius 12; CSS "circle" defaults to the
        // farthest-corner radius. DrawVector evaluates gradients per pixel
        // from an uploaded stop row.
        let radius = 12.;
        let v = &mut self.draw_panel;
        v.begin();
        let (gx, gy) = (x + w * 0.5, y + h * 0.42);
        let reach = [(x, y), (x + w, y), (x, y + h), (x + w, y + h)]
            .iter()
            .map(|(px, py)| ((px - gx).powi(2) + (py - gy).powi(2)).sqrt())
            .fold(0., f64::max);
        let stops = vec![
            GradientStop::new(0., 1., 1., 1., 0.95),
            GradientStop::from_hex(1., 0xe4efeb, 0.78),
        ];
        v.cur_gradient_row_v = v.add_gradient_row(&stops);
        v.set_paint(VectorPaint::radial_gradient(
            gx as f32,
            gy as f32,
            reach as f32,
            reach as f32,
            stops,
        ));
        v.rounded_rect(x as f32, y as f32, w as f32, h as f32, radius as f32);
        v.fill();
        v.cur_gradient_row_v = -1.;
        // Control bar and fallback strip (rgba(255,255,255,.46) / .6).
        let fallback_top = y + h - FALLBACK_HEIGHT;
        let controls_top = fallback_top - CONTROLS_HEIGHT;
        set(v, 0xffffff, 0.46);
        v.rect(
            x as f32,
            controls_top as f32,
            w as f32,
            CONTROLS_HEIGHT as f32,
        );
        v.fill_opts(LineJoin::Miter, 4., 0.);
        set(v, 0xffffff, 0.6);
        v.move_to(x as f32, fallback_top as f32);
        v.line_to((x + w) as f32, fallback_top as f32);
        v.line_to((x + w) as f32, (y + h - radius) as f32);
        v.quad_to(
            (x + w) as f32,
            (y + h) as f32,
            (x + w - radius) as f32,
            (y + h) as f32,
        );
        v.line_to((x + radius) as f32, (y + h) as f32);
        v.quad_to(x as f32, (y + h) as f32, x as f32, (y + h - radius) as f32);
        v.close();
        v.fill();
        v.end(cx);

        // Scene: SVG viewBox 420x270, preserveAspectRatio xMidYMid meet.
        let area = rect_from(x, y, w, (controls_top - y).max(1.));
        let scale = (area.size.x / scene3d::WIDTH).min(area.size.y / scene3d::HEIGHT);
        let ox = area.pos.x + (area.size.x - scene3d::WIDTH * scale) / 2.;
        let oy = area.pos.y + (area.size.y - scene3d::HEIGHT * scale) / 2.;
        self.scene_rect = area;
        let map = |(px, py): (f64, f64)| ((ox + px * scale) as f32, (oy + py * scale) as f32);
        let drawing = scene3d::render(&self.content, self.view(), &self.variables);
        self.error = drawing.as_ref().err().cloned();
        let mut labels = Vec::new();
        // The SVG viewport clips its content (zoomed scenes overflow).
        cx.begin_turtle(
            Walk {
                abs_pos: Some(area.pos),
                width: Size::Fixed(area.size.x),
                height: Size::Fixed(area.size.y),
                ..Default::default()
            },
            Layout {
                clip_x: true,
                clip_y: true,
                ..Layout::default()
            },
        );
        let v = &mut self.draw_scene;
        v.begin();
        if let Ok(drawing) = &drawing {
            for prim in &drawing.prims {
                match prim {
                    Prim::Path {
                        points,
                        closed,
                        fill,
                        stroke,
                        stroke_width,
                        dash,
                        round,
                        ..
                    } => {
                        let pts: Vec<(f64, f64)> = points
                            .iter()
                            .map(|p| {
                                let (a, b) = map(*p);
                                (a as f64, b as f64)
                            })
                            .collect();
                        if let (Some((c, a)), true) = (fill, *closed) {
                            set(v, *c, *a);
                            path(v, &pts, true);
                            v.fill();
                        }
                        if let Some((c, a)) = stroke {
                            set(v, *c, *a);
                            let width = *stroke_width as f32;
                            if let Some(d) = dash {
                                dashed(v, &pts, *closed, *d, width);
                            } else {
                                path(v, &pts, *closed);
                                let (cap, join) = if *round {
                                    (LineCap::Round, LineJoin::Round)
                                } else {
                                    (LineCap::Butt, LineJoin::Miter)
                                };
                                v.stroke_opts(width, cap, join, 4., 1.);
                            }
                        }
                    }
                    Prim::Circle {
                        center,
                        radius,
                        fill,
                        stroke,
                        stroke_width,
                        ..
                    } => {
                        let (cx_, cy_) = map(*center);
                        let r = (*radius * scale) as f32;
                        set(v, *fill, 1.);
                        v.circle(cx_, cy_, r);
                        v.fill();
                        set(v, *stroke, 1.);
                        v.circle(cx_, cy_, r);
                        v.stroke(*stroke_width as f32);
                    }
                    Prim::Text { at, text, style } => {
                        let (a, b) = map(*at);
                        labels.push((dvec2(a as f64, b as f64), text.clone(), *style));
                    }
                }
            }
        }
        v.end(cx);
        let text_px = 11. * scale * drawing.as_ref().map_or(1., |d| d.text_scale);
        for (at, text, style) in labels {
            // SVG text y is the baseline; draw_abs positions the line top.
            let top = at - dvec2(0., text_px * 0.8);
            let color = match style {
                TextStyle::Axis => hex4(0x5f6f6b, 1.),
                TextStyle::Highlight => hex4(0x8d302a, 1.),
            };
            self.draw_label(cx, top, &text, text_px, color, true);
        }
        if let Some(error) = self.error.clone() {
            let msg = format!("三维场景暂时无法交互：{error}");
            self.draw_label(
                cx,
                area.pos + dvec2(12., 12.),
                &msg,
                10.,
                hex4(0x8d302a, 1.),
                false,
            );
        }
        cx.end_turtle();

        // Controls: padding 5px 10px 2px, gap 5; buttons 600 10px, padding
        // 5px 8px, 1px rgba(44,104,96,.2) border, radius 8.
        let widths: Vec<f64> = CONTROLS
            .iter()
            .map(|t| self.text_width(cx, t, 10., true))
            .collect();
        let hint_width = self.text_width(cx, HINT, 10., false);
        self.buttons.clear();
        let mut bx = x + 10.;
        let by = controls_top + 5.;
        let bh = 22.;
        for width in &widths {
            self.buttons.push(rect_from(bx, by, width + 18., bh));
            bx += width + 18. + 5.;
        }
        let hint = rect_from(
            x + w - 10. - (hint_width + 18.),
            y + 10.,
            hint_width + 18.,
            22.,
        );
        let v = &mut self.draw_top;
        v.begin();
        for r in self.buttons.iter().chain([&hint]) {
            let rad = if std::ptr::eq(r, &hint) { 9. } else { 8. };
            set(v, 0xfffdf7, if std::ptr::eq(r, &hint) { 0.9 } else { 0.92 });
            v.rounded_rect(
                r.pos.x as f32,
                r.pos.y as f32,
                r.size.x as f32,
                r.size.y as f32,
                rad,
            );
            v.fill();
            if std::ptr::eq(r, &hint) {
                set(v, 0x206f68, 0.18);
            } else {
                set(v, 0x2c6860, 0.2);
            }
            v.rounded_rect(
                r.pos.x as f32 + 0.5,
                r.pos.y as f32 + 0.5,
                r.size.x as f32 - 1.,
                r.size.y as f32 - 1.,
                rad,
            );
            v.stroke(1.);
        }
        v.end(cx);
        let buttons = self.buttons.clone();
        for (i, r) in buttons.iter().enumerate() {
            self.draw_label(
                cx,
                r.pos + dvec2(9., 5.),
                CONTROLS[i],
                10.,
                hex4(0x3f5e58, 1.),
                true,
            );
        }
        self.draw_label(
            cx,
            hint.pos + dvec2(9., 5.),
            HINT,
            10.,
            hex4(0x35645f, 1.),
            false,
        );
        let fallback = self.content["fallback"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("请结合旁白和标注理解这个三维场景。");
        let fallback = format!("静态说明：{fallback}");
        self.draw_label(
            cx,
            dvec2(x + 12., fallback_top + 4.),
            &fallback,
            10.,
            hex4(0x66736f, 1.),
            false,
        );
        cx.end_turtle();
        DrawStep::done()
    }
}

fn rect_from(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        pos: dvec2(x, y),
        size: dvec2(w, h),
    }
}
