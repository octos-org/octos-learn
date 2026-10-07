//! Camera frames for questions (web use-camera-frame): the default camera is
//! opened through Makepad's video input, the latest frame is kept as I420,
//! a small preview is converted for the monitor, and a question grabs the
//! current frame as a JPEG (document mode: longest edge 1600, quality .88).
//! The framing settings (rotation, mirror, zoom, offset, document mode) are
//! applied to the preview and the sent frame alike (web drawCameraFrame).
use makepad_widgets::makepad_platform::permission::{Permission, PermissionStatus};
use makepad_widgets::makepad_platform::video::{
    CameraFrameOwned, VideoFormatId, VideoInputId, VideoInputsEvent, VideoPixelFormat,
};
use makepad_widgets::*;
use std::sync::{Arc, Mutex};

/// Web DOCUMENT_MAX_LONG_EDGE / DOCUMENT_JPEG_QUALITY and MAX_LONG_EDGE /
/// JPEG_QUALITY (document mode off).
const DOCUMENT_MAX_LONG_EDGE: usize = 1600;
const DOCUMENT_JPEG_QUALITY: u8 = 88;
const MAX_LONG_EDGE: usize = 768;
const JPEG_QUALITY: u8 = 70;

/// Web CameraFrameSettings (normalized like normalizeCameraFrameSettings).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FrameSettings {
    pub rotation: u16,
    pub mirror: bool,
    pub zoom: f64,
    pub offset_x: f64,
    pub offset_y: f64,
    pub document_mode: bool,
}
impl Default for FrameSettings {
    fn default() -> Self {
        Self { rotation: 0, mirror: false, zoom: 1., offset_x: 0., offset_y: 0., document_mode: true }
    }
}
impl FrameSettings {
    pub fn normalized(self) -> Self {
        Self {
            rotation: if [0, 90, 180, 270].contains(&self.rotation) { self.rotation } else { 0 },
            mirror: self.mirror,
            zoom: if self.zoom.is_finite() { self.zoom.clamp(1., 3.) } else { 1. },
            offset_x: if self.offset_x.is_finite() { self.offset_x.clamp(-1., 1.) } else { 0. },
            offset_y: if self.offset_y.is_finite() { self.offset_y.clamp(-1., 1.) } else { 0. },
            document_mode: self.document_mode,
        }
    }
    pub fn to_json(self) -> serde_json::Value {
        serde_json::json!({"rotation": self.rotation, "mirror": self.mirror, "zoom": self.zoom, "offsetX": self.offset_x, "offsetY": self.offset_y, "documentMode": self.document_mode})
    }
    pub fn from_json(v: &serde_json::Value) -> Self {
        let d = Self::default();
        Self {
            rotation: v["rotation"].as_u64().map_or(d.rotation, |r| r as u16),
            mirror: v["mirror"].as_bool() == Some(true),
            zoom: v["zoom"].as_f64().unwrap_or(1.),
            offset_x: v["offsetX"].as_f64().unwrap_or(0.),
            offset_y: v["offsetY"].as_f64().unwrap_or(0.),
            document_mode: v["documentMode"].as_bool() != Some(false),
        }
        .normalized()
    }
}

