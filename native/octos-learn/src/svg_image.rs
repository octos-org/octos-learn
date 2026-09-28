//! `<img src="*.svg">` with web `object-fit: contain` semantics: the whole
//! viewBox is fitted and centered in the widget rect, and `<text>` runs (which
//! Makepad's SVG tessellator skips) are drawn through DrawText from the
//! makepad_svg text sidecar. Used for course thumbnails and collection covers.
use makepad_widgets::makepad_draw::svg::collect_text_cmds;
use makepad_widgets::makepad_draw::vector::document::SvgTextAnchor;
use makepad_widgets::*;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.SvgImage = set_type_default() do #(SvgImage::register_widget(vm)) {
        width: Fill height: Fill
        draw_svg +: {preserve_viewbox: true}
        draw_text +: {text_style: theme.font_regular{font_size: 9}}
        draw_bold +: {text_style: theme.font_bold{font_size: 9}}
    }
}

struct TextRun {
    x: f64,
    y: f64,
    px: f64,
    color: Vec4,
    text: String,
    anchor: SvgTextAnchor,
    bold: bool,
}

#[derive(Script, ScriptHook, Widget)]
pub struct SvgImage {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_svg: DrawSvg,
    #[live]
    draw_text: DrawText,
    #[live]
    draw_bold: DrawText,
    #[rust]
    size: (f64, f64),
    #[rust]
    texts: Vec<TextRun>,
    #[rust]
    loaded: bool,
}

/// `font-weight` of each `<text>` tag in document order (the sidecar does
/// not carry weights; thumbnails use 700 for titles).
fn text_weights(svg: &str) -> Vec<bool> {
    svg.match_indices("<text")
        .map(|(i, _)| {
            let tag = &svg[i..svg[i..].find('>').map_or(svg.len(), |e| i + e)];
            tag.contains("font-weight=\"700\"")
                || tag.contains("font-weight=\"bold\"")
                || tag.contains("font-weight=\"600\"")
                || tag.contains("font-weight:700")
        })
        .collect()
}

impl SvgImage {
    pub fn load(&mut self, cx: &mut Cx, svg: &str) {
        self.draw_svg.preserve_viewbox = true;
        self.draw_svg.load_from_str(svg);
        self.texts.clear();
        self.loaded = false;
        if let Some(doc) = self.draw_svg.svg_doc.as_ref() {
            let (w, h) = doc.logical_size();
            self.size = (w as f64, h as f64);
            let weights = text_weights(svg);
            for (i, cmd) in collect_text_cmds(doc).into_iter().enumerate() {
                let (r, g, b, a) = cmd.color;
                self.texts.push(TextRun {
                    x: cmd.x as f64,
                    y: cmd.y as f64,
                    px: cmd.font_size as f64,
                    color: vec4(r, g, b, a),
                    text: cmd.text,
                    anchor: cmd.text_anchor,
                    bold: weights.get(i).copied().unwrap_or(false),
                });
            }
            self.loaded = true;
        }
        self.redraw(cx);
    }
}

impl Widget for SvgImage {
    fn handle_event(&mut self, _cx: &mut Cx, _event: &Event, _scope: &mut Scope) {}

    fn draw_walk(&mut self, cx: &mut Cx2d, _scope: &mut Scope, walk: Walk) -> DrawStep {
        let rect = cx.walk_turtle(walk);
        if !self.loaded || self.size.0 <= 0. || self.size.1 <= 0. {
            return DrawStep::done();
        }
        self.draw_svg.draw_abs(cx, rect);
        // Same contain fit DrawSvg applies to the viewBox bounds.
        let s = (rect.size.x / self.size.0).min(rect.size.y / self.size.1);
        let ox = rect.pos.x + (rect.size.x - self.size.0 * s) / 2.;
        let oy = rect.pos.y + (rect.size.y - self.size.1 * s) / 2.;
        for i in 0..self.texts.len() {
            let run = &self.texts[i];
            let px = run.px * s;
            let (x, y, color, bold, anchor) = (run.x, run.y, run.color, run.bold, run.anchor);
            let text = run.text.clone();
            let t = if bold { &mut self.draw_bold } else { &mut self.draw_text };
            // Makepad sizes in points (px * 0.75).
            t.text_style.font_size = (px * 0.75) as f32;
            t.color = color;
            let width = match anchor {
                SvgTextAnchor::Start => 0.,
                _ => t
                    .prepare_single_line_run(cx, &text)
                    .map_or(0., |r| r.width_in_lpxs as f64),
            };
            let shift = match anchor {
                SvgTextAnchor::Start => 0.,
                SvgTextAnchor::Middle => width / 2.,
                _ => width,
            };
            // SVG y is the baseline; draw_abs takes the line top.
            let at = dvec2(ox + x * s - shift, oy + y * s - px * 0.8);
            t.draw_abs(cx, at, &text);
        }
        DrawStep::done()
    }
}
