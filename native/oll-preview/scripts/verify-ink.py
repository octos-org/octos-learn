#!/usr/bin/env python3
"""Persistence regression using owned native Metal instances and isolated storage."""
import json,os,pathlib,re,shutil,subprocess,sys,time,urllib.request
app=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
data=out/'data';data.mkdir(exist_ok=True)
def run(number,task):
    log=(out/f'native-{number}.log').open('w');proc=subprocess.Popen([str(app/'Contents/MacOS/octos-oll-preview'),'--remote'],env={**os.environ,'MAKEPAD_HIDE_WINDOWS':'1','OLL_PREVIEW_DATA_DIR':str(data)},stdout=log,stderr=subprocess.STDOUT);base=None
    def get(path):return json.load(urllib.request.urlopen(base+path,timeout=10))
    def text(widget):return next((w.get('t','') for w in get('/snap?q='+widget)['s'] if w['i']==widget),'')
    def click(widget):
        x,y,w,h=next(w['r'] for w in get('/snap?q='+widget)['s'] if w['i']==widget);get(f'/click?x={x+w/2}&y={y+h/2}&wait=1')
    def until(widget,predicate,timeout=20):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            value=text(widget)
            if predicate(value):return value
            time.sleep(.1)
        raise AssertionError(text(widget))
    try:
        for _ in range(150):
            log.flush();content=(out/f'native-{number}.log').read_text();m=re.search(r'listening on (127.0.0.1:\d+) pid=(\d+)',content)
            if m:assert int(m[2])==proc.pid;base='http://'+m[1];break
            if proc.poll() is not None:raise RuntimeError(content)
            time.sleep(.1)
        assert base
        (out/f'help-{number}.txt').write_bytes(urllib.request.urlopen(base+'/').read())
        task(get,text,click,until)
    finally:
        if base:
            try:get('/gq')
            except Exception:pass
        proc.wait(timeout=15);log.close()
state={}
def ink_test(get,text,click,until):
    until('status',lambda s:'动作 0/5' in s)
    click('ink_mode')
    board=lambda:json.loads(text('spatial'))
    assert board()['drawing']
    v=board()['viewport'];x=v['x']+200;y=v['y']+150
    get(f'/m?k=down&x={x}&y={y}&wait=1')
    for dx,dy in [(20,20),(50,0),(80,40)]:get(f'/m?k=move&x={x+dx}&y={y+dy}&wait=1');time.sleep(.03)
    get(f'/m?k=up&x={x+100}&y={y+50}&wait=1')
    assert len(board()['ink']['strokes'])==1
    stroke=board()['ink']['strokes'][0]
    assert len(stroke['points'])>=3
    click('ink_undo');assert len(board()['ink']['strokes'])==0
    click('ink_redo');assert board()['ink']['strokes'][0]==stroke
    click('ink_mode');assert not board()['drawing'];click('zoom_in');assert board()['ink']['strokes'][0]==stroke
    shutil.copy2(get('/g')['png'],out/'ink-and-controls.png')
    click('reset');assert board()['ink']['strokes']==[]
    (out/'verification.json').write_text(json.dumps({'draw':True,'undo_redo':True,'world_coordinates_stable_on_zoom':True,'reset':True},indent=2))
run(1,ink_test)
print('Native handwriting controls passed')
