#!/usr/bin/env python3
"""Build only; never install. Reuse pinned Makepad and cached Agora artifacts."""
import argparse,hashlib,json,os,pathlib,subprocess,zipfile
p=argparse.ArgumentParser();p.add_argument('--sdk',required=True);p.add_argument('--cargo-makepad',required=True);p.add_argument('--target-dir',required=True);args=p.parse_args()
crate=pathlib.Path(__file__).resolve().parents[1];app=crate.parents[1];cache=pathlib.Path.home()/'.gradle/caches/modules-2/files-2.1';resources=crate/'resources/android';sources=app/'android/app/src/main/java/cc/pitun/learn';metadata={'services':{},'dependencies':{}}
for name in ['NativeEventSink','NativeInkBridge','NativeInkOverlayView','NativeAudioBridge']:
    source=sources/(name+'.java');data=source.read_text().replace('package cc.pitun.learn;','package cc.pitun.learn.preview;',1);(resources/'java'/source.name).write_text(data);metadata['services'][name]=hashlib.sha256(source.read_bytes()).hexdigest()
libs=resources/'libs';libs.mkdir(parents=True,exist_ok=True);native=crate/'target/android-service-libs';native.mkdir(parents=True,exist_ok=True)
for group,name,version in [('io.agora.rtc','full-rtc-basic','4.5.2'),('io.agora.infra','aosl','1.2.13.1')]:
    matches=list((cache/group/name/version).glob('*/*.aar'))
    if len(matches)!=1:raise RuntimeError(f'Expected one cached {name} {version}, found {len(matches)}; no download attempted')
    aar=matches[0];metadata['dependencies'][name]={'version':version,'sha256':hashlib.sha256(aar.read_bytes()).hexdigest()}
    with zipfile.ZipFile(aar) as z:
        for member in z.namelist():
            if member.endswith('.jar'):(libs/(name+'-'+pathlib.Path(member).name)).write_bytes(z.read(member))
            if member.startswith('jni/arm64-v8a/') and member.endswith('.so'):(native/pathlib.Path(member).name).write_bytes(z.read(member))
env={**os.environ,'CARGO_NET_OFFLINE':'true','CARGO_TARGET_DIR':str(pathlib.Path(args.target_dir).resolve()),'MAKEPAD_ANDROID_EXTRA_LIBS':';'.join(f'{f.name}={f}' for f in sorted(native.glob('*.so')))}
# Keep mobile asset lookup independent of a macOS build's Resources setting.
env.pop('MAKEPAD_PACKAGE_DIR',None)
cmd=[str(pathlib.Path(args.cargo_makepad).resolve()),'android','--abi=aarch64','--min-sdk-version=26','--sdk-path='+str(pathlib.Path(args.sdk).resolve()),'--package-name=cc.pitun.learn.preview','--app-label=Octos OLL Preview','build','-p','octos-oll-preview','--release','--locked']
subprocess.run(cmd,cwd=crate,env=env,check=True)
(crate/'target/android-service-build.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Android package built. No installation performed.')
