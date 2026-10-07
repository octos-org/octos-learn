//! Microphone capture for voice questions (web use-voice-capture): the
//! default input is captured on Makepad's audio thread, an utterance is cut
//! by an energy VAD with the web MicVAD timings (≥300 ms of speech, ends
//! after ~700 ms of silence) and encoded as 16 kHz mono 16-bit WAV, the
//! format the web uploads for server ASR.
//! DIFF: the web runs the Silero VAD model; this is an adaptive energy gate.
use makepad_widgets::*;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Captured {
    rate: f64,
    samples: Vec<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VadState {
    Idle,
    Speaking,
}

pub struct Voice {
    shared: Arc<Mutex<Captured>>,
    registered: bool,
    pub enabled: bool,
    state: VadState,
    noise: f32,
    utterance: Vec<f32>,
    speech_ms: f64,
    silence_ms: f64,
    rate: f64,
    pending: Vec<f32>,
}

impl Default for Voice {
    fn default() -> Self {
        Self {
            shared: Arc::new(Mutex::new(Captured::default())),
            registered: false,
            enabled: false,
            state: VadState::Idle,
            noise: 0.002,
            utterance: Vec::new(),
            speech_ms: 0.,
            silence_ms: 0.,
            rate: 48000.,
            pending: Vec::new(),
        }
    }
}

const FRAME_MS: f64 = 20.;
const MIN_SPEECH_MS: f64 = 300.;
const END_SILENCE_MS: f64 = 700.;
const MAX_UTTERANCE_MS: f64 = 30000.;
const PRE_ROLL_MS: f64 = 200.;

impl Voice {
    /// Start capturing (registers the input callback once; the devices are
    /// chosen on Event::AudioDevices).
    pub fn enable(&mut self, cx: &mut Cx) {
        if !self.registered {
            self.registered = true;
            let shared = self.shared.clone();
            cx.audio_input(0, move |info, input| {
                let Ok(mut c) = shared.lock() else { return };
                c.rate = info.sample_rate;
                let channels = input.channel_count().max(1);
                for i in 0..input.frame_count() {
                    let mut sum = 0.;
                    for ch in 0..channels {
                        sum += input.channel(ch)[i];
                    }
                    c.samples.push(sum / channels as f32);
                }
                // Never hold more than ~60 s if the UI stops draining.
                let cap = (c.rate.max(8000.) * 60.) as usize;
                if c.samples.len() > cap {
                    let drop = c.samples.len() - cap;
                    c.samples.drain(..drop);
                }
            });
        }
        self.enabled = true;
        self.reset();
        if let Ok(mut c) = self.shared.lock() {
            c.samples.clear();
        }
    }
    pub fn disable(&mut self) {
        self.enabled = false;
        self.reset();
    }
    fn reset(&mut self) {
        self.state = VadState::Idle;
        self.utterance.clear();
        self.pending.clear();
        self.speech_ms = 0.;
        self.silence_ms = 0.;
    }
    pub fn state(&self) -> VadState {
        self.state
    }
    /// Drain captured audio; returns a finished utterance as WAV bytes.
    pub fn poll(&mut self) -> Option<Vec<u8>> {
        let (rate, samples) = {
            let Ok(mut c) = self.shared.lock() else { return None };
            (c.rate, std::mem::take(&mut c.samples))
        };
        if !self.enabled {
            return None;
        }
        if rate > 0. {
            self.rate = rate;
        }
        self.pending.extend(samples);
        let frame = (self.rate * FRAME_MS / 1000.) as usize;
        let pre_roll = (self.rate * PRE_ROLL_MS / 1000.) as usize;
        let mut done = None;
        while frame > 0 && self.pending.len() >= frame {
            let chunk: Vec<f32> = self.pending.drain(..frame).collect();
            let rms = (chunk.iter().map(|s| s * s).sum::<f32>() / frame as f32).sqrt();
            let speech = rms > (self.noise * 3.5).max(0.012);
            match self.state {
                VadState::Idle => {
                    // Track the room's noise floor while nobody speaks.
                    self.noise = self.noise * 0.95 + rms * 0.05;
                    self.utterance.extend_from_slice(&chunk);
                    if self.utterance.len() > pre_roll {
                        let extra = self.utterance.len() - pre_roll;
                        self.utterance.drain(..extra);
                    }
                    if speech {
                        self.state = VadState::Speaking;
                        self.speech_ms = FRAME_MS;
                        self.silence_ms = 0.;
                    }
                }
                VadState::Speaking => {
                    self.utterance.extend_from_slice(&chunk);
                    if speech {
                        self.speech_ms += FRAME_MS;
                        self.silence_ms = 0.;
                    } else {
                        self.silence_ms += FRAME_MS;
                    }
                    let long = self.utterance.len() as f64 / self.rate * 1000. > MAX_UTTERANCE_MS;
                    if self.silence_ms >= END_SILENCE_MS || long {
                        let audio = std::mem::take(&mut self.utterance);
                        let real = self.speech_ms >= MIN_SPEECH_MS;
                        self.state = VadState::Idle;
                        self.speech_ms = 0.;
                        self.silence_ms = 0.;
                        if real && done.is_none() {
                            done = Some(encode_wav_16k(&audio, self.rate));
                        }
                    }
                }
            }
        }
        done
    }
}

/// Linear-resample to 16 kHz and encode mono 16-bit PCM WAV (web encodeWav).
pub fn encode_wav_16k(samples: &[f32], rate: f64) -> Vec<u8> {
    let out_rate = 16000.;
    let n = ((samples.len() as f64) * out_rate / rate.max(1.)).floor() as usize;
    let mut pcm = Vec::with_capacity(n * 2);
    for i in 0..n {
        let pos = i as f64 * rate / out_rate;
        let j = pos.floor() as usize;
        let t = (pos - j as f64) as f32;
        let a = samples.get(j).copied().unwrap_or(0.);
        let b = samples.get(j + 1).copied().unwrap_or(a);
        let v = (a + (b - a) * t).clamp(-1., 1.);
        pcm.extend_from_slice(&((v * 32767.) as i16).to_le_bytes());
    }
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&16000u32.to_le_bytes());
    wav.extend_from_slice(&32000u32.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(&pcm);
    wav
}
