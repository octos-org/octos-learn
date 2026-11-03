"""Encode the actual production painter's frames, not an image-generator mockup."""
from pathlib import Path
import json
import shutil
import numpy as np
import imageio.v2 as iio
from PIL import Image

source = Path('scratch/avatar-painted')
out = Path('docs/avatar-animation-phase-a/painted-v0.1')
out.mkdir(parents=True, exist_ok=True)
frames = sorted((source / 'frames').glob('*.png'))
assert len(frames) == 160
with iio.get_writer(out / 'preview.mp4', fps=20, codec='libx264', quality=8,
                    pixelformat='yuv420p', macro_block_size=2) as writer:
    for frame in frames:
        writer.append_data(np.array(Image.open(frame).convert('RGB')))
images = [Image.open(frame).convert('RGB').resize((384, 384), Image.Resampling.LANCZOS)
          for frame in frames[::2]]
images[0].save(out / 'preview.gif', save_all=True, append_images=images[1:],
               duration=100, loop=0, optimize=False)
reader = iio.get_reader(out / 'preview.mp4')
count = sum(1 for _ in reader)
reader.close()
gif = Image.open(out / 'preview.gif')
duration = 0
for index in range(gif.n_frames):
    gif.seek(index)
    duration += gif.info.get('duration', 0)
assert count == 160 and duration == 8000
for name in ['poses.jpg', 'render-report.json', 'animation-report.json', 'synthetic-track.json', 'round-trip-report.json']:
    shutil.copy2(source / name, out / name)
(out / 'media-report.json').write_text(json.dumps({
    'mp4DecodedFrames': count, 'mp4Size': [536, 536], 'mp4Fps': 20,
    'gifDurationMs': duration,
    'source': 'Actual createPaintedFoxPainter with deterministic demoFaceFrame input',
    'limitation': 'Offline playback rate is not real-time capture or television performance.'
}, indent=2) + '\n')
print(out)
