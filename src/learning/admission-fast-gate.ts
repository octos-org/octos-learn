import {
  evaluateSystemOne,
  type ChoiceAnswer,
  type NoulAnswer,
  DEFAULT_TYPESAFE_TIMEOUT_MS,
} from "@/api/typesafe-client";
import {
  requestSystemOneGrant,
  getCachedSystemOneGrant,
} from "@/api/systemone-grant";

export interface AdmissionFastGateInput {
  text: string;
  modality: "voice" | "text";
  hasSelection?: boolean;
  hasCameraFrame?: boolean;
}

export type AdmissionDisposition = "generate_lesson" | "clarify" | "ignore";
export type AdmissionSubjectDomain =
  | "math"
  | "physics"
  | "general_science"
  | "language_humanities"
  | "other";

export interface AdmissionFastGateResult {
  disposition: AdmissionDisposition;
  confidence: number;
  subject?: AdmissionSubjectDomain;
  isSelfContained: boolean;
  clarificationPrompt?: string;
  reason?: string;
  source: "jev_direct" | "fallback_local" | "passthrough";
  elapsedMs: number;
  latencyMs: number;
}

export interface AdmissionFastGateOptions {
  apiKey?: string;
  timeoutMs?: number;
  confidenceThreshold?: number;
  fetchFn?: typeof fetch;
}

export const DEFAULT_ADMISSION_CONFIDENCE_THRESHOLD = 0.6;

async function resolveApiKey(explicitKey?: string): Promise<string | null> {
  if (explicitKey?.trim()) return explicitKey.trim();

  // Tier 1: Vite client-side environment variable (for standalone / local debugging)
  const envKey = (import.meta.env?.VITE_TYPESAFE_API_KEY as string | undefined)?.trim();
  if (envKey) return envKey;

  // Tier 2: Fetch Grant from backend (cached in memory)
  const grant = await requestSystemOneGrant();
  if (grant?.apiKey?.trim()) return grant.apiKey.trim();

  return null;
}

export interface AdmissionEventRecord {
  id: string;
  timestampEpochMs: number;
  input: AdmissionFastGateInput;
  result: AdmissionFastGateResult;
}

const admissionEventListeners = new Set<() => void>();
let admissionEventHistory: AdmissionEventRecord[] = [];

export function recordAdmissionEvent(
  input: AdmissionFastGateInput,
  result: AdmissionFastGateResult,
): void {
  const record: AdmissionEventRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampEpochMs: Date.now(),
    input,
    result,
  };
  admissionEventHistory = [record, ...admissionEventHistory].slice(0, 50);
  admissionEventListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error("admission listener error", e);
    }
  });
}

export function subscribeAdmissionEvents(listener: () => void): () => void {
  admissionEventListeners.add(listener);
  return () => {
    admissionEventListeners.delete(listener);
  };
}

export function getAdmissionEventHistory(): AdmissionEventRecord[] {
  return admissionEventHistory;
}

export function clearAdmissionEventHistory(): void {
  admissionEventHistory = [];
  admissionEventListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // listener error ignored
    }
  });
}

export async function getSystemOneStatus({
  fetchIfMissing = false,
}: {
  fetchIfMissing?: boolean;
} = {}): Promise<{
  available: boolean;
  hasKey: boolean;
  keyPreview?: string;
  source: "grant" | "env" | "none";
}> {
  const envKey = (import.meta.env?.VITE_TYPESAFE_API_KEY as string | undefined)?.trim();
  if (envKey) {
    return {
      available: true,
      hasKey: true,
      keyPreview: envKey.slice(0, 10) + "...",
      source: "env",
    };
  }
  const cachedGrant = getCachedSystemOneGrant();
  if (cachedGrant?.apiKey?.trim()) {
    return {
      available: true,
      hasKey: true,
      keyPreview: cachedGrant.apiKey.trim().slice(0, 10) + "...",
      source: "grant",
    };
  }
  if (fetchIfMissing) {
    const grant = await requestSystemOneGrant();
    if (grant?.apiKey?.trim()) {
      return {
        available: true,
        hasKey: true,
        keyPreview: grant.apiKey.trim().slice(0, 10) + "...",
        source: "grant",
      };
    }
  }
  return {
    available: false,
    hasKey: false,
    source: "none",
  };
}

function finish(input: AdmissionFastGateInput, result: AdmissionFastGateResult): AdmissionFastGateResult {
  recordAdmissionEvent(input, result);
  return result;
}

