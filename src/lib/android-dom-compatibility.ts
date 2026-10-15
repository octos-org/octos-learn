/** DOM methods are outside plugin-legacy's ECMAScript built-in detection. */
export function installAndroidDomCompatibility(): void {
  // WebView 74 has secure random bytes, but not the UUID API used by OLL's
  // committed SVG components and whiteboard persistence.
  if (typeof crypto.randomUUID !== "function") {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      writable: true,
      value() {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6]! & 0x0f) | 0x40;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      },
    });
  }
  for (const prototype of [Element.prototype, Document.prototype, DocumentFragment.prototype]) {
    if (typeof prototype.replaceChildren === "function") continue;
    Object.defineProperty(prototype, "replaceChildren", {
      configurable: true,
      writable: true,
      value(this: Element | Document | DocumentFragment, ...nodes: (Node | string)[]) {
        const document = this.ownerDocument ?? this as Document;
        const fragment = document.createDocumentFragment();
        // append() supplies the native Node/DOMString conversion and moves
        // existing children without copying them or losing their listeners.
        fragment.append(...nodes);
        while (this.firstChild) this.removeChild(this.firstChild);
        this.appendChild(fragment);
      },
    });
  }
}

function markFlexGapSupport(): void {
  // CSS.supports("gap", ...) also succeeds on engines supporting grid gaps
  // only. Measure a tiny flex column once before the application mounts.
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:-9999px;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;padding:0;border:0";
  for (let index = 0; index < 2; index += 1) {
    const child = document.createElement("div");
    child.style.cssText = "height:1px;min-height:1px;padding:0;margin:0;border:0";
    probe.appendChild(child);
  }
  document.body.appendChild(probe);
  document.documentElement.dataset.flexGap = probe.scrollHeight === 3 ? "supported" : "unsupported";
  probe.remove();
}

function trackFocusModality(): void {
  // :focus-visible is missing in WebView 74. Keep remote/keyboard navigation
  // discoverable without showing the vendor focus ring after touch input.
  const root = document.documentElement;
  root.dataset.focusModality = "pointer";
  document.addEventListener("pointerdown", () => {
    root.dataset.focusModality = "pointer";
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (["Tab", "Enter", " ", "Home", "End", "PageUp", "PageDown"].includes(event.key)
      || event.key.startsWith("Arrow")) {
      root.dataset.focusModality = "keyboard";
    }
  }, true);
}

if (import.meta.env.MODE === "android") {
  installAndroidDomCompatibility();
  markFlexGapSupport();
  trackFocusModality();
}
