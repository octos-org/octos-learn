#!/usr/bin/env python3
"""Read-only profiling plus authorized touch input in the independent test app."""
import argparse
import os
import json
import re
import statistics
import shlex
import subprocess
import threading
import time
from pathlib import Path

ADB = os.environ.get('OCTOS_TEST_ADB', 'adb')
DEVICE = os.environ.get('OCTOS_TEST_DEVICE', '192.168.1.63:5555')
PACKAGE = 'cc.pitun.learn.makepadtest'
BASE = Path(__file__).resolve().parent

def adb(*args, **kwargs):
    if args and args[0] == 'shell':
        args = ('shell', shlex.join(map(str, args[1:])))
    return subprocess.check_output([ADB, '-s', DEVICE, *map(str, args)], **kwargs)

def presents(raw):
    rows = []
    for line in raw.splitlines()[1:]:
        fields = line.split()
        if len(fields) == 3:
            t = int(fields[1])
            if 0 < t < 2**63 - 1:
                rows.append(t)
    return sorted(set(rows))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('name')
    parser.add_argument('--scale', type=int, required=True)
    parser.add_argument('--mode', choices=['scroll', 'probe'], required=True)
    parser.add_argument('--x', type=int, default=325)
    parser.add_argument('--bisect', default='')
    args = parser.parse_args()
    out = BASE / args.name
    out.mkdir(exist_ok=True)
    pid = adb('shell', 'pidof', PACKAGE, text=True).strip()
    layers = adb('shell', 'dumpsys', 'SurfaceFlinger', '--list', text=True).splitlines()
    layer = next(x for x in layers if 'SurfaceView[' + PACKAGE in x and '(BLAST)' in x)
    if args.mode == 'scroll':
        for y1,y2 in [(470,450),(450,470)]:
            adb('shell', 'input', 'touchscreen', 'swipe', args.x*args.scale, y1*args.scale, args.x*args.scale, y2*args.scale, 400)
        time.sleep(0.25)
    before = adb('shell', 'dumpsys', 'SurfaceFlinger', '--latency', layer, text=True)
    (out/'latency-before.txt').write_text(before)
    (out/'before.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    device_started = float(adb('shell', 'date', '+%s.%N', text=True).strip())
    started = time.monotonic()
    log = subprocess.Popen([ADB, '-s', DEVICE, 'logcat', '-v', 'epoch', '-T', '1', '--pid='+pid], stdout=subprocess.PIPE, text=True)
    samples = []
    def collect():
        with (out/'logcat.txt').open('w') as f:
            for line in log.stdout:
                f.write(line)
                f.flush()
                if '[perf]' in line:
                    samples.append({'elapsed':float(line.split()[0])-device_started, 'receivedElapsed':time.monotonic()-started, 'line':line.strip()})
    reader = threading.Thread(target=collect, daemon=True)
    reader.start()
    top_file = (out/'top.txt').open('w')
    top = subprocess.Popen([ADB, '-s', DEVICE, 'shell', 'top', '-H', '-b', '-d', '1', '-n', '20', '-p', pid], stdout=top_file)
    gestures = []
    if args.mode == 'scroll':
        for i in range(16):
            y1,y2 = (470,350) if i%2==0 else (350,470)
            action_start = time.monotonic()-started
            adb('shell', 'input', 'touchscreen', 'swipe', args.x*args.scale, y1*args.scale, args.x*args.scale, y2*args.scale, 1400)
            gestures.append({'start':action_start,'end':time.monotonic()-started,'logical':[args.x,y1,args.x,y2],'durationMs':1400})
    else:
        time.sleep(24)
    action_end = time.monotonic()-started
    after = adb('shell', 'dumpsys', 'SurfaceFlinger', '--latency', layer, text=True)
    (out/'latency-after.txt').write_text(after)
    time.sleep(1.2)
    log.terminate()
    log.wait(timeout=5)
    reader.join(timeout=2)
    top.wait(timeout=5)
    top_file.close()
    (out/'after.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    frames = presents(after)
    threshold = max(presents(before),default=0)
    frames = [t for t in frames if t>threshold]
    intervals = [(b-a)/1e6 for a,b in zip(frames,frames[1:])]
    stats = {'newFramesInRing':len(frames),'timestampRatePerSecond':1000/statistics.mean(intervals) if intervals else None,
             'meanMs':statistics.mean(intervals) if intervals else None,'medianMs':statistics.median(intervals) if intervals else None,
             'p95Ms':sorted(intervals)[int(.95*(len(intervals)-1))] if intervals else None}
    parsed = []
    for item in samples:
        line = item['line']
        m = re.search(r'\|\| frames (\d+) gap ([\d.]+)ms max ([\d.]+)ms \|(.*)',line)
        if not m or not (3 <= item['elapsed'] <= action_end-1):
            continue
        row = dict(item,frames=int(m[1]),gap=float(m[2]),gapMax=float(m[3]))
        row['channels'] = {k:float(v) for k,v in re.findall(r'(\w+) ([\d.]+)ms',m[4])}
        row['busy'] = int(re.search(r'busy (\d+)%',line)[1])
        parsed.append(row)
    n = sum(r['frames'] for r in parsed)
    channels = {k:sum(r['channels'].get(k,0)*r['frames'] for r in parsed)/n for k in ['event','draw','wait','gpu','gc']} if n else {}
    if not any('gpu' in r['channels'] for r in parsed):
        channels['gpu'] = None
    result = {'name':args.name,'pid':int(pid),'layer':layer,'mode':args.mode,'scale':args.scale,'bisect':args.bisect,
              'actionEndSeconds':action_end,'deviceStartEpoch':device_started,'gestures':gestures,'surface':stats,
              'steadyWindows':len(parsed),'steadyFrames':n,'weightedChannelsMs':channels,
              'weightedGapMs':sum(r['gap']*r['frames'] for r in parsed)/n if n else None,
              'meanBusyPercent':statistics.mean(r['busy'] for r in parsed) if parsed else None,
              'samples':samples,'steadySamples':parsed}
    (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['samples','steadySamples','gestures']},indent=2),flush=True)

if __name__=='__main__':
    main()
