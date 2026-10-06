//! Native `.plot-explorer-body` (web-runtime board-view.ts drawPlot +
//! plot-explorer.ts + styles.css): the function plot in the Web's 404×235
//! SVG viewBox scaled to the card width, then the secant measurement line,
//! the "说明" details toggle and the legend. Geometry comes from
//! `oll_runtime::plot::plot_scene`. Board cards receive no events, so
//! SpatialBoard routes pointer input here in board world coordinates.
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;
use oll_runtime::expression::Variables;
use oll_runtime::plot::{self, Primitive, Range, Style};
use serde_json::Value;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.PlotView = set_type_default() do #(PlotView::register_widget(vm)) {
        width: Fill height: Fit
        draw_grid +: {draw_depth: 0.0}
        draw_plot +: {draw_depth: 0.0}
        draw_text +: {color: #817a70 text_style: theme.font_regular{font_size: 7.5}}
        draw_bold +: {color: #614039 text_style: theme.font_bold{font_size: 8}}
        draw_code +: {color: #817a70 text_style: theme.font_code{font_size: 6.75}}
    }
}

/// Web paint(): the in-card plot is drawn at 404×235.
pub const VIEW_W: f64 = 404.;
pub const VIEW_H: f64 = 235.;
const PT: f64 = 0.75;
const MEASURE_GAP: f64 = 5.;
const MEASURE_LINE: f64 = 11. * 1.4;
const DETAILS_GAP: f64 = 2.;
const DETAILS_LINE: f64 = 11. * 1.4;
const LEGEND_GAP: f64 = 3.;
const LEGEND_LINE: f64 = 14. * 1.4;
/// .plot-probe-readout: min-height 16px, 11px/1.4.
const READOUT_LINE: f64 = 16.;
/// Chrome's default checkbox: 13px box, margin 3px 3px 3px 4px.
const CHECK: f64 = 13.;
/// .plot-toolbar: min-height 28, margin -3 0 5, padding-right 42, gap 5.
const TOOLBAR_H: f64 = 28.;
const TOOLBAR_TOP: f64 = -3.;
const TOOLBAR_BOTTOM: f64 = 5.;

/// Toolbar actions (web plot-explorer buttons).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    Explore,
    Restore,
    Expand,
}

/// Explorer state kept by the board across relayouts (web PlotExplorer state).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PlotState {
    pub ranges: Option<(Range, Range)>,
    pub exploring: bool,
    pub hidden: Vec<usize>,
    pub details_open: bool,
    pub ticks: Option<(f64, f64)>,
}

#[derive(Script, ScriptHook, Widget)]
pub struct PlotView {
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
    draw_plot: DrawVector,
    #[live]
    draw_text: DrawText,
    #[live]
    draw_bold: DrawText,
    #[live]
    draw_code: DrawText,
    #[rust]
    node: Value,
    #[rust]
    variables: Variables,
    #[rust]
    pub state: PlotState,
    #[rust]
    rect: Rect,
    #[rust]
    plot_rect: Rect,
    #[rust]
    details_rect: Rect,
    #[rust]
    tools: Vec<(Tool, Rect)>,
    /// Legend entries (curve index, hit rect): click toggles the curve.
    #[rust]
    legend_rects: Vec<(usize, Rect)>,
    /// Pointer probe position as frame fractions (x right, y up).
    #[rust]
    probe: Option<(f64, f64)>,
    #[rust]
    area: Area,
    /// Explore-mode pan in the 大图 dialog: ranges and pointer at the start.
    #[rust]
    drag: Option<((Range, Range), DVec2)>,
    /// Drawn inside the 大图 dialog: no toolbar 大图 button, larger viewBox.
    #[rust]
    pub large: Option<(f64, f64)>,
    #[rust]
    scene: Option<plot::PlotScene>,
}

