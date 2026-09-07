import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { existsSync, readFileSync } from "node:fs";

const localCertificate = path.resolve(__dirname, ".cert/octos-learn.pem");
const localCertificateKey = path.resolve(__dirname, ".cert/octos-learn-key.pem");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useLocalHttps = mode === "local-https";
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
    plugins: [react(), tailwindcss()],
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
    },
  };
});
