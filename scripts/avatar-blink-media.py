"""Encode the native Canvas comparison frames; no model inference or camera use."""
from pathlib import Path
import json
import imageio.v2 as iio
import numpy as np
from PIL import Image

root = Path('docs/avatar-animation-phase-a/facial-rig/blink-v2')
frames = sorted(Path('scratch/avatar-face-rig/blink-v2/frames').glob('*.png'))
assert len(frames) == 120, 'Run avatar-blink-validate.mjs first'
with iio.get_writer(root / 'validation.mp4', fps=24, codec='libx264', quality=8,
                    pixelformat='yuv420p', macro_block_size=2) as writer:
    for frame in frames:
        writer.append_data(np.array(Image.open(frame).convert('RGB')))
images = [Image.open(p).convert('RGB').resize((640, 240), Image.Resampling.LANCZOS)
          for p in frames[::2]]
# GIF timings are quantized to 10ms. This sums to exactly five seconds.
images[0].save(root / 'validation.gif', save_all=True, append_images=images[1:],
               duration=[80, 80, 90] * 20, loop=0, optimize=False)
reader = iio.get_reader(root / 'validation.mp4')
decoded = sum(1 for _ in reader)
reader.close()
gif = Image.open(root / 'validation.gif')
duration = 0
for index in range(gif.n_frames):
    gif.seek(index)
    duration += gif.info.get('duration', 0)
assert decoded == 120 and duration == 5000
report = json.loads((root / 'report.json').read_text())
report['mediaVerification'] = {'mp4DecodedFrames': decoded, 'mp4Dimensions': [800, 300],
                              'playbackFps': 24, 'mp4Seconds': 5,
                              'gifActualDurationMs': duration,
                              'note': 'Offline parameter sequence, not capture or real-time performance.'}
(root / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['mediaVerification'])
