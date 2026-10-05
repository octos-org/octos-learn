//! Web `.board-group` frame: 2px dashed rgba(84,117,110,.28) border, radius
//! 24, a faint rgba(219,235,230,.08) fill, and the `.group-label` pill
//! (left 14, top -11, padding 3/9, #e9f0ec, #45645d 10px) on the top edge.
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.GroupFrame = set_type_default() do #(GroupFrame::register_widget(vm)) {
        width: Fill height: Fill
        draw_frame +: {draw_depth: 0.0}
        draw_text +: {color: #45645d text_style: theme.font_regular{font_size: 7.5}}
    }
}

#[derive(Script, ScriptHook, Widget)]
pub struct GroupFrame {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_frame: DrawVector,
    #[live]
    draw_text: DrawText,
    #[rust]
    pub title: String,
    #[rust]
    pub focused: bool,
}

impl Widget for GroupFrame {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}
    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let r = cx.walk_turtle(walk);
        let (x, y, w, h) = (r.pos.x as f32, r.pos.y as f32, r.size.x as f32, r.size.y as f32);
        let label_w = {
            self.draw_text.text_style.font_size = 7.5;
            self.draw_text.prepare_single_line_run(cx, &self.title).map_or(0., |l| l.width_in_lpxs as f64)
        };
        let v = &mut self.draw_frame;
        v.begin();
        let (fill, stroke) = if self.focused {
            ((0x7a5aa3, 0.05), (0x7a5aa3, 0.55))
        } else {
            ((0xdbebe6, 0.08), (0x54756e, 0.28))
        };
        v.set_color_hex(fill.0, fill.1);
        v.rounded_rect(x, y, w, h, 24.);
        v.fill();
        // Dashed border (CSS dashed: dash ≈ 3× width, equal gap).
        v.set_color_hex(stroke.0, stroke.1);
        let (rx, ry, rw, rh) = (x + 1., y + 1., w - 2., h - 2.);
        let radius = 23f32;
        let mut pts: Vec<(f32, f32)> = Vec::new();
        let corner = |cx0: f32, cy0: f32, a0: f32, pts: &mut Vec<(f32, f32)>| {
            for i in 0..=8 {
                let a = a0 + std::f32::consts::FRAC_PI_2 * i as f32 / 8.;
                pts.push((cx0 + radius * a.cos(), cy0 + radius * a.sin()));
            }
        };
        corner(rx + rw - radius, ry + radius, -std::f32::consts::FRAC_PI_2, &mut pts);
        corner(rx + rw - radius, ry + rh - radius, 0., &mut pts);
        corner(rx + radius, ry + rh - radius, std::f32::consts::FRAC_PI_2, &mut pts);
        corner(rx + radius, ry + radius, std::f32::consts::PI, &mut pts);
        pts.push(pts[0]);
        let (dash, gap) = (6.0f32, 6.0f32);
        let mut phase = 0f32;
        for s in pts.windows(2) {
            let (a, b) = (s[0], s[1]);
            let len = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
            let mut t = 0.;
            while t < len {
                let p = phase % (dash + gap);
                let (on, left) = if p < dash { (true, dash - p) } else { (false, dash + gap - p) };
                let step = left.min(len - t);
                if on {
                    let at = |q: f32| (a.0 + (b.0 - a.0) * q / len, a.1 + (b.1 - a.1) * q / len);
                    let (p0, p1) = (at(t), at(t + step));
                    v.move_to(p0.0, p0.1);
                    v.line_to(p1.0, p1.1);
                    v.stroke_opts(2., LineCap::Butt, LineJoin::Round, 4., 1.);
                }
                t += step;
                phase += step;
            }
        }
        if !self.title.is_empty() {
            let (pw, ph) = (label_w as f32 + 18., 10. * 1.2 + 6.);
            v.set_color_hex(0xe9f0ec, 1.);
            v.rounded_rect(x + 14., y - 11., pw, ph, ph / 2.);
            v.fill();
        }
        v.end(cx);
        if !self.title.is_empty() {
            let t = &mut self.draw_text;
            t.text_style.font_size = 7.5;
            t.color = vec4(0x45 as f32 / 255., 0x64 as f32 / 255., 0x5d as f32 / 255., 1.);
            t.draw_abs(cx, dvec2(r.pos.x + 14. + 9., r.pos.y - 11. + 3. + (12. - 10. * 1.18) / 2.), &self.title);
        }
        DrawStep::done()
    }
}
