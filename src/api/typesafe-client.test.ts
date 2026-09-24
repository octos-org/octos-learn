import { describe, it, expect, vi } from "vitest";
import {
  evaluateSystemOne,
  DEFAULT_TYPESAFE_API_URL,
  DEFAULT_TYPESAFE_MODEL,
  TypeSafeApiError,
} from "./typesafe-client";

describe("typesafe-client", () => {
  const dummyApiKey = "ts-test-key-12345";

  it("successfully sends evaluation request and parses response", async () => {
    const mockResponse = {
      answers: {
        disposition: {
          choice: "generate_lesson",
          probabilities: { generate_lesson: 0.95, clarify: 0.03, ignore: 0.02 },
          confidence: 0.92,
        },
        is_self_contained: {
          noul: 0.88,
        },
      },
      model: "jev-latest",
      usage: { total_tokens: 120 },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await evaluateSystemOne(
      dummyApiKey,
      {
        state: { learner_request: "请讲解勾股定理" },
        questions: {
          disposition: {
            type: "choice",
            instructions: "判断输入是否为清晰的教学请求",
            criteria: {
              generate_lesson: "明确的教学请求",
              clarify: "需要澄清",
              ignore: "无意义噪音",
            },
          },
          is_self_contained: {
            type: "noul",
            instructions: "该请求是否独立自足？",
          },
        },
      },
      { fetchFn: mockFetch as unknown as typeof fetch },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      DEFAULT_TYPESAFE_API_URL,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Authorization": `Bearer ${dummyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: { learner_request: "请讲解勾股定理" },
          model: DEFAULT_TYPESAFE_MODEL,
          questions: {
            disposition: {
              type: "choice",
              instructions: "判断输入是否为清晰的教学请求",
              criteria: {
                generate_lesson: "明确的教学请求",
                clarify: "需要澄清",
                ignore: "无意义噪音",
              },
            },
            is_self_contained: {
              type: "noul",
              instructions: "该请求是否独立自足？",
            },
          },
        }),
      }),
    );

    expect(result.answers.disposition).toEqual(mockResponse.answers.disposition);
    expect(result.answers.is_self_contained).toEqual(mockResponse.answers.is_self_contained);
  });

  it("handles HTTP error status codes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: vi.fn().mockResolvedValue("Invalid API Key"),
    });

    await expect(
      evaluateSystemOne(
        dummyApiKey,
        {
          state: "hello",
          questions: {},
        },
        { fetchFn: mockFetch as unknown as typeof fetch },
      ),
    ).rejects.toThrow(TypeSafeApiError);
  });

  it("handles request timeout", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    await expect(
      evaluateSystemOne(
        dummyApiKey,
        { state: "hello", questions: {} },
        {
          fetchFn: mockFetch as unknown as typeof fetch,
          timeoutMs: 20,
        },
      ),
    ).rejects.toThrow(/timed out/);
  });
});
