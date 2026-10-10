// Function-name buckets; a stack is counted once per bucket (inclusive time).
const BUCKETS = {
  "structuredClone (runtime/player snapshots)": ["structuredClone"],
  "JSON.stringify": ["stringify"],
  "IndexedDB write": ["IDBObjectStore", "put", "learning-document-store"],
  "BoardView.render": ["render"],
  "BoardView.syncNodes": ["syncNodes"],
  "computeBoardLayout": ["computeBoardLayout"],
  "positionNodes/syncGroups/renderConnections": ["positionNodes", "syncGroups", "renderConnections"],
  "updatePlotExplorer": ["updatePlotExplorer"],
  "updateScene3d": ["updateScene3d"],
  "measureVisualRegionBounds/measureBoardNodeBounds": ["measureVisualRegionBounds", "measureBoardNodeBounds", "getRegionBoundsMap", "getAttachmentBoundsMap"],
  "getBoundingClientRect/offset*/scrollHeight": ["getBoundingClientRect", "offsetHeight", "offsetWidth", "scrollHeight", "clientWidth", "clientHeight"],
  "persist / checkpoint": ["persist", "checkpoint"],
  "applyManualVariable": ["applyManualVariable"],
  "KaTeX": ["katex", "renderToString"],
  "React commit/render": ["performUnitOfWork", "commitRoot", "renderWithHooks", "flushPassiveEffects", "react-dom-client.production"],
  "ink runtime": ["ink", "Ink"],
};

export function analyse(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const keyOf = id => {
    const { functionName, url, lineNumber } = nodes.get(id).callFrame;
    const file = url ? url.split("/").slice(-1)[0].split("?")[0] : "";
    return `${functionName || "(anonymous)"} ${file}:${lineNumber + 1}`;
  };
  const self = new Map();
  const inclusive = new Map();
  const bucketTotals = Object.fromEntries(Object.keys(BUCKETS).map(name => [name, 0]));
  let total = 0;
  let idle = 0;
  profile.samples.forEach((id, index) => {
    const delta = (profile.timeDeltas[index] ?? 0) / 1000;
    const name = nodes.get(id).callFrame.functionName;
    if (name === "(idle)") { idle += delta; return; }
    total += delta;
    self.set(keyOf(id), (self.get(keyOf(id)) ?? 0) + delta);
    const seen = new Set();
    const bucketsSeen = new Set();
    for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
      const key = keyOf(cursor);
      if (!seen.has(key)) { seen.add(key); inclusive.set(key, (inclusive.get(key) ?? 0) + delta); }
      const fn = nodes.get(cursor).callFrame.functionName;
      const url = nodes.get(cursor).callFrame.url ?? "";
      for (const [bucket, needles] of Object.entries(BUCKETS)) {
        if (bucketsSeen.has(bucket)) continue;
        if (needles.some(needle => fn === needle || fn.includes(needle) && needle.length > 6 || url.includes(needle) && needle.length > 12)) {
          bucketsSeen.add(bucket);
          bucketTotals[bucket] += delta;
        }
      }
    }
  });
  const top = map => [...map].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }));
  return { activeMs: Math.round(total), idleMs: Math.round(idle), topSelf: top(self), topInclusive: top(inclusive),
    buckets: Object.fromEntries(Object.entries(bucketTotals).map(([k, v]) => [k, Math.round(v)])) };
}

// Mutually exclusive groups. The inclusive buckets above must not be added.
export function disjoint(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const totals = {};
  profile.samples.forEach((id, index) => {
    const leaf = nodes.get(id).callFrame;
    if (leaf.functionName === '(idle)') return;
    const stack = [];
    for (let cursor = id; cursor !== undefined; cursor = parents.get(cursor)) stack.push(nodes.get(cursor).callFrame);
    const match = (file, fn) => stack.some(frame => frame.url.includes(file) && (!fn || frame.functionName === fn));
    const group = leaf.functionName === '(program)' ? 'Browser native / unattributed'
      : leaf.functionName === '(garbage collector)' ? 'GC'
      : match('board-view.js', 'render') ? 'BoardView.render'
      : match('/runtime.js', 'applyManualVariable') ? 'Runtime variable update (including sync persist)'
      : match('learning-document-store.ts') ? 'Async storage / document store'
      : match('react-dom-client.production') ? 'React and host work (excluding BoardView / storage)'
      : 'Other JavaScript';
    totals[group] = (totals[group] ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000;
  });
  return Object.fromEntries(Object.entries(totals).map(([name, ms]) => [name, Math.round(ms)]));
}
