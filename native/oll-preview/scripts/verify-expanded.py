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
fixtures=json.loads(pathlib.Path(sys.argv[3]).read_text())
results=[]
def verify(get,text,click,until):
    until('status',lambda s:'动作 0/5' in s)
    click('switch_course');click('switch_course')
    for case in fixtures:
        key=case['course'];count=len(case['frames'])
        for i,checkpoint in enumerate(case['checkpoints']+[case['checkpoint']]):
            (data/(key+'.json')).write_text(json.dumps(checkpoint,ensure_ascii=False))
            click('restore_progress');until('progress_status',lambda s:'进度已恢复' in s)
            expected_actions=len(checkpoint['projection']['board']['applied_actions'])
            until('status',lambda s:f'动作 {expected_actions}/{count}' in s)
            assert '无法' not in text('status'),text('status')
            state=json.loads(text('spatial'))
            assert len(state['nodes'])==len(checkpoint['projection']['board']['nodes']), (text('status'),state,checkpoint['cursor'])
            assert state['connections']==len(checkpoint['projection']['board']['connections'])
            time.sleep(.1)
            if i==len(case['checkpoints']):click('overview')
            shutil.copy2(get('/g')['png'],out/(key+'-%02d.png'%i))
            results.append({'course':key,'status':text('status'),'nodes':len(state['nodes']),'connections':state['connections']})
        assert '播放完成' in text('status')
        click('switch_course')
    (out/'verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
run(1,verify)
print('Expanded courses and imported checkpoints rendered successfully')
