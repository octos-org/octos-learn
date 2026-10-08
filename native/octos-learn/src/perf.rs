//! Main-thread profiling for performance investigations (OCTOS_PERF=1):
//! per event type, how many events the app handled and the time spent, and
//! the main-thread busy fraction, printed once per second to stderr. Off by
//! default; the disabled cost is one branch per event.
//!
//! It also turns on Makepad's PerfMonitor and appends a per-second split of
//! the recorded frame boundaries: count, mean/max gap, and the mean time in
//! the platform channels — `draw` (CPU pass encode and GL driver calls),
//! `wait` (eglSwapBuffers / drawable wait) and `gpu` (GPU frame time where
//! the backend reports it). Event time above is app code only; these show
//! the cost after the app returns.
//! The pinned Android backend needs the app Draw boundary hook in lib.rs;
//! those boundaries are not confirmed physical display presents. Android
//! does not report GPU timer data, so an absent `gpu` channel means unavailable.
use makepad_widgets::*;
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct Perf {
    enabled: Option<bool>,
    window_start: Option<Instant>,
    by_kind: BTreeMap<&'static str, (u32, Duration, Duration)>,
    frames_seen: u64,
    frames: Vec<PerfMonitorFrame>,
}

impl Perf {
    pub fn enabled(&mut self) -> bool {
        *self.enabled.get_or_insert_with(|| std::env::var_os("OCTOS_PERF").is_some())
    }
    pub fn record(&mut self, cx: &mut Cx, kind: &'static str, spent: Duration) {
        if !cx.perf_monitor.enabled() {
            cx.perf_monitor.set_enabled(true);
            self.frames_seen = cx.perf_monitor.frames_painted();
        }
        let now = Instant::now();
        let start = *self.window_start.get_or_insert(now);
        let entry = self.by_kind.entry(kind).or_default();
        entry.0 += 1;
        entry.1 += spent;
        entry.2 = entry.2.max(spent);
        let window = now.duration_since(start);
        if window >= Duration::from_secs(1) {
            let busy: Duration = self.by_kind.values().map(|e| e.1).sum();
            let mut line = format!("[perf] busy {:.0}%", busy.as_secs_f64() / window.as_secs_f64() * 100.);
            let mut kinds: Vec<_> = self.by_kind.iter().collect();
            kinds.sort_by(|a, b| b.1 .1.cmp(&a.1 .1));
            for (k, (n, total, max)) in kinds {
                line.push_str(&format!(" | {k} {n}x {:.1}ms max {:.1}ms", total.as_secs_f64() * 1e3, max.as_secs_f64() * 1e3));
            }
            line.push_str(&self.frame_split(cx));
            if std::env::var_os("OCTOS_CENSUS").is_some() {
                if let Some(c) = census(cx) {
                    line.push('\n');
                    line.push_str(&c);
                }
            }
            #[cfg(target_os = "android")]
            makepad_widgets::log!("{line}");
            #[cfg(not(target_os = "android"))]
            eprintln!("{line}");
            self.by_kind.clear();
            self.window_start = Some(now);
        }
    }

    fn frame_split(&mut self, cx: &mut Cx) -> String {
        let painted = cx.perf_monitor.frames_painted();
        let n = ((painted - self.frames_seen) as usize).min(PERF_MONITOR_HISTORY);
        self.frames_seen = painted;
        if n == 0 {
            return " || frames 0".into();
        }
        cx.perf_monitor.read(&mut self.frames);
        let recent = &self.frames[self.frames.len() - n..];
        let names: Vec<String> = cx.perf_monitor.channels().iter().map(|c| c.name.clone()).collect();
        let gap_mean = recent.iter().map(|f| f.gap_ms as f64).sum::<f64>() / n as f64;
        let gap_max = recent.iter().map(|f| f.gap_ms).fold(0., f32::max);
        let mut out = format!(" || frames {n} gap {gap_mean:.1}ms max {gap_max:.1}ms |");
        for (i, name) in names.iter().enumerate() {
            let us: u64 = recent.iter().map(|f| f.channel_us[i] as u64).sum();
            if us > 0 {
                out.push_str(&format!(" {name} {:.1}ms", us as f64 / n as f64 / 1e3));
            }
        }
        out
    }
}

