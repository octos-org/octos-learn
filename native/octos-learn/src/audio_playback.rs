//! Narration and speech playback, the same on every platform: clips are
//! decoded in Rust (MP3 via Makepad's in-tree `makepad-audio-decode`, plus
//! WAV) on a worker thread and mixed into Makepad's audio output.
//!
//! Replaces the per-platform players (2026-10-08, user decision): the pinned
//! Makepad video backend cut audio-only clips off on macOS after 60 frameless
//! polls, and its Android / Windows audio-only entry was empty. Mixing here
//! also gives the lesson an exact audio clock (`state`): the position comes
//! from the samples actually handed to the device.
use makepad_widgets::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Decoded PCM, interleaved f32.
pub struct Decoded {
    pub rate: u32,
    pub channels: u16,
    pub pcm: Vec<f32>,
}

impl Decoded {
    pub fn frames(&self) -> usize {
        if self.channels == 0 { 0 } else { self.pcm.len() / self.channels as usize }
    }
    pub fn duration_ms(&self) -> f64 {
        if self.rate == 0 { 0. } else { self.frames() as f64 * 1000. / self.rate as f64 }
    }
}

/// Decode MP3 / Ogg / FLAC (makepad-audio-decode) or PCM / float WAV.
pub fn decode(bytes: &[u8]) -> Result<Decoded, String> {
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        return decode_wav(bytes);
    }
    let d = makepad_audio_decode::decode_any(bytes).map_err(|e| format!("音频解码失败：{e:?}"))?;
    Ok(Decoded { rate: d.rate, channels: d.channels, pcm: d.pcm_interleaved_f32 })
}

fn decode_wav(bytes: &[u8]) -> Result<Decoded, String> {
    let u16le = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
    let u32le = |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
    let (mut format, mut channels, mut rate, mut bits) = (0u16, 0u16, 0u32, 0u16);
    let mut at = 12;
    while at + 8 <= bytes.len() {
        let size = u32le(at + 4) as usize;
        let body = at + 8;
        let end = (body + size).min(bytes.len());
        match &bytes[at..at + 4] {
            b"fmt " if size >= 16 => {
                format = u16le(body);
                channels = u16le(body + 2);
                rate = u32le(body + 4);
                bits = u16le(body + 14);
                if format == 0xfffe && size >= 26 {
                    format = u16le(body + 24); // WAVE_FORMAT_EXTENSIBLE sub-format
                }
            }
            b"data" => {
                let data = &bytes[body..end];
                let pcm: Vec<f32> = match (format, bits) {
                    (1, 16) => data.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.).collect(),
                    (1, 8) => data.iter().map(|b| (*b as f32 - 128.) / 128.).collect(),
                    (1, 24) => data.chunks_exact(3).map(|c| ((i32::from_le_bytes([0, c[0], c[1], c[2]])) >> 8) as f32 / 8_388_608.).collect(),
                    (1, 32) => data.chunks_exact(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f32 / 2_147_483_648.).collect(),
                    (3, 32) => data.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect(),
                    _ => return Err(format!("不支持的 WAV 格式（format {format}, {bits} bit）")),
                };
                if channels == 0 || rate == 0 {
                    return Err("WAV 缺少 fmt 信息".into());
                }
                return Ok(Decoded { rate, channels, pcm });
            }
            _ => {}
        }
        at = body + size + (size & 1);
    }
    Err("WAV 没有音频数据".into())
}

/// What the host reads back for a clip each tick.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClipState {
    /// Decoded and playable (false while decoding).
    pub ready: bool,
    pub failed: bool,
    pub position_ms: f64,
    pub total_ms: f64,
    /// Played to the end.
    pub finished: bool,
}

struct Clip {
    id: LiveId,
    audio: Option<Arc<Decoded>>,
    failed: bool,
    /// Source frames (fractional: resampled playback).
    pos: f64,
    seek_ms: Option<f64>,
    playing: bool,
    finished: bool,
}

#[derive(Default)]
struct Mixer {
    clips: Vec<Clip>,
}

impl Mixer {
    /// Mix every playing clip into planar `output` at `device_rate`.
    fn mix(&mut self, output: &mut AudioBuffer, device_rate: f64) {
        let channels = output.channel_count();
        let frames = output.frame_count();
        for clip in &mut self.clips {
            let Some(audio) = clip.audio.clone() else { continue };
            if let Some(ms) = clip.seek_ms.take() {
                clip.pos = (ms / 1000. * audio.rate as f64).clamp(0., audio.frames() as f64);
            }
            if !clip.playing || clip.finished || device_rate <= 0. {
                continue;
            }
            let src_channels = audio.channels.max(1) as usize;
            let total = audio.frames();
            let step = audio.rate as f64 / device_rate;
            for frame in 0..frames {
                let index = clip.pos as usize;
                if index >= total {
                    clip.finished = true;
                    clip.playing = false;
                    break;
                }
                let next = (index + 1).min(total - 1);
                let t = (clip.pos - index as f64) as f32;
                for ch in 0..channels {
                    let sc = ch.min(src_channels - 1);
                    let a = audio.pcm[index * src_channels + sc];
                    let b = audio.pcm[next * src_channels + sc];
                    output.channel_mut(ch)[frame] += a + (b - a) * t;
                }
                clip.pos += step;
            }
            if clip.pos as usize >= total {
                clip.finished = true;
                clip.playing = false;
            }
        }
    }
}

