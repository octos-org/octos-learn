"""Offline DCT-Net 3D graph probe. No webcam, uploads, model service or UI changes."""
from pathlib import Path
import argparse
import hashlib
import json
import platform
import statistics
import time

import numpy as np
from PIL import Image, ImageDraw
import tensorflow as tf

parser = argparse.ArgumentParser()
parser.add_argument('--model', type=Path, required=True)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--onnx', type=Path)
args = parser.parse_args()
# Frozen official inference graph only; no Python code is loaded from weights.
expected = 'bca966dded317de32b6870b758fd01c6ab8f6ab76a285149fbf450a71624fe80'
digest = hashlib.sha256(args.model.read_bytes()).hexdigest()
if digest != expected:
    raise ValueError('Unexpected model digest')
args.output.mkdir(parents=True, exist_ok=True)
source = Image.open(args.input).convert('RGB')
if source.size != (512, 512):
    raise ValueError('This probe uses the documented 512px NASA/scikit-image fixture')
crop = (110, 10, 350, 250)
graph = tf.Graph()
with graph.as_default():
    definition = tf.compat.v1.GraphDef()
    definition.ParseFromString(args.model.read_bytes())
    tf.import_graph_def(definition, name='')
input_tensor = graph.get_tensor_by_name('input_image:0')
output_tensor = graph.get_tensor_by_name('output_image:0')
config = tf.compat.v1.ConfigProto(intra_op_parallelism_threads=6, inter_op_parallelism_threads=1,
                                device_count={'GPU': 0})
results = []
with tf.compat.v1.Session(graph=graph, config=config) as session:
    for name, image in [('head-288', source.crop(crop).resize((288, 288), Image.Resampling.LANCZOS)),
                        ('head-512', source.crop(crop).resize((512, 512), Image.Resampling.LANCZOS)),
                        ('full-512', source)]:
        # Official inference feeds HWC BGR values in [0,255], without external normalization.
        rgb = np.asarray(image)
        value = np.ascontiguousarray(rgb[:, :, ::-1]).astype(input_tensor.dtype.as_numpy_dtype)
        warm_started = time.perf_counter()
        actual = session.run(output_tensor, {input_tensor: value})
        warm_ms = (time.perf_counter() - warm_started) * 1000
        timings = []
        for _ in range(8):
            started = time.perf_counter()
            actual = session.run(output_tensor, {input_tensor: value})
            timings.append((time.perf_counter() - started) * 1000)
        if actual.shape != rgb.shape or not np.isfinite(actual).all():
            raise ValueError('Invalid inference output')
        out = np.clip(actual[:, :, ::-1], 0, 255).astype(np.uint8)
        if out.std() < 1:
            raise ValueError('Blank inference output')
        image.save(args.output / f'{name}-input.png')
        Image.fromarray(out).save(args.output / f'{name}-output.png')
        results.append({'name': name, 'size': list(image.size), 'warmup_ms': warm_ms,
                        'inference_ms': timings, 'median_ms': statistics.median(timings),
                        'mean_ms': statistics.mean(timings), 'output_sha256': hashlib.sha256(out.tobytes()).hexdigest()})
onnx_info = None
if args.onnx:
    import onnx
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 6
    options.inter_op_num_threads = 1
    engine = ort.InferenceSession(str(args.onnx), sess_options=options, providers=['CPUExecutionProvider'])
    for result in results:
        image = np.asarray(Image.open(args.output / f"{result['name']}-input.png").convert('RGB'))
        value = np.ascontiguousarray(image[:, :, ::-1]).astype(input_tensor.dtype.as_numpy_dtype)
        reference = np.asarray(Image.open(args.output / f"{result['name']}-output.png").convert('RGB'))
        engine.run(None, {'input_image:0': value})
        timings = []
        for _ in range(8):
            started = time.perf_counter()
            actual = engine.run(None, {'input_image:0': value})[0]
            timings.append((time.perf_counter() - started) * 1000)
        actual_bytes = np.clip(actual[:, :, ::-1], 0, 255).astype(np.uint8)
        difference = np.abs(actual_bytes.astype(np.int16) - reference.astype(np.int16))
        maximum = int(difference.max())
        if maximum > 2:
            raise ValueError(f'ONNX output differs from TensorFlow by {maximum}')
        result['onnx'] = {'inference_ms': timings, 'median_ms': statistics.median(timings),
                          'max_channel_difference_vs_tensorflow': maximum,
                          'mean_channel_difference_vs_tensorflow': float(difference.mean())}
    onnx_info = {'runtime': ort.__version__, 'providers': engine.get_providers(),
                 'sha256': hashlib.sha256(args.onnx.read_bytes()).hexdigest(), 'bytes': args.onnx.stat().st_size,
                 'operators': sorted({n.op_type for n in onnx.load(str(args.onnx)).graph.node}),
                 'web_runtime_tested': False}
sheet = Image.new('RGB', (768, 420), '#f4f1ea')
draw = ImageDraw.Draw(sheet)
for index, (label, path) in enumerate([
    ('NASA adult fixture', args.output / 'head-288-input.png'),
    ('DCT-Net 3D / 288', args.output / 'head-288-output.png'),
    ('DCT-Net 3D / 512', args.output / 'head-512-output.png'),
]):
    draw.text((index * 256 + 10, 12), label, fill='#243649')
    sheet.paste(Image.open(path).resize((256, 256), Image.Resampling.LANCZOS), (index * 256, 42))
draw.text((12, 320), 'Local CPU inference. Still-image probe; not Snapchat output.', fill='#243649')
draw.text((12, 345), 'No camera input, no uploads. Playback / temporal quality not tested.', fill='#243649')
draw.text((12, 370), 'NASA / scikit-image public-domain test photograph; no endorsement.', fill='#243649')
sheet.save(args.output / 'comparison.jpg', quality=92)
report = {
    'kind': 'real-local-frozen-graph-inference', 'date': '2026-11-03',
    'model': {'name': 'iic/cv_unet_person-image-cartoon-3d_compound-models', 'file': args.model.name,
              'sha256': digest, 'input': input_tensor.name, 'input_dtype': input_tensor.dtype.name,
              'output': output_tensor.name, 'output_dtype': output_tensor.dtype.name,
              'model_page': 'https://modelscope.cn/models/iic/cv_unet_person-image-cartoon-3d_compound-models/summary'},
    'input': {'source': 'NASA public-domain Eileen Collins photograph from scikit-image v0.19.3',
              'url': 'https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/astronaut.png',
              'license_reference': 'https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut',
              'sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(), 'head_crop': list(crop),
              'alignment': 'Fixed manual crop, not automatic face detection or the full upstream composite pipeline'},
    'runtime': {'tensorflow': tf.__version__, 'numpy': np.__version__, 'python': platform.python_version(),
                'machine': platform.machine(), 'device': 'CPU', 'intra_op_threads': 6, 'inter_op_threads': 1},
    'results': results, 'onnx': onnx_info, 'camera_used': False, 'external_inference': False,
    'limits': ['Not the Snapchat model or a style-equivalence pass.', 'Single static adult fixture; no expression/temporal test.',
               'Core graph timing excludes capture, face detection/alignment, background composition, encoding and display.',
               'No browser/TV performance claim; no anonymity or final TTS claim.'],
}
(args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'tensorflow': tf.__version__, 'results': results, 'output': str(args.output)}, indent=2))
