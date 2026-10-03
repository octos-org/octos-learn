interface Camera {
  panX: number;
  panY: number;
  scale: number;
}
interface PreviewBoard {
  subscribeCamera(listener: (camera: Camera) => void): () => void;
}
interface Preview {
  svg: SVGSVGElement;
  bitmap: HTMLImageElement;
  url: string;
  width: number;
  height: number;
  display: string;
  displayPriority: string;
}

const CACHE_PIXELS = 1920 * 1080 * 3;
const GRAPH_PIXELS = 1024 * 1024;
const IDLE_MS = 500;
const SETTLE_MS = 160;
const GRAPH_SELECTOR = "svg.plot-preview,svg.geometry-preview,svg.diagram-preview";
const PAINT_PROPERTIES = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
  "text-anchor", "dominant-baseline", "opacity", "visibility", "color",
  "stop-color", "stop-opacity", "paint-order", "vector-effect", "clip-path",
];

/** Cache static course graphics only while the Android board camera moves.
 * The original SVG stays mounted and is restored before ordinary interaction.
 * Unsupported SVGs and graphs whose cache is not ready keep their live renderer.
 */
export function configureAndroidCoursePreview(
  viewport: HTMLElement,
  board: PreviewBoard,
  canPrepare: () => boolean = () => !viewport.hasAttribute("data-ink-suspended"),
): { destroy(): void } {
  const hostWindow = viewport.ownerDocument.defaultView!;
  const world = viewport.querySelector<HTMLElement>("[data-oll-board-runtime-world]");
  const nodes = world?.querySelector<HTMLElement>(".node-layer");
  if (!world || !nodes || typeof hostWindow.ResizeObserver !== "function"
    || typeof hostWindow.Image.prototype.decode !== "function") return { destroy() {} };
  const previews = new Map<SVGSVGElement, Preview>();
  let generation = 0;
  let destroyed = false;
  let building = false;
  let active = false;
  let moving = false;
  let idleTimer: number | undefined;
  let settleTimer: number | undefined;
  let settleFrame: number | undefined;
  let previousCamera: Camera | undefined;
  let layerPrepared = false;
  let previousWillChange = "";
  let previousWillChangePriority = "";

  const prepareLayer = () => {
    if (layerPrepared) return;
    previousWillChange = world.style.getPropertyValue("will-change");
    previousWillChangePriority = world.style.getPropertyPriority("will-change");
    world.style.willChange = "transform";
    layerPrepared = true;
  };
  const releaseLayer = () => {
    if (!layerPrepared) return;
    world.style.setProperty("will-change", previousWillChange, previousWillChangePriority);
    layerPrepared = false;
  };
  const cancelSettle = () => {
    if (settleTimer !== undefined) hostWindow.clearTimeout(settleTimer);
    if (settleFrame !== undefined) hostWindow.cancelAnimationFrame(settleFrame);
    settleTimer = undefined;
    settleFrame = undefined;
  };
  const restore = () => {
    cancelSettle();
    moving = false;
    if (destroyed || !canPrepare() || !previews.size) releaseLayer();
    if (!active) return;
    active = false;
    delete viewport.dataset.androidCoursePreview;
    for (const { svg, bitmap, display, displayPriority } of previews.values()) {
      svg.style.setProperty("display", display, displayPriority);
      bitmap.remove();
    }
  };
  const clearCache = () => {
    generation++;
    restore();
    for (const preview of previews.values()) {
      preview.bitmap.removeAttribute("src");
      URL.revokeObjectURL(preview.url);
    }
    previews.clear();
    releaseLayer();
  };
  const scheduleBuild = () => {
    if (idleTimer !== undefined) hostWindow.clearTimeout(idleTimer);
    idleTimer = hostWindow.setTimeout(() => {
      idleTimer = undefined;
      // Do not add SVG serialization/decode work to lesson playback or startup.
      if (moving || !canPrepare()) {
        scheduleBuild();
        return;
      }
      void buildCache();
    }, IDLE_MS);
  };
  const buildCache = async () => {
    if (building || destroyed) return;
    building = true;
    const currentGeneration = generation;
    try {
      let pixels = [...previews.values()].reduce((sum, p) => sum + p.bitmap.naturalWidth * p.bitmap.naturalHeight, 0);
      for (const svg of nodes.querySelectorAll<SVGSVGElement>(GRAPH_SELECTOR)) {
        if (destroyed || generation !== currentGeneration || moving || !canPrepare()) return;
        if (previews.has(svg) || svg.querySelector("foreignObject,image")
          || [...svg.querySelectorAll("use")].some(element => {
            const href = element.getAttribute("href") ?? element.getAttribute("xlink:href");
            return href && !href.startsWith("#");
          })) continue;
        const style = hostWindow.getComputedStyle(svg);
        const width = Number.parseFloat(style.width) || svg.clientWidth;
        const height = Number.parseFloat(style.height) || svg.clientHeight;
        if (!width || !height) continue;
        const ratio = Math.min(2, hostWindow.devicePixelRatio || 1, Math.sqrt(GRAPH_PIXELS / (width * height)));
        const rasterWidth = Math.ceil(width * ratio);
        const rasterHeight = Math.ceil(height * ratio);
        if (pixels + rasterWidth * rasterHeight > CACHE_PIXELS) continue;
        const copy = svg.cloneNode(true) as SVGSVGElement;
        const sourceElements = [svg, ...svg.querySelectorAll<SVGElement>("*")];
        const copyElements = [copy, ...copy.querySelectorAll<SVGElement>("*")];
        for (let index = 0; index < sourceElements.length; index++) {
          if (destroyed || generation !== currentGeneration || moving || !canPrepare()) return;
          const element = sourceElements[index];
          const style = hostWindow.getComputedStyle(element);
          for (const property of PAINT_PROPERTIES) {
            // Computed clip/paint URLs point at this document. Keep local SVG
            // definitions local when the graphic is decoded from a blob URL.
            const value = style.getPropertyValue(property).replace(/url\(["']?[^)#]*#([^)'" ]+)["']?\)/g, "url(#$1)");
            copyElements[index].style.setProperty(property, value);
          }
          // Preparation must yield to input even before any preview is ready.
          if (index % 8 === 7) await new Promise<void>(resolve => hostWindow.setTimeout(resolve, 0));
        }
        copy.setAttribute("width", String(width));
        copy.setAttribute("height", String(height));
        copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
        const image = new Image();
        try {
          image.src = url;
          await image.decode();
          if (destroyed || generation !== currentGeneration || !svg.isConnected || moving || !canPrepare()) return;
          const canvas = viewport.ownerDocument.createElement("canvas");
          canvas.width = rasterWidth;
          canvas.height = rasterHeight;
          const context = canvas.getContext("2d");
          if (!context) continue;
          context.drawImage(image, 0, 0, rasterWidth, rasterHeight);
          // Canvas previews disappeared on the TV after promoting the world
          // layer. Use a decoded PNG in the ordinary image compositor instead
          // of retaining the canvas texture as the displayed preview.
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
          canvas.width = canvas.height = 0;
          if (!blob) continue;
          const bitmapUrl = URL.createObjectURL(blob);
          let retained = false;
          try {
            const bitmap = new Image();
            bitmap.src = bitmapUrl;
            await bitmap.decode();
            if (destroyed || generation !== currentGeneration || !svg.isConnected || moving || !canPrepare()) return;
            bitmap.className = svg.classList.value;
            bitmap.dataset.androidGraphPreview = "";
            bitmap.setAttribute("aria-hidden", "true");
            bitmap.draggable = false;
            bitmap.style.width = `${width}px`;
            bitmap.style.height = `${height}px`;
            bitmap.style.display = style.display;
            bitmap.style.margin = style.margin;
            bitmap.style.pointerEvents = "none";
            previews.set(svg, { svg, bitmap, url: bitmapUrl, width, height, display: svg.style.getPropertyValue("display"), displayPriority: svg.style.getPropertyPriority("display") });
            retained = true;
          } finally {
            if (!retained) URL.revokeObjectURL(bitmapUrl);
          }
          pixels += rasterWidth * rasterHeight;
        } catch {
          // Keep the original renderer on older WebViews or unsupported graphics.
        } finally {
          URL.revokeObjectURL(url);
        }
        // Yield between graphs so preparation cannot become one long main task.
        await new Promise<void>(resolve => hostWindow.setTimeout(resolve, 0));
      }
    } catch {
      // A serialization/style failure must leave the live course usable.
    } finally {
      building = false;
      // Prepare compositing while the paused course is idle, rather than at
      // the first touch. Retain it between drags; release on playback/cleanup.
      if (!destroyed && !moving && canPrepare() && previews.size) prepareLayer();
      if (!canPrepare()) releaseLayer();
      if (!destroyed && generation !== currentGeneration) scheduleBuild();
    }
  };
  const mutation = new MutationObserver(records => {
    if (!canPrepare()) restore();
    const changed = records.filter(record => {
      // Math/text cards remain live during a gesture. Their own render writes
      // cannot change a cached graph in a different card.
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      const insideSvg = Boolean(element?.closest("svg")?.matches(GRAPH_SELECTOR));
      if (record.type === "childList") {
        const affected = [...record.addedNodes, ...record.removedNodes].filter(node =>
          !(node instanceof Element && node.hasAttribute("data-android-graph-preview")));
        return affected.length > 0 && (insideSvg || affected.some(node =>
          node instanceof Element && (node.matches(GRAPH_SELECTOR) || node.querySelector(GRAPH_SELECTOR))));
      }
      if (!insideSvg && !element?.querySelector(GRAPH_SELECTOR)) return false;
      // Board renders also rewrite unchanged classes and geometry attributes.
      // Those writes must not discard a usable preview during navigation.
      if (record.type === "attributes" && record.target instanceof Element
        && record.oldValue === record.target.getAttribute(record.attributeName!)) return false;
      // Host layout measurement writes temporary auto heights and positions.
      // Those do not change pixels in a plot with the same SVG content box.
      // Keep invalidating on width/height changes or any paint-related style.
      if (!insideSvg && record.type === "attributes" && record.attributeName === "style"
        && element?.matches(".board-node.kind-plot")) {
        const graphs = [...previews.values()].filter(preview => element.contains(preview.svg));
        const before = viewport.ownerDocument.createElement("div");
        const after = viewport.ownerDocument.createElement("div");
        before.setAttribute("style", record.oldValue ?? "");
        after.setAttribute("style", element.getAttribute("style") ?? "");
        const beforeWidth = before.style.width;
        const afterWidth = after.style.width;
        for (const property of ["left", "top", "width", "height"]) {
          before.style.removeProperty(property);
          after.style.removeProperty(property);
        }
        if (graphs.length && before.style.cssText === after.style.cssText
          && graphs.every(preview => preview.svg.style.display === "none"
            ? beforeWidth === afterWidth
            : preview.svg.clientWidth === Math.round(preview.width)
              && preview.svg.clientHeight === Math.round(preview.height))) return false;
      }
      // OLL focus styling decorates the article border, not its SVG content.
      if (!insideSvg && record.type === "attributes" && record.attributeName === "class"
        && element?.matches(".board-node.kind-plot")) {
        const classes = (value: string | null) => (value ?? "").split(/\s+/)
          .filter(name => name && !["focused", "focus-arrive", "active"].includes(name)).sort().join(" ");
        if (classes(record.oldValue) === classes(element.getAttribute("class"))) return false;
      }
      // The preview's own SVG hide/restore must not invalidate its cache.
      if (record.type === "attributes" && record.attributeName === "style"
        && record.target instanceof SVGSVGElement && previews.has(record.target)) {
        const preview = previews.get(record.target)!;
        const before = viewport.ownerDocument.createElement("div");
        before.setAttribute("style", record.oldValue ?? "");
        before.style.setProperty("display", record.target.style.getPropertyValue("display"), record.target.style.getPropertyPriority("display"));
        if (before.style.cssText === record.target.style.cssText
          && (active || record.target.style.getPropertyValue("display") === preview.display)) return false;
      }
      return true;
    });
    if (changed.length) {
      generation++;
      for (const [svg, preview] of previews) {
        const affected = !svg.isConnected || changed.some(record => {
          if (svg.contains(record.target)) return true;
          if (record.type === "childList") return [...record.addedNodes, ...record.removedNodes].some(node => node.contains(svg));
          return record.target.contains(svg);
        });
        if (!affected) continue;
        svg.style.setProperty("display", preview.display, preview.displayPriority);
        preview.bitmap.remove();
        preview.bitmap.removeAttribute("src");
        URL.revokeObjectURL(preview.url);
        previews.delete(svg);
      }
      // An updating graph stays live; independent static graphs keep their
      // previews rather than causing an all-or-nothing cache rebuild.
      if (!previews.size || !canPrepare()) releaseLayer();
      if (active && !previews.size) restore();
      scheduleBuild();
    }
  });
  mutation.observe(nodes, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  const resize = new ResizeObserver(() => {
    clearCache();
    scheduleBuild();
  });
  resize.observe(viewport);
  const unsubscribe = board.subscribeCamera(camera => {
    const changed = previousCamera && (camera.panX !== previousCamera.panX || camera.panY !== previousCamera.panY || camera.scale !== previousCamera.scale);
    previousCamera = { ...camera };
    if (destroyed) return;
    if (!canPrepare()) {
      restore();
      return;
    }
    if (!changed) return;
    if (!viewport.classList.contains("manual-navigation")) {
      restore();
      releaseLayer();
      scheduleBuild();
      return;
    }
    moving = true;
    if (!active && previews.size) {
      prepareLayer();
      active = true;
      viewport.dataset.androidCoursePreview = "";
      for (const preview of previews.values()) {
        if (!preview.svg.isConnected) continue;
        // The image replaces the SVG's exact fractional content box in flow.
        // display:none avoids old WebViews rasterizing invisible SVG paths.
        preview.svg.before(preview.bitmap);
        preview.svg.style.setProperty("display", "none", "important");
      }
    }
    cancelSettle();
    settleTimer = hostWindow.setTimeout(() => {
      settleTimer = undefined;
      settleFrame = hostWindow.requestAnimationFrame(() => {
        settleFrame = undefined;
        restore();
        scheduleBuild();
      });
    }, SETTLE_MS);
  });
  scheduleBuild();
  return {
    destroy() {
      destroyed = true;
      unsubscribe();
      mutation.disconnect();
      resize.disconnect();
      if (idleTimer !== undefined) hostWindow.clearTimeout(idleTimer);
      clearCache();
    },
  };
}
