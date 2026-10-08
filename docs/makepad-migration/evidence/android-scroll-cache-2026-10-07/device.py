import subprocess,shlex,time,json
from pathlib import Path
B=Path(__file__).resolve().parent
A=['/opt/homebrew/bin/adb','-s','192.168.1.63:5555'];P='cc.pitun.learn.makepadtest'
def adb(*args):
 if args[0]=='shell':args=('shell',shlex.join(map(str,args[1:])))
 return subprocess.check_output(A+list(map(str,args)))
def record(kind,**data):
 p=B/'touch-actions.jsonl'
 with p.open('a') as f:f.write(json.dumps({'hostMonotonic':time.monotonic(),'kind':kind,**data})+'\n')
def start(perf=False,bisect=''):
 adb('shell','am','force-stop',P)
 args=['shell','am','start','-n',P+'/.MakepadApp']
 if perf:args+=['--es','octos.OCTOS_PERF','1']
 if bisect:args+=['--es','octos.OCTOS_BISECT',bisect]
 out=adb(*args).decode();record('start',perf=perf,bisect=bisect,result=out);time.sleep(5)
def tap(x,y,wait=1.5):
 adb('shell','input','tap',x,y);record('tap',physical=[x,y]);time.sleep(wait)
def swipe(x1,y1,x2,y2,ms,wait=1.5):
 adb('shell','input','touchscreen','swipe',x1,y1,x2,y2,ms);record('swipe',physical=[x1,y1,x2,y2],durationMs=ms);time.sleep(wait)
def shot(name):
 (B/name).write_bytes(adb('exec-out','screencap','-p'));record('screenshot',name=name)
