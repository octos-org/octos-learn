// Executed by Playwright before the complete application's first script.
// Correlates actual rendered course nodes and decoded narration bytes. No
// production globals or source changes are required.
export function installLivePlayableProbe() {
  const state = { start: 0, visual: 0, audio: 0, target: null, audioSha256: null, audioSources: 0, audioInterval: null };
  window.__livePlayableProbe = state;
  const matching = new WeakSet();
  document.addEventListener('submit', () => {
    if (state.start) return;
    state.start = performance.now(); requestAnimationFrame(watchVisual);
  }, true);
  function visible() {
    if (!state.target) return false;
    const ids = new Set(state.target.nodeIds);
    return [...document.querySelectorAll('[data-testid="oll-lesson-board"] .board-node[data-id]')].some(node => {
      if (!ids.has(node.getAttribute('data-id'))) return false;
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight && style.visibility !== 'hidden' && style.opacity !== '0';
    }) && !!document.querySelector('[data-testid="oll-controls"] button:not([disabled])');
  }
  function watchVisual() {
    if (state.visual) return;
    if (!visible()) { requestAnimationFrame(watchVisual); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (visible()) state.visual ||= performance.now(); else requestAnimationFrame(watchVisual);
    }));
  }
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (bytes, ...callbacks) {
    // Copy before native decode detaches the original buffer. Hash and native
    // decode run together; neither replaces audio with a synthetic signal.
    const digest = crypto.subtle.digest('SHA-256', bytes.slice(0)).then(value =>
      [...new Uint8Array(value)].map(v => v.toString(16).padStart(2, '0')).join(''));
    return Promise.all([decode.call(this, bytes), digest]).then(([buffer, hash]) => {
      if (state.audioSha256 && hash === state.audioSha256) matching.add(buffer);
      callbacks[0]?.(buffer); return buffer;
    }, error => { callbacks[1]?.(error); throw error; });
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = start.apply(this, args);
    if (!state.start || state.audio || !matching.has(this.buffer)) return result;
    state.audioSources++;
    const ctx = this.context, analyser = ctx.createAnalyser(), mute = ctx.createGain();
    analyser.fftSize = 256; mute.gain.value = 0;
    this.connect(analyser); analyser.connect(mute); mute.connect(ctx.destination);
    const values = new Float32Array(256), beginning = performance.now(); let last = beginning;
    const poll = () => {
      analyser.getFloatTimeDomainData(values);
      if (ctx.state === 'running' && values.some(v => Math.abs(v) > 0.001)) {
        state.audio ||= performance.now(); state.audioInterval = [last - state.start, state.audio - state.start];
        this.disconnect(analyser); analyser.disconnect(); mute.disconnect();
      } else if (!state.audio && performance.now() - beginning < 10000) { last = performance.now(); requestAnimationFrame(poll); }
    };
    requestAnimationFrame(poll); return result;
  };
}

export async function readLivePlayable(page) {
  return page.evaluate(() => {
    const s = window.__livePlayableProbe;
    if (!s.start || !s.visual || !s.audio || !s.target || !s.audioSha256) return null;
    return { visual_ms: s.visual - s.start, audio_ms: s.audio - s.start,
      playable_ms: Math.max(s.visual, s.audio) - s.start, audio_observation_interval_ms: s.audioInterval,
      matched_audio_sources: s.audioSources, artifact_sha256: s.target.artifactSha256,
      audio_sha256: s.audioSha256, beat_id: s.target.beatId };
  });
}
