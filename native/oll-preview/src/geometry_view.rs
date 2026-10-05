//! Native `.geometry-explorer-body` (web board-view.ts drawGeometry +
//! geometry-explorer.ts + styles.css): toolbar, the geometry in the Web
//! 404×280 SVG viewBox scaled to the card width, and the caption. Geometry
//! comes from `oll_runtime::geometry::geometry_scene`. Angle-control points
//! are dragged through SpatialBoard (board cards receive no events).
use crate::plot_view::{PlotState, Tool};
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;
use oll_runtime::geometry::{self, AngleControl, Primitive, SegmentStyle, Style, Tone};
use oll_runtime::plot::Range;
use serde_json::Value;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.GeometryView = set_type_default() do #(GeometryView::register_widget(vm)) {
        width: Fill height: Fit
        draw_grid +: {draw_depth: 0.0}
        draw_shapes +: {draw_depth: 0.0}
        draw_text +: {color: #374b47 text_style: theme.font_regular{font_size: 7.5}}
        draw_bold +: {color: #374b47 text_style: theme.font_bold{font_size: 7.5}}
    }
}

pub const VIEW_W: f64 = 404.;
pub const VIEW_H: f64 = 280.;
const PT: f64 = 0.75;
const TOOLBAR_H: f64 = 28.;
const TOOLBAR_TOP: f64 = -3.;
const TOOLBAR_BOTTOM: f64 = 5.;

#[derive(Script, ScriptHook, Widget)]
pub struct GeometryView {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_grid: DrawVector,
    #[live]
    draw_shapes: DrawVector,
    #[live]
    draw_text: DrawText,
    #[live]
    draw_bold: DrawText,
    #[rust]
    node: Value,
    #[rust]
    pub state: PlotState,
    #[rust]
    rect: Rect,
    #[rust]
    svg_rect: Rect,
    #[rust]
    tools: Vec<(Tool, Rect)>,
    #[rust]
    scene: Option<geometry::GeometryScene>,
    /// The variable whose control point is being dragged (highlighted).
    #[rust]
    pub active_control: Option<String>,
}

fn rgb(hex: u32) -> (f32, f32, f32) {
    (((hex >> 16) & 0xff) as f32 / 255., ((hex >> 8) & 0xff) as f32 / 255., (hex & 0xff) as f32 / 255.)
}
fn set(v: &mut DrawVector, hex: u32, alpha: f32) {
    let (r, g, b) = rgb(hex);
    v.set_color(r, g, b, alpha);
}
fn color(hex: u32) -> Vec4 {
    let (r, g, b) = rgb(hex);
    vec4(r, g, b, 1.)
}
fn polyline(v: &mut DrawVector, pts: &[(f32, f32)], closed: bool) {
    let Some(first) = pts.first() else { return };
    v.move_to(first.0, first.1);
    for p in &pts[1..] {
        v.line_to(p.0, p.1);
    }
    if closed {
        v.close();
    }
}
fn dashed(v: &mut DrawVector, pts: &[(f32, f32)], dash: &[f64], width: f32, cap: LineCap) {
    if dash.is_empty() {
        polyline(v, pts, false);
        v.stroke_opts(width, cap, LineJoin::Round, 4., 1.);
        return;
    }
    let period: f64 = dash.iter().sum();
    let mut phase = 0.0f64;
    for w in pts.windows(2) {
        let (a, b) = (w[0], w[1]);
        let len = (((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)) as f64).sqrt();
        let mut t = 0.;
        while t < len {
            let mut p = phase % period;
            let mut i = 0;
            while p >= dash[i] {
                p -= dash[i];
                i = (i + 1) % dash.len();
            }
            let step = (dash[i] - p).min(len - t);
            if i % 2 == 0 {
                let at = |s: f64| (a.0 + (b.0 - a.0) * (s / len) as f32, a.1 + (b.1 - a.1) * (s / len) as f32);
                let (s, e) = (at(t), at(t + step));
                v.move_to(s.0, s.1);
                v.line_to(e.0, e.1);
                v.stroke_opts(width, cap, LineJoin::Round, 4., 1.);
            }
            t += step;
            phase += step;
        }
    }
}
/// Emphasis stroke (web .geometry-*.emphasis-*): (color, width, opacity).
fn emphasis_stroke(e: Option<&str>, base: (u32, f64)) -> (u32, f64, f32) {
    match e {
        Some("focus") => (0xe15d45, 4.5, 1.),
        Some("supporting") => (0xd79a29, 4., 1.),
        Some("warning") => (0xcc3447, 4.5, 1.),
        Some("resolved") => (base.0, base.1, 0.68),
        _ => (base.0, base.1, 1.),
    }
}