/// Web drawCameraFrame without the downscale: rotate (clockwise), mirror,
/// then crop the zoomed window at the offset (computeCameraFrameGeometry).
pub fn frame_transform(src: &Rgb, settings: FrameSettings) -> Rgb {
    let s = settings.normalized();
    let (w, h) = (src.width, src.height);
    let quarter = s.rotation == 90 || s.rotation == 270;
    let (rw, rh) = if quarter { (h, w) } else { (w, h) };
    let crop_w = ((rw as f64 / s.zoom).round() as usize).clamp(1, rw);
    let crop_h = ((rh as f64 / s.zoom).round() as usize).clamp(1, rh);
    let crop_x = ((rw - crop_w) as f64 * (s.offset_x + 1.) / 2.).round() as usize;
    let crop_y = ((rh - crop_h) as f64 * (s.offset_y + 1.) / 2.).round() as usize;
    let mut data = Vec::with_capacity(crop_w * crop_h * 3);
    for y in crop_y..crop_y + crop_h {
        for x in crop_x..crop_x + crop_w {
            // Output (x, y) in the rotated, mirrored canvas -> source pixel.
            let mx = if s.mirror { rw - 1 - x } else { x };
            let (sx, sy) = match s.rotation {
                90 => (y, h - 1 - mx),
                180 => (w - 1 - mx, h - 1 - y),
                270 => (w - 1 - y, mx),
                _ => (mx, y),
            };
            let i = (sy * w + sx) * 3;
            data.extend_from_slice(&src.data[i..i + 3]);
        }
    }
    Rgb { width: crop_w, height: crop_h, data }
}
/// Web .learning-camera-frame canvas max size.
pub const PREVIEW_W: usize = 192;
pub const PREVIEW_H: usize = 144;
/// Frames are converted at most this often on the capture thread.
const FRAME_INTERVAL_NS: u64 = 66_000_000;

/// A frame in RGB (8-bit, row-major).
#[derive(Clone)]
pub struct Rgb {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}

#[derive(Default)]
pub struct Camera {
    shared: Arc<Mutex<Option<CameraFrameOwned>>>,
    registered: bool,
    pub active: bool,
    choice: Option<(VideoInputId, VideoFormatId)>,
    permission: Option<PermissionStatus>,
    shown: u64,
    /// Automation: a still image replaces the camera (OCTOS_CAMERA_TEST_IMAGE).
    test: Option<Rgb>,
    pub settings: FrameSettings,
}

