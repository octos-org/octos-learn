//! World-space course control panel (octos-learn
//! `.learning-variable-controls.is-world`, the compact panel docked under its
//! visual at the visual's width): one row per slider variable,
//! `label | range | value | − + ↺`, drawn in board world coordinates so it
//! moves and zooms with its lesson visuals. Board cards receive no events,
//! so SpatialBoard hit-tests the panel through `hit` in world coordinates.
use makepad_widgets::makepad_draw::vector::{LineCap, LineJoin};
use makepad_widgets::*;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.ControlsCard = set_type_default() do #(ControlsCard::register_widget(vm)) {
        width: Fill height: Fill
        draw_card +: {draw_depth: 0.0}
        draw_reset +: {draw_depth: 0.0 preserve_viewbox: true}
        draw_text +: {text_style: theme.font_regular{font_size: 9}}
        draw_bold +: {text_style: theme.font_bold{font_size: 9}}
    }
}

/// Web px -> Makepad points.
const PT: f64 = 0.75;
// Compact docked panel: 5px/10px padding + 1px border, rows as tall as
// their 22px buttons (web measures 34px for one row), 4px gaps.
const PAD_X: f64 = 11.;
const PAD_Y: f64 = 6.;
const ROW_H: f64 = 22.;
const ROW_GAP: f64 = 4.;
const COL_GAP: f64 = 6.;
const BUTTON: f64 = 22.;
const BUTTON_GAP: f64 = 3.;
const RADIUS: f32 = 14.;
/// Status pill shown on the panel's top edge while the teacher animates a variable.
const DEMO_HINT: &str = "老师正在演示这个变量，结束后即可继续拖动";
const RESET_ICON: &str = include_str!("../../octos-learn/assets/icons/rotate-ccw.svg");

/// Rendered panel height for `rows` sliders (the host reports the measured
/// panel to the layout, like the web interaction measurement).
pub fn panel_height(rows: usize) -> f64 {
    let n = rows as f64;
    2. * PAD_Y + n * ROW_H + (n - 1.).max(0.) * ROW_GAP
}

#[derive(Clone, Debug, PartialEq)]
pub struct ControlModel {
    pub alias: String,
    pub label: String,
    pub value: f64,
    pub min: f64,
    pub max: f64,
    pub step: f64,
    pub unit: String,
    pub initial: f64,
    pub animating: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Part {
    /// Track position as a 0..1 fraction of the range.
    Track(f64),
    Minus,
    Plus,
    Reset,
}

#[derive(Script, ScriptHook, Widget)]
pub struct ControlsCard {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_card: DrawVector,
    #[live]
    draw_reset: DrawSvg,
    #[live]
    draw_text: DrawText,
    #[live]
    draw_bold: DrawText,
    #[rust]
    rows: Vec<ControlModel>,
    #[rust]
    rect: Rect,
    #[rust]
    tracks: Vec<Rect>,
    #[rust]
    buttons: Vec<[Rect; 3]>,
    #[rust]
    icon_loaded: bool,
    /// Row the learner is dragging (its value shows without symbolic labels).
    #[rust]
    dragging: Option<usize>,
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
fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        pos: dvec2(x, y),
        size: dvec2(w, h),
    }
}