fn rgb(hex: u32) -> (f32, f32, f32) {
    (
        ((hex >> 16) & 0xff) as f32 / 255.,
        ((hex >> 8) & 0xff) as f32 / 255.,
        (hex & 0xff) as f32 / 255.,
    )
}
fn set(v: &mut DrawVector, hex: u32, alpha: f32) {
    let (r, g, b) = rgb(hex);
    v.set_color(r, g, b, alpha);
}
fn color(hex: u32) -> Vec4 {
    let (r, g, b) = rgb(hex);
    vec4(r, g, b, 1.)
}
/// Web .plot-series-N colors.
pub fn series_color(series: usize) -> u32 {
    [0x23877c, 0xb95873, 0x7a5aa3, 0xc7832e, 0x3f73a8, 0x697a3b][series % 6]
}
fn emphasis_color(e: &str) -> Option<u32> {
    match e {
        "focus" => Some(0xe15d45),
        "warning" => Some(0xcc3447),
        _ => None,
    }
}
/// A dashed polyline (SVG stroke-dasharray, one pattern along the path).
fn dashed(v: &mut DrawVector, points: &[(f32, f32)], dash: &[f64], width: f32, cap: LineCap) {
    if dash.is_empty() {
        let Some(first) = points.first() else { return };
        v.move_to(first.0, first.1);
        for p in &points[1..] {
            v.line_to(p.0, p.1);
        }
        v.stroke_opts(width, cap, LineJoin::Round, 4., 1.);
        return;
    }
    let period: f64 = dash.iter().sum();
    if !(period > 1e-6) || dash.iter().any(|d| !(*d > 0.)) {
        return;
    }
    let mut phase = 0.0f64;
    for w in points.windows(2) {
        let (a, b) = (w[0], w[1]);
        let len = (((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)) as f64).sqrt();
        let mut t = 0.;
        let mut guard = 0;
        while t < len && guard < 100_000 {
            guard += 1;
            let mut p = phase % period;
            let mut index = 0;
            while p >= dash[index] {
                p -= dash[index];
                index = (index + 1) % dash.len();
            }
            let step = (dash[index] - p).max(1e-3).min(len - t);
            if index % 2 == 0 {
                let at = |s: f64| (a.0 + (b.0 - a.0) * (s / len) as f32, a.1 + (b.1 - a.1) * (s / len) as f32);
                let (s, e) = (at(t), at(t + step));
                v.move_to(s.0, s.1);
                v.line_to(e.0, e.1);
                v.stroke_opts(width, LineCap::Butt, LineJoin::Round, 4., 1.);
            }
            t += step;
            phase += step;
        }
    }
}

impl PlotState {
    /// Web legend checkbox: show or hide curve `index`.
    pub fn toggle_curve(&mut self, index: usize) {
        if let Some(at) = self.hidden.iter().position(|i| *i == index) {
            self.hidden.remove(at);
        } else {
            self.hidden.push(index);
            self.hidden.sort_unstable();
        }
    }
    /// The readout row is shown while exploring or with curves hidden.
    fn readout_visible(&self) -> bool {
        self.exploring || !self.hidden.is_empty()
    }
}

impl PlotView {
    /// Web plot-explorer pointer probe (hover over the frame). Returns true
    /// when the reading changed.
    pub fn set_probe(&mut self, cx: &mut Cx, at: Option<DVec2>) -> bool {
        let fraction = at.and_then(|p| self.frame_fraction(p));
        if fraction != self.probe {
            self.probe = fraction;
            self.redraw(cx);
            return true;
        }
        false
    }
    pub fn legend_at(&self, p: DVec2) -> Option<usize> {
        self.legend_rects.iter().find(|(_, r)| r.contains(p)).map(|(i, _)| *i)
    }
    pub fn set_node(&mut self, cx: &mut Cx, node: &Value, variables: &Variables, state: &PlotState) {
        if &self.node != node || &self.variables != variables || &self.state != state {
            self.node = node.clone();
            self.variables = variables.clone();
            self.state = state.clone();
            self.redraw(cx);
        }
    }
    /// The plot area (SVG viewBox) in world coordinates.
    pub fn plot_rect(&self) -> Rect {
        self.plot_rect
    }
    pub fn details_contains(&self, p: DVec2) -> bool {
        self.details_rect.contains(p)
    }
    pub fn tool_at(&self, p: DVec2) -> Option<Tool> {
        self.tools.iter().find(|(_, r)| r.contains(p)).map(|(t, _)| *t)
    }
    fn view_size(&self) -> (f64, f64) {
        self.large.unwrap_or((VIEW_W, VIEW_H))
    }
    /// Range fraction (x right, y up) of a world point inside the plot frame.
    pub fn frame_fraction(&self, p: DVec2) -> Option<(f64, f64)> {
        let s = self.scene.as_ref()?;
        let k = self.plot_rect.size.x / self.view_size().0;
        let fx = (p.x - self.plot_rect.pos.x) / k;
        let fy = (p.y - self.plot_rect.pos.y) / k;
        let f = s.frame;
        (fx >= f.left && fx <= f.right && fy >= f.top && fy <= f.bottom)
            .then(|| ((fx - f.left) / f.width, 1. - (fy - f.top) / f.height))
    }
    /// World units per data unit along x and y (for drag panning).
    pub fn data_per_world(&self) -> Option<(f64, f64)> {
        let s = self.scene.as_ref()?;
        let k = self.plot_rect.size.x / self.view_size().0;
        Some((s.x.span() / (s.frame.width * k), s.y.span() / (s.frame.height * k)))
    }
    pub fn current_ranges(&self) -> Option<(Range, Range)> {
        self.scene.as_ref().map(|s| (s.x, s.y))
    }
    pub fn ticks(&self) -> Option<(f64, f64)> {
        self.scene.as_ref().map(|s| s.ticks)
    }
    fn text_width(t: &mut DrawText, cx: &mut Cx2d, text: &str, px: f64) -> f64 {
        t.text_style.font_size = (px * PT) as f32;
        t.prepare_single_line_run(cx, text).map_or(0., |r| r.width_in_lpxs as f64)
    }
    /// Greedy character wrap of `text` to `width` at `px`.
    fn wrap(t: &mut DrawText, cx: &mut Cx2d, text: &str, px: f64, width: f64) -> Vec<String> {
        let mut lines = Vec::new();
        let mut line = String::new();
        for ch in text.chars() {
            let mut candidate = line.clone();
            candidate.push(ch);
            if !line.is_empty() && Self::text_width(t, cx, &candidate, px) > width {
                lines.push(std::mem::take(&mut line));
                line.push(ch);
            } else {
                line = candidate;
            }
        }
        if !line.is_empty() {
            lines.push(line);
        }
        lines
    }
}

