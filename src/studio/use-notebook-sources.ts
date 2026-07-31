import { useCallback, useEffect, useRef, useState } from "react";

import {
  listSkillActionJobs,
  skillActionScopeId,
  type SkillActionJob,
} from "@/api/skill-actions";

import {
  SOURCE_IMPORT_ACTION_ID,
  mergeSourceRows,
  sourceRowFromSkillActionJob,
  type SourceRow,
} from "./source-media";
import { loadSourceCatalog } from "./source-store";

interface SourceState {
  sessionId: string;
  selectedSources: string[];
  uploadedSources: SourceRow[];
  sourcesLoading: boolean;
}

function initialSourceState(sessionId: string): SourceState {
  return {
    sessionId,
    selectedSources: [],
    uploadedSources: [],
    sourcesLoading: true,
  };
}

function sameSourceRow(a: SourceRow, b: SourceRow): boolean {
  if (a.jobId && b.jobId && a.jobId === b.jobId) return true;
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  return a.path === b.path;
}

function selectedPathMatchesRow(path: string, row: SourceRow): boolean {
  return path === row.path || path === row.sourcePath;
}

/**
 * Owns the notebook source catalog, transient import jobs, and selection for
 * one session. Both /studio and the opt-in Workspace chat shell use this
 * controller so they cannot drift back to different source lifecycles.
 */
