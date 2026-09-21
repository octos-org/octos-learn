#!/usr/bin/env python3
"""Launch and inspect only the process created here; capture via Makepad Metal remote."""
import json, os, pathlib, re, shutil, subprocess, sys, time, urllib.request
app = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
log = (out / 'native.log').open('w')
proc = subprocess.Popen([str(app / 'Contents/MacOS/octos-oll-preview'), '--remote'], env={**os.environ,'MAKEPAD_HIDE_WINDOWS':'1'}, stdout=log, stderr=subprocess.STDOUT)
base = None
result = {}
def get(route):
    return json.load(urllib.request.urlopen(base + route, timeout=10))
def click(widget):
    found = [w for w in get('/snap?q='+widget)['s'] if w['i']==widget]
    assert len(found)==1, found
    x,y,w,h=found[0]['r']
    return get('/click?x=%s&y=%s&wait=1'%(x+w/2,y+h/2))
def status():
    widgets=get('/snap?q=status')['s']
    return widgets[0].get('t','') if widgets else ''
def capture(name):
    response=get('/g')
    shutil.copy2(response['png'],out/name)
    return response
def until(predicate,timeout):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        s=status()
        if predicate(s):return s
        time.sleep(.1)
    raise AssertionError('Timed out: '+status())
try:
    for _ in range(150):
        log.flush();content=(out/'native.log').read_text()
        match=re.search(r'listening on (127.0.0.1:\d+) pid=(\d+)',content)
        if match:
            assert int(match[2])==proc.pid
            base='http://'+match[1];break
        if proc.poll() is not None:raise RuntimeError(content)
        time.sleep(.1)
    assert base, 'Remote endpoint unavailable'
    (out/'remote-help.txt').write_bytes(urllib.request.urlopen(base+'/').read())
    until(lambda s:'动作 0/5' in s,10)
    click('formulas')
    result['formulas']=[]
    for page in range(8):
        result['formulas'].append({'status':status(),'capture':capture('formulas-%d.png'%(page+1))})
        if page<7:click('next_formulas')
    click('play')
    until(lambda s:'变量动画' in s,10)
    time.sleep(.8);click('play');frozen=status();time.sleep(1);assert status()==frozen
    result['animation_pause']=frozen
    result['course_capture']=capture('course-animation.png')
    click('play')
    until(lambda s:'动作 4/5' in s and '讲解中' in s,8)
    click('play');frozen=status();time.sleep(1);assert status()==frozen
    result['narration_pause']=frozen
    click('play');result['completed']=until(lambda s:'播放完成' in s,25)
    capture('completed.png')
    click('reset');assert '动作 0/5' in status() and 'θ = 0.000' in status()
    result['reset']=status()
    result['logs']=get('/log?n=50')
    (out/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
finally:
    if base and proc.poll() is None:
        try:get('/gq')
        except Exception:get('/quit')
    try:proc.wait(timeout=10)
    finally:log.close()