impl GeometryView {
    pub fn set_node(&mut self, cx: &mut Cx, node: &Value, state: &PlotState) {
        if &self.node != node || &self.state != state {
            self.node = node.clone();
            self.state = state.clone();
            self.redraw(cx);
        }
    }
    pub fn tool_at(&self, p: DVec2) -> Option<Tool> {
        self.tools.iter().find(|(_, r)| r.contains(p)).map(|(t, _)| *t)
    }
    fn k(&self) -> f64 {
        self.svg_rect.size.x / VIEW_W
    }
    fn to_world(&self, x: f64, y: f64) -> DVec2 {
        dvec2(self.svg_rect.pos.x + x * self.k(), self.svg_rect.pos.y + y * self.k())
    }
    /// The angle control under a world point (generous 12px grab radius).
    pub fn control_at(&self, p: DVec2) -> Option<AngleControl> {
        let scene = self.scene.as_ref()?;
        scene
            .controls
            .iter()
            .find(|c| (self.to_world(c.x, c.y) - p).length() <= 12.)
            .cloned()
    }
    /// Pointer angle around a control's centre (web updateVariableDrag).
    pub fn pointer_angle(&self, control: &AngleControl, p: DVec2) -> f64 {
        let c = self.to_world(control.center.0, control.center.1);
        (c.y - p.y).atan2(p.x - c.x)
    }
    /// On-screen radius of a control around its centre, in world units.
    pub fn control_radius(&self, control: &AngleControl) -> f64 {
        (self.to_world(control.x, control.y) - self.to_world(control.center.0, control.center.1)).length()
    }
    /// Controls as world positions (debug snapshots).
    pub fn debug_controls(&self) -> Vec<serde_json::Value> {
        self.scene.as_ref().map_or(vec![], |s| {
            s.controls
                .iter()
                .map(|c| {
                    let p = self.to_world(c.x, c.y);
                    let o = self.to_world(c.center.0, c.center.1);
                    serde_json::json!({"variable": c.variable, "x": p.x, "y": p.y, "cx": o.x, "cy": o.y})
                })
                .collect()
        })
    }
    pub fn frame_fraction(&self, p: DVec2) -> Option<(f64, f64)> {
        let v = self.scene.as_ref()?.viewport;
        let (x, y) = ((p.x - self.svg_rect.pos.x) / self.k(), (p.y - self.svg_rect.pos.y) / self.k());
        (x >= v.left && x <= v.right && y >= v.top && y <= v.bottom)
            .then(|| ((x - v.left) / (v.right - v.left), 1. - (y - v.top) / (v.bottom - v.top)))
    }
    pub fn data_per_world(&self) -> Option<(f64, f64)> {
        let v = self.scene.as_ref()?.viewport;
        Some((1. / (v.scale * self.k()), 1. / (v.scale * self.k())))
    }
    pub fn current_ranges(&self) -> Option<(Range, Range)> {
        self.scene.as_ref().map(|s| (s.viewport.x, s.viewport.y))
    }
    fn text_width(t: &mut DrawText, cx: &mut Cx2d, text: &str, px: f64) -> f64 {
        t.text_style.font_size = (px * PT) as f32;
        t.prepare_single_line_run(cx, text).map_or(0., |r| r.width_in_lpxs as f64)
    }
}

