import { useSyncExternalStore } from "react";
import { getLocale, subscribeLocale } from "./index";

/** Subscribe without changing component identity, sessions, or effect lifetimes. */
export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