export function useNotebookSources(sessionId: string, topic?: string) {
  const scopeId = skillActionScopeId(sessionId, topic);
  const [state, setState] = useState<SourceState>(() =>
    initialSourceState(scopeId),
  );
  const sourceCatalogRequest = useRef(0);
  const terminalImportJobs = useRef<{
    scopeId: string;
    ids: Set<string>;
  }>({ scopeId, ids: new Set() });

  // WorkspaceLayout can switch sessions without remounting. Reset during
  // render so rows and selection from the previous session are never painted
  // under the new session id.
  if (state.sessionId !== scopeId) {
    setState(initialSourceState(scopeId));
  }
  if (terminalImportJobs.current.scopeId !== scopeId) {
    terminalImportJobs.current = { scopeId, ids: new Set() };
  }

  const selectedSources =
    state.sessionId === scopeId ? state.selectedSources : [];
  const uploadedSources =
    state.sessionId === scopeId ? state.uploadedSources : [];
  const sourcesLoading =
    state.sessionId === scopeId ? state.sourcesLoading : true;

  const mergeUploadedSourceRows = useCallback(
    (rows: SourceRow[]) => {
      setState((current) =>
        current.sessionId === scopeId
          ? {
              ...current,
              uploadedSources: mergeSourceRows(current.uploadedSources, rows),
            }
          : current,
      );
    },
    [scopeId],
  );

  const refreshSourceCatalog = useCallback(async () => {
    const request = ++sourceCatalogRequest.current;
    try {
      const catalog = await loadSourceCatalog(sessionId, topic);
      if (request !== sourceCatalogRequest.current) return;
      setState((current) =>
        current.sessionId === scopeId
          ? {
              ...current,
              uploadedSources: [
                ...catalog,
                ...current.uploadedSources.filter(
                  (row) => (row.status ?? "ready") !== "ready",
                ),
              ],
            }
          : current,
      );
    } finally {
      if (request === sourceCatalogRequest.current) {
        setState((current) =>
          current.sessionId === scopeId
            ? { ...current, sourcesLoading: false }
            : current,
        );
      }
    }
  }, [scopeId, sessionId, topic]);

  const renameUploadedSourceRow = useCallback(
    (row: SourceRow, title: string) => {
      setState((current) =>
        current.sessionId === scopeId
          ? {
              ...current,
              uploadedSources: current.uploadedSources.map((existing) =>
                sameSourceRow(existing, row)
                  ? { ...existing, filename: title, timestamp: Date.now() }
                  : existing,
              ),
            }
          : current,
      );
    },
    [scopeId],
  );

  const removeUploadedSourceRow = useCallback(
    (row: SourceRow) => {
      setState((current) =>
        current.sessionId === scopeId
          ? {
              ...current,
              uploadedSources: current.uploadedSources.filter(
                (existing) => !sameSourceRow(existing, row),
              ),
              selectedSources: current.selectedSources.filter(
                (path) => !selectedPathMatchesRow(path, row),
              ),
            }
          : current,
      );
    },
    [scopeId],
  );

  const mergeSourceImportJobs = useCallback(
    (jobs: SkillActionJob[]) => {
      if (terminalImportJobs.current.scopeId !== scopeId) return;
      const sourceJobsForScope = jobs.filter(
        (job) =>
          job.session_id === scopeId &&
          job.action_id === SOURCE_IMPORT_ACTION_ID,
      );
      const terminalIds = terminalImportJobs.current.ids;
      for (const job of sourceJobsForScope) {
        if (
          job.status === "succeeded" ||
          job.status === "failed" ||
          job.status === "abandoned"
        ) {
          terminalIds.add(job.job_id);
        }
      }
      // A persisted job/list response can arrive after the live terminal
      // event. Never resurrect queued/running rows once that job reached a
      // terminal state.
      const sourceJobs = sourceJobsForScope.filter(
        (job) =>
          !terminalIds.has(job.job_id) ||
          (job.status !== "queued" && job.status !== "running"),
      );
      if (sourceJobs.length === 0) return;

      const succeededIds = new Set(
        sourceJobs
          .filter((job) => job.status === "succeeded")
          .map((job) => job.job_id),
      );
      const transientRows = sourceJobs
        .filter((job) => job.status !== "succeeded")
        .map((job) => sourceRowFromSkillActionJob(job));
      setState((current) =>
        current.sessionId === scopeId
          ? {
              ...current,
              uploadedSources: mergeSourceRows(
                current.uploadedSources.filter(
                  (row) => !row.jobId || !succeededIds.has(row.jobId),
                ),
                transientRows,
              ),
            }
          : current,
      );
      if (succeededIds.size > 0) {
        void refreshSourceCatalog().catch(() => {});
      }
    },
    [refreshSourceCatalog, scopeId],
  );

  const restoreSourceImportJobs = useCallback(async () => {
    try {
      const jobs = await listSkillActionJobs(
        sessionId,
        {
          actionId: SOURCE_IMPORT_ACTION_ID,
        },
        topic,
      );
      mergeSourceImportJobs(jobs);
    } catch {
      // The bridge may not be connected yet; bridge_connected retries it.
    }
  }, [mergeSourceImportJobs, sessionId, topic]);

  useEffect(() => {
    const restoreSoon = () => {
      void Promise.resolve().then(restoreSourceImportJobs);
      void Promise.resolve().then(refreshSourceCatalog).catch(() => {});
    };
    restoreSoon();
    window.addEventListener("crew:bridge_connected", restoreSoon);
    return () => {
      window.removeEventListener("crew:bridge_connected", restoreSoon);
    };
  }, [refreshSourceCatalog, restoreSourceImportJobs]);

  useEffect(() => {
    const onJobUpdated = (event: Event) => {
      const job = (event as CustomEvent<SkillActionJob>).detail;
      if (job) mergeSourceImportJobs([job]);
    };
    window.addEventListener("crew:skill_action_job_updated", onJobUpdated);
    return () => {
      window.removeEventListener("crew:skill_action_job_updated", onJobUpdated);
    };
  }, [mergeSourceImportJobs]);

  const toggleSource = useCallback(
    (path: string) => {
      setState((current) =>
        current.sessionId === scopeId
          ? {
              ...current,
              selectedSources: current.selectedSources.includes(path)
                ? current.selectedSources.filter((entry) => entry !== path)
                : [...current.selectedSources, path],
            }
          : current,
      );
    },
    [scopeId],
  );

  const selectedSourceIds = selectedSources
    .map(
      (path) =>
        uploadedSources.find(
          (row) => row.sourceId && selectedPathMatchesRow(path, row),
        )?.sourceId,
    )
    .filter((sourceId): sourceId is string => Boolean(sourceId));

  const refreshSourceCatalogSafely = useCallback(() => {
    void refreshSourceCatalog().catch(() => {});
  }, [refreshSourceCatalog]);

  return {
    selectedSources,
    uploadedSources,
    sourcesLoading,
    selectedSourceIds,
    toggleSource,
    mergeUploadedSourceRows,
    renameUploadedSourceRow,
    removeUploadedSourceRow,
    refreshSourceCatalog: refreshSourceCatalogSafely,
  };
}
