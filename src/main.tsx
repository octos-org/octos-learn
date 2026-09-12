import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { initTheme } from "./hooks/use-theme";

// Apply the stored/system theme to <html> before React mounts so every
// route — including galleries that render no component calling useTheme —
// honors the saved preference and avoids a dark-to-light first-paint flash.
initTheme();

// The APK serves the same application from packaged assets. Mark that build
// explicitly so we can avoid GPU-heavy presentation effects on older Android
// System WebViews without weakening the desktop/web experience.
if (import.meta.env.MODE === "android") {
  document.documentElement.dataset.runtimePlatform = "android";
}

const rootElement = document.getElementById("root")!;
rootElement.setAttribute("data-octos-booted", "true");
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
