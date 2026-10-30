// Zero-provider browser controls for the same probe used by the live runner.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { installLivePlayableProbe, readLivePlayable } from './lib/learning-playable-probe.mjs';

const resultPath = process.argv[2]; assert.ok(resultPath, 'Supply a new result JSON path');
const report = { scope: 'Isolated browser probe controls, no product acceptance or real provider calls', real_supplier_calls: 0, rows: [] };
await writeFile(resultPath, JSON.stringify(report), { flag: 'wx', mode: 0o600 });
function wav(silent) {
  const b = Buffer.alloc(44 + 24000 * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  if (!silent) for (let i = 0; i < 24000; i++) b.writeInt16LE(Math.round(600 * Math.sin(2 * Math.PI * 440 * i / 24000)), 44 + i * 2);
  return b;
}
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  for (const scenario of ['valid', 'silent', 'wrong-audio', 'wrong-course', 'no-audio', 'no-course']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(installLivePlayableProbe);
      await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <form><button>Start</button></form><div data-testid="oll-lesson-board"><div class="board-node" data-id="old-course">Old lesson</div></div>
        <div data-testid="oll-controls"><button>Play</button></div><script>document.querySelector('form').onsubmit=e=>e.preventDefault()</script>` }));
      const page = await context.newPage(); await page.goto('https://probe-fixture.invalid');
      const bytes = wav(scenario === 'silent'), hash = createHash('sha256').update(bytes).digest('hex');
      await page.evaluate(({ scenario, hash }) => {
        const s = window.__livePlayableProbe;
        s.target = { nodeIds: ['new-course'], beatId: 'first-beat', artifactSha256: 'fixed-fixture' };
        s.audioSha256 = scenario === 'wrong-audio' ? 'not-the-decoded-audio' : hash;
      }, { scenario, hash });
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      await page.evaluate(async ({ scenario, base64 }) => {
        if (!['wrong-course', 'no-course'].includes(scenario)) {
          const node = document.createElement('div'); node.className = 'board-node'; node.dataset.id = 'new-course'; node.textContent = 'New lesson';
          document.querySelector('[data-testid="oll-lesson-board"]').append(node);
        }
        if (scenario !== 'no-audio') {
          const c = new AudioContext(); await c.resume();
          const b = await c.decodeAudioData(Uint8Array.from(atob(base64), ch => ch.charCodeAt(0)).buffer);
          window.__probeControlReplay = () => { const replay = c.createBufferSource(); replay.buffer = b; replay.connect(c.destination); replay.start(); };
          const source = c.createBufferSource(); source.buffer = b; source.connect(c.destination); source.start();
        }
      }, { scenario, base64: bytes.toString('base64') });
      if (scenario === 'valid') await page.waitForFunction(() => window.__livePlayableProbe.audio && window.__livePlayableProbe.visual);
      else await page.waitForTimeout(250);
      const result = await readLivePlayable(page);
      assert.equal(!!result, scenario === 'valid', `False completion for ${scenario}`);
      report.rows.push({ scenario, expected_complete: scenario === 'valid', actual_complete: !!result,
        metrics: await page.evaluate(() => { const s = window.__livePlayableProbe; return { audio: s.audio > 0, visual: s.visual > 0, matching_sources: s.audioSources }; }) });
      if (scenario === 'valid') {
        await page.evaluate(() => window.__probeControlReplay());
        const replayed = await readLivePlayable(page);
        assert.equal(replayed.matched_audio_sources, 2, 'A replay after first audio must be counted');
        assert.equal(replayed.audio_ms, result.audio_ms, 'A replay must not overwrite first readiness');
        report.replay_control = { matching_sources: replayed.matched_audio_sources, first_timestamp_preserved: true };
      }
    } finally { await context.close(); }
  }
  report.passed = true; report.checked_at = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true });
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
