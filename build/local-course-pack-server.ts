import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const PREFIX = "/api/learn/course-packs";
const ID = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
const VERSION = "[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?";
const RELEASE = new RegExp(`^${PREFIX}/(${ID})/(${VERSION})/(archive\\.ocpack|manifest\\.json|files/(.+))$`, "u");

// Expose only the same public paths as production Nginx, never publisher state.
export function localCoursePackFile(root: string, url: string): string | null {
  const pathname = url.split("?", 1)[0]!;
  let relative: string;
  if (pathname === PREFIX || pathname === `${PREFIX}/`) {
    relative = "catalog.json";
  } else {
    const match = RELEASE.exec(pathname);
    if (!match) return null;
    let suffix: string;
    try { suffix = decodeURIComponent(match[3]!); } catch { return null; }
    if (suffix.includes("\\") || suffix.split("/").some((part) => !part || part === "." || part === "..")
      || Array.from(suffix).some((character) => character.charCodeAt(0) < 32)) return null;
    relative = path.join("releases", match[1]!, match[2]!, suffix);
  }
  const canonicalRoot = realpathSync(root);
  const candidate = path.resolve(canonicalRoot, relative);
  if (!existsSync(candidate)) return null;
  const canonicalFile = realpathSync(candidate);
  if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)
    || !statSync(canonicalFile).isFile()) return null;
  return canonicalFile;
}

export function localCoursePackServer(root: string): Plugin {
  if (!existsSync(path.join(root, "catalog.json"))) {
    throw new Error("OCTOS_LOCAL_COURSE_PACK_ROOT must contain a published catalog.json");
  }
  return {
    name: "local-reviewed-course-packs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.split("?", 1)[0]?.startsWith(PREFIX)) return next();
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET, HEAD");
          return response.end();
        }
        const file = localCoursePackFile(root, request.url);
        if (!file) { response.statusCode = 404; return response.end(); }
        const mime: Record<string, string> = {
          ".json": "application/json", ".svg": "image/svg+xml",
          ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
          ".mp3": "audio/mpeg", ".jsonl": "application/x-ndjson",
        };
        response.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
        response.setHeader("Content-Length", statSync(file).size);
        response.setHeader("Cache-Control", "no-store");
        if (request.method === "HEAD") return response.end();
        const stream = createReadStream(file);
        stream.on("error", () => response.destroy());
        stream.pipe(response);
      });
    },
  };
}
