import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SemanticBoardState } from 'octos-lesson-language';
import { mountInfiniteBoard, type MountedInfiniteBoard, type Scene3dViewState } from 'octos-lesson-language/web-runtime';

const mounts: MountedInfiniteBoard[] = [];
function setup() {
  const viewport = document.createElement('div');
  document.body.append(viewport);
  const mounted = mountInfiniteBoard(viewport);
  mounts.push(mounted);
  return mounted;
}
function board(): SemanticBoardState {
  return {
    board_id: 'slider-render-regression', revision: 1, variables: { n1: { value: 0 }, n2: { value: 0 } },
    nodes: {
      scene: { id: 'scene', kind: 'scene3d', content: {
        title: '曲面截面', axes: true, camera: { yaw: .72, pitch: .55, zoom: 1 },
        objects: [{ id: 'surface', kind: 'surface', expression: 'x^2-y^2',
          x_range: { min: -2, max: 2 }, y_range: { min: -2, max: 2 }, samples: 12 }],
        sections: [{ id: 'section', axis: 'y', value: 0, targets: ['surface'], display: 'plane_and_intersection' }],
      } },
      formula: { id: 'formula', kind: 'math', content: { latex: 'z=x^2-y^2' } },
    }, groups: {}, connections: {}, focus: [], applied_lessons: [], applied_steps: [], applied_actions: [],
  } as unknown as SemanticBoardState;
}
function section(state: SemanticBoardState, value: number) {
  const next = structuredClone(state);
  next.nodes.scene!.content!.sections[0].value = value;
  next.variables!.n1!.value = value;
  return next;
}
afterEach(() => {
  mounts.splice(0).forEach(m => m.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('live slider rendering', () => {
  it('updates the intersection while retaining the SVG, static surface and card placement', () => {
    const m = setup(), initial = board();
    m.view.render(initial);
    const svg = m.elements.nodes.querySelector('.scene3d-runtime svg')!;
    const cells = [...svg.querySelectorAll('.scene3d-surface-cell')];
    const beforePath = svg.querySelector('.scene3d-intersection')!.getAttribute('d');
    const card = m.elements.nodes.querySelector<HTMLElement>('[data-id="scene"]')!;
    const placement = [card.style.left, card.style.top, card.style.width, card.style.height];
    for (const value of [.2, .4, .6]) m.view.render(section(initial, value));
    expect(m.elements.nodes.querySelector('.scene3d-runtime svg')).toBe(svg);
    expect([...svg.querySelectorAll('.scene3d-surface-cell')]).toEqual(cells);
    expect(cells).toHaveLength(144);
    expect(svg.querySelector('.scene3d-intersection')!.getAttribute('d')).not.toBe(beforePath);
    expect([card.style.left, card.style.top, card.style.width, card.style.height]).toEqual(placement);
  });

  it('invalidates the surface when a referenced variable changes, and ignores unrelated variables', () => {
    const m = setup(), initial = board();
    initial.nodes.scene!.content!.objects[0].expression = 'n1*x^2-y^2';
    m.view.render(initial);
    const svg = m.elements.nodes.querySelector('.scene3d-runtime svg')!;
    const points = [...svg.querySelectorAll('polygon')].map(p => p.getAttribute('points'));
    m.view.render(section(initial, 1));
    expect([...svg.querySelectorAll('polygon')].map(p => p.getAttribute('points'))).not.toEqual(points);
    const cells = [...svg.querySelectorAll('.scene3d-surface-cell')];
    const unrelated = section(initial, 1);
    unrelated.variables!.n2!.value = 3;
    m.view.render(unrelated);
    expect([...svg.querySelectorAll('.scene3d-surface-cell')]).toEqual(cells);
  });

  it('updates 2D curves while retaining axes, SVG and curve visibility state', () => {
    const m = setup(), initial = board();
    initial.nodes.plot = { id: 'plot', kind: 'plot', content: {
      title: '参数曲线', axes: { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } },
      curves: [{ id: 'line', expression: 'n1*x', label: '直线' },
        { id: 'fixed', expression: 'x^2', label: '抛物线' }],
    } } as typeof initial.nodes[string];
    m.view.render(initial);
    const card = m.elements.nodes.querySelector<HTMLElement>('[data-id="plot"]')!;
    const svg = card.querySelector('svg')!;
    const axes = [...svg.querySelectorAll('.plot-axis,.plot-grid')];
    const path = svg.querySelector('.plot-curve')!.getAttribute('d');
    const hidden = card.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!;
    hidden.checked = false;
    hidden.dispatchEvent(new Event('change'));
    m.view.render(section(initial, 1));
    expect(card.querySelector('svg')).toBe(svg);
    expect([...svg.querySelectorAll('.plot-axis,.plot-grid')]).toEqual(axes);
    expect(svg.querySelectorAll('.plot-curve')).toHaveLength(1);
    expect(svg.querySelector('.plot-curve')!.getAttribute('d')).not.toBe(path);
    const clipId = svg.querySelector('clipPath')!.id;
    expect(svg.querySelector('.plot-curve')!.getAttribute('clip-path')).toBe(`url(#${clipId})`);
    expect(card.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.checked).toBe(false);
    const changed = section(initial, 2);
    changed.nodes.plot!.content!.axes.x.max = 6;
    m.view.render(changed);
    expect(card.querySelector('svg')).not.toBe(svg);
    expect(card.querySelectorAll('.plot-curve')).toHaveLength(2);
  });

  it('replaces the plot SVG when learner zoom, pan or restore changes its ranges', () => {
    const m = setup(), initial = board();
    initial.nodes.plot = { id: 'plot', kind: 'plot', content: {
      title: '参数曲线', axes: { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } },
      curves: [{ id: 'line', expression: 'n1*x', label: '直线' }],
    } } as typeof initial.nodes[string];
    m.view.render(initial);
    const body = m.elements.nodes.querySelector<HTMLElement>('[data-id="plot"] .plot-explorer-body')!;
    const press = (key: string) => body.querySelector('svg')!
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const original = body.querySelector('svg');
    press('+');
    press('ArrowLeft');
    expect(body.querySelectorAll('svg')).toHaveLength(1);
    expect(body.querySelector('svg')).not.toBe(original);
    m.elements.nodes.querySelector<HTMLButtonElement>('[data-id="plot"] [data-action=restore]')!.click();
    expect(body.querySelectorAll('svg')).toHaveLength(1);
  });

  it('keeps a second finger on a 3D scene out of board navigation', () => {
    const m = setup(), inputs: string[] = [];
    m.view.setScene3dInputHandler((_id, _view, event) => { inputs.push(event.phase); });
    m.view.render(board());
    const svg = m.elements.nodes.querySelector<SVGSVGElement>('.scene3d-runtime svg')!;
    svg.setPointerCapture = vi.fn();
    const bubbled = vi.fn();
    m.elements.nodes.addEventListener('pointerdown', bubbled);
    const down = (pointerId: number) => {
      const event = new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      svg.dispatchEvent(event);
      return event;
    };
    down(1);
    const second = down(2);
    expect(bubbled).not.toHaveBeenCalled();
    expect(second.defaultPrevented).toBe(true);
    expect(inputs).toEqual(['start']);
  });

  it('coalesces orbit events, ignores stale echoes and commits the exact last view', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.set(++sequence, cb); return sequence; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(0)); };
    const m = setup(), initial = board(), inputs: string[] = [], views: Scene3dViewState[] = [];
    m.view.setScene3dInputHandler((id, view, event) => {
      inputs.push(event.phase);
      views.push({ ...view });
      if (event.phase !== 'start') {
        m.view.setScene3dViews({ [id]: view });
        m.view.render(structuredClone(initial));
      }
      return 'orbit-1';
    });
    m.view.render(initial);
    const svg = m.elements.nodes.querySelector<SVGSVGElement>('.scene3d-runtime svg')!;
    const cells = [...svg.querySelectorAll('.scene3d-surface-cell')];
    const intersection = svg.querySelector('.scene3d-intersection');
    const before = cells[0]!.getAttribute('points');
    svg.setPointerCapture = vi.fn();
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 20 }));
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 25 }));
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 30 }));
    expect(inputs).toEqual(['start']);
    expect(cells[0]!.getAttribute('points')).toBe(before);
    m.view.setScene3dViews({ scene: { yaw: .72, pitch: .55, zoom: 1 } });
    m.view.render(structuredClone(initial));
    flush();
    expect(inputs).toEqual(['start', 'update']);
    expect(views.at(-1)!.yaw).toBeCloseTo(.72 + 20 * .012);
    expect(cells[0]!.getAttribute('points')).not.toBe(before);
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 40 }));
    svg.dispatchEvent(new MouseEvent('pointerup'));
    flush();
    expect(inputs).toEqual(['start', 'update', 'commit']);
    expect(views.at(-1)!.yaw).toBeCloseTo(.72 + 40 * .012);
    expect(views.at(-1)!.pitch).toBeCloseTo(.55 - 20 * .01);
    expect([...svg.querySelectorAll('.scene3d-surface-cell')]).toEqual(cells);
    expect(svg.querySelector('.scene3d-intersection')).toBe(intersection);
  });

  it('coalesces wheel zoom and flushes it before a preset, without a delayed second commit', () => {
    vi.useFakeTimers();
    try {
      const frames = new Map<number, FrameRequestCallback>();
      let sequence = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.set(++sequence, cb); return sequence; });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
      const m = setup(), inputs: Array<{phase: string; control: string; zoom: number}> = [];
      m.view.setScene3dInputHandler((_id, view, event) => {
        inputs.push({ phase: event.phase, control: event.control, zoom: view.zoom });
        return event.control;
      });
      m.view.render(board());
      const svg = m.elements.nodes.querySelector<SVGSVGElement>('.scene3d-runtime svg')!;
      for (const deltaY of [10, 20, 30]) svg.dispatchEvent(new WheelEvent('wheel', { deltaY }));
      expect(inputs.map(i => i.phase)).toEqual(['start']);
      const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(0));
      expect(inputs.map(i => i.phase)).toEqual(['start', 'update']);
      expect(inputs.at(-1)!.zoom).toBeCloseTo(Math.exp(-60 * .0015));
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }));
      const front = [...m.elements.nodes.querySelectorAll('button')].find(b => b.textContent === '正视')!;
      front.click();
      vi.advanceTimersByTime(200);
      [...frames.values()].forEach(cb => cb(0));
      expect(inputs.map(i => `${i.control}:${i.phase}`)).toEqual(['zoom:start', 'zoom:update', 'zoom:commit', 'preset:start', 'preset:commit']);
      expect(inputs[2]!.zoom).toBeCloseTo(Math.exp(-100 * .0015));
      expect(inputs.at(-1)!.zoom).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('cancels pending orbit and wheel work when a scene is removed', () => {
    vi.useFakeTimers();
    try {
      const frames = new Map<number, FrameRequestCallback>();
      let sequence = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.set(++sequence, cb); return sequence; });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
      const m = setup(), initial = board(), inputs: string[] = [];
      m.view.setScene3dInputHandler((_id, _view, event) => { inputs.push(event.phase); });
      m.view.render(initial);
      const svg = m.elements.nodes.querySelector<SVGSVGElement>('.scene3d-runtime svg')!;
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }));
      const removed = structuredClone(initial); delete removed.nodes.scene;
      m.view.render(removed);
      vi.advanceTimersByTime(200);
      [...frames.values()].forEach(cb => cb(0));
      expect(inputs).toEqual(['start']);
      m.view.render(initial);
      const replacement = m.elements.nodes.querySelector<SVGSVGElement>('.scene3d-runtime svg')!;
      replacement.setPointerCapture = vi.fn();
      replacement.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
      replacement.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 20 }));
      m.destroy(); mounts.splice(mounts.indexOf(m), 1);
      [...frames.values()].forEach(cb => cb(0));
      expect(inputs).toEqual(['start', 'start']);
    } finally { vi.useRealTimers(); }
  });

  it('avoids measuring unchanged math on repeated parameter updates and reflows actual size changes', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('kind-math') && this.textContent!.includes('LONG') ? 240 : 96;
    });
    const m = setup(), initial = board();
    m.view.render(initial);
    m.view.render(section(initial, .1)); // settle the current-width measurement key
    height.mockClear();
    m.view.render(section(initial, .2));
    m.view.render(section(initial, .3));
    expect(height).not.toHaveBeenCalled();
    const formula = m.elements.nodes.querySelector<HTMLElement>('[data-id="formula"]')!;
    const beforeHeight = formula.style.height;
    const changed = section(initial, .4);
    changed.nodes.formula!.content = { text: 'LONG '.repeat(30) };
    m.view.render(changed);
    expect(height).toHaveBeenCalled();
    expect(formula.style.height).not.toBe(beforeHeight);
    expect(formula.textContent).toContain('LONG');
  });
});
