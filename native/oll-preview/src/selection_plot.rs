//! Native `.learning-selection-plot` (web selection-enhancement-layer.tsx
//! SelectionPlot): the enhancement's function in a 300×164 viewBox — axes
//! through the origin (clamped to the plot box) and the sampled curve.
use crate::geometry_view::{color, polyline, set};
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;
use oll_runtime::plot::{sample, sample_implicit, Range};
use serde_json::Value;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.SelectionPlotView = set_type_default() do #(SelectionPlotView::register_widget(vm)) {
        width: Fill height: Fit
        draw_plot +: {draw_depth: 0.0}
        draw_text +: {color: #455a57 text_style: theme.font_code{font_size: 8.25}}
    }
}

const VIEW_W: f64 = 300.;
const VIEW_H: f64 = 164.;

#[derive(Script, ScriptHook, Widget)]
pub struct SelectionPlotView {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_plot: DrawVector,
    #[live]
    draw_text: DrawText,
    #[rust]
    response: Value,
    #[rust]
    area: Area,
}

impl SelectionPlotView {
    pub fn set_response(&mut self, cx: &mut Cx, response: &Value) {
        if &self.response != response {
            self.response = response.clone();
            self.redraw(cx);
        }
    }
    fn label(&self) -> String {
        let r = &self.response;
        let expression = r["expression"].as_str().unwrap_or("");
        if r["plot_kind"] == "implicit" {
            format!("{expression} = {}", oll_runtime::plot::js_number(r["level"].as_f64().unwrap_or(0.)))
        } else {
            format!("y = {expression}")
        }
    }
}

impl Widget for SelectionPlotView {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let width = cx.turtle().max_width(Walk { width: Size::fill(), ..walk }).unwrap_or(VIEW_W).max(40.);
        let k = width / VIEW_W;
        let code_h = 22.;
        let rect = cx.walk_turtle_with_area(&mut self.area, Walk {
            width: Size::Fixed(width),
            height: Size::Fixed(VIEW_H * k + code_h),
            ..walk
        });
        cx.begin_turtle(
            Walk { abs_pos: Some(rect.pos), width: Size::Fixed(rect.size.x), height: Size::Fixed(rect.size.y), ..Default::default() },
            Layout::default(),
        );
        let r = &self.response;
        let range = |v: &Value| Range { min: v["min"].as_f64().unwrap_or(-5.), max: v["max"].as_f64().unwrap_or(5.) };
        let (xr, yr) = (range(&r["x_range"]), range(&r["y_range"]));
        let (left, top, right, bottom) = (24., 12., 276., 150.);
        let (ox, oy) = (rect.pos.x, rect.pos.y);
        let map = |x: f64, y: f64| {
            let px = left + (x - xr.min) / (xr.max - xr.min) * (right - left);
            let py = bottom - (y - yr.min) / (yr.max - yr.min) * (bottom - top);
            ((ox + px * k) as f32, (oy + py * k) as f32)
        };
        let v = &mut self.draw_plot;
        v.begin();
        set(v, 0xfbfaf4, 1.);
        v.rounded_rect(ox as f32, oy as f32, (VIEW_W * k) as f32, (VIEW_H * k) as f32, (10. * k) as f32);
        v.fill();
        let x_axis = (bottom - (0. - yr.min) / (yr.max - yr.min) * (bottom - top)).clamp(top, bottom);
        let y_axis = (left + (0. - xr.min) / (xr.max - xr.min) * (right - left)).clamp(left, right);
        set(v, 0x9babaa, 1.);
        polyline(v, &[((ox + left * k) as f32, (oy + x_axis * k) as f32), ((ox + right * k) as f32, (oy + x_axis * k) as f32)], false);
        v.stroke(k as f32);
        polyline(v, &[((ox + y_axis * k) as f32, (oy + top * k) as f32), ((ox + y_axis * k) as f32, (oy + bottom * k) as f32)], false);
        v.stroke(k as f32);
        let expression = r["expression"].as_str().unwrap_or("");
        let segments = if r["plot_kind"] == "implicit" {
            sample_implicit(expression, xr, yr, r["level"].as_f64().unwrap_or(0.), r["samples"].as_u64().unwrap_or(96) as usize, &Default::default())
        } else {
            sample(expression, xr, yr, 240, &Default::default())
        };
        set(v, 0x17786e, 1.);
        for segment in &segments {
            let pts: Vec<(f32, f32)> = segment.iter().map(|p| map(p.0, p.1)).collect();
            if pts.len() > 1 {
                polyline(v, &pts, false);
                v.stroke_opts((2.5 * k) as f32, LineCap::Round, LineJoin::Round, 4., 1.);
            }
        }
        v.end(cx);
        let label = self.label();
        let t = &mut self.draw_text;
        t.color = color(0x455a57);
        t.draw_abs(cx, dvec2(ox, oy + VIEW_H * k + 5.), &label);
        cx.end_turtle();
        DrawStep::done()
    }
}
