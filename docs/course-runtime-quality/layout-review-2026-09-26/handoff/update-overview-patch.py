from pathlib import Path
import shutil,difflib,subprocess,json,hashlib
root=Path('/Users/alan0x/Documents/projects');app=root/'octos-learn';oll=root/'octos-lesson-language'
work=Path('/tmp/teaching-patch-work');base=work/'baseline';updated=work/'updated'
prior=Path('/tmp/overview-prior.patch');shutil.copyfile(app/'patches/octos-lesson-language@0.1.0-rc.1.patch',prior)
for module in ['core/src/index','core/src/opening','web-runtime/src/layout','web-runtime/src/teaching-layout','web-runtime/src/camera','web-runtime/src/board-view','web-runtime/src/runtime']:
 exts = ['.js','.d.ts','.js.map']
 for ext in exts:
  rel=Path('dist/packages')/(module+ext)
  (updated/rel).parent.mkdir(parents=True,exist_ok=True)
  shutil.copyfile(oll/rel,updated/rel)
parts=[]
paths=sorted(set(p.relative_to(base) for p in base.rglob('*') if p.is_file())|set(p.relative_to(updated) for p in updated.rglob('*') if p.is_file()))
for rel in paths:
 a=(base/rel).read_bytes() if (base/rel).exists() else b'';b=(updated/rel).read_bytes() if (updated/rel).exists() else b''
 if a==b:continue
 parts.append(f'diff --git a/{rel} b/{rel}\n')
 if not (base/rel).exists():parts.append('new file mode 100644\n')
 for line in difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile=f'a/{rel}' if (base/rel).exists() else '/dev/null',tofile=f'b/{rel}'):
  parts.append(line if line.endswith('\n') else line+'\n\\ No newline at end of file\n')
patch=Path('/tmp/overview-new.patch');patch.write_text(''.join(parts))
subprocess.run(['git','apply','--check',str(patch)],cwd=base,check=True)
coach=root/'learning-coach'
# Restore installed generator package to baseline before changing its patch.
subprocess.run(['git','apply','--reverse','--directory=node_modules/octos-lesson-language',str(prior)],cwd=coach,check=True)
for dest in [app/'patches/octos-lesson-language@0.1.0-rc.1.patch',root/'octos-course-library/patches/octos-lesson-language@0.1.0-rc.1.patch',coach/'patches/oll-runtime.patch']:shutil.copyfile(patch,dest)
p=coach/'oll-contract.json';d=json.loads(p.read_text());d['oll']['patch']['sha256']=hashlib.sha256(patch.read_bytes()).hexdigest();p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['node','scripts/apply-oll-runtime-patch.mjs'],cwd=coach,check=True)
print('Updated all three patch consumers')
