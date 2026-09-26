"""Prepare an unmodified temporary copy only when a published directory lacks files."""
from pathlib import Path
import zipfile, shutil
project = Path('/Users/alan0x/Documents/projects/octos-learn')
root = Path('/tmp/octos-reviewed-course-publication/releases')
for course in root.iterdir():
    version = sorted(course.iterdir(), key=lambda d: list(map(int, d.name.split('.'))))[-1]
    if (version / 'manifest.json').exists():
        continue
    archive = project / 'public/course-packs/embedded' / course.name / version.name / 'archive.ocpack'
    target = Path('/tmp/octos-layout-research/extracted') / course.name / version.name
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        source.extractall(target / 'files')
    shutil.copy(target / 'files/manifest.json', target / 'manifest.json')
    shutil.copy(archive, target / 'archive.ocpack')
