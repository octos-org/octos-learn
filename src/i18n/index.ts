import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
// Import attributes keep this module loadable by native Node ESM (Playwright
// helpers import product catalogs) as well as by Vite.
import en from "./messages/en.json" with { type: "json" };
import zh from "./messages/zh.json" with { type: "json" };

export type Locale = "zh-CN" | "en-US";
export const LOCALE_STORAGE_KEY = "octos-locale";
export const LOCALE_EVENT = "octos:locale-changed";

export function normalizeLocale(value: unknown): Locale {
  return typeof value === "string" && /^zh(?:-|$)/i.test(value) ? "zh-CN" : "en-US";
}

export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en-US") return saved;
  } catch { /* Browsers may disable persistent storage. */ }
  // Chinese until the learner chooses otherwise, whatever the browser or
  // device language (TV and WebView system languages are often English).
  return "zh-CN";
}

export const i18n = createInstance();
const canonicalMessages = new Map<string, string>();
for (const [source, translation] of [...Object.entries(en), ...Object.entries(zh)]) canonicalMessages.set(translation, source);
void i18n.use(initReactI18next).init({
  lng: initialLocale(),
  fallbackLng: "en-US",
  supportedLngs: ["zh-CN", "en-US"],
  resources: { "zh-CN": { translation: zh }, "en-US": { translation: en } },
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

let requestLocale: Locale | null = null;
export function getLocale(): Locale { return requestLocale ?? normalizeLocale(i18n.language); }

/** Formats model-facing request text in the language captured at submission,
 * even if the interface has switched since. `format` must be synchronous. */
export function withLocale<T>(locale: Locale, format: () => T): T {
  const previous = requestLocale;
  requestLocale = locale;
  try { return format(); } finally { requestLocale = previous; }
}

// Async status strings may outlive the language in which they were created.
// Keep only a small in-memory set of message recipes; learner content is never
// translated or used as a message key through interpolation.
const statusRecipes = new Map<string, { source: string; values: Record<string, unknown> }>();

/** Source text is a stable message key. Values are interpolated, never used as keys. */
export function tr(source: string, values: Record<string, unknown> = {}, locale = getLocale()): string {
  const key = Object.hasOwn(en, source) ? source : canonicalMessages.get(source) ?? source;
  const message = String(i18n.t(key, { ...values, lng: locale, defaultValue: source }));
  if (Object.keys(values).length && Object.hasOwn(en, key)) {
    if (statusRecipes.size >= 256) statusRecipes.delete(statusRecipes.keys().next().value!);
    statusRecipes.set(message, { source: key, values: { ...values } });
  }
  return message;
}

export function translateStatus(message: string | null | undefined): string {
  if (!message) return "";
  const recipe = statusRecipes.get(message);
  return recipe ? tr(recipe.source, recipe.values) : tr(message);
}

export function setLocale(locale: Locale, persist = true): void {
  if (persist) {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Keep the in-memory choice. */ }
  }
  if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = locale;
  if (locale === getLocale()) return;
  void i18n.changeLanguage(locale);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: locale }));
}

export function subscribeLocale(listener: () => void): () => void {
  i18n.on("languageChanged", listener);
  return () => { i18n.off("languageChanged", listener); };
}

export function initLocale(): void {
  setLocale(initialLocale(), false);
  window.addEventListener("storage", event => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) setLocale(initialLocale(), false);
  });
}

export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(value));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}

/** Static product catalogs keep their IDs and identity, with lazy translated
 * presentation fields. Plain getters remain compatible with structuredClone. */
export function localizedCatalog<T>(source: T): T {
  if (!source || typeof source !== "object") return source;
  if (!Array.isArray(source) && Object.getPrototypeOf(source) !== Object.prototype) return source;
  const result = (Array.isArray(source) ? [] : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (key === "formerNames") { result[key] = value; continue; }
    if (typeof value === "string" && (Object.hasOwn(en, value) || Object.hasOwn(zh, value))) {
      Object.defineProperty(result, key, { enumerable: true, configurable: true, get: () => tr(value) });
    } else result[key] = localizedCatalog(value);
  }
  return result as T;
}