/// Web formatVariableValue: π fractions (eighths) for radians, otherwise
/// the value to three decimals with its unit.
fn format_variable_value(value: f64, unit: &str) -> String {
    if unit == "rad" {
        let ratio = value / std::f64::consts::PI;
        let eighths = (ratio * 8.).round();
        if (ratio * 8. - eighths).abs() < 0.002 {
            if eighths == 0. {
                return "0".into();
            }
            let sign = if eighths < 0. { "−" } else { "" };
            let n = eighths.abs() as i64;
            let g = gcd(n, 8);
            let (num, den) = (n / g, 8 / g);
            return match (num, den) {
                (1, 1) => format!("{sign}π"),
                (k, 1) => format!("{sign}{k}π"),
                (1, d) => format!("{sign}π/{d}"),
                (k, d) => format!("{sign}{k}π/{d}"),
            };
        }
    }
    let rounded = if value.abs() < 1e-10 {
        0.
    } else {
        trim(&format!("{value:.3}"))
    };
    if unit.is_empty() {
        js_number(rounded)
    } else {
        format!("{} {unit}", js_number(rounded))
    }
}
fn trim(fixed: &str) -> f64 {
    fixed.parse().unwrap_or(0.)
}
/// JS Number -> String for the short decimals used here.
fn js_number(v: f64) -> String {
    let v = if v == 0. { 0. } else { v };
    if v == v.trunc() {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}
/// Web courseControlDecimals: decimals implied by a slider step, at most two.
fn decimals(step: Option<f64>) -> usize {
    let Some(step) = step.filter(|s| s.is_finite() && *s > 0.) else {
        return 2;
    };
    (0..2)
        .find(|d| {
            let scaled = step * 10f64.powi(*d as i32);
            (scaled - scaled.round()).abs() < 1e-9
        })
        .unwrap_or(2)
}

/// Web formatCourseControlValue: symbolic radians while at rest; otherwise a
/// fixed number of decimals from the step, so the label keeps its length.
pub fn format_value(value: f64, unit: &str, step: Option<f64>, moving: bool) -> String {
    if unit == "rad" && !moving {
        let symbolic = format_variable_value(value, unit);
        if symbolic == "0" || symbolic.contains('π') {
            return symbolic;
        }
    }
    let text = match step {
        None => js_number(trim(&format!("{value:.2}"))),
        Some(_) => format!("{value:.*}", decimals(step)),
    };
    let normalized = match text.strip_prefix('-') {
        Some(rest) if rest.chars().all(|c| c == '0' || c == '.') => rest.to_owned(),
        _ => text,
    };
    if unit.is_empty() {
        normalized
    } else {
        format!("{normalized} {unit}")
    }
}

/// Web courseControlLabelWidth: characters that fit every label of the range.
pub fn label_width_chars(min: f64, max: f64, unit: &str, step: Option<f64>) -> usize {
    [min, max]
        .iter()
        .map(|v| format_value(*v, unit, step, true).chars().count())
        .max()
        .unwrap_or(1)
        .max(if unit == "rad" { 4 } else { 1 })
}
fn gcd(a: i64, b: i64) -> i64 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

impl ControlsCard {
    pub fn set_rows(&mut self, cx: &mut Cx, rows: Vec<ControlModel>) {
        if self.rows != rows {
            self.rows = rows;
            self.redraw(cx);
        }
    }
    pub fn rows(&self) -> &[ControlModel] {
        &self.rows
    }
    pub fn set_dragging(&mut self, cx: &mut Cx, row: Option<usize>) {
        if self.dragging != row {
            self.dragging = row;
            self.redraw(cx);
        }
    }
    fn shown(&self, i: usize) -> String {
        let row = &self.rows[i];
        let step = (row.step > 0.).then_some(row.step);
        format_value(row.value, &row.unit, step, row.animating || self.dragging == Some(i))
    }
    /// Row and part under a board-world point.
    pub fn hit(&self, p: DVec2) -> Option<(usize, Part)> {
        if !self.rect.contains(p) {
            return None;
        }
        for (i, track) in self.tracks.iter().enumerate() {
            // The whole range input (travel ± the 8px thumb radius) with a
            // generous vertical grab band, like a range input's full height.
            let band = rect(
                track.pos.x - 8.,
                track.pos.y - 10.,
                track.size.x + 16.,
                track.size.y + 20.,
            );
            if band.contains(p) {
                let t = ((p.x - track.pos.x) / track.size.x.max(1.)).clamp(0., 1.);
                return Some((i, Part::Track(t)));
            }
            for (k, b) in self.buttons[i].iter().enumerate() {
                if b.contains(p) {
                    return Some((i, [Part::Minus, Part::Plus, Part::Reset][k]));
                }
            }
        }
        None
    }
    /// World rects of the slider tracks (debug snapshots).
    pub fn track_rects(&self) -> Vec<(f64, f64, f64, f64)> {
        self.tracks.iter().map(|t| (t.pos.x, t.pos.y, t.size.x, t.size.y)).collect()
    }
    /// World width of row `row`'s slider track.
    pub fn track_width(&self, row: usize) -> f64 {
        self.tracks.get(row).map_or(0., |t| t.size.x)
    }
    /// Track fraction for a world x during a drag of row `row`.
    pub fn track_fraction(&self, row: usize, x: f64) -> f64 {
        self.tracks
            .get(row)
            .map_or(0., |t| ((x - t.pos.x) / t.size.x.max(1.)).clamp(0., 1.))
    }
    fn text_width(t: &mut DrawText, cx: &mut Cx2d, text: &str, px: f64) -> f64 {
        t.text_style.font_size = (px * PT) as f32;
        t.prepare_single_line_run(cx, text)
            .map_or(0., |r| r.width_in_lpxs as f64)
    }
}

impl Widget for ControlsCard {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let r = cx.walk_turtle(walk);
        self.rect = r;
        if !self.icon_loaded {
            self.draw_reset
                .load_from_str(&RESET_ICON.replace("#000000", "#0d7082"));
            self.icon_loaded = true;
        }
        let (x, y, w, h) = (r.pos.x, r.pos.y, r.size.x, r.size.y);
        // Label column: the widest label (web grid `auto` column).
        let label_w = self
            .rows
            .iter()
            // Glyphs missing from the bold face (θ, CJK) fall back to other
            // fonts; take the wider of both measurements.
            .map(|row| {
                Self::text_width(&mut self.draw_bold, cx, &row.label, 12.)
                    .max(Self::text_width(&mut self.draw_text, cx, &row.label, 12.))
                    + 2.
            })
            .fold(0., f64::max);
        // Output column: at least 5ch of the 12px bold figure font, and the
        // ch width that fits every label of each range (web min-width).
        let ch = Self::text_width(&mut self.draw_bold, cx, "0", 12.).max(1.);
        let mut output_w = 5. * ch;
        for i in 0..self.rows.len() {
            let row = &self.rows[i];
            let step = (row.step > 0.).then_some(row.step);
            let chars = label_width_chars(row.min, row.max, &row.unit, step) as f64;
            let shown = self.shown(i);
            output_w = output_w
                .max(chars * ch)
                .max(Self::text_width(&mut self.draw_bold, cx, &shown, 12.));
        }
        let actions_w = 3. * BUTTON + 2. * BUTTON_GAP;
        let inner_w = w - 2. * PAD_X;
        let track_w = (inner_w - label_w - output_w - actions_w - 3. * COL_GAP).max(20.);

        // Starts 10px above the card: the demonstration hint pill sits on
        // its top edge (y - 9, web), and DrawVector / DrawText clip to this turtle.
        cx.begin_turtle(
            Walk {
                abs_pos: Some(r.pos - dvec2(0., 10.)),
                width: Size::Fixed(w),
                height: Size::Fixed(h + 10.),
                ..Default::default()
            },
            Layout::default(),
        );
        let v = &mut self.draw_card;
        v.begin();
        // Card: rgba(255,253,248,.95), 1px rgba(63,73,67,.14), radius 14.
        set(v, 0xfffdf8, 0.95);
        v.rounded_rect(x as f32, y as f32, w as f32, h as f32, RADIUS);
        v.fill();
        set(v, 0x3f4943, 0.14);
        v.rounded_rect(
            x as f32 + 0.5,
            y as f32 + 0.5,
            w as f32 - 1.,
            h as f32 - 1.,
            RADIUS - 0.5,
        );
        v.stroke(1.);
        self.tracks.clear();
        self.buttons.clear();
        for (i, row) in self.rows.iter().enumerate() {
            let ry = y + PAD_Y + i as f64 * (ROW_H + ROW_GAP);
            let cy = ry + ROW_H / 2.;
            let tx = x + PAD_X + label_w + COL_GAP;
            // Range input: 4px track, filled part in the accent, 16px thumb.
            let span = (row.max - row.min).abs().max(1e-9);
            let t = ((row.value - row.min) / span).clamp(0., 1.);
            set(v, 0xd9dcd8, 1.);
            v.rounded_rect(tx as f32, (cy - 2.) as f32, track_w as f32, 4., 2.);
            v.fill();
            // Like a browser range input the thumb stays inside the input:
            // its centre travels between left + 8 and right - 8.
            let travel = (track_w - 16.).max(1.);
            let thumb = tx + 8. + travel * t;
            set(v, 0x168398, 1.);
            v.rounded_rect(tx as f32, (cy - 2.) as f32, (thumb - tx) as f32, 4., 2.);
            v.fill();
            v.circle(thumb as f32, cy as f32, 8.);
            v.fill();
            self.tracks.push(rect(tx + 8., cy - 2., travel, 4.));
            let bx0 = x + w - PAD_X - actions_w;
            let mut bs = [Rect::default(); 3];
            for (k, b) in bs.iter_mut().enumerate() {
                let bx = bx0 + k as f64 * (BUTTON + BUTTON_GAP);
                let by = cy - BUTTON / 2.;
                *b = rect(bx, by, BUTTON, BUTTON);
                set(v, 0x168398, 0.08);
                v.rounded_rect(bx as f32, by as f32, BUTTON as f32, BUTTON as f32, 7.);
                v.fill();
                set(v, 0x0d7082, 0.2);
                v.rounded_rect(
                    bx as f32 + 0.5,
                    by as f32 + 0.5,
                    BUTTON as f32 - 1.,
                    BUTTON as f32 - 1.,
                    6.5,
                );
                v.stroke(1.);
            }
            // "-" and "+" text glyphs of the web 12px button font: a ~4.5px
            // hyphen and a ~6.5px plus, ~1.1px strokes.
            set(v, 0x0d7082, 1.);
            for (k, plus) in [(0usize, false), (1, true)] {
                let (gx, gy) = (bs[k].pos.x + BUTTON / 2., cy);
                let half = if plus { 3.25 } else { 2.25 };
                v.move_to((gx - half) as f32, gy as f32);
                v.line_to((gx + half) as f32, gy as f32);
                v.stroke_opts(1.1, LineCap::Butt, LineJoin::Round, 4., 1.);
                if plus {
                    v.move_to(gx as f32, (gy - half) as f32);
                    v.line_to(gx as f32, (gy + half) as f32);
                    v.stroke_opts(1.1, LineCap::Butt, LineJoin::Round, 4., 1.);
                }
            }
            self.buttons.push(bs);
        }
        // Demonstration hint: a pill on the panel's top edge (10px text,
        // 16px line, 8px side padding, 10px from the right edge).
        let animating = self.rows.iter().any(|r| r.animating);
        let hint_w = if animating {
            Self::text_width(&mut self.draw_text, cx, DEMO_HINT, 10.)
        } else {
            0.
        };
        let hint = rect(x + w - 10. - hint_w - 18., y - 9., hint_w + 18., 18.);
        let v = &mut self.draw_card;
        if animating {
            set(v, 0xfff7f2, 1.);
            v.rounded_rect(hint.pos.x as f32, hint.pos.y as f32, hint.size.x as f32, 18., 9.);
            v.fill();
            set(v, 0xc35e42, 0.25);
            v.rounded_rect(
                hint.pos.x as f32 + 0.5,
                hint.pos.y as f32 + 0.5,
                hint.size.x as f32 - 1.,
                17.,
                8.5,
            );
            v.stroke(1.);
        }
        v.end(cx);
        for (i, row) in self.rows.iter().enumerate() {
            let ry = y + PAD_Y + i as f64 * (ROW_H + ROW_GAP);
            // 12px text centered in the row (web grid align-items: center).
            let text_y = ry + (ROW_H - 12. * 1.18) / 2.;
            self.draw_bold.text_style.font_size = (12. * PT) as f32;
            self.draw_bold.color = color(0x5d5952);
            self.draw_bold
                .draw_abs(cx, dvec2(x + PAD_X, text_y), &row.label);
            let value = self.shown(i);
            let vw = Self::text_width(&mut self.draw_bold, cx, &value, 12.);
            let right = x + w - PAD_X - actions_w - COL_GAP;
            self.draw_bold.color = color(if row.animating { 0xc35e42 } else { 0x0d7082 });
            self.draw_bold
                .draw_abs(cx, dvec2(right - vw, text_y), &value);
            let reset = self.buttons[i][2];
            self.draw_reset
                .draw_abs(cx, rect(reset.pos.x + 5., reset.pos.y + 5., 12., 12.));
        }
        if animating {
            self.draw_text.text_style.font_size = (10. * PT) as f32;
            self.draw_text.color = color(0xc35e42);
            self.draw_text.draw_abs(
                cx,
                dvec2(hint.pos.x + 9., hint.pos.y + 1. + (16. - 10. * 1.18) / 2.),
                DEMO_HINT,
            );
        }
        cx.end_turtle();
        DrawStep::done()
    }
}

#[cfg(test)]
mod tests {
    use super::{format_value, label_width_chars};
    use std::f64::consts::PI;
    #[test]
    fn values_format_like_the_web() {
        assert_eq!(format_value(1., "", None, false), "1");
        assert_eq!(format_value(0.4, "", None, false), "0.4");
        assert_eq!(format_value(-0.0001, "", None, false), "0");
        assert_eq!(format_value(4., "厘米", None, false), "4 厘米");
        assert_eq!(format_value(PI / 2., "rad", None, false), "π/2");
        assert_eq!(format_value(-PI, "rad", None, false), "−π");
        // A known step keeps the decimals fixed; moving radians are numeric.
        assert_eq!(format_value(1., "", Some(0.1), false), "1.0");
        assert_eq!(format_value(-0.001, "", Some(0.01), false), "0.00");
        assert_eq!(format_value(PI / 2., "rad", Some(0.01), true), "1.57 rad");
        assert_eq!(format_value(0.5, "rad", Some(0.01), false), "0.50 rad");
        assert_eq!(label_width_chars(-5., 5., "", Some(0.5)), 4);
        assert_eq!(label_width_chars(0., 1., "rad", Some(1.)), 5);
    }
}
