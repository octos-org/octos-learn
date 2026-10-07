//! Native `.diagram-preview` (web board-view.ts renderDiagram +
//! renderInternalDiagramConnection, styles.css .diagram-*): the diagram SVG
//! in its own viewBox, scaled with `meet` into the view and centred. Layout
//! comes from `oll_runtime::diagram`.
//! DIFF: web node labels use STKaiti 600; native uses the bold theme face.
use crate::geometry_view::{color, dashed, polyline, set};
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;
use oll_runtime::diagram::{self, InternalConnection};
use oll_runtime::plot::latest_emphasis;
use serde_json::Value;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.DiagramView = set_type_default() do #(DiagramView::register_widget(vm)) {
        width: Fill height: 168
        draw_shapes +: {draw_depth: 0.0}
        draw_text +: {color: #766f65 text_style: theme.font_regular{font_size: 8.25}}
        draw_bold +: {color: #193f3a text_style: theme.font_bold{font_size: 10.5}}
    }
}

const PT: f64 = 0.75;

/// A fragment-to-fragment connection drawn inside the diagram.
#[derive(Clone, Debug, PartialEq)]
pub struct Overlay {
    pub geometry: InternalConnection,
    pub emphasis: Option<String>,
    pub focused: bool,
}

#[derive(Script, ScriptHook, Widget)]
pub struct DiagramView {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_shapes: DrawVector,
    #[live]
    draw_text: DrawText,
    #[live]
    draw_bold: DrawText,
    #[rust]
    node: Value,
    #[rust]
    overlays: Vec<Overlay>,
    #[rust]
    area: Area,
}

impl DiagramView {
    pub fn set_node(&mut self, cx: &mut Cx, node: &Value, overlays: Vec<Overlay>) {
        if &self.node != node || self.overlays != overlays {
            self.node = node.clone();
            self.overlays = overlays;
            self.redraw(cx);
        }
    }
    fn text_width(t: &mut DrawText, cx: &mut Cx2d, text: &str, px: f64) -> f64 {
        t.text_style.font_size = (px * PT) as f32;
        t.prepare_single_line_run(cx, text).map_or(0., |r| r.width_in_lpxs as f64)
    }
    /// SVG text at baseline (x, y) with an anchor, optionally haloed
    /// (paint-order stroke) in #fffdf7.
    #[allow(clippy::too_many_arguments)]
    fn text(t: &mut DrawText, cx: &mut Cx2d, at: DVec2, text: &str, px: f64, hex: u32, middle: bool, halo: f64) {
        let w = Self::text_width(t, cx, text, px);
        let pos = dvec2(at.x - if middle { w / 2. } else { 0. }, at.y - px * 0.8);
        t.text_style.font_size = (px * PT) as f32;
        if halo > 0. {
            t.color = color(0xfffdf7);
            for (dx, dy) in [(-halo, 0.), (halo, 0.), (0., -halo), (0., halo)] {
                t.draw_abs(cx, pos + dvec2(dx, dy), text);
            }
        }
        t.color = color(hex);
        t.draw_abs(cx, pos, text);
    }
}

