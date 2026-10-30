import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./messages/en.json";
import zh from "./messages/zh.json";

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
  return normalizeLocale(typeof navigator === "undefined" ? "en" : navigator.languages?.[0] ?? navigator.language);
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

export function getLocale(): Locale { return normalizeLocale(i18n.language); }

/** Source text is a stable message key. Values are interpolated, never used as keys. */
export function tr(source: string, values: Record<string, unknown> = {}, locale = getLocale()): string {
  const key = Object.hasOwn(en, source) ? source : canonicalMessages.get(source) ?? source;
  return String(i18n.t(key, { ...values, lng: locale, defaultValue: source }));
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
