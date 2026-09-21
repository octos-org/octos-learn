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
    def board():
        ws=[w for w in get('/snap?q=spatial')['s'] if w['i']=='spatial']
        assert len(ws)==1, ws
        return json.loads(ws[0]['t'])
    click('formulas');capture('formula-gallery-regression.png');click('formulas')
    click('play');until(lambda s:'变量动画' in s,12)
    time.sleep(.6);click('play')
    frozen=board();time.sleep(.7);assert board()==frozen
    capture('unit-circle-paused.png');result['unit_circle_pause']=frozen
    click('play');result['unit_circle_completed']=until(lambda s:'播放完成' in s,30)
    capture('unit-circle-completed.png')
    click('switch_course');assert '动作 0/25' in status()
    click('play');result['quadratic']=[]
    for action in [1,3,6,11,14,18,25]:
        until(lambda s:int(re.search(r'动作 (\d+)/25',s)[1])>=action,90)
        click('play');frozen=board();time.sleep(.5);assert board()==frozen
        capture('focus-%02d.png'%action)
        result['quadratic'].append({'status':status(),'board':frozen})
        if action==3:
            nodes={n['id'].rsplit(':',1)[-1]:n for n in frozen['nodes']}
            assert nodes['target-form']['x']>nodes['original']['x']+nodes['original']['width']
            click('overview');overview=board();assert overview['manual']
            click('zoom_in');zoom=board();assert zoom['camera']['scale']>overview['camera']['scale']
            time.sleep(.5);assert board()==zoom
            # Drag only inside the owned board; verify manual camera is retained.
            viewport=next(w['r'] for w in get('/snap?q=spatial')['s'] if w['i']=='spatial')
            x,y,w,h=viewport;x+=w/2;y+=h/2
            get('/m?k=down&x=%s&y=%s&wait=1'%(x,y))
            get('/m?k=move&x=%s&y=%s&wait=1'%(x+60,y+30))
            get('/m?k=up&x=%s&y=%s&wait=1'%(x+60,y+30))
            dragged=board();assert abs(dragged['camera']['x']-zoom['camera']['x']-60)<.1
            assert abs(dragged['camera']['y']-zoom['camera']['y']-30)<.1
            result['manual_navigation']={'overview':overview,'zoom':zoom,'dragged':dragged}
            before_scroll=dragged['camera']
            get('/m?k=scroll&x=%s&y=%s&dy=-120&wait=1'%(x,y))
            scrolled=board()['camera'];assert scrolled['scale']>before_scroll['scale']
            precise=board()['viewport'];local=(x-precise['x'],y-precise['y'])
            for key,at in zip(['x','y'],local):
                assert abs((at-before_scroll[key])/before_scroll['scale']-(at-scrolled[key])/scrolled['scale'])<.01
            result['wheel_zoom']=scrolled
            capture('manual-navigation.png')
            click('follow');assert not board()['manual']
            capture('teaching-focus.png')
            click('zoom_out');assert board()['manual']
        if action==6:
            assert not board()['manual'], 'new teaching target must resume following'
            click('play')
            x,y,w,h=next(w['r'] for w in get('/snap?q=spatial')['s'] if w['i']=='spatial')
            x+=w/2;y+=h/2
            get('/m?k=down&x=%s&y=%s&wait=1'%(x,y));held=board()['camera']
            until(lambda s:int(re.search(r'动作 (\d+)/25',s)[1])>=7,35)
            assert board()['manual'] and board()['camera']==held
            get('/m?k=up&x=%s&y=%s&wait=1'%(x,y));time.sleep(.8)
            assert not board()['manual']
            result['deferred_focus_after_drag']='passed'
            continue
        click('play')
    result['quadratic_completed']=until(lambda s:'播放完成' in s,30)
    capture('group-overview.png')
    final=board();assert final['groups']==3
    click('overview');capture('all-nodes.png')
    click('zoom_in');click('reset');assert '动作 0/25' in status()
    clean=board();assert not clean['nodes'] and clean['groups']==0 and not clean['manual']
    capture('reset.png');result['reset']=clean
    result['logs']=get('/log?n=50')
    (out/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'unit_circle':result['unit_circle_completed'],'quadratic':result['quadratic_completed'],'manual_navigation':'passed','reset':'passed'},ensure_ascii=False))
finally:
    if base and proc.poll() is None:
        try:get('/gq')
        except Exception:get('/quit')
    try:proc.wait(timeout=10)
    finally:log.close()
