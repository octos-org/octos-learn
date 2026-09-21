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
def first(get,text,click,until):
    until('status',lambda s:'动作 0/5' in s);click('play');until('status',lambda s:'变量动画' in s);time.sleep(.4);click('play');click('save_progress');until('progress_status',lambda s:s=='进度已保存');time.sleep(.5)
    state['saved']=json.loads((data/'unit-circle-sine.json').read_text());state['status']=text('status');state['nodes']=json.loads(text('spatial'))['nodes'];assert state['saved']['animation'] is not None
    click('reset');assert '动作 0/5' in text('status');click('restore_progress');until('progress_status',lambda s:'进度已恢复' in s);assert text('status')==state['status'];assert json.loads(text('spatial'))['nodes']==state['nodes'];time.sleep(.5);assert text('status')==state['status']
    shutil.copy2(get('/g')['png'],out/'restored-animation.png')
run(1,first)
def second(get,text,click,until):
    until('status',lambda s:'动作 0/5' in s);click('restore_progress');until('progress_status',lambda s:'进度已恢复' in s);assert text('status')==state['status']
    click('switch_course');click('restore_progress');until('progress_status',lambda s:'尚无保存' in s);assert '动作 0/25' in text('status');click('switch_course');click('restore_progress');until('progress_status',lambda s:'进度已恢复' in s);click('play');until('status',lambda s:'播放完成' in s,35)
    shutil.copy2(get('/g')['png'],out/'resumed-complete.png')
run(2,second)
(out/'verification.json').write_text(json.dumps({'restart_restore':True,'paused_animation':True,'course_isolation':True,'resume_to_completion':True,'saved_cursor':state['saved']['cursor']},ensure_ascii=False,indent=2))
print('Persistence and restart checks passed')