impl Camera {
    pub fn enable(&mut self, cx: &mut Cx) -> Result<(), String> {
        if let Some(path) = std::env::var_os("OCTOS_CAMERA_TEST_IMAGE") {
            let img = ::image::open(&path).map_err(|e| format!("测试图片无法读取：{e}"))?.to_rgb8();
            self.test = Some(Rgb { width: img.width() as usize, height: img.height() as usize, data: img.into_raw() });
            self.active = true;
            return Ok(());
        }
        if self.permission == Some(PermissionStatus::DeniedPermanent) {
            return Err("摄像头权限被拒绝，请在系统设置 > 隐私与安全性 > 摄像头中允许 Octos Learn".into());
        }
        if !self.registered {
            self.registered = true;
            let shared = self.shared.clone();
            let mut last = 0u64;
            cx.camera_frame_input(0, move |frame| {
                if frame.timestamp_ns != 0 && frame.timestamp_ns.saturating_sub(last) < FRAME_INTERVAL_NS {
                    return;
                }
                last = frame.timestamp_ns;
                let mut owned = CameraFrameOwned::default();
                if owned.convert_to_i420(frame) {
                    if let Ok(mut slot) = shared.lock() {
                        *slot = Some(owned);
                    }
                }
            });
        }
        cx.request_permission(Permission::Camera);
        self.active = true;
        if let Some(choice) = self.choice {
            cx.use_video_input(&[choice]);
        }
        Ok(())
    }
    pub fn disable(&mut self, cx: &mut Cx) {
        if self.active && self.test.is_none() {
            cx.use_video_input(&[]);
        }
        self.active = false;
        self.test = None;
        self.shown = 0;
        if let Ok(mut slot) = self.shared.lock() {
            *slot = None;
        }
    }
    pub fn on_permission(&mut self, status: PermissionStatus) {
        self.permission = Some(status);
    }
    pub fn denied(&self) -> bool {
        self.permission == Some(PermissionStatus::DeniedPermanent)
    }
    /// Pick the first camera at its best ≤1080p format.
    pub fn on_video_inputs(&mut self, cx: &mut Cx, ev: &VideoInputsEvent) {
        self.choice = ev.descs.first().and_then(|desc| {
            let rank = |p: VideoPixelFormat| match p {
                VideoPixelFormat::NV12 => 3,
                VideoPixelFormat::YUY2 => 2,
                VideoPixelFormat::YUV420 => 1,
                _ => 0,
            };
            desc.formats
                .iter()
                .filter(|f| rank(f.pixel_format) > 0)
                .max_by_key(|f| {
                    let fits = f.width <= 1920 && f.height <= 1080;
                    (fits, rank(f.pixel_format), f.width * f.height, (f.frame_rate.unwrap_or(0.) * 100.) as u64)
                })
                .map(|f| (desc.input_id, f.format_id))
        });
        if self.active && self.test.is_none() {
            if let Some(choice) = self.choice {
                cx.use_video_input(&[choice]);
            }
        }
    }
    /// The current frame, framed by the settings.
    fn latest(&self, max_edge: usize) -> Option<Rgb> {
        let raw = match &self.test {
            Some(t) => t.clone(),
            None => {
                let slot = self.shared.lock().ok()?;
                // Sample generously before cropping a zoomed window.
                slot.as_ref().map(|f| i420_to_rgb(f, (max_edge as f64 * self.settings.zoom).ceil() as usize))?
            }
        };
        Some(frame_transform(&raw, self.settings))
    }
    /// A framed preview of up to `max_edge` (the camera dialog), whether or
    /// not the frame is new.
    pub fn framed_preview(&self, max_edge: usize) -> Option<(usize, usize, Vec<u32>)> {
        self.latest(max_edge).map(|rgb| to_bgra(&downscale(&rgb, max_edge, max_edge)))
    }
    /// A new preview (BGRA u32, contained in 192×144) when a newer frame
    /// arrived since the last call.
    pub fn preview(&mut self) -> Option<(usize, usize, Vec<u32>)> {
        if !self.active {
            return None;
        }
        let stamp = if self.test.is_some() {
            1
        } else {
            let slot = self.shared.lock().ok()?;
            slot.as_ref()?.timestamp_ns.max(1)
        };
        if stamp == self.shown {
            return None;
        }
        self.shown = stamp;
        let rgb = self.latest(PREVIEW_W.max(PREVIEW_H) * 2)?;
        Some(to_bgra(&downscale(&rgb, PREVIEW_W, PREVIEW_H)))
    }
    /// Force the monitor to redraw (framing changed).
    pub fn refresh_preview(&mut self) {
        self.shown = 0;
    }
    /// The current frame and its JPEG bytes (web grabFrame: document mode
    /// sends 1600 px at .88, otherwise 768 px at .70).
    pub fn grab(&self) -> Option<(Rgb, Vec<u8>)> {
        let (edge, quality) = if self.settings.document_mode { (DOCUMENT_MAX_LONG_EDGE, DOCUMENT_JPEG_QUALITY) } else { (MAX_LONG_EDGE, JPEG_QUALITY) };
        let rgb = downscale(&self.latest(edge)?, edge, edge);
        let jpeg = encode_jpeg(&rgb, quality)?;
        Some((rgb, jpeg))
    }
}

pub fn encode_jpeg(rgb: &Rgb, quality: u8) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut enc = ::image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
    enc.encode(&rgb.data, rgb.width as u32, rgb.height as u32, ::image::ExtendedColorType::Rgb8).ok()?;
    Some(out)
}

pub fn to_bgra(rgb: &Rgb) -> (usize, usize, Vec<u32>) {
    let data = rgb
        .data
        .chunks_exact(3)
        .map(|p| 0xff00_0000 | (p[0] as u32) << 16 | (p[1] as u32) << 8 | p[2] as u32)
        .collect();
    (rgb.width, rgb.height, data)
}

