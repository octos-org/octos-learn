"""Build the licensed handwriting asset: python build-board-writing.py AUTHOR_TTF.
Requires fonttools==4.60.2. The source is LXGW WenKai v1.522 Regular.
"""
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1])
# OFL reserved names belong to the author; this modified subset uses new names.
names = {1: 'Octos Board Handwriting', 2: 'Regular', 3: 'OctosBoardHandwriting-Regular-1',
         4: 'Octos Board Handwriting Regular', 6: 'OctosBoardHandwriting-Regular',
         16: 'Octos Board Handwriting', 17: 'Regular'}
for record in font['name'].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
options = subset.Options()
options.flavor = 'woff'
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
points = set()
for start, end in [(0x20, 0x024f), (0x370, 0x3ff), (0x2000, 0x22ff), (0x3000, 0x303f), (0x4e00, 0x9fff), (0xff00, 0xffef)]:
    points.update(range(start, end + 1))
subsetter.populate(unicodes=points)
subsetter.subset(font)
font.flavor = 'woff'
output = Path(__file__).resolve().parents[2] / 'public/fonts/handwriting/board-writing.woff'
font.save(output)
print(f'{output.name}: {output.stat().st_size} bytes')