/// Decoded clips by path, so resuming / seeking a narration does not decode again.
fn cache() -> &'static Mutex<HashMap<String, Arc<Decoded>>> {
    static CACHE: std::sync::OnceLock<Mutex<HashMap<String, Arc<Decoded>>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(Default::default)
}
const CACHE_LIMIT: usize = 24;

#[derive(Default)]
pub struct Players {
    mixer: Arc<Mutex<Mixer>>,
    installed: bool,
}

impl Players {
    /// Install the output callback (once).
    fn install(&mut self, cx: &mut Cx) {
        if self.installed {
            return;
        }
        self.installed = true;
        let mixer = self.mixer.clone();
        cx.audio_output(0, move |info, output| {
            output.zero();
            // Never block the realtime thread: skip a buffer if the host holds the lock.
            if let Ok(mut m) = mixer.try_lock() {
                m.mix(output, info.sample_rate);
            }
        });
    }
    /// Route output to the default device (call on Event::AudioDevices).
    pub fn handle_audio_devices(&mut self, cx: &mut Cx, devices: &AudioDevicesEvent) {
        self.install(cx);
        cx.use_audio_outputs(&devices.default_output());
    }
    /// Start `path` (decoded on a worker thread), optionally `seek_ms` in.
    pub fn prepare(&mut self, cx: &mut Cx, id: LiveId, path: &str, seek_ms: Option<u64>) -> Result<(), String> {
        self.install(cx);
        let cached = cache().lock().unwrap().get(path).cloned();
        {
            let mut m = self.mixer.lock().unwrap();
            m.clips.retain(|c| c.id != id);
            m.clips.push(Clip {
                id,
                audio: cached.clone(),
                failed: false,
                pos: 0.,
                seek_ms: seek_ms.map(|ms| ms as f64),
                playing: true,
                finished: false,
            });
        }
        if cached.is_none() {
            let mixer = self.mixer.clone();
            let path = path.to_owned();
            std::thread::spawn(move || {
                let decoded = std::fs::read(&path).map_err(|e| e.to_string()).and_then(|b| decode(&b));
                if std::env::var_os("OCTOS_AUDIO_DEBUG").is_some() {
                    match &decoded {
                        Ok(d) => eprintln!("[audio] decoded {path}: {}Hz x{} {:.0}ms", d.rate, d.channels, d.duration_ms()),
                        Err(e) => eprintln!("[audio] {path}: {e}"),
                    }
                }
                let decoded = decoded.ok().map(Arc::new);
                if let Some(d) = &decoded {
                    let mut c = cache().lock().unwrap();
                    if c.len() >= CACHE_LIMIT {
                        c.clear();
                    }
                    c.insert(path, d.clone());
                }
                let mut m = mixer.lock().unwrap();
                if let Some(clip) = m.clips.iter_mut().find(|c| c.id == id) {
                    clip.failed = decoded.is_none();
                    clip.audio = decoded;
                }
            });
        }
        Ok(())
    }
    pub fn pause(&mut self, _cx: &mut Cx, id: LiveId) {
        if let Some(c) = self.mixer.lock().unwrap().clips.iter_mut().find(|c| c.id == id) {
            c.playing = false;
        }
    }
    pub fn resume(&mut self, _cx: &mut Cx, id: LiveId) {
        if let Some(c) = self.mixer.lock().unwrap().clips.iter_mut().find(|c| c.id == id) {
            c.playing = !c.finished;
        }
    }
    pub fn stop(&mut self, _cx: &mut Cx, id: LiveId) {
        self.mixer.lock().unwrap().clips.retain(|c| c.id != id);
    }
    /// The clip's playback clock (None once stopped / unknown).
    pub fn state(&self, id: LiveId) -> Option<ClipState> {
        let m = self.mixer.lock().unwrap();
        let c = m.clips.iter().find(|c| c.id == id)?;
        let (position_ms, total_ms) = match &c.audio {
            Some(a) if a.rate > 0 => {
                let pos = c.seek_ms.map_or(c.pos * 1000. / a.rate as f64, |ms| ms);
                (pos.min(a.duration_ms()), a.duration_ms())
            }
            _ => (0., 0.),
        };
        Some(ClipState { ready: c.audio.is_some(), failed: c.failed, position_ms, total_ms, finished: c.finished })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(rate: u32, seconds: f64) -> Vec<u8> {
        let samples = (rate as f64 * seconds) as u32;
        let mut w = b"RIFF".to_vec();
        w.extend_from_slice(&(36 + samples * 2).to_le_bytes());
        w.extend_from_slice(b"WAVEfmt ");
        w.extend_from_slice(&16u32.to_le_bytes());
        w.extend_from_slice(&1u16.to_le_bytes());
        w.extend_from_slice(&1u16.to_le_bytes());
        w.extend_from_slice(&rate.to_le_bytes());
        w.extend_from_slice(&(rate * 2).to_le_bytes());
        w.extend_from_slice(&2u16.to_le_bytes());
        w.extend_from_slice(&16u16.to_le_bytes());
        w.extend_from_slice(b"data");
        w.extend_from_slice(&(samples * 2).to_le_bytes());
        for i in 0..samples {
            w.extend_from_slice(&(((i % 100) as i16 - 50) * 100).to_le_bytes());
        }
        w
    }

    #[test]
    fn wav_decodes_with_its_duration() {
        let d = decode(&wav(16000, 1.5)).unwrap();
        assert_eq!((d.rate, d.channels), (16000, 1));
        assert!((d.duration_ms() - 1500.).abs() < 0.1);
    }

    /// The mixer's clock is the samples it handed to the device: a 1.5s
    /// clip at 16kHz on a 48kHz device finishes after exactly 1.5s of buffers,
    /// pauses hold the position, and a seek lands where asked.
    #[test]
    fn mixer_clock_follows_the_device_buffers() {
        let audio = Arc::new(decode(&wav(16000, 1.5)).unwrap());
        let id = LiveId(1);
        let mut m = Mixer::default();
        m.clips.push(Clip { id, audio: Some(audio.clone()), failed: false, pos: 0., seek_ms: None, playing: true, finished: false });
        let mut buf = AudioBuffer::new_with_size(480, 2);
        let state = |m: &Mixer| m.clips[0].pos * 1000. / 16000.;
        for _ in 0..100 {
            m.mix(&mut buf, 48000.); // 100 x 10ms
        }
        assert!((state(&m) - 1000.).abs() < 0.5, "{}", state(&m));
        m.clips[0].playing = false;
        m.mix(&mut buf, 48000.);
        assert!((state(&m) - 1000.).abs() < 0.5);
        m.clips[0].playing = true;
        for _ in 0..60 {
            m.mix(&mut buf, 48000.);
        }
        assert!(m.clips[0].finished && !m.clips[0].playing);
        m.clips[0].seek_ms = Some(250.);
        m.clips[0].finished = false;
        m.clips[0].playing = true;
        m.mix(&mut AudioBuffer::new_with_size(0, 2), 48000.);
        assert!((state(&m) - 250.).abs() < 0.5);
    }

    /// Pack narration (OCTOS_AUDIO_TEST_FILE=<course mp3>) decodes in full.
    #[test]
    #[ignore = "requires OCTOS_AUDIO_TEST_FILE pointing to a recorded course MP3"]
    fn recorded_course_mp3_decodes() {
        let path = std::env::var("OCTOS_AUDIO_TEST_FILE").unwrap();
        let d = decode(&std::fs::read(path).unwrap()).unwrap();
        assert!(d.duration_ms() > 2500.);
        eprintln!("{}Hz x{} {:.0}ms", d.rate, d.channels, d.duration_ms());
    }

    /// Declared (manifest durationMs) vs decoded narration length for every
    /// pack under OCTOS_AUDIO_PACK_ROOT (item 2 evaluation).
    #[test]
    #[ignore = "requires OCTOS_AUDIO_PACK_ROOT pointing to unpacked course packs"]
    fn declared_vs_decoded_narration_durations() {
        let root = std::path::PathBuf::from(std::env::var("OCTOS_AUDIO_PACK_ROOT").unwrap());
        let mut diffs = Vec::new();
        for pack in std::fs::read_dir(&root).unwrap().flatten().filter(|e| e.path().is_dir()) {
            for version in std::fs::read_dir(pack.path()).unwrap().flatten().filter(|e| e.path().is_dir()) {
                let (p, v) = (pack.file_name().to_string_lossy().to_string(), version.file_name().to_string_lossy().to_string());
                for (beat, path, declared) in crate::course_pack::narration(&root, &p, &v) {
                    let d = decode(&std::fs::read(&path).unwrap()).unwrap();
                    diffs.push((d.duration_ms() - declared, format!("{p}/{beat}")));
                }
            }
        }
        diffs.sort_by(|a, b| a.0.abs().total_cmp(&b.0.abs()));
        let n = diffs.len() as f64;
        let mean = diffs.iter().map(|d| d.0).sum::<f64>() / n;
        let mean_abs = diffs.iter().map(|d| d.0.abs()).sum::<f64>() / n;
        eprintln!("clips {} | decoded - declared: mean {mean:.1}ms, mean |d| {mean_abs:.1}ms, median |d| {:.1}ms, max {:?}", diffs.len(), diffs[diffs.len() / 2].0.abs(), diffs.last());
    }
}
