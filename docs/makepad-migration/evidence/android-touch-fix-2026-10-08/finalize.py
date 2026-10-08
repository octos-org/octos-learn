import json,re,hashlib,urllib.request
from device import *
start()
shot('final-default-home.png')
pid=adb('shell','pidof',P).decode().strip()
log=adb('logcat','-d','--pid='+pid,'-v','epoch').decode(errors='replace')
(B/'final-logcat.txt').write_text(log)
(B/'final-startup.txt').write_text('\n'.join(l for l in log.splitlines() if any(k in l for k in ['Render scale','[android','[perf]','cached=','Surface','FATAL EXCEPTION','panicked','ScrollCache:']))+'\n')
def ident(p):
 d=adb('shell','dumpsys','package',p).decode();r={}
 for k in ['codePath','versionCode','versionName','firstInstallTime','lastUpdateTime']:
  m=re.search(r'^\s*'+k+r'=(.+)$',d,re.M);r[k]=m.group(1) if m else None
 return r
s=adb('shell','dumpsys','SurfaceFlinger').decode(errors='replace');(B/'surface-final-raw.txt').write_text(s)
ls=s.splitlines();ix=set()
for i,l in enumerate(ls):
 if 'makepadtest' in l:ix.update(range(max(0,i-2),min(len(ls),i+9)))
(B/'surface-final-extract.txt').write_text('\n'.join(ls[i].rstrip() for i in sorted(ix)).rstrip()+'\n')
path=adb('shell','pm','path',P).decode().strip().split('package:')[-1]
print(adb('pull',path,str(B/'installed-base.apk')).decode())
s={'size':adb('shell','wm','size').decode(),'density':adb('shell','wm','density').decode(),'web':ident('cc.pitun.learn'),'nativeTest':ident(P),'reverse':adb('reverse','--list').decode(),'release':adb('shell','getprop','ro.build.version.release').decode().strip(),'installedApkSha256':hashlib.sha256((B/'installed-base.apk').read_bytes()).hexdigest(),'finalPid':pid,'finalPerfLineCount':sum('[perf]' in l for l in log.splitlines()),'finalErrorLines':[l for l in log.splitlines() if any(k in l for k in ['FATAL EXCEPTION','Fatal signal','panicked','ScrollCache: content'])]}
with urllib.request.urlopen('http://127.0.0.1:50080/health',timeout=5) as r:s['backendHealth']=r.read().decode()
before=json.loads((B/'state-before.json').read_text());s['webIdentityUnchanged']=before['web']==s['web'];s['displaySettingsUnchanged']=all(before[k]==s[k] for k in ['size','density']);s['nativeFirstInstallTimeRetained']=before['nativeTest']['firstInstallTime']==s['nativeTest']['firstInstallTime']
assert s['installedApkSha256']==json.loads((B/'apk-build.json').read_text())['sha256']
assert s['webIdentityUnchanged'] and s['displaySettingsUnchanged'] and s['nativeFirstInstallTimeRetained']
(B/'state-after.json').write_text(json.dumps(s,indent=2,ensure_ascii=False)+'\n');print(json.dumps(s,indent=2,ensure_ascii=False))
