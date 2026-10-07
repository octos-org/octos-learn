//! Animated layer of the web `.learning-whiteboard-loading-block`
//! (learning-workspace.css): the diagonal sweep (2.8s), the top beam
//! (2.7s), six drifting particles (3.6s) and the shimmer on the three
//! placeholder lines (1.8s, staggered). Gradients are drawn as alpha
//! slices; the card text sits on top. SpatialBoard keeps it redrawing while
//! a loading card is shown.
use crate::geometry_view::set;
use makepad_widgets::makepad_draw::{GradientStop, VectorPaint};
use makepad_widgets::*;
use std::sync::OnceLock;
use std::time::Instant;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.LoadingFx = set_type_default() do #(LoadingFx::register_widget(vm)) {
        width: Fill height: Fill
        draw_fx +: {draw_depth: 0.0}
    }
    mod.widgets.LoadingLine = set_type_default() do #(LoadingLine::register_widget(vm)) {
        width: Fill height: 5
        delay: 0.0
        draw_line +: {draw_depth: 0.0}
    }
}

#[derive(Script, ScriptHook, Widget)]
pub struct LoadingFx {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_fx: DrawVector,
    #[rust]
    area: Area,
}

fn clock() -> f64 {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_secs_f64()
}
fn ease_in_out(t: f64) -> f64 {
    // CSS ease-in-out ≈ cubic smoothstep.
    t * t * (3. - 2. * t)
}
/// Piecewise-linear keyframes over [0, 1].
fn keyframes(t: f64, frames: &[(f64, f64)]) -> f64 {
    for w in frames.windows(2) {
        let ((a, va), (b, vb)) = (w[0], w[1]);
        if t >= a && t <= b {
            let k = if b > a { ease_in_out((t - a) / (b - a)) } else { 0. };
            return va + (vb - va) * k;
        }
    }
    frames.last().map_or(0., |f| f.1)
}
/// A horizontal band [x, x+w] whose alpha follows `profile(u)` (u in 0..1),
/// drawn as one linear-gradient shape clipped to `clip`. `corner` rounds the
/// visible part like the card (web overflow:hidden, 18px).
#[allow(clippy::too_many_arguments)]
fn band(v: &mut DrawVector, hex: u32, x: f64, y: f64, w: f64, h: f64, clip: (f64, f64), corner: f64, profile: impl Fn(f64) -> f64) {
    let (x0, x1) = (x.max(clip.0), (x + w).min(clip.1));
    if x1 <= x0 || w <= 0. {
        return;
    }
    let rgb = [((hex >> 16) & 0xff) as f32 / 255., ((hex >> 8) & 0xff) as f32 / 255., (hex & 0xff) as f32 / 255.];
    const STOPS: usize = 17;
    let stops: Vec<GradientStop> = (0..STOPS)
        .map(|i| {
            let u = i as f64 / (STOPS - 1) as f64;
            let a = profile(u).clamp(0., 1.) as f32;
            GradientStop { offset: u as f32, color: [rgb[0] * a, rgb[1] * a, rgb[2] * a, a], straight_rgb: Some(rgb) }
        })
        .collect();
    v.cur_gradient_row_v = v.add_gradient_row(&stops);
    v.set_paint(VectorPaint::LinearGradient { x0: x as f32, y0: y as f32, x1: (x + w) as f32, y1: y as f32, stops });
    let r = corner.min((x1 - x0) / 2.).min(h / 2.);
    if r > 0. {
        v.rounded_rect(x0 as f32, y as f32, (x1 - x0) as f32, h as f32, r as f32);
    } else {
        v.rect(x0 as f32, y as f32, (x1 - x0) as f32, h as f32);
    }
    v.fill();
    v.cur_gradient_row_v = -1.0;
}

