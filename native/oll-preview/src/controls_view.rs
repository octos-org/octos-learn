//! World-space course control panel (octos-learn
//! `.learning-variable-controls.is-world`): one row per slider variable,
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
const PAD_X: f64 = 12.;
const PAD_Y: f64 = 10.;
const ROW_H: f64 = 24.;
const ROW_GAP: f64 = 6.;
const COL_GAP: f64 = 6.;
const BUTTON: f64 = 24.;
const BUTTON_GAP: f64 = 3.;
const RESET_ICON: &str = include_str!("../../octos-learn/assets/icons/rotate-ccw.svg");

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

/// Web formatCourseControlValue for plain units (value + unit), and the
/// variable-controls π-fraction format for radians.
pub fn format_value(value: f64, unit: &str) -> String {
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
    let rounded = (value * 100.).round() / 100.;
    let rounded = if rounded == 0. { 0. } else { rounded };
    let base = if rounded == rounded.trunc() {
        format!("{}", rounded as i64)
    } else {
        format!("{rounded}")
    };
    if unit.is_empty() || unit == "rad" {
        base
    } else {
        format!("{base} {unit}")
    }
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
    /// Row and part under a board-world point.
    pub fn hit(&self, p: DVec2) -> Option<(usize, Part)> {
        if !self.rect.contains(p) {
            return None;
        }
        for (i, track) in self.tracks.iter().enumerate() {
            // Generous vertical grab band, like a range input's full height.
            let band = rect(
                track.pos.x - 6.,
                track.pos.y - 10.,
                track.size.x + 12.,
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
            .map(|row| Self::text_width(&mut self.draw_bold, cx, &row.label, 12.))
            .fold(0., f64::max);
        // Output column: at least 5ch of the 12px bold figure font.
        let ch = Self::text_width(&mut self.draw_bold, cx, "0", 12.).max(1.);
        let output_w = self
            .rows
            .iter()
            .map(|row| {
                Self::text_width(
                    &mut self.draw_bold,
                    cx,
                    &format_value(row.value, &row.unit),
                    12.,
                )
            })
            .fold(5. * ch, f64::max);
        let actions_w = 3. * BUTTON + 2. * BUTTON_GAP;
        let inner_w = w - 2. * PAD_X;
        let track_w = (inner_w - label_w - output_w - actions_w - 3. * COL_GAP).max(20.);

        cx.begin_turtle(
            Walk {
                abs_pos: Some(r.pos),
                width: Size::Fixed(w),
                height: Size::Fixed(h),
                ..Default::default()
            },
            Layout::default(),
        );
        let v = &mut self.draw_card;
        v.begin();
        // Card: rgba(255,253,248,.95), 1px rgba(63,73,67,.14), radius 18.
        set(v, 0xfffdf8, 0.95);
        v.rounded_rect(x as f32, y as f32, w as f32, h as f32, 18.);
        v.fill();
        set(v, 0x3f4943, 0.14);
        v.rounded_rect(
            x as f32 + 0.5,
            y as f32 + 0.5,
            w as f32 - 1.,
            h as f32 - 1.,
            17.5,
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
            set(v, 0x168398, 1.);
            v.rounded_rect(tx as f32, (cy - 2.) as f32, (track_w * t) as f32, 4., 2.);
            v.fill();
            v.circle((tx + track_w * t) as f32, cy as f32, 8.);
            v.fill();
            self.tracks.push(rect(tx, cy - 2., track_w, 4.));
            let bx0 = x + w - PAD_X - actions_w;
            let mut bs = [Rect::default(); 3];
            for (k, b) in bs.iter_mut().enumerate() {
                let bx = bx0 + k as f64 * (BUTTON + BUTTON_GAP);
                *b = rect(bx, ry, BUTTON, BUTTON);
                set(v, 0x168398, 0.08);
                v.rounded_rect(bx as f32, ry as f32, BUTTON as f32, BUTTON as f32, 7.);
                v.fill();
                set(v, 0x0d7082, 0.2);
                v.rounded_rect(
                    bx as f32 + 0.5,
                    ry as f32 + 0.5,
                    BUTTON as f32 - 1.,
                    BUTTON as f32 - 1.,
                    6.5,
                );
                v.stroke(1.);
            }
            // − and + glyphs as strokes (1.5px, 8px long), web font glyph size.
            set(v, 0x0d7082, 1.);
            for (k, plus) in [(0usize, false), (1, true)] {
                let (gx, gy) = (bs[k].pos.x + BUTTON / 2., ry + BUTTON / 2.);
                v.move_to((gx - 4.) as f32, gy as f32);
                v.line_to((gx + 4.) as f32, gy as f32);
                v.stroke_opts(1.5, LineCap::Round, LineJoin::Round, 4., 1.);
                if plus {
                    v.move_to(gx as f32, (gy - 4.) as f32);
                    v.line_to(gx as f32, (gy + 4.) as f32);
                    v.stroke_opts(1.5, LineCap::Round, LineJoin::Round, 4., 1.);
                }
            }
            self.buttons.push(bs);
        }
        v.end(cx);
        for (i, row) in self.rows.iter().enumerate() {
            let ry = y + PAD_Y + i as f64 * (ROW_H + ROW_GAP);
            // 12px text centered in the 24px row (web grid align-items: center).
            let text_y = ry + (ROW_H - 12. * 1.18) / 2.;
            self.draw_bold.text_style.font_size = (12. * PT) as f32;
            self.draw_bold.color = color(0x5d5952);
            self.draw_bold
                .draw_abs(cx, dvec2(x + PAD_X, text_y), &row.label);
            let value = format_value(row.value, &row.unit);
            let vw = Self::text_width(&mut self.draw_bold, cx, &value, 12.);
            let right = x + w - PAD_X - actions_w - COL_GAP;
            self.draw_bold.color = color(if row.animating { 0xc35e42 } else { 0x0d7082 });
            self.draw_bold
                .draw_abs(cx, dvec2(right - vw, text_y), &value);
            let reset = self.buttons[i][2];
            self.draw_reset
                .draw_abs(cx, rect(reset.pos.x + 6., reset.pos.y + 6., 12., 12.));
        }
        cx.end_turtle();
        DrawStep::done()
    }
}

#[cfg(test)]
mod tests {
    use super::format_value;
    #[test]
    fn values_format_like_the_web() {
        assert_eq!(format_value(1., ""), "1");
        assert_eq!(format_value(0.4, ""), "0.4");
        assert_eq!(format_value(-0.0001, ""), "0");
        assert_eq!(format_value(4., "厘米"), "4 厘米");
        assert_eq!(format_value(std::f64::consts::PI / 2., "rad"), "π/2");
        assert_eq!(format_value(-std::f64::consts::PI, "rad"), "−π");
    }
}
