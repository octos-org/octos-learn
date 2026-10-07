//! Questions about an ink selection (web oll-lesson-runtime selection
//! toolbar + learning-workspace sendSelectionQuestion): the selection's
//! image, its automatic classification and the learner's choices.
use octos_oll_preview::spatial_board::InkSelection;
use ::image::ImageEncoder;
use serde_json::Value;

/// Web selectionSnapshotToPngFile: the selected strokes alone on the board
/// paper (#fbfaf5), scaled by min(2, 1600 / longest side).
pub fn render_png(selection: &InkSelection) -> Option<Vec<u8>> {
    let (x0, y0, w, h) = selection.bounds;
    let scale = (1600. / w.max(h)).min(2.);
    let (iw, ih) = ((w * scale).ceil().max(1.) as usize, (h * scale).ceil().max(1.) as usize);
    let mut rgb = vec![0f32; iw * ih * 3];
    for px in rgb.chunks_exact_mut(3) {
        px.copy_from_slice(&[251., 250., 245.]);
    }
    let mut coverage = vec![0f32; iw * ih];
    for stroke in &selection.strokes {
        coverage.iter_mut().for_each(|c| *c = 0.);
        let r = (stroke.width * scale / 2.).max(0.5);
        let pts: Vec<(f64, f64)> = stroke.points.iter().map(|(x, y)| ((x - x0) * scale, (y - y0) * scale)).collect();
        let segments: Vec<((f64, f64), (f64, f64))> = if pts.len() == 1 {
            vec![(pts[0], pts[0])]
        } else {
            pts.windows(2).map(|p| (p[0], p[1])).collect()
        };
        for (a, b) in segments {
            let (lx, ly) = ((a.0.min(b.0) - r - 1.).max(0.) as usize, (a.1.min(b.1) - r - 1.).max(0.) as usize);
            let (hx, hy) = (((a.0.max(b.0) + r + 1.).ceil() as usize).min(iw), ((a.1.max(b.1) + r + 1.).ceil() as usize).min(ih));
            let (dx, dy) = (b.0 - a.0, b.1 - a.1);
            let len2 = dx * dx + dy * dy;
            for y in ly..hy {
                for x in lx..hx {
                    let (px, py) = (x as f64 + 0.5, y as f64 + 0.5);
                    let t = if len2 > 0. { (((px - a.0) * dx + (py - a.1) * dy) / len2).clamp(0., 1.) } else { 0. };
                    let d = ((px - a.0 - t * dx).powi(2) + (py - a.1 - t * dy).powi(2)).sqrt();
                    let c = (r + 0.5 - d).clamp(0., 1.) as f32;
                    let slot = &mut coverage[y * iw + x];
                    *slot = slot.max(c);
                }
            }
        }
        let [cr, cg, cb, ca] = stroke.color;
        for (i, c) in coverage.iter().enumerate() {
            let a = c * ca;
            if a <= 0. {
                continue;
            }
            for (k, v) in [cr, cg, cb].into_iter().enumerate() {
                let dst = &mut rgb[i * 3 + k];
                *dst = *dst * (1. - a) + v * 255. * a;
            }
        }
    }
    let bytes: Vec<u8> = rgb.into_iter().map(|v| v.round().clamp(0., 255.) as u8).collect();
    let mut out = Vec::new();
    ::image::codecs::png::PngEncoder::new(&mut out)
        .write_image(&bytes, iw as u32, ih as u32, ::image::ExtendedColorType::Rgb8)
        .ok()?;
    Some(out)
}

/// Serializable strokes (checksum input, web snapshot svg role).
pub fn strokes_value(selection: &InkSelection) -> Value {
    Value::Array(
        selection
            .strokes
            .iter()
            .map(|s| serde_json::json!({"id": s.id, "width": s.width, "points": s.points.iter().map(|(x, y)| [x, y]).collect::<Vec<_>>()}))
            .collect(),
    )
}

/// The current selection's question state (web preparedSelection +
/// selectionClassification + the 问小章鱼 panel).
pub struct SelectionState {
    /// Changes whenever the selected strokes or their position change.
    pub key: String,
    pub source_id: String,
    pub selection: InkSelection,
    pub png: Option<Vec<u8>>,
    /// Uploaded selection image (server path).
    pub media: Option<String>,
    /// Board cards under the selection (web BoardTargetCandidate).
    pub candidates: Vec<Value>,
    /// The candidate the learner picked in the panel (target id).
    pub chosen: Option<String>,
    /// "idle" | "loading" | "ready" | "error".
    pub class_status: &'static str,
    /// (kind, content, confidence).
    pub classification: Option<(String, String, String)>,
    pub content_kind: String,
    pub panel_open: bool,
    pub pending: bool,
}

impl SelectionState {
    pub fn key_of(selection: &InkSelection) -> String {
        let ids: Vec<String> = selection.strokes.iter().map(|s| s.id.to_string()).collect();
        let (x, y, w, h) = selection.bounds;
        format!("{}@{x:.1},{y:.1},{w:.1},{h:.1}", ids.join(","))
    }
    /// Web quickSelectionTools: shown once classified with some confidence.
    pub fn quick_tools(&self) -> Vec<&'static oll_runtime::selection::Tool> {
        match (&self.classification, self.class_status) {
            (Some((kind, _, confidence)), "ready") if confidence != "low" && kind != "unknown" => {
                oll_runtime::selection::available_tools(kind)
            }
            _ => Vec::new(),
        }
    }
    pub fn chosen_targets(&self) -> Vec<Value> {
        self.candidates
            .iter()
            .filter(|c| self.chosen.as_deref() == c["target_id"].as_str())
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use octos_oll_preview::spatial_board::SelectedStroke;

    #[test]
    fn renders_strokes_on_paper() {
        let selection = InkSelection {
            bounds: (0., 0., 100., 50.),
            strokes: vec![SelectedStroke { id: 1, points: vec![(10., 25.), (90., 25.)], width: 4., color: [0., 0., 0., 1.] }],
        };
        let png = render_png(&selection).unwrap();
        let img = ::image::load_from_memory(&png).unwrap().to_rgb8();
        assert_eq!((img.width(), img.height()), (200, 100));
        assert_eq!(img.get_pixel(0, 0).0, [251, 250, 245]);
        assert_eq!(img.get_pixel(100, 50).0, [0, 0, 0]);
    }
}
