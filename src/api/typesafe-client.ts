export type QuestionType = "choice" | "score" | "noul";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: Record<string, string>;
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  score: number;
  legend?: string[];
  probabilities: Record<string, number>;
  confidence: number;
}

export interface NoulAnswer {
  noul: number;
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface SystemOneRequest {
  state: unknown;
  model?: string;
  questions: Record<string, Question>;
}

export interface SystemOneResponse {
  answers: Record<string, Answer>;
  model: string;
  usage?: {
    total_tokens?: number;
  };
}

export interface EvaluateSystemOneOptions {
  timeoutMs?: number;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export const DEFAULT_TYPESAFE_API_URL = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_TYPESAFE_MODEL = "jev-latest";
export const DEFAULT_TYPESAFE_TIMEOUT_MS = 500;

export class TypeSafeApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = "TypeSafeApiError";
    this.status = status;
    this.code = code;
  }
}

export async function evaluateSystemOne(
  apiKey: string,
  requestPayload: SystemOneRequest,
  options: EvaluateSystemOneOptions = {},
): Promise<SystemOneResponse> {
  const {
    timeoutMs = DEFAULT_TYPESAFE_TIMEOUT_MS,
    baseUrl = DEFAULT_TYPESAFE_API_URL,
    fetchFn = globalThis.fetch,
    signal,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const mergedSignal = signal
    ? AbortSignal.any
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal
    : controller.signal;

  try {
    const response = await fetchFn(baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: requestPayload.state,
        model: requestPayload.model ?? DEFAULT_TYPESAFE_MODEL,
        questions: requestPayload.questions,
      }),
      signal: mergedSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new TypeSafeApiError(
        `TypeSafe evaluation failed: HTTP ${response.status} ${response.statusText} ${errorText}`.trim(),
        response.status,
      );
    }

    const data = (await response.json()) as SystemOneResponse;
    if (!data || typeof data !== "object" || !data.answers) {
      throw new TypeSafeApiError("Invalid TypeSafe response format: missing answers");
    }
    return data;
  } catch (error) {
    if (error instanceof TypeSafeApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TypeSafeApiError(`TypeSafe evaluation timed out after ${timeoutMs}ms`, 408, "TIMEOUT");
    }
    throw new TypeSafeApiError(
      error instanceof Error ? error.message : String(error),
      undefined,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
