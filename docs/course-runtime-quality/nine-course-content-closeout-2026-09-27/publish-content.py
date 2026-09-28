import json, subprocess, hashlib, shutil, os, datetime, sys, urllib.request
from pathlib import Path
stage=Path(__file__).resolve().parent
root=Path('/opt/octos-learn/course-packs')
tools=Path('/home/ubuntu/octos-publication-nine-20260927')
plan=json.loads((stage/'publication-plan.json').read_text())
expected=json.loads((stage/'expected-before.json').read_text())
def identities(c): return sorted((e['packId'],e['version'],e['archiveSha256']) for e in c['packs'])
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
current=json.loads((root/'catalog.json').read_text())
assert identities(current)==identities(expected),'Public catalog changed; stop'
assert len(current['packs'])==9
for e in plan:
 source=stage/'sources'/e['packId']
 source.mkdir(parents=True,exist_ok=True)
 release=root/'releases'/e['packId']/e['previousVersion']
 for f in e['files']:
  dest=source/f['path'];dest.parent.mkdir(parents=True,exist_ok=True)
  old=release/('manifest.json' if f['path']=='manifest.json' else 'files/'+f['path'])
  if old.exists() and digest(old)==f['sha256']:shutil.copy2(old,dest)
  elif not dest.exists() or digest(dest)!=f['sha256']:
   url=f"https://raw.githubusercontent.com/alan0x/octos-course-library/{e['commit']}/courses/{e['packId']}/{f['path']}"
   with urllib.request.urlopen(url,timeout=60) as response: dest.write_bytes(response.read())
  assert digest(dest)==f['sha256'],f"Source hash mismatch: {e['packId']}/{f['path']}"
 archive=stage/(e['packId']+'.ocpack')
 subprocess.run(['/usr/local/bin/node',str(tools/'builder.cjs'),'build',str(source),'--out',str(archive)],check=True,stdout=subprocess.DEVNULL)
 assert digest(archive)==e['sha256'],'Build hash mismatch'
 print('PREPARED',e['packId'],e['version'],e['sha256'],flush=True)
if len(sys.argv)<2 or sys.argv[1]!='publish':sys.exit(0)
backup=Path('/opt/octos-learn/backups')/('course-content-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700,parents=True)
for name in ['catalog.json','catalog.source.json','audit.ndjson']:
 if (root/name).exists():shutil.copy2(root/name,backup/name)
print('BACKUP',backup,flush=True)
shadow=stage/'publication-staging'
shadow.mkdir(exist_ok=True)
for name in ['catalog.json','catalog.source.json','audit.ndjson']:shutil.copy2(root/name,shadow/name)
def cli(*args):subprocess.run(['/usr/local/bin/node',str(tools/'publisher.cjs'),*args,'--root',str(shadow)],check=True,stdout=subprocess.DEVNULL)
try:
 for e in plan:cli('publish',str(stage/(e['packId']+'.ocpack')))
 for e in plan:cli('withdraw',e['packId'],e['previousVersion'])
 final=json.loads((shadow/'catalog.json').read_text());changed={e['packId'] for e in plan}
 wanted=sorted([(e['packId'],e['version'],e['archiveSha256']) for e in current['packs'] if e['packId'] not in changed]+[(e['packId'],e['version'],e['sha256']) for e in plan])
 assert identities(final)==wanted
 for e in plan:
  dest=root/'releases'/e['packId']/e['version']
  assert not dest.exists(),'Immutable release already exists'
  shutil.copytree(shadow/'releases'/e['packId']/e['version'],dest)
 for e in final['packs']:assert digest(root/'releases'/e['packId']/e['version']/'archive.ocpack')==e['archiveSha256']
 for name in ['catalog.source.json','audit.ndjson','catalog.json']:
  temp=root/(name+'.publish');shutil.copy2(shadow/name,temp);os.replace(temp,root/name)
 (stage/'publication-result.json').write_text(json.dumps({'backup':str(backup),'catalog':final},indent=2)+'\n')
 print('VERIFIED exactly nine courses with expected archive hashes',flush=True)
except Exception:
 for name in ['catalog.source.json','catalog.json']:
  temp=root/(name+'.rollback');shutil.copy2(backup/name,temp);os.replace(temp,root/name)
 with (root/'audit.ndjson').open('a') as f:f.write(json.dumps({'action':'operator_catalog_rollback','backup':str(backup)})+'\n')
 raise