impl Widget for LoadingFx {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let rect = cx.walk_turtle_with_area(&mut self.area, walk);
        let (ox, oy, w, h) = (rect.pos.x, rect.pos.y, rect.size.x, rect.size.y);
        let now = clock();
        cx.begin_turtle(
            Walk { abs_pos: Some(rect.pos), width: Size::Fixed(w), height: Size::Fixed(h), ..Default::default() },
            Layout { clip_x: true, clip_y: true, ..Layout::default() },
        );
        let v = &mut self.draw_fx;
        v.begin();
        // ::before sweep: 62% wide, translateX(-110% → 270%), fading in/out.
        let t = (now % 2.8) / 2.8;
        let shift = keyframes(t, &[(0., -1.1), (0.12, -1.1), (0.88, 2.7), (1., 2.7)]);
        let alpha = keyframes(t, &[(0., 0.), (0.12, 0.), (0.45, 1.), (0.88, 0.), (1., 0.)]);
        let sw = w * 0.62;
        band(v, 0x53a196, ox + sw * shift, oy, sw, h, (ox, ox + w), 18., |u| {
            let peak = keyframes(u, &[(0., 0.), (0.28, 0.04), (0.5, 0.16), (0.67, 0.09), (1., 0.)]);
            peak * alpha
        });
        // Particles: 5px dots with a soft glow, drifting up and fading.
        for (top, left, delay) in [(0.18, 0.11, -0.4), (0.22, 0.80, -2.2), (0.67, 0.91, -1.1), (0.83, 0.18, -2.8), (0.48, 0.07, -1.7), (0.09, 0.56, -3.3)] {
            let t = ((now - delay) % 3.6 + 3.6) % 3.6 / 3.6;
            let dx = keyframes(t, &[(0., 0.), (0.42, 7.), (0.68, -3.), (1., 0.)]);
            let dy = keyframes(t, &[(0., 8.), (0.42, -5.), (0.68, -10.), (1., 8.)]);
            let scale = keyframes(t, &[(0., 0.55), (0.42, 1.), (0.68, 0.72), (1., 0.55)]);
            let opacity = keyframes(t, &[(0., 0.), (0.42, 0.38), (0.68, 0.14), (1., 0.)]);
            let (cxp, cyp) = (ox + w * left + 2.5 + dx, oy + h * top + 2.5 + dy);
            for (r, a) in [(9., 0.06), (6., 0.12)] {
                set(v, 0x4b9188, (a * opacity * 2.) as f32);
                v.circle(cxp as f32, cyp as f32, (r * scale) as f32);
                v.fill();
            }
            set(v, 0x579d94, opacity as f32);
            v.circle(cxp as f32, cyp as f32, (2.5 * scale) as f32);
            v.fill();
        }
        // Beam: 1px line inset 18, a bright centre travelling 120% → -120%.
        let t = (now % 2.7) / 2.7;
        let pos = keyframes(t, &[(0., 1.2), (0.5, -1.2), (1., 1.2)]);
        let beam_alpha = keyframes(t, &[(0., 0.45), (0.5, 1.), (1., 0.45)]);
        let (bx, bw) = (ox + 18., w - 36.);
        // background-size 220%: the gradient spans 2.2× the beam, offset by pos.
        let gw = bw * 2.2;
        let gx = bx + (bw - gw) * (pos + 1.2) / 2.4;
        band(v, 0x388980, gx, oy, gw, 1.5, (bx, bx + bw), 0., |u| {
            keyframes(u, &[(0., 0.), (0.3, 0.25), (0.5, 1.), (0.7, 0.25), (1., 0.)]) * beam_alpha
        });
        v.end(cx);
        cx.end_turtle();
        DrawStep::done()
    }
}

/// Shimmer of one placeholder line (web .learning-whiteboard-loading-lines
/// > i::after): a 48%-wide highlight moving -115% → 240% every 1.8s.
#[derive(Script, ScriptHook, Widget)]
pub struct LoadingLine {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_line: DrawVector,
    /// Animation delay in seconds (web nth-child delays).
    #[live]
    delay: f64,
    #[rust]
    area: Area,
}

impl Widget for LoadingLine {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let rect = cx.walk_turtle_with_area(&mut self.area, walk);
        let (ox, oy, w, h) = (rect.pos.x, rect.pos.y, rect.size.x, rect.size.y);
        cx.begin_turtle(
            Walk { abs_pos: Some(rect.pos), width: Size::Fixed(w), height: Size::Fixed(h), ..Default::default() },
            Layout { clip_x: true, clip_y: true, ..Layout::default() },
        );
        let v = &mut self.draw_line;
        v.begin();
        set(v, 0x5b7168, 0.1);
        v.rounded_rect(ox as f32, oy as f32, w as f32, h as f32, (h / 2.) as f32);
        v.fill();
        let t = (((clock() - self.delay) % 1.8 + 1.8) % 1.8) / 1.8;
        let hw = w * 0.48;
        let x = ox + hw * keyframes(t, &[(0., -1.15), (1., 2.4)]);
        band(v, 0x4c978e, x, oy, hw, h, (ox, ox + w), 0., |u| keyframes(u, &[(0., 0.), (0.5, 0.38), (1., 0.)]));
        v.end(cx);
        cx.end_turtle();
        DrawStep::done()
    }
}
