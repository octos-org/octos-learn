import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { existsSync, readFileSync } from "node:fs";
import {
  addLegacySupportsForSrgbColorMixes,
  downlevelOklchColors,
} from "./build/android-legacy-css";

const localCertificate = path.resolve(__dirname, ".cert/octos-learn.pem");
const localCertificateKey = path.resolve(__dirname, ".cert/octos-learn-key.pem");

/**
 * OLL scopes its board internals with CSS `@scope`, which is only available in
 * recent Chromium/WebView releases. Android 8 devices frequently cannot update
 * that far and would discard the whole block — including every node/layer
 * position. The scoped source is intentionally flat, so prefixing its selectors
 * produces equivalent CSS for the packaged legacy build.
 */
function downlevelOllBoardScope(source: string): string {
  const scopeMarker = "@scope (.oll-board-runtime)";
  const scopeStart = source.indexOf(scopeMarker);
  if (scopeStart < 0) return source;
  const openingBrace = source.indexOf("{", scopeStart + scopeMarker.length);
  if (openingBrace < 0) return source;

  let depth = 1;
  let closingBrace = openingBrace + 1;
  for (; closingBrace < source.length && depth > 0; closingBrace += 1) {
    if (source[closingBrace] === "{") depth += 1;
    else if (source[closingBrace] === "}") depth -= 1;
  }
  if (depth !== 0) return source;

  const body = source.slice(openingBrace + 1, closingBrace - 1);
  const prefixed = body.replace(
    /([^{}]+)\{([^{}]*)\}/g,
    (_rule, selectorSource: string, declarations: string) => {
      const selector = selectorSource
        .split(",")
        .map((part) => {
          const trimmed = part.trim();
          return trimmed.startsWith(":scope")
            ? trimmed.replace(/:scope/g, ".oll-board-runtime")
            : `.oll-board-runtime ${trimmed}`;
        })
        .join(", ");
      const legacyDeclarations = declarations.replace(
        /(^|;)\s*inset\s*:\s*0\s*;/g,
        "$1 top: 0; right: 0; bottom: 0; left: 0;",
      );
      return `${selector} {${legacyDeclarations}}`;
    },
  );

  return source.slice(0, scopeStart) + prefixed + source.slice(closingBrace);
}

function androidLegacyColorPlugin(): Plugin {
  return {
    name: "android-legacy-css-colors",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type !== "asset"
          || !output.fileName.endsWith(".css")
        ) continue;
        const source = typeof output.source === "string"
          ? output.source
          : Buffer.from(output.source).toString("utf8");
        output.source = downlevelOklchColors(
          addLegacySupportsForSrgbColorMixes(source),
        );
      }
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Android-mode browser verification must retain MODE=android so all APK
  // compatibility/UI branches execute, while still using a secure origin for
  // microphone, selection capture, and Web Crypto. Only the dev server needs
  // the local certificate; `vite build --mode android` remains portable.
  const useLocalHttps = mode === "local-https"
    || (mode === "android" && command === "serve");
  const useAndroidLegacyBuild = mode === "android";
  // Local integration only: exercise an unmerged Runtime without changing the
  // production dependency pin or publishing intermediate commits.
  const localOll = mode === "development" || useLocalHttps
    ? env.OCTOS_LOCAL_OLL_PATH?.trim() : undefined;
  const octosApiTarget =
    env.OCTOS_API_TARGET?.trim() || "http://127.0.0.1:50080";
  if (
    useLocalHttps &&
    (!existsSync(localCertificate) || !existsSync(localCertificateKey))
  ) {
    throw new Error(
      "Local HTTPS certificate is missing. Run `pnpm setup:https` first.",
    );
  }

  return {
    optimizeDeps: {
      // OLL is pinned to an exact repository revision. Serve its ESM output
      // directly so a browser refresh cannot mix freshly HMR-ed host code with
      // an older node_modules/.vite snapshot of the Runtime.
      exclude: [
        "octos-lesson-language",
        "octos-lesson-language/player",
        "octos-lesson-language/web-runtime",
        "octos-lesson-language/ink-runtime",
      ],
      // OLL's validator uses AJV's CommonJS 2020 entrypoint. Keep that leaf
      // dependency optimized so the directly served OLL modules receive Vite's
      // ESM interop wrapper.
      include: [
        "octos-lesson-language > ajv/dist/2020.js",
        "octos-lesson-language > js-draw",
      ],
    },
    base: process.env.BASE_URL || "/",
    plugins: [
      ...(useAndroidLegacyBuild
        ? [{
            name: "android-downlevel-oll-board-css",
            enforce: "pre" as const,
            transform(code: string, id: string) {
              const cleanId = id.split("?", 1)[0].replaceAll("\\", "/");
              if (!cleanId.endsWith("/web-runtime/styles.css")) return null;
              return { code: downlevelOllBoardScope(code), map: null };
            },
          }]
        : []),
      react(),
      tailwindcss(),
      ...(useAndroidLegacyBuild ? [androidLegacyColorPlugin()] : []),
      ...(useAndroidLegacyBuild
        ? [legacy({
            // Android 8 devices often ship a Chromium 60/61-era WebView and
            // may not have a working system-WebView updater. Those engines
            // receive the SystemJS legacy bundle; newer WebViews keep the
            // faster native-ESM bundle.
            targets: ["Chrome >= 55"],
            modernTargets: ["Chrome >= 64"],
          })]
        : []),
    ],
    worker: { format: "es" },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        ...(localOll ? {
          "octos-lesson-language/ink-runtime/styles.css": path.resolve(localOll, "packages/ink-runtime/styles.css"),
          "octos-lesson-language/ink-runtime": path.resolve(localOll, "dist/packages/ink-runtime/src/index.js"),
        } : {}),
      },
    },
    server: {
      port: 5173,
      https: useLocalHttps
        ? {
            cert: readFileSync(localCertificate),
            key: readFileSync(localCertificateKey),
          }
        : undefined,
      proxy: {
        "/api": {
          target: octosApiTarget,
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            proxy.on("proxyReqWs", (proxyReq) => {
              proxyReq.removeHeader("origin");
            });
          },
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      ...(useAndroidLegacyBuild
        ? {
            target: "chrome64",
            cssTarget: "chrome61",
          }
        : {}),
    },
  };
});