/// Contain within max_w × max_h, never upscaling (web computeDownscaledSize);
/// box-filtered so text stays legible.
pub fn downscale(src: &Rgb, max_w: usize, max_h: usize) -> Rgb {
    let scale = (max_w as f64 / src.width as f64).min(max_h as f64 / src.height as f64).min(1.);
    let (w, h) = (((src.width as f64 * scale).round() as usize).max(1), ((src.height as f64 * scale).round() as usize).max(1));
    if w == src.width && h == src.height {
        return src.clone();
    }
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        let (y0, y1) = (y * src.height / h, ((y + 1) * src.height / h).max(y * src.height / h + 1));
        for x in 0..w {
            let (x0, x1) = (x * src.width / w, ((x + 1) * src.width / w).max(x * src.width / w + 1));
            let mut sum = [0u32; 3];
            for sy in y0..y1.min(src.height) {
                for sx in x0..x1.min(src.width) {
                    let i = (sy * src.width + sx) * 3;
                    for c in 0..3 {
                        sum[c] += src.data[i + c] as u32;
                    }
                }
            }
            let n = ((y1.min(src.height) - y0) * (x1.min(src.width) - x0)).max(1) as u32;
            data.extend(sum.iter().map(|s| (s / n) as u8));
        }
    }
    Rgb { width: w, height: h, data }
}

/// BT.709 limited-range I420 → RGB, sampling down to `max_edge` on the fly.
fn i420_to_rgb(f: &CameraFrameOwned, max_edge: usize) -> Rgb {
    let step = (f.width.max(f.height)).div_ceil(max_edge.max(1)).max(1);
    let (w, h) = (f.width / step, f.height / step);
    let (y_plane, u_plane, v_plane) = (&f.planes[0], &f.planes[1], &f.planes[2]);
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        let sy = y * step;
        for x in 0..w {
            let sx = x * step;
            let yy = *y_plane.bytes.get(sy * y_plane.row_stride + sx).unwrap_or(&16) as f32;
            let ci = (sy / 2) * u_plane.row_stride + sx / 2;
            let u = *u_plane.bytes.get(ci).unwrap_or(&128) as f32 - 128.;
            let v = *v_plane.bytes.get((sy / 2) * v_plane.row_stride + sx / 2).unwrap_or(&128) as f32 - 128.;
            let c = (yy - 16.) * 1.164;
            let r = c + 1.793 * v;
            let g = c - 0.213 * u - 0.533 * v;
            let b = c + 2.112 * u;
            data.extend([r, g, b].map(|v| v.clamp(0., 255.) as u8));
        }
    }
    Rgb { width: w.max(1), height: h.max(1), data }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downscale_contains_without_upscaling() {
        let src = Rgb { width: 400, height: 200, data: vec![200; 400 * 200 * 3] };
        let d = downscale(&src, 192, 144);
        assert_eq!((d.width, d.height), (192, 96));
        assert!(d.data.iter().all(|v| *v == 200));
        let small = Rgb { width: 10, height: 10, data: vec![0; 300] };
        assert_eq!(downscale(&small, 192, 144).width, 10);
    }

    #[test]
    fn framing_rotates_mirrors_and_crops_like_the_web() {
        // 2x1 image: red, green.
        let src = Rgb { width: 2, height: 1, data: vec![255, 0, 0, 0, 255, 0] };
        let r = |s: FrameSettings| frame_transform(&src, s);
        let base = FrameSettings::default();
        // 90° clockwise: 1x2 with red on top.
        let rot = r(FrameSettings { rotation: 90, ..base });
        assert_eq!((rot.width, rot.height), (1, 2));
        assert_eq!(&rot.data[..3], &[255, 0, 0]);
        // 270°: green on top.
        assert_eq!(&r(FrameSettings { rotation: 270, ..base }).data[..3], &[0, 255, 0]);
        // Mirror: green first.
        assert_eq!(&r(FrameSettings { mirror: true, ..base }).data[..3], &[0, 255, 0]);
        // Zoom 2 at offset +1 keeps the right half.
        let z = r(FrameSettings { zoom: 2., offset_x: 1., ..base });
        assert_eq!((z.width, z.data[..3].to_vec()), (1, vec![0, 255, 0]));
    }

    #[test]
    fn jpeg_round_trips() {
        let rgb = Rgb { width: 16, height: 8, data: vec![90; 16 * 8 * 3] };
        let jpg = encode_jpeg(&rgb, 88).unwrap();
        assert_eq!(&jpg[..2], &[0xff, 0xd8]);
    }
}
