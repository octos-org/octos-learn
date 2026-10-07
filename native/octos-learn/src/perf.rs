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
