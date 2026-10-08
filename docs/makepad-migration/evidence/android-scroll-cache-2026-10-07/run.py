#!/usr/bin/env python3
import argparse, os,shlex,subprocess,time,json,shutil
from pathlib import Path
B=Path(__file__).resolve().parent
A=['/opt/homebrew/bin/adb','-s','192.168.1.63:5555']
P='cc.pitun.learn.makepadtest'
def adb(*x):
    if x[0]=='shell': x=('shell',shlex.join(map(str,x[1:])))
    return subprocess.check_output(A+list(map(str,x)))
p=argparse.ArgumentParser()
p.add_argument('name');p.add_argument('--page',choices=['home','collection'],required=True);p.add_argument('--bisect',default='');p.add_argument('--mode',choices=['scroll','probe'],default='scroll')
a=p.parse_args();d=B/a.name;d.mkdir(exist_ok=True)
adb('shell','am','force-stop',P)
args=['shell','am','start','-n',P+'/cc.pitun.learn.makepadtest.MakepadApp','--es','octos.OCTOS_PERF','1']
if a.bisect: args+=['--es','octos.OCTOS_BISECT',a.bisect]
launch=adb(*args).decode();(d/'launch.txt').write_text(launch)
time.sleep(2)
pid=adb('shell','pidof',P).decode().strip()
ready_started=time.monotonic()
while True:
    startup=adb('logcat','-d','-v','epoch','--pid='+pid).decode()
    if startup.count('[perf]')>=3: break
    if time.monotonic()-ready_started>90: raise RuntimeError('App not ready within 90 seconds')
    time.sleep(2)
(d/'launcher-before-entry.png').write_bytes(adb('exec-out','screencap','-p'))
if a.page=='collection': adb('shell','input','tap','500','1800')
time.sleep(4)
pid=adb('shell','pidof',P).decode().strip()
log=adb('logcat','-d','-v','epoch','--pid='+pid).decode()
(d/'startup.txt').write_text('\n'.join(x for x in log.splitlines() if '[android-ui]' in x or 'OctosNativeTest' in x)+'\n')
(d/'run-config.json').write_text(json.dumps({'name':a.name,'page':a.page,'bisect':a.bisect,'mode':a.mode,'pid':int(pid),'surfaceBuffer':[1920,1080],'systemSize':[3840,2160],'densityOverride':640,'entryTapPhysical':[500,1800] if a.page=='collection' else None,'scrollXLogical':325 if a.page=='collection' else 16,'preheatSeconds':4},indent=2)+'\n')
env=dict(os.environ,OCTOS_TEST_ADB=A[0],OCTOS_TEST_DEVICE=A[2])
subprocess.run(['python3',str(B/'sample.py'),a.name,'--scale','4','--x',str(325 if a.page=='collection' else 16),'--mode',a.mode,'--bisect',a.bisect],env=env,check=True)
log=adb('logcat','-d','-v','epoch','--pid='+pid).decode()
(d/'crash-check.txt').write_text('\n'.join(x for x in log.splitlines() if 'FATAL EXCEPTION' in x or 'panicked' in x or 'Fatal signal' in x)+'\n')
