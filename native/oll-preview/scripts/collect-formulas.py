#!/usr/bin/env python3
"""Collect unmodified math fragment strings from the sibling OLL checkout."""
import json
from pathlib import Path
crate = Path(__file__).resolve().parents[1]
examples = crate.parents[2] / 'oll/examples'
samples = {}
for path in sorted(examples.glob('*/lesson.canonical.jsonl')):
    for line in path.read_text().splitlines():
        event = json.loads(line)
        for beat in event.get('step', {}).get('beats', []):
            for actions in beat['stage'].values():
                for action in actions:
                    node = action.get('node', {})
                    if node.get('kind') != 'math':
                        continue
                    latex = ''.join(f.get('latex', '') for f in node.get('content', {}).get('fragments', []))
                    if latex:
                        samples.setdefault(latex, {'source': f"OLL {path.parent.name} / {node['id']}", 'latex': latex})
result = list(samples.values())
for title, latex in [
    ('分式与根号', r'x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}'),
    ('积分', r'\int_0^\infty e^{-x^2} dx=\frac{\sqrt{\pi}}{2}'),
    ('矩阵', r'\begin{pmatrix}a&b\\c&d\end{pmatrix}'),
]:
    result.append({'source': '补充排版测试（非课程）：'+title, 'latex': latex})
assert samples, 'No source courses found; check sibling checkout layout'
(crate / 'courses/formulas.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
