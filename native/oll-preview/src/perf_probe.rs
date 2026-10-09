//! Device-measurement hooks shared with the app's `OCTOS_PERF` report:
//! diagnostic switches (`OCTOS_BISECT=a,b,...`; the Android host passes
//! intent extra `octos.OCTOS_BISECT`) and named counters that the report
//! prints and resets once per second. Counters only record while
//! `OCTOS_PERF` is set; otherwise each call is one branch.
use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

pub fn bisect(token: &str) -> bool {
    static TOKENS: OnceLock<Vec<String>> = OnceLock::new();
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

fn enabled() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| std::env::var_os("OCTOS_PERF").is_some())
}

/// (count, total time) per counter name.
static COUNTERS: Mutex<BTreeMap<&'static str, (u64, Duration)>> = Mutex::new(BTreeMap::new());

/// Count one occurrence of `name`.
pub fn count(name: &'static str) {
    time(name, Duration::ZERO);
}

/// Count one occurrence of `name` that took `spent`.
pub fn time(name: &'static str, spent: Duration) {
    if !enabled() {
        return;
    }
    if let Ok(mut c) = COUNTERS.lock() {
        let e = c.entry(name).or_default();
        e.0 += 1;
        e.1 += spent;
    }
}

/// The counters since the last call, as ` | name n [t ms]` segments; empty
/// when nothing was counted.
pub fn take_line() -> String {
    let Ok(mut c) = COUNTERS.lock() else { return String::new() };
    let mut out = String::new();
    for (name, (n, spent)) in std::mem::take(&mut *c) {
        if spent.is_zero() {
            out.push_str(&format!(" | {name} {n}"));
        } else {
            out.push_str(&format!(" | {name} {n}x {:.1}ms", spent.as_secs_f64() * 1e3));
        }
    }
    out
}