export async function evaluateAdmissionFastGate(
  input: AdmissionFastGateInput,
  options: AdmissionFastGateOptions = {},
): Promise<AdmissionFastGateResult> {
  const startedAt = Date.now();
  const trimmed = input.text?.trim() ?? "";

  // 1. Local fast check for empty strings
  if (!trimmed) {
    const elapsedMs = Date.now() - startedAt;
    return finish(input, {
      disposition: "ignore",
      confidence: 1.0,
      isSelfContained: false,
      reason: "Empty input",
      source: "fallback_local",
      elapsedMs,
      latencyMs: elapsedMs,
    });
  }

  // 2. Resolve credentials (Grant / Env)
  const apiKey = await resolveApiKey(options.apiKey);
  if (!apiKey) {
    const elapsedMs = Date.now() - startedAt;
    return finish(input, {
      disposition: "generate_lesson",
      confidence: 1.0,
      isSelfContained: true,
      reason: "No credentials configured; passthrough to full pipeline",
      source: "passthrough",
      elapsedMs,
      latencyMs: elapsedMs,
    });
  }

  // 3. Assemble System One questions
  const timeoutMs = options.timeoutMs ?? DEFAULT_TYPESAFE_TIMEOUT_MS;
  const confidenceThreshold = options.confidenceThreshold ?? DEFAULT_ADMISSION_CONFIDENCE_THRESHOLD;

  try {
    const response = await evaluateSystemOne(
      apiKey,
      {
        state: {
          learner_request: trimmed,
          input_modality: input.modality,
          has_camera_frame: Boolean(input.hasCameraFrame),
          has_selection: Boolean(input.hasSelection),
        },
        questions: {
          disposition: {
            type: "choice",
            instructions: "判断用户当前的输入是否构成一个清晰、可实质性展开教学的学习主题或提问",
            criteria: {
              generate_lesson: "提出了具体的学习问题、概念解释或明确的学习主题（包括简短但清晰的主题，如'勾股定理'、'为什么负负得正'）",
              clarify: "是真实的口语，但内容残缺不全、指代不明或缺少主干，需要向用户追问（如'这本书'、'刚才那个'）",
              ignore: "仅为语气词、口头填充、停顿、唤醒词或无实际教学意图的噪音（如'呃'、'啊对'、'嗯'、'好'）",
            },
          },
          subject: {
            type: "choice",
            instructions: "如果该内容涉及学习主题，判断其最可能所属的主学科领域",
            criteria: {
              math: "数学（代数、几何、函数、微积分、概率等）",
              physics: "物理与工程技术",
              general_science: "化学、生物及常规自然科学",
              language_humanities: "语言、文学、历史与人文社科",
              other: "日常常识或其他非典型学科",
            },
          },
          is_self_contained: {
            type: "noul",
            instructions: "该输入是否无需额外依赖上下文即可独立理解并直接展开一堂课？",
          },
        },
      },
      {
        timeoutMs,
        fetchFn: options.fetchFn,
      },
    );

    const dispAnswer = response.answers.disposition as ChoiceAnswer | undefined;
    const subjectAnswer = response.answers.subject as ChoiceAnswer | undefined;
    const selfContainedAnswer = response.answers.is_self_contained as NoulAnswer | undefined;

    const rawChoice = dispAnswer?.choice;
    const confidence = dispAnswer?.confidence ?? 0;
    const isSelfContained = (selfContainedAnswer?.noul ?? 0) >= 0.5;

    // Confidence Floor: If the model is not confident, do not aggressively ignore or clarify.
    // Fall back to generate_lesson / passthrough to let the downstream system handle it.
    if (confidence < confidenceThreshold) {
      const elapsedMs = Date.now() - startedAt;
      return finish(input, {
        disposition: "generate_lesson",
        confidence,
        subject: subjectAnswer?.choice as AdmissionSubjectDomain | undefined,
        isSelfContained,
        reason: "Low confidence; passthrough to full pipeline",
        source: "passthrough",
        elapsedMs,
        latencyMs: elapsedMs,
      });
    }

    let disposition: AdmissionDisposition = "generate_lesson";
    if (rawChoice === "ignore") disposition = "ignore";
    else if (rawChoice === "clarify") disposition = "clarify";

    let clarificationPrompt: string | undefined;
    if (disposition === "clarify") {
      clarificationPrompt = `你想了解关于“${trimmed}”的哪部分内容呢？请具体告诉我。`;
    }

    const elapsedMs = Date.now() - startedAt;
    return finish(input, {
      disposition,
      confidence,
      subject: subjectAnswer?.choice as AdmissionSubjectDomain | undefined,
      isSelfContained,
      clarificationPrompt,
      reason: clarificationPrompt,
      source: "jev_direct",
      elapsedMs,
      latencyMs: elapsedMs,
    });
  } catch (error) {
    // 4. Graceful Fallback on timeout or API error
    const elapsedMs = Date.now() - startedAt;
    return finish(input, {
      disposition: "generate_lesson",
      confidence: 0,
      isSelfContained: true,
      reason: error instanceof Error ? error.message : "System One error",
      source: "passthrough",
      elapsedMs,
      latencyMs: elapsedMs,
    });
  }
}
