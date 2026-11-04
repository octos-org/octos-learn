#!/usr/bin/env python3
"""Offline LivePortrait evaluation. Uses an external checkout and local weights.

No camera, face detector, upload, generated parts, image blending, or product UI.
A square source image is the only visual input. Human/animal core, official
retargeting networks and head-pose transforms generate all output frames.
Dependencies and exact upstream revision are documented in docs/.
"""
import argparse
import hashlib
import json
import pathlib
import statistics
import subprocess
import sys
import time


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--checkout', type=pathlib.Path, required=True)
    p.add_argument('--source', type=pathlib.Path, required=True)
    p.add_argument('--output', type=pathlib.Path, required=True)
    p.add_argument('--model', choices=['human', 'animal'], default='human')
    p.add_argument('--device', choices=['cpu', 'hybrid'], default='hybrid')
    p.add_argument('--mode', choices=['stills', 'clip'], default='stills')
    p.add_argument('--manifest', type=pathlib.Path, required=True)
    args = p.parse_args()
    checkout = args.checkout.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    # Verify downloaded checkpoint bytes before loading any torch serialization.
    files = json.loads(args.manifest.read_text())
    selected = [entry for entry in files if entry['file'].startswith(
        'liveportrait/base_models/' if args.model == 'human' else 'liveportrait_animals/base_models_v1.1/')
        or entry['file'] == 'liveportrait/retargeting_models/stitching_retargeting_module.pth']
    if len(selected) != 5:
        raise ValueError('Expected exactly four core checkpoints and one retargeting checkpoint')
    for entry in selected:
        data = (checkout / 'pretrained_weights' / entry['file']).read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('Checkpoint checksum mismatch: ' + entry['file'])
    import numpy as np
    import torch
    from PIL import Image
    sys.path.insert(0, str(checkout))
    from src.config.inference_config import InferenceConfig
    from src.live_portrait_wrapper import LivePortraitWrapper, LivePortraitWrapperAnimal
    from src.utils.camera import get_rotation_matrix
    torch.set_num_threads(6)
    torch.set_num_interop_threads(2)
    started = time.perf_counter()
    cfg = InferenceConfig(flag_force_cpu=True, flag_use_half_precision=False)
    wrapper = (LivePortraitWrapperAnimal if args.model == 'animal' else LivePortraitWrapper)(cfg)
    mps = args.device == 'hybrid' and torch.backends.mps.is_available()
    if args.device == 'hybrid' and not mps:
        raise RuntimeError('Metal acceleration unavailable. Explicitly select --device cpu to use CPU.')
    # PyTorch 2.3 MPS has no Conv3D support. No model math is substituted:
    # F/W remain on CPU, while the 2D M/G modules use Metal.
    if mps:
        wrapper.motion_extractor.to('mps')
        wrapper.spade_generator.to('mps')
    source_rgb = np.array(Image.open(args.source).convert('RGB').resize((512, 512)))
    Image.fromarray(source_rgb).save(args.output / 'source.png')
    metadata = {
        'upstream': 'https://github.com/KlingAIResearch/LivePortrait',
        'upstream_commit': subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip(),
        'model': args.model, 'torch': torch.__version__,
        'device': 'CPU F/W + Metal M/G' if mps else 'CPU', 'cpu_threads': 6,
        'source_file': str(args.source), 'source_sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
        'output_size': [512, 512], 'mode': args.mode,
        'network_used_for_inference': False, 'camera_used': False,
        'input_notes': 'Pre-cropped single complete illustration; no InsightFace or X-Pose detector.',
        'weights': selected, 'frames': [],
    }
    if args.mode == 'stills':
        states = [('neutral', 0, 0, 0), ('blink', 1, 0, 0), ('open-mouth', 0, 1, 0),
                  ('turn-left', 0, 0, -10), ('turn-right', 0, 0, 10), ('return', 0, 0, 0)]
    else:
        states = [('neutral', 0, 0, 0)]
        states += [('blink', float(np.sin(np.pi*i/8)**2), 0, 0) for i in range(1, 9)]
        states += [('open-mouth', 0, float(np.sin(np.pi*i/8)**2), 0) for i in range(1, 9)]
        states += [('head-turn', 0, 0, float(10*np.sin(2*np.pi*i/14))) for i in range(1, 15)]
        states += [('return', 0, 0, 0)]
    with torch.inference_mode():
        x = wrapper.prepare_source(source_rgb)
        info = wrapper.get_kp_info(x.to('mps') if mps else x)
        info = {k: v.cpu() if torch.is_tensor(v) else v for k, v in info.items()}
        source_kp = wrapper.transform_keypoint(info)
        feature = wrapper.extract_feature_3d(x)
        # Manually supplied source ratios avoid a human detector on a fox face.
        # These are diagnostic control values, not measured face geometry.
        eye_delta = wrapper.retarget_eye(source_kp, torch.tensor([[.5, .5, 0.]], dtype=torch.float32))
        lip_delta = wrapper.retarget_lip(source_kp, torch.tensor([[.02, .28]], dtype=torch.float32))
        metadata['source_ratios'] = {'eyes': [.5, .5], 'lip': .02}
        metadata['target_ratios'] = {'eyes': 0, 'lip': .28}
        metadata['estimated_head_degrees'] = {k: info[k].item() for k in ['pitch', 'yaw', 'roll']}
        metadata['initialization_seconds'] = time.perf_counter() - started
        first = last = None
        for index, (label, blink, mouth, yaw) in enumerate(states):
            if mps:
                torch.mps.synchronize()
            start = time.perf_counter()
            rotation = get_rotation_matrix(info['pitch'], info['yaw'] + yaw, info['roll'])
            target = info['scale'][..., None] * (info['kp'] @ rotation + info['exp'])
            target[:, :, :2] += info['t'][:, None, :2]
            target += eye_delta * blink + lip_delta * mouth
            target = wrapper.stitching(source_kp, target)
            warped = wrapper.warping_module(feature, kp_source=source_kp, kp_driving=target)
            rendered = wrapper.spade_generator(feature=warped['out'].to('mps') if mps else warped['out'])
            pixels = wrapper.parse_output(rendered)[0]
            if mps:
                torch.mps.synchronize()
            elapsed = time.perf_counter() - start
            if index == 0:
                first = pixels.copy()
            last = pixels
            filename = f'{index:03d}-{label}.png'
            Image.fromarray(pixels).save(args.output / filename)
            record = {'index': index, 'file': filename, 'label': label,
                      'blink_weight': blink, 'mouth_weight': mouth,
                      'relative_yaw_degrees': yaw, 'inference_seconds': elapsed}
            metadata['frames'].append(record)
            (args.output / 'report.json').write_text(json.dumps(metadata, indent=2))
            print(json.dumps(record), flush=True)
        metadata['reset_max_pixel_difference'] = int(np.abs(first.astype(np.int16) - last.astype(np.int16)).max())
        metadata['reset_mean_pixel_difference'] = float(np.abs(first.astype(np.int16) - last.astype(np.int16)).mean())
        metadata['neutral_vs_source_mean_absolute_pixel_difference'] = float(np.abs(first.astype(np.int16) - source_rgb.astype(np.int16)).mean())
        times = [record['inference_seconds'] for record in metadata['frames']]
        metadata['timing'] = {'mean_seconds': statistics.mean(times), 'median_seconds': statistics.median(times),
                              'p95_seconds': sorted(times)[int(np.ceil(.95*len(times)))-1],
                              'note': 'Local offline core inference, excludes capture, network, encoding and display; not an optimized real-time benchmark.'}
        (args.output / 'report.json').write_text(json.dumps(metadata, indent=2))
        print('DONE', args.output, flush=True)


if __name__ == '__main__':
    main()