/// Diagnostic switches for device bisection (`OCTOS_BISECT=a,b,...`; the
/// Android host passes intent extra `octos.OCTOS_BISECT`). Off by default.
/// Content: `nosvg` (thumbnails/covers), `noshapes` / `nosvgtext` (their
/// vector or text part), `nocardtext`, `nocardbg` (course cards), `batch`
/// (course cards keep their own draw list), `nocache` (launcher ScrollCache
/// re-renders its content every frame, the pre-cache cost). Redraw probes, launcher only,
/// every timer tick without input: `tinyredraw` (one label: GPU and present
/// cost of the unchanged scene) and `fullredraw` (whole UI re-encoded).
pub fn bisect(token: &str) -> bool {
    static TOKENS: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    TOKENS
        .get_or_init(|| {
            std::env::var("OCTOS_BISECT")
                .unwrap_or_default()
                .split(',')
                .map(|t| t.trim().to_owned())
                .filter(|t| !t.is_empty())
                .collect()
        })
        .iter()
        .any(|t| t == token)
}

/// `OCTOS_CENSUS=1`: per shader, the main window pass's draw calls,
/// instances and on-screen covered area (instance rects clipped to their
/// draw clip and the window, in physical pixels). A layout-level proxy for
/// GPU fill and per-call cost, deterministic unlike GPU timers.
pub fn census(cx: &Cx) -> Option<String> {
    let window = &cx.windows[CxWindowPool::id_zero()];
    let pass = window.main_pass_id?;
    let dpi = window.effective_dpi_factor();
    let size = window.get_inner_size();
    let list = cx.passes[pass].main_draw_list_id?;
    let mut rows: BTreeMap<String, (u64, u64, f64)> = BTreeMap::new();
    census_list(cx, list, size, &mut rows, 0);
    let mut sorted: Vec<_> = rows.into_iter().collect();
    sorted.sort_by(|a, b| b.1 .2.partial_cmp(&a.1 .2).unwrap_or(std::cmp::Ordering::Equal));
    let screen = size.x * size.y * dpi * dpi;
    let (calls, inst, area) = sorted.iter().fold((0, 0, 0.), |a, r| (a.0 + r.1 .0, a.1 + r.1 .1, a.2 + r.1 .2 * dpi * dpi));
    let mut out = format!("[census] calls {calls} instances {inst} covered {:.2} screens", area / screen);
    for (name, (c, i, a)) in sorted.iter().take(12) {
        out.push_str(&format!(" | {name} {c}c {i}i {:.2}s", a * dpi * dpi / screen));
    }
    Some(out)
}

fn census_list(cx: &Cx, id: DrawListId, size: DVec2, rows: &mut BTreeMap<String, (u64, u64, f64)>, depth: usize) {
    if depth > 64 || cx.draw_lists.is_id_freed(id) {
        return;
    }
    let list = &cx.draw_lists[id];
    for order in 0..list.draw_item_order_len() {
        let Some(item_id) = list.draw_item_id_at_order_index(order) else { continue };
        let item = &list.draw_items[item_id];
        if let Some(sub) = item.kind.sub_list() {
            census_list(cx, sub, size, rows, depth + 1);
            continue;
        }
        let Some(call) = item.kind.draw_call() else { continue };
        let sh = &cx.draw_shaders.shaders[call.draw_shader_id.index];
        let slots = sh.mapping.instances.total_slots;
        let name = {
            let ids: Vec<String> = sh.mapping.instances.inputs.iter().rev().take(3).map(|i| format!("{}", i.id)).collect();
            format!("#{}[{}]", call.draw_shader_id.index, ids.join(","))
        };
        let Some(buf) = item.instances.as_ref() else {
            let e = rows.entry(format!("{name}(retained)")).or_default();
            e.0 += 1;
            e.1 += item.retained_instance_count as u64;
            continue;
        };
        if slots == 0 {
            continue;
        }
        let data = buf.as_slice();
        let n = data.len() / slots;
        if n == 0 {
            continue;
        }
        let mut area = 0.;
        if let (Some(p), Some(s)) = (sh.mapping.rect_pos, sh.mapping.rect_size) {
            for k in 0..n {
                let d = &data[k * slots..(k + 1) * slots];
                let (mut x0, mut y0) = (d[p] as f64, d[p + 1] as f64);
                let (mut x1, mut y1) = (x0 + d[s] as f64, y0 + d[s + 1] as f64);
                if let Some(c) = sh.mapping.draw_clip {
                    x0 = x0.max(d[c] as f64);
                    y0 = y0.max(d[c + 1] as f64);
                    x1 = x1.min(d[c + 2] as f64);
                    y1 = y1.min(d[c + 3] as f64);
                }
                x0 = x0.max(0.);
                y0 = y0.max(0.);
                x1 = x1.min(size.x);
                y1 = y1.min(size.y);
                if x1 > x0 && y1 > y0 {
                    area += (x1 - x0) * (y1 - y0);
                }
            }
        }
        let e = rows.entry(name).or_default();
        e.0 += 1;
        e.1 += n as u64;
        e.2 += area;
    }
}
