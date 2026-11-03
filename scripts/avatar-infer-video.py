"""Offline real-model input probe. Never opens a camera or uploads video.

The Python CPU runtime uses the same pinned .task file as the browser Worker.
It is NOT the browser/WASM Worker, so results are kept separate from browser
capture performance and compatibility claims. Raw sample footage stays ignored.
"""
import argparse
import hashlib
import json
import platform
import statistics
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--videos', type=Path, nargs='+', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seconds', type=float, default=8)
    parser.add_argument('--fps', type=int, default=20)
    args = parser.parse_args()
    import cv2
    import numpy as np
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    args.output.mkdir(parents=True, exist_ok=True)
    model = Path('public/models/avatar-face/face_landmarker.task')
    manifest = json.loads(Path('public/models/avatar-face/manifest.json').read_text())
    checksum = hashlib.sha256(model.read_bytes()).hexdigest()
    assert checksum == manifest['sha256']
    for video in args.videos:
        cap = cv2.VideoCapture(str(video))
        if not cap.isOpened():
            raise ValueError('Cannot read local video: ' + str(video))
        native_fps = cap.get(cv2.CAP_PROP_FPS)
        count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        maximum = min(count, round(native_fps * args.seconds))
        frames = []
        options = vision.FaceLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(model), delegate=python.BaseOptions.Delegate.CPU),
            running_mode=vision.RunningMode.VIDEO, num_faces=1,
            output_face_blendshapes=True, output_facial_transformation_matrixes=True)
        with vision.FaceLandmarker.create_from_options(options) as detector:
            last_rgb = None
            def detect(rgb, time_ms, phase, source_index=None):
                start = time.perf_counter()
                result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)), time_ms)
                elapsed = (time.perf_counter() - start) * 1000
                cats = result.face_blendshapes[0] if result.face_blendshapes else []
                matrix = result.facial_transformation_matrixes[0] if result.facial_transformation_matrixes else None
                frames.append({'timeMs': time_ms, 'phase': phase, 'sourceIndex': source_index,
                    'categories': [{'categoryName': c.category_name, 'score': float(c.score)} for c in cats],
                    # Native Python gives an actual row/column ndarray. Convert
                    # explicitly to the column-major packed data used by the TS adapter.
                    'matrix': matrix.flatten(order='F').tolist() if matrix is not None else None,
                    'matrixRows': matrix.tolist() if matrix is not None else None,
                    'processingMs': elapsed})
            for index in range(maximum):
                ok, bgr = cap.read()
                if not ok:
                    break
                if index < round(len(frames) * native_fps / args.fps):
                    continue
                last_rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                detect(last_rgb, round(len(frames) * 1000 / args.fps), 'video', index)
            if last_rgb is None:
                raise ValueError('Empty video')
            # Exercise actual detector loss then recovery; these blank inputs are
            # intentionally constructed and labeled, not claimed as human occlusion.
            blank = np.full_like(last_rgb, 128)
            for _ in range(args.fps * 2):
                detect(blank, round(len(frames) * 1000 / args.fps), 'blank')
            for _ in range(args.fps):
                detect(last_rgb, round(len(frames) * 1000 / args.fps), 'recovery')
        cap.release()
        times = sorted(f['processingMs'] for f in frames)
        report = {'video': video.name, 'sourceSha256': hashlib.sha256(video.read_bytes()).hexdigest(),
            'sourceUrl': 'https://github.com/KlingAIResearch/LivePortrait/tree/9b294b3d0536135442ea73cb01e6cb3ca7029dd3/assets/examples/driving',
            'modelSha256': checksum, 'runtime': 'mediapipe Python CPU ' + mp.__version__,
            'python': platform.python_version(), 'numpy': np.__version__, 'opencv': cv2.__version__,
            'nativeVideoFps': native_fps, 'inputFps': args.fps, 'nativeVideoFrameCount': count,
            'matrixLayout': 'column-major from ndarray.flatten(order=F); matrixRows retained to audit conversion',
            'notBrowserWorker': True, 'userCameraUsed': False, 'networkDuringInference': False,
            'processing': {'averageMs': statistics.mean(times), 'p95Ms': times[min(len(times)-1, int(len(times)*.95))]},
            'frames': frames}
        target = args.output / (video.stem + '.json')
        target.write_text(json.dumps(report))
        print(json.dumps({'video': video.name, 'frames': len(frames), 'detected': sum(bool(f['categories']) for f in frames),
                          'blankDetected': sum(bool(f['categories']) for f in frames if f['phase']=='blank'),
                          'processing': report['processing']}), flush=True)


if __name__ == '__main__':
    main()