impl Widget for PlotView {
    /// In the 大图 dialog the view lives in screen space and handles its own
    /// input (web dialog toolbar, explore pan, wheel zoom).
    fn handle_event(&mut self, cx: &mut Cx, event: &Event, _scope: &mut Scope) {
        if self.large.is_none() {
            return;
        }
        match event.hits(cx, self.area) {
            Hit::FingerDown(e) => {
                if let Some(tool) = self.tool_at(e.abs) {
                    match tool {
                        Tool::Explore => self.state.exploring = !self.state.exploring,
                        Tool::Restore => {
                            self.state.ranges = None;
                            self.state.hidden.clear();
                        }
                        Tool::Expand => {}
                    }
                    self.redraw(cx);
                } else if let Some(index) = self.legend_at(e.abs) {
                    self.state.toggle_curve(index);
                    self.redraw(cx);
                } else if self.state.exploring && self.frame_fraction(e.abs).is_some() {
                    self.drag = self.current_ranges().map(|r| (r, e.abs));
                }
            }
            Hit::FingerMove(e) => {
                if let (Some((start, at)), Some((px, py))) = (self.drag, self.data_per_world()) {
                    let d = e.abs - at;
                    self.state.ranges = Some(oll_runtime::plot::pan(start.0, start.1, -d.x * px, d.y * py));
                    self.redraw(cx);
                }
            }
            Hit::FingerHoverIn(e) | Hit::FingerHoverOver(e) => {
                self.set_probe(cx, Some(e.abs));
            }
            Hit::FingerHoverOut(_) => {
                self.set_probe(cx, None);
            }
            Hit::FingerUp(_) => self.drag = None,
            Hit::FingerScroll(e) => {
                if let (Some(anchor), Some((x, y))) = (self.frame_fraction(e.abs), self.current_ranges()) {
                    self.state.ranges = Some(oll_runtime::plot::zoom(x, y, oll_runtime::plot::wheel_zoom_factor(e.scroll.y), anchor));
                    self.redraw(cx);
                }
            }
            _ => {}
        }
    }

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let (vw, vh) = self.view_size();
        let width = cx.turtle().max_width(Walk { width: Size::fill(), ..walk }).unwrap_or(vw).max(40.);
        let k = width / vw;
        let scene = plot::plot_scene(
            &self.node,
            &self.variables,
            vw,
            vh,
            self.state.ranges,
            &self.state.hidden,
            self.state.ticks,
        );
        // Text block under the SVG.
        let mut hint_lines = Vec::new();
        if self.state.details_open {
            if let Some(hint) = scene.hint.clone() {
                hint_lines = Self::wrap(&mut self.draw_text, cx, &hint, 11., width);
            }
        }
        let svg_h = vh * k;
        let toolbar = TOOLBAR_TOP + TOOLBAR_H + TOOLBAR_BOTTOM;
        let mut height = toolbar + svg_h;
        if scene.measurement.is_some() {
            height += MEASURE_GAP + MEASURE_LINE;
        }
        if scene.hint.is_some() {
            height += DETAILS_GAP + DETAILS_LINE + hint_lines.len() as f64 * 11. * 1.4 + if hint_lines.is_empty() { 0. } else { 4. };
        }
        if !scene.legend.is_empty() {
            height += LEGEND_GAP + LEGEND_LINE;
        }
        // In the 大图 dialog a reading also opens the row (web un-hides it);
        // board cards keep their laid-out height and only draw the crosshair.
        let readout = self.state.readout_visible() || (self.large.is_some() && self.probe.is_some());
        if readout {
            height += READOUT_LINE;
        }
        let rect = cx.walk_turtle_with_area(&mut self.area, Walk { width: Size::Fixed(width), height: Size::Fixed(height), ..walk });
        self.rect = rect;
        // DrawVector maps through the current turtle: draw inside one pinned
        // to this view (outside the board world it is not at the origin).
        cx.begin_turtle(
            Walk { abs_pos: Some(rect.pos), width: Size::Fixed(rect.size.x), height: Size::Fixed(rect.size.y), ..Default::default() },
            Layout::default(),
        );
        // Toolbar: right-aligned buttons, 42px right padding (room for the badge).
        let default = Range { min: -5., max: 5. };
        let axes = &self.node["content"]["axes"];
        let recommended = (plot::range(&axes["x"], default), plot::range(&axes["y"], default));
        let restored = self.state.ranges.is_none_or(|r| r == recommended) && self.state.hidden.is_empty();
        let mut tools = vec![(Tool::Explore, "探索")];
        if !restored {
            tools.push((Tool::Restore, "恢复"));
        }
        if self.large.is_none() {
            tools.push((Tool::Expand, "大图"));
        }
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
        v.end(cx);
        for ((_, label), (_, r)) in tools.iter().zip(self.tools.clone()) {
            let w = Self::text_width(&mut self.draw_text, cx, label, 12.);
            let t = &mut self.draw_text;
            t.color = color(0x214c48);
            t.text_style.font_size = (12. * PT) as f32;
            t.draw_abs(cx, dvec2(r.pos.x + (r.size.x - w) / 2., r.pos.y + (TOOLBAR_H - 12. * 1.18) / 2.), label);
        }
        let svg_top = rect.pos.y + toolbar;
        self.plot_rect = Rect { pos: dvec2(rect.pos.x, svg_top), size: dvec2(width, svg_h) };
        let (ox, oy) = (rect.pos.x, svg_top);
        let map = |x: f64, y: f64| ((ox + x * k) as f32, (oy + y * k) as f32);
        let f = scene.frame;
        let mut texts: Vec<(f64, f64, String, &'static str, Style)> = Vec::new();

        // Grid, axes and guides (unclipped), then the clipped data layer.
        let v = &mut self.draw_grid;
        v.begin();
        for p in &scene.primitives {
            if let Primitive::Line { x1, y1, x2, y2, style, emphasis, clip: false } = p {
                let (hex, w, dash): (u32, f64, &[f64]) = match style {
                    Style::GridMinor => (0xeee9df, 0.55, &[]),
                    Style::Grid => (0xe4ded3, 0.8, &[]),
                    Style::Axis => (0x8b857b, 1.4, &[]),
                    _ => match emphasis.as_deref() {
                        Some("focus") => (0xe15d45, 3., &[5., 4.]),
                        _ => (0xa39b90, 1.5, &[5., 4.]),
                    },
                };
                set(v, hex, 1.);
                dashed(v, &[map(*x1, *y1), map(*x2, *y2)], &dash.iter().map(|d| d * k).collect::<Vec<_>>(), (w * k) as f32, LineCap::Butt);
            }
            if let Primitive::Text { x, y, text, anchor, style } = p {
                texts.push((*x, *y, text.clone(), anchor, *style));
            }
        }
        v.end(cx);
        cx.begin_turtle(
            Walk {
                abs_pos: Some(dvec2(ox + f.left * k, oy + f.top * k)),
                width: Size::Fixed(f.width * k),
                height: Size::Fixed(f.height * k),
                ..Default::default()
            },
            Layout { clip_x: true, clip_y: true, ..Layout::default() },
        );
        let v = &mut self.draw_plot;
        v.begin();
        for p in &scene.primitives {
            match p {
                Primitive::Path { segments, style: Style::Curve(series), emphasis } => {
                    let (hex, w) = match emphasis.as_deref() {
                        Some(e) if emphasis_color(e).is_some() => (emphasis_color(e).unwrap(), 4.5),
                        Some("supporting") => (series_color(*series), 4.),
                        _ => (series_color(*series), 2.6),
                    };
                    // Curves use vector-effect: non-scaling-stroke (screen px).
                    set(v, hex, if emphasis.as_deref() == Some("resolved") { 0.68 } else { 1. });
                    let dash: Vec<f64> = if emphasis.as_deref() == Some("warning") {
                        vec![7., 4.]
                    } else {
                        plot::series_dash(*series).to_vec()
                    };
                    for seg in segments {
                        let pts: Vec<(f32, f32)> = seg.iter().map(|(x, y)| map(*x, *y)).collect();
                        dashed(v, &pts, &dash, w as f32, LineCap::Round);
                    }
                }
                Primitive::Line { x1, y1, x2, y2, style, clip: true, .. } => {
                    let (hex, w, dash): (u32, f64, &[f64]) = match style {
                        Style::Secant => (0xb94735, 2., &[]),
                        _ => (0xa39b90, 1.5, &[5., 4.]),
                    };
                    set(v, hex, 1.);
                    dashed(v, &[map(*x1, *y1), map(*x2, *y2)], &dash.iter().map(|d| d * k).collect::<Vec<_>>(), (w * k) as f32, LineCap::Butt);
                }
                _ => {}
            }
        }
        v.end(cx);
        cx.end_turtle();
        // Points above the clip (web points are not clipped).
        let v = &mut self.draw_plot;
        v.begin();
        for p in &scene.primitives {
            if let Primitive::Circle { cx: px, cy: py, r, emphasis, .. } = p {
                let r = if emphasis.as_deref() == Some("focus") { 7. } else { *r } * k;
                let (x, y) = map(*px, *py);
                set(v, 0xfffdf7, 1.);
                v.circle(x, y, (r + 1. * k) as f32);
                v.fill();
                set(v, 0xe15d45, 1.);
                v.circle(x, y, (r - 1. * k) as f32);
                v.fill();
            }
        }
        // Probe crosshair (web dashed #7b8d88 lines appended to the SVG).
        let reading = self.probe.and_then(|(fx, fy)| {
            plot::probe(&self.node, &self.variables, scene.x, scene.y, &self.state.hidden, fx, fy).map(|p| (fx, p))
        });
        if let Some((fx, p)) = &reading {
            let px = f.left + fx * f.width;
            let py = f.bottom - (p.y - scene.y.min) / scene.y.span() * f.height;
            set(v, 0x7b8d88, 1.);
            let dash = [3. * k, 3. * k];
            dashed(v, &[map(px, f.top), map(px, f.bottom)], &dash, k as f32, LineCap::Butt);
            dashed(v, &[map(f.left, py), map(f.right, py)], &dash, k as f32, LineCap::Butt);
        }
        v.end(cx);
        // SVG text: y is the baseline; draw_abs places the line top.
        for (x, y, text, anchor, style) in texts.into_iter().chain(scene.primitives.iter().filter_map(|p| match p {
            Primitive::Text { x, y, text, anchor, style: Style::PointLabel } => Some((*x, *y, text.clone(), *anchor, Style::PointLabel)),
            _ => None,
        })) {
            let (t, px, hex) = match style {
                Style::PointLabel => (&mut self.draw_bold, 11. * k, 0x614039),
                _ => (&mut self.draw_code, 9. * k, 0x817a70),
            };
            let w = Self::text_width(t, cx, &text, px);
            let left = match anchor {
                "end" => x * k - w,
                "middle" => x * k - w / 2.,
                _ => x * k,
            };
            t.color = color(hex);
            t.text_style.font_size = (px * PT) as f32;
            t.draw_abs(cx, dvec2(ox + left, oy + y * k - px * 0.8), &text);
        }

        // Measurement, details and legend (web HTML under the SVG).
        let mut y = oy + svg_h;
        if let Some(m) = &scene.measurement {
            y += MEASURE_GAP;
            let t = &mut self.draw_text;
            t.color = color(0x3f554f);
            t.text_style.font_size = (11. * PT) as f32;
            t.draw_abs(cx, dvec2(ox, y + (MEASURE_LINE - 11. * 1.18) / 2.), m);
            y += MEASURE_LINE;
        }
        if scene.hint.is_some() {
            y += DETAILS_GAP;
            let label = if self.state.details_open { "▼ 说明" } else { "▶ 说明" };
            let t = &mut self.draw_text;
            t.color = color(0x42645e);
            t.text_style.font_size = (11. * PT) as f32;
            t.draw_abs(cx, dvec2(ox, y + (DETAILS_LINE - 11. * 1.18) / 2.), label);
            let w = Self::text_width(&mut self.draw_text, cx, label, 11.);
            self.details_rect = Rect { pos: dvec2(ox, y), size: dvec2(w.max(30.), DETAILS_LINE) };
            y += DETAILS_LINE;
            if !hint_lines.is_empty() {
                y += 4.;
                for line in &hint_lines {
                    let t = &mut self.draw_text;
                    t.color = color(0x6b685e);
                    t.text_style.font_size = (11. * PT) as f32;
                    t.draw_abs(cx, dvec2(ox, y), line);
                    y += 11. * 1.4;
                }
            }
        } else {
            self.details_rect = Rect::default();
        }
        self.legend_rects.clear();
        if !scene.legend.is_empty() {
            y += LEGEND_GAP;
            // Web plot-explorer legend: swatch, a checkbox when there are
            // several curves, then the label (gap 5, items 12 apart).
            let checkbox = scene.legend.len() > 1;
            let mut x = ox;
            let mid = y + LEGEND_LINE / 2.;
            let v = &mut self.draw_grid;
            v.begin();
            let mut labels = Vec::new();
            for item in &scene.legend {
                let w = Self::text_width(&mut self.draw_text, cx, &item.text, 14.);
                let start = x;
                set(v, series_color(item.series), 1.);
                v.move_to(x as f32 + 1.5, mid as f32);
                v.line_to((x + 15.) as f32 - 1.5, mid as f32);
                v.stroke_opts(3., LineCap::Round, LineJoin::Round, 4., 1.);
                x += 15. + 5.;
                if checkbox {
                    let (bx, by) = ((x + 4.) as f32, (mid - CHECK / 2.) as f32);
                    let c = CHECK as f32;
                    if item.hidden {
                        set(v, 0xffffff, 1.);
                        v.rounded_rect(bx, by, c, c, 2.);
                        v.fill();
                        set(v, 0x767676, 1.);
                        v.rounded_rect(bx + 0.5, by + 0.5, c - 1., c - 1., 2.);
                        v.stroke(1.);
                    } else {
                        set(v, 0x0075ff, 1.);
                        v.rounded_rect(bx, by, c, c, 2.);
                        v.fill();
                        set(v, 0xffffff, 1.);
                        v.move_to(bx + 2.8, by + 6.8);
                        v.line_to(bx + 5.4, by + 9.4);
                        v.line_to(bx + 10.3, by + 3.9);
                        v.stroke_opts(1.8, LineCap::Butt, LineJoin::Miter, 4., 1.);
                    }
                    x += 4. + CHECK + 3. + 5.;
                }
                labels.push((x, item.text.clone()));
                if checkbox {
                    self.legend_rects.push((item.index, Rect { pos: dvec2(start, y), size: dvec2(x + w - start, LEGEND_LINE) }));
                }
                x += w + 12.;
            }
            v.end(cx);
            for (lx, text) in labels {
                let t = &mut self.draw_text;
                t.color = color(0x625c53);
                t.text_style.font_size = (14. * PT) as f32;
                t.draw_abs(cx, dvec2(lx, y + (LEGEND_LINE - 14. * 1.18) / 2.), &text);
            }
            y += LEGEND_LINE;
        }
        if readout {
            let text = match &reading {
                Some((_, p)) => p.text.clone(),
                None if self.probe.is_some() => "当前位置没有可读曲线".to_owned(),
                None => plot::readout_idle(self.state.exploring, !self.state.hidden.is_empty()).to_owned(),
            };
            let t = &mut self.draw_text;
            t.color = color(0x4d645f);
            t.text_style.font_size = (11. * PT) as f32;
            t.draw_abs(cx, dvec2(ox, y + (READOUT_LINE - 11. * 1.18) / 2.), &text);
        }
        self.scene = Some(scene);
        cx.end_turtle();
        DrawStep::done()
    }
}
