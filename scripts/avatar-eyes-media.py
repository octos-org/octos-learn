"""Encode actual dual-eye Canvas frames; playback is not a capture benchmark."""
from pathlib import Path
import json
import imageio.v2 as iio
import numpy as np
from PIL import Image

root = Path('docs/avatar-animation-phase-a/facial-rig/blink-v3')
frames = sorted(Path('scratch/avatar-face-rig/blink-v3/frames').glob('*.png'))
assert len(frames) == 120
with iio.get_writer(root / 'validation.mp4', fps=24, codec='libx264', quality=8,
                    pixelformat='yuv420p') as writer:
    for frame in frames:
        writer.append_data(np.array(Image.open(frame).convert('RGB')))
images = [Image.open(p).convert('RGB').resize((384, 384), Image.Resampling.LANCZOS)
          for p in frames[::2]]
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
report['mediaVerification'] = {'mp4DecodedFrames': decoded, 'mp4Dimensions': [512, 512],
                              'playbackFps': 24, 'mp4Seconds': 5, 'gifDurationMs': duration}
(root / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['mediaVerification'])