impl Widget for DiagramView {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let rect = cx.walk_turtle_with_area(&mut self.area, walk);
        let content = &self.node["content"];
        let layout = diagram::layout(content);
        // preserveAspectRatio xMidYMid meet.
        let k = (rect.size.x / layout.width).min(rect.size.y / layout.height).max(0.01);
        let ox = rect.pos.x + (rect.size.x - layout.width * k) / 2.;
        let oy = rect.pos.y + (rect.size.y - layout.height * k) / 2.;
        let map = |x: f64, y: f64| ((ox + x * k) as f32, (oy + y * k) as f32);
        let at = |x: f64, y: f64| dvec2(ox + x * k, oy + y * k);
        let emphasis = |id: &Value| latest_emphasis(&self.node, id.as_str().unwrap_or(""));
        cx.begin_turtle(
            Walk { abs_pos: Some(rect.pos), width: Size::Fixed(rect.size.x), height: Size::Fixed(rect.size.y), ..Default::default() },
            Layout::default(),
        );
        let v = &mut self.draw_shapes;
        v.begin();
        for region in content["regions"].as_array().map(Vec::as_slice).unwrap_or(&[]) {
            let pts: Vec<(f32, f32)> = region["members"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or(&[])
                .iter()
                .filter_map(|m| layout.point(m.as_str()?))
                .map(|p| map(p.x, p.y))
                .collect();
            if pts.len() < 3 {
                continue;
            }
            let (fill, alpha, stroke) = match emphasis(&region["id"]).as_deref() {
                Some("focus") => (0xe15d45, 0.19, Some((0xe15d45, 1.8))),
                Some("supporting") => (0xd79a29, 0.16, Some((0xd79a29, 1.4))),
                Some("resolved") => (0x2f8f80, 0.12, Some((0x2f8f80, 1.2))),
                _ => (0x4f998d, 0.08, None),
            };
            set(v, fill, alpha);
            polyline(v, &pts, true);
            v.fill();
            if let Some((hex, w)) = stroke {
                set(v, hex, 1.);
                polyline(v, &pts, true);
                v.stroke_opts((w * k) as f32, LineCap::Butt, LineJoin::Miter, 4., 1.);
            }
        }
        let mut edge_labels = Vec::new();
        for edge in content["edges"].as_array().map(Vec::as_slice).unwrap_or(&[]) {
            let (Some(from), Some(to)) = (
                edge["from"].as_str().and_then(|id| layout.point(id)),
                edge["to"].as_str().and_then(|id| layout.point(id)),
            ) else {
                continue;
            };
            let (hex, w, dash): (u32, f64, &[f64]) = match emphasis(&edge["id"]).as_deref() {
                Some("focus") => (0xe15d45, 5., &[]),
                Some("supporting") => (0xd79a29, 4., &[]),
                Some("resolved") => (0x2f8f80, 3.4, &[]),
                Some("warning") => (0xcc3447, 5., &[7., 4.]),
                _ => (0x526b67, 2.2, &[]),
            };
            set(v, hex, 1.);
            let dash: Vec<f64> = dash.iter().map(|d| d * k).collect();
            dashed(v, &[map(from.x, from.y), map(to.x, to.y)], &dash, (w * k) as f32, LineCap::Butt);
            if let Some(label) = edge["label"].as_str().filter(|s| !s.is_empty()) {
                edge_labels.push(((from.x + to.x) / 2., (from.y + to.y) / 2. - 6., label.to_owned()));
            }
        }
        for o in &self.overlays {
            let g = &o.geometry;
            let (hex, w) = match o.emphasis.as_deref() {
                Some("resolved") => (0x2f8f80, 3.6),
                Some("supporting") => (0xd79a29, 4.),
                Some("focus") => (0xe34f5f, 4.6),
                _ if o.focused => (0xe34f5f, 4.6),
                _ => (0xe34f5f, 3.2),
            };
            set(v, hex, 1.);
            polyline(v, &[map(g.from.0, g.from.1), map(g.to.0, g.to.1)], false);
            v.stroke_opts((w * k) as f32, LineCap::Round, LineJoin::Round, 4., 1.);
        }
        for (id, p) in &layout.points {
            let e = latest_emphasis(&self.node, id);
            if let Some((w, h)) = p.size {
                let (fill, alpha, stroke, sw) = match e.as_deref() {
                    Some("focus") => (0xe15d45, 0.1, 0xe15d45, 2.5),
                    Some("supporting") => (0xd79a29, 0.1, 0xd79a29, 2.2),
                    Some("warning") => (0xcc3447, 0.1, 0xcc3447, 2.5),
                    _ => (0xfffdf7, 0.96, 0x6e8d86, 1.5),
                };
                let (x, y) = map(p.x - w / 2., p.y - h / 2.);
                let (w, h, r) = ((w * k) as f32, (h * k) as f32, (10. * k) as f32);
                set(v, fill, alpha);
                v.rounded_rect(x, y, w, h, r);
                v.fill();
                set(v, stroke, 1.);
                v.rounded_rect(x, y, w, h, r);
                v.stroke((sw * k) as f32);
            } else {
                let (x, y) = map(p.x, p.y);
                let r = if e.as_deref() == Some("focus") { 6. } else { 4. };
                set(v, if e.as_deref() == Some("focus") { 0xe15d45 } else { 0x247f74 }, 1.);
                v.circle(x, y, (r * k) as f32);
                v.fill();
            }
        }
        // Internal connection badges (rect rx 8, 22 tall).
        for o in &self.overlays {
            let (x, y, w) = o.geometry.label_at;
            if o.geometry.label.is_empty() {
                continue;
            }
            let (bx, by) = map(x - w / 2., y - 11.);
            set(v, 0xfffbeb, 0.96);
            v.rounded_rect(bx, by, (w * k) as f32, (22. * k) as f32, (8. * k) as f32);
            v.fill();
            set(v, 0xe4a8ae, 1.);
            v.rounded_rect(bx, by, (w * k) as f32, (22. * k) as f32, (8. * k) as f32);
            v.stroke(k as f32);
        }
        v.end(cx);
        for (x, y, label) in edge_labels {
            Self::text(&mut self.draw_text, cx, at(x, y), &label, 11. * k, 0x766f65, true, 2. * k);
        }
        for (_, p) in &layout.points {
            if p.size.is_some() {
                let first = p.y - (p.lines.len() as f64 - 1.) * 8.5 + 5.;
                for (i, line) in p.lines.iter().enumerate() {
                    Self::text(&mut self.draw_bold, cx, at(p.x, first + i as f64 * 17.), line, 14. * k, 0x193f3a, true, 0.);
                }
            } else {
                Self::text(&mut self.draw_bold, cx, at(p.x + 8., p.y - 7.), &p.label, 14. * k, 0x193f3a, false, 0.);
            }
        }
        for o in &self.overlays {
            let (x, y, _) = o.geometry.label_at;
            if !o.geometry.label.is_empty() {
                // dominant-baseline: middle -> baseline ~0.35em below centre.
                Self::text(&mut self.draw_bold, cx, at(x, y + 11. * 0.35), &o.geometry.label, 11. * k, 0x8f2f3a, true, 0.);
            }
        }
        cx.end_turtle();
        DrawStep::done()
    }
}
