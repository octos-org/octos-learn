import {
  buildApiHeaders,
  getToken,
  refreshSelectedProfileId,
} from "@/api/client";
import { API_BASE } from "@/lib/constants";

export interface BuildFileUrlOptions {
  sessionId?: string;
  /** Resolve a relative path inside the current session workspace. */
  workspaceScoped?: boolean;
}

export interface FetchAuthenticatedFileOptions extends BuildFileUrlOptions {
  /** Profile that owned the file when it was uploaded. */
  profileId?: string | null;
}

function shouldUseSessionScopedFileUrl(filePath: string, sessionId?: string): boolean {
  return Boolean(
    sessionId &&
      (filePath.startsWith("uploads/") || filePath.startsWith("ws/")),
  );
}

function shouldUseQueryFileUrl(
  filePath: string,
  options: BuildFileUrlOptions,
): boolean {
  const isAbsolute = /^(?:[A-Za-z]:[\\/]|\/)/.test(filePath);
  return Boolean(options.workspaceScoped && options.sessionId)
    || shouldUseSessionScopedFileUrl(filePath, options.sessionId)
    || isAbsolute;
}

function materializedUploadPath(filePath: string, sessionId?: string): string | null {
  if (!sessionId || !filePath.startsWith("up/")) return null;
  const filename = filePath.split("/").at(-1);
  if (!filename || filename === "." || filename === "..") return null;
  return `uploads/${filename}`;
}

export function buildFileUrl(
  filePath: string,
  options: BuildFileUrlOptions = {},
): string {
  if (shouldUseQueryFileUrl(filePath, options)) {
    const params = new URLSearchParams();
    params.set("path", filePath);
    if (options.sessionId) {
      params.set("session", options.sessionId);
    }
    return `${API_BASE}/api/files?${params.toString()}`;
  }
  return `${API_BASE}/api/files/${encodeURIComponent(filePath)}`;
}

export function buildAuthenticatedFileUrl(
  filePath: string,
  options: BuildFileUrlOptions = {},
): string {
  const token = getToken();
  const base = buildFileUrl(filePath, options);
  const separator = base.includes("?") ? "&" : "?";
  return token ? `${base}${separator}token=${encodeURIComponent(token)}` : base;
}

/** Read a protected file through fetch rather than an <img src>. Hosted
 * profiles require X-Profile-Id as well as the bearer token; an image element
 * cannot send that header and therefore receives 403/404 for valid files. */
export async function fetchAuthenticatedFileBlob(
  filePath: string,
  options: FetchAuthenticatedFileOptions = {},
  signal?: AbortSignal,
): Promise<Blob> {
  const { profileId, ...urlOptions } = options;
  const materializedPath = materializedUploadPath(filePath, options.sessionId);
  const candidatePaths = materializedPath ? [materializedPath, filePath] : [filePath];
  const fetchCandidates = async (ownerProfileId?: string | null) => {
    let lastResponse: Response | null = null;
    for (const candidatePath of candidatePaths) {
      const response = await fetch(buildFileUrl(candidatePath, urlOptions), {
        headers: buildApiHeaders({}, ownerProfileId),
        signal,
      });
      if (response.ok || response.status === 401) return response;
      lastResponse = response;
    }
    return lastResponse!;
  };
  let response = await fetchCandidates(profileId);
  // Records created before imageProfileId was persisted only know the opaque
  // file handle. If the browser's selected profile became stale, refresh the
  // authenticated home profile once and retry without weakening file auth.
  if (response.status === 404 && profileId === undefined) {
    const refreshedProfileId = await refreshSelectedProfileId();
    if (refreshedProfileId) {
      response = await fetchCandidates(refreshedProfileId);
    }
  }
  if (!response.ok) {
    throw new Error(`File request failed (${response.status})`);
  }
  return response.blob();
}
