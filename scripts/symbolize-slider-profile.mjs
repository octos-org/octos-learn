// Apply the verified frame symbol table shipped beside the Android profiles.
// node scripts/symbolize-slider-profile.mjs <DIR>
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { analyse, disjoint } from './slider-profile-analysis.mjs';
const dir = process.argv[2];
if (!dir) throw Error('Provide the Android profile directory');
const table = JSON.parse(await readFile(join(dir, 'symbols.json'), 'utf8'));
for (const file of await readdir(dir)) {
  if (!file.endsWith('.cpuprofile') || file.endsWith('.symbolized.cpuprofile')) continue;
  const profile = JSON.parse(await readFile(join(dir, file), 'utf8'));
  for (const node of profile.nodes) {
    const frame = node.callFrame;
    const mapped = table.frames[`${frame.url}:${frame.lineNumber}:${frame.columnNumber}`];
    if (mapped) Object.assign(frame, mapped);
  }
  const resultPath = join(dir, file.replace('.cpuprofile', '.json'));
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  result.cpuSymbolized = analyse(profile);
  result.cpuDisjoint = disjoint(profile);
  result.symbolization = table.validation;
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(dir, file.replace('.cpuprofile', '.symbolized.cpuprofile')), JSON.stringify(profile));
  console.log(`${file}: ${result.cpuSymbolized.activeMs}ms active`);
}
