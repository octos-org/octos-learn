//! Main-thread profiling for performance investigations (OCTOS_PERF=1):
//! per event type, how many events the app handled and the time spent, and
//! the main-thread busy fraction, printed once per second to stderr. Off by
//! default; the disabled cost is one branch per event.
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct Perf {
    enabled: Option<bool>,
    window_start: Option<Instant>,
    by_kind: BTreeMap<&'static str, (u32, Duration, Duration)>,
}

impl Perf {
    pub fn enabled(&mut self) -> bool {
        *self.enabled.get_or_insert_with(|| std::env::var_os("OCTOS_PERF").is_some())
    }
    pub fn record(&mut self, kind: &'static str, spent: Duration) {
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
            #[cfg(target_os = "android")]
            makepad_widgets::log!("{line}");
            #[cfg(not(target_os = "android"))]
            eprintln!("{line}");
            self.by_kind.clear();
            self.window_start = Some(now);
        }
    }
}
