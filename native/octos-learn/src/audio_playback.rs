//! Audio-only playback. The pinned Makepad macOS video backend falls back
//! after 60 polls without a video frame, which cuts off MP3/WAV narration.
//! Keep audio on AVAudioPlayer without changing the pinned Makepad checkout.
use makepad_widgets::*;

#[derive(Default)]
pub struct Players {
    #[cfg(target_os = "macos")]
    players: std::collections::HashMap<LiveId, apple::Player>,
}

impl Players {
    pub fn prepare(
        &mut self,
        _cx: &mut Cx,
        id: LiveId,
        path: &str,
        seek_ms: Option<u64>,
    ) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let player = apple::Player::new(path)?;
            if let Some(ms) = seek_ms {
                player.seek(ms);
            }
            player.play()?;
            self.players.insert(id, player);
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = seek_ms; // Seek on VideoPlaybackPrepared in the host.
            _cx.prepare_audio_playback(
                id,
                makepad_widgets::makepad_platform::event::VideoSource::Filesystem(path.into()),
                true,
                false,
            );
        }
        Ok(())
    }
    pub fn pause(&mut self, _cx: &mut Cx, id: LiveId) {
        #[cfg(target_os = "macos")]
        if let Some(player) = self.players.get(&id) {
            player.pause();
        }
        #[cfg(not(target_os = "macos"))]
        _cx.pause_video_playback(id);
    }
    pub fn resume(&mut self, _cx: &mut Cx, id: LiveId) {
        #[cfg(target_os = "macos")]
        if let Some(player) = self.players.get(&id) {
            let _ = player.play();
        }
        #[cfg(not(target_os = "macos"))]
        _cx.resume_video_playback(id);
    }
    pub fn stop(&mut self, _cx: &mut Cx, id: LiveId) {
        #[cfg(target_os = "macos")]
        {
            self.players.remove(&id);
        }
        #[cfg(not(target_os = "macos"))]
        _cx.cleanup_video_playback_resources(id);
    }
}

#[cfg(target_os = "macos")]
mod apple {
    use makepad_widgets::makepad_platform::os::apple::apple_sys::*;

    pub(super) struct Player(RcObjcId);