impl Widget for GeometryView {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let width = cx.turtle().max_width(Walk { width: Size::fill(), ..walk }).unwrap_or(VIEW_W).max(40.);
        let k = width / VIEW_W;
        let scene = geometry::geometry_scene(&self.node, VIEW_W, VIEW_H, self.state.ranges, self.state.ticks);
        let toolbar = TOOLBAR_TOP + TOOLBAR_H + TOOLBAR_BOTTOM;
        let svg_h = VIEW_H * k;
        let caption_h = if scene.caption.is_some() { 6. + 12. * 1.5 * 2. } else { 0. };
        let rect = cx.walk_turtle(Walk {
            width: Size::Fixed(width),
            height: Size::Fixed(toolbar + svg_h + caption_h),
            ..walk
        });
        self.rect = rect;
        // Toolbar (web .coordinate-toolbar).
        let default = Range { min: -1.25, max: 1.25 };
        let axes = &self.node["content"]["axes"];
        let recommended = (oll_runtime::plot::range(&axes["x"], default), oll_runtime::plot::range(&axes["y"], default));
        let restored = self.state.ranges.is_none_or(|r| r == recommended);
        let mut tools = vec![(Tool::Explore, "探索")];
        if !restored {
            tools.push((Tool::Restore, "恢复"));
        }
        tools.push((Tool::Expand, "大图"));
        let widths: Vec<f64> = tools
            .iter()
            .map(|(_, l)| (Self::text_width(&mut self.draw_text, cx, l, 12.) + 18.).max(44.))
            .collect();
        let mut bx = rect.pos.x + width - 42. - widths.iter().sum::<f64>() - 5. * (widths.len() as f64 - 1.);
        let by = rect.pos.y + TOOLBAR_TOP;
        self.tools.clear();
        let v = &mut self.draw_grid;
        v.begin();
        for ((tool, _), w) in tools.iter().zip(&widths) {
            let pressed = *tool == Tool::Explore && self.state.exploring;
            set(v, if pressed { 0xd6eee7 } else { 0xfffdf7 }, 1.);
            v.rounded_rect(bx as f32, by as f32, *w as f32, TOOLBAR_H as f32, 7.);
            v.fill();
            set(v, if pressed { 0x87bcb4 } else { 0xcec8bd }, 1.);
            v.rounded_rect(bx as f32 + 0.5, by as f32 + 0.5, *w as f32 - 1., TOOLBAR_H as f32 - 1., 6.5);
            v.stroke(1.);
            self.tools.push((*tool, Rect { pos: dvec2(bx, by), size: dvec2(*w, TOOLBAR_H) }));
            bx += w + 5.;
        }
        // SVG.
        let (ox, oy) = (rect.pos.x, rect.pos.y + toolbar);
        self.svg_rect = Rect { pos: dvec2(ox, oy), size: dvec2(width, svg_h) };
        let map = |x: f64, y: f64| ((ox + x * k) as f32, (oy + y * k) as f32);
        let mut labels = Vec::new();
        for p in &scene.primitives {
            match p {
                Primitive::Line { x1, y1, x2, y2, style, clip: false, .. } => {
                    let (hex, w, dash): (u32, f64, &[f64]) = match style {
                        Style::GridMinor => (0xf0ece3, 0.5 * k, &[]),
                        Style::Grid => (0xe7e1d6, 0.75 * k, &[]),
                        Style::Axis => (0x777168, 1.5 * k, &[]),
                        _ => (0x758882, 1. * k, &[3., 2.]),
                    };
                    set(v, hex, 1.);
                    let dash: Vec<f64> = dash.iter().map(|d| d * k).collect();
                    dashed(v, &[map(*x1, *y1), map(*x2, *y2)], &dash, w as f32, LineCap::Butt);
                }
                Primitive::Text { x, y, text, anchor } => labels.push((*x, *y, text.clone(), *anchor)),
                _ => {}
            }
        }
        v.end(cx);
        let vp = scene.viewport;
        cx.begin_turtle(
            Walk {
                abs_pos: Some(dvec2(ox + vp.left * k, oy + vp.top * k)),
                width: Size::Fixed((vp.right - vp.left) * k),
                height: Size::Fixed((vp.bottom - vp.top) * k),
                ..Default::default()
            },
            Layout { clip_x: true, clip_y: true, ..Layout::default() },
        );
        let v = &mut self.draw_shapes;
        v.begin();
        for p in &scene.primitives {
            match p {
                Primitive::Polygon { points, style: Style::Polygon(tone), emphasis } => {
                    let (fill, alpha, stroke) = match tone {
                        Tone::Primary => (0x23877c, 0.18, 0x23877c),
                        Tone::Secondary => (0x4f84b5, 0.18, 0x4f84b5),
                        Tone::Accent => (0xd79a29, 0.22, 0xc7832e),
                        Tone::Neutral => (0x526b67, 0.12, 0x526b67),
                    };
                    let pts: Vec<(f32, f32)> = points.iter().map(|(x, y)| ((ox + x * k) as f32, (oy + y * k) as f32)).collect();
                    set(v, fill, alpha);
                    polyline(v, &pts, true);
                    v.fill();
                    let (hex, w, a) = emphasis_stroke(emphasis.as_deref(), (stroke, 2.2));
                    set(v, hex, a);
                    polyline(v, &pts, true);
                    v.stroke_opts(w as f32, LineCap::Butt, LineJoin::Round, 4., 1.);
                }
                Primitive::Circle { cx: x, cy: y, r, style: Style::Circle, emphasis, .. } => {
                    let (px, py) = map(*x, *y);
                    set(v, 0x23877c, 0.035);
                    v.circle(px, py, (*r * k) as f32);
                    v.fill();
                    let (hex, w, a) = emphasis_stroke(emphasis.as_deref(), (0x23877c, 2.6));
                    set(v, hex, a);
                    v.circle(px, py, (*r * k) as f32);
                    v.stroke(w as f32);
                }
                Primitive::Line { x1, y1, x2, y2, style: Style::Segment(s), emphasis, clip: true } => {
                    let base = if *s == SegmentStyle::Projection { 0xb95873 } else { 0x526b67 };
                    let (hex, w, a) = emphasis_stroke(emphasis.as_deref(), (base, 2.2));
                    set(v, hex, a);
                    let dash: &[f64] = if *s == SegmentStyle::Solid { &[] } else { &[6., 4.] };
                    let dash: Vec<f64> = dash.iter().map(|d| d * k).collect();
                    dashed(v, &[map(*x1, *y1), map(*x2, *y2)], &dash, w as f32, LineCap::Round);
                }
                Primitive::Arc { points, closed, style, emphasis } => {
                    let pts: Vec<(f32, f32)> = points.iter().map(|(x, y)| map(*x, *y)).collect();
                    if *style == Style::Sector {
                        set(v, 0xd5e8ee, 0.8);
                        polyline(v, &pts, true);
                        v.fill();
                    }
                    let (hex, w, a) = emphasis_stroke(emphasis.as_deref(), (0xc7832e, if *style == Style::Sector { 1. } else { 2.4 }));
                    set(v, hex, a);
                    polyline(v, &pts, *closed);
                    v.stroke_opts(w as f32, LineCap::Butt, LineJoin::Round, 4., 1.);
                }
                _ => {}
            }
        }
        // Points (clipped like the web), controls on top.
        for p in &scene.primitives {
            if let Primitive::Circle { cx: x, cy: y, r, style, emphasis, .. } = p {
                if !matches!(style, Style::Point | Style::ControlPoint) {
                    continue;
                }
                let control = *style == Style::ControlPoint;
                let r = if emphasis.as_deref() == Some("focus") && !control { 6. } else { *r } * k;
                let stroke = if control { 2.4 } else { 1.8 } * k;
                let (px, py) = map(*x, *y);
                if control && self.active_control.is_some() {
                    set(v, 0x107788, 0.25);
                    v.circle(px, py, (r + 5. * k) as f32);
                    v.fill();
                }
                set(v, 0xfffdf7, 1.);
                v.circle(px, py, (r + stroke / 2.) as f32);
                v.fill();
                set(v, 0xe15d45, 1.);
                v.circle(px, py, (r - stroke / 2.) as f32);
                v.fill();
            }
        }
        v.end(cx);
        cx.end_turtle();
        // Labels: 600 10px #374b47 with a 3px white halo (paint-order stroke).
        let px = 10. * k;
        for (x, y, text, anchor) in labels {
            let w = Self::text_width(&mut self.draw_bold, cx, &text, px);
            let left = match anchor {
                "end" => x * k - w,
                "middle" => x * k - w / 2.,
                _ => x * k,
            };
            let at = dvec2(ox + left, oy + y * k - px * 0.8);
            let t = &mut self.draw_bold;
            t.text_style.font_size = (px * PT) as f32;
            t.color = color(0xfffdf7);
            for (dx, dy) in [(-1.2, 0.), (1.2, 0.), (0., -1.2), (0., 1.2)] {
                t.draw_abs(cx, at + dvec2(dx * k, dy * k), &text);
            }
            t.color = color(0x374b47);
            t.draw_abs(cx, at, &text);
        }
        // Toolbar labels.
        for ((_, label), (_, r)) in tools.iter().zip(self.tools.clone()) {
            let w = Self::text_width(&mut self.draw_text, cx, label, 12.);
            let t = &mut self.draw_text;
            t.color = color(0x214c48);
            t.text_style.font_size = (12. * PT) as f32;
            t.draw_abs(cx, dvec2(r.pos.x + (r.size.x - w) / 2., r.pos.y + (TOOLBAR_H - 12. * 1.18) / 2.), label);
        }
        if let Some(caption) = &scene.caption {
            let t = &mut self.draw_text;
            t.color = color(0x53635c);
            t.text_style.font_size = (12. * PT) as f32;
            t.draw_abs(cx, dvec2(ox, oy + svg_h + 6. + (18. - 12. * 1.18) / 2.), caption);
        }
        self.scene = Some(scene);
        DrawStep::done()
    }
}