    impl Player {
        pub(super) fn new(path: &str) -> Result<Self, String> {
            // Owned AVAudioPlayer stays on the UI thread; it handles decoding
            // and audio output independently of drawing or video-frame polls.
            unsafe {
                let url: ObjcId = msg_send![class!(NSURL), fileURLWithPath: str_to_nsstring(path)];
                let allocated: ObjcId = msg_send![class!(AVAudioPlayer), alloc];
                let mut error: ObjcId = nil;
                let player: ObjcId =
                    msg_send![allocated, initWithContentsOfURL: url error: &mut error];
                let player = NonNull::new(player).ok_or("无法打开旁白音频")?;
                let player = Self(RcObjcId::from_owned(player));
                let ready: BOOL = msg_send![player.0.as_id(), prepareToPlay];
                if ready == NO {
                    return Err("无法准备旁白音频".into());
                }
                if std::env::var_os("OCTOS_AUDIO_DEBUG").is_some() {
                    eprintln!(
                        "[audio] audio-only prepared {path} duration {:.0}ms",
                        player.duration_ms()
                    );
                }
                Ok(player)
            }
        }
        pub(super) fn play(&self) -> Result<(), String> {
            unsafe {
                let started: BOOL = msg_send![self.0.as_id(), play];
                if started == NO {
                    return Err("无法播放旁白音频".into());
                }
            }
            Ok(())
        }
        pub(super) fn pause(&self) {
            unsafe {
                let _: () = msg_send![self.0.as_id(), pause];
            }
        }
        pub(super) fn seek(&self, ms: u64) {
            unsafe {
                let _: () = msg_send![self.0.as_id(), setCurrentTime: ms as f64 / 1000.];
            }
        }
        fn duration_ms(&self) -> f64 {
            unsafe {
                let seconds: f64 = msg_send![self.0.as_id(), duration];
                seconds * 1000.
            }
        }
        fn position_ms(&self) -> f64 {
            unsafe {
                let seconds: f64 = msg_send![self.0.as_id(), currentTime];
                seconds * 1000.
            }
        }
        fn is_playing(&self) -> bool {
            unsafe {
                let playing: BOOL = msg_send![self.0.as_id(), isPlaying];
                playing != NO
            }
        }
    }
    impl Drop for Player {
        fn drop(&mut self) {
            if std::env::var_os("OCTOS_AUDIO_DEBUG").is_some() {
                eprintln!(
                    "[audio] audio-only released playing={} position {:.0}/{:.0}ms",
                    self.is_playing(),
                    self.position_ms(),
                    self.duration_ms()
                );
            }
            unsafe {
                let _: () = msg_send![self.0.as_id(), stop];
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::time::Duration;

        #[test]
        #[ignore = "requires OCTOS_AUDIO_TEST_FILE pointing to a recorded course MP3"]
        fn recorded_course_mp3_plays_to_the_end() {
            let path = std::env::var("OCTOS_AUDIO_TEST_FILE").unwrap();
            let player = Player::new(&path).unwrap();
            let duration = player.duration_ms();
            assert!(duration > 2500.);
            player.play().unwrap();
            std::thread::sleep(Duration::from_millis(2000));
            let position = player.position_ms();
            assert!(position > 1500., "MP3 stopped early at {position}ms");
            std::thread::sleep(Duration::from_secs_f64((duration - position) / 1000. - 0.2));
            let position = player.position_ms();
            assert!(
                position >= duration - 500. && player.is_playing(),
                "MP3 stopped early at {position}/{duration}ms"
            );
            eprintln!("Recorded MP3 reached {position:.0}/{duration:.0}ms");
            std::thread::sleep(Duration::from_millis(500));
            // Compressed audio currentTime resets to zero after EOF.
            assert!(!player.is_playing());
        }

        #[test]
        fn audio_only_keeps_playing_and_supports_pause_resume_seek() {
            // Four seconds of silent PCM: an audio-only asset with no video
            // frames, exercising playback well past the old ~1 second cutoff.
            let path = std::env::temp_dir().join(format!("octos-audio-{}.wav", std::process::id()));
            let data_len = 8000u32 * 2 * 4;
            let mut wav = Vec::new();
            wav.extend_from_slice(b"RIFF");
            wav.extend_from_slice(&(36 + data_len).to_le_bytes());
            wav.extend_from_slice(b"WAVEfmt ");
            wav.extend_from_slice(&16u32.to_le_bytes());
            wav.extend_from_slice(&1u16.to_le_bytes());
            wav.extend_from_slice(&1u16.to_le_bytes());
            wav.extend_from_slice(&8000u32.to_le_bytes());
            wav.extend_from_slice(&16000u32.to_le_bytes());
            wav.extend_from_slice(&2u16.to_le_bytes());
            wav.extend_from_slice(&16u16.to_le_bytes());
            wav.extend_from_slice(b"data");
            wav.extend_from_slice(&data_len.to_le_bytes());
            wav.resize(44 + data_len as usize, 0);
            std::fs::write(&path, wav).unwrap();
            let player = Player::new(path.to_str().unwrap()).unwrap();
            assert!((player.duration_ms() - 4000.).abs() < 10.);
            player.play().unwrap();
            std::thread::sleep(Duration::from_millis(1800));
            assert!(player.position_ms() > 1400.);
            player.pause();
            let paused = player.position_ms();
            std::thread::sleep(Duration::from_millis(150));
            assert!((player.position_ms() - paused).abs() < 50.);
            player.seek(3300);
            player.play().unwrap();
            std::thread::sleep(Duration::from_millis(850));
            assert!(player.position_ms() >= 3990.);
            drop(player);
            std::fs::remove_file(path).unwrap();
        }
    }
}
