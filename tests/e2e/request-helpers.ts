import { expect, type APIRequestContext, type Page } from "@playwright/test";

type JsonRetryResult<TPayload> = {
  ok: boolean;
  status: number;
  payload: TPayload | null;
};

function formatJsonRetryFailure<TPayload>(url: string, result: JsonRetryResult<TPayload> | null) {
  return JSON.stringify({
    url,
    status: result?.status ?? null,
    payload: result?.payload ?? null
  });
}

function formatStatusOnlyRetryFailure<TPayload>(result: JsonRetryResult<TPayload> | null) {
  return JSON.stringify({
    status: result?.status ?? null
  });
}

export async function postJsonWithRetry<TPayload = unknown>(
  request: APIRequestContext,
  url: string,
  data: Record<string, unknown>,
  options?: {
    attempts?: number;
    retryDelayMs?: number;
  }
) {
  const attempts = options?.attempts ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 250;
  let lastResult: JsonRetryResult<TPayload> | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request.post(url, { data });
      const payload = await response.json().catch(() => null);
      const result: JsonRetryResult<TPayload> = {
        ok: response.ok(),
        status: response.status(),
        payload: payload as TPayload | null
      };

      lastResult = result;

      if (result.ok) {
        return result;
      }
    } catch {
      // Auth setup failures intentionally omit request and response details from reporters.
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  expect(lastResult?.ok, formatStatusOnlyRetryFailure(lastResult)).toBeTruthy();
  throw new Error(`${url} が成功しませんでした。`);
}

export async function postJsonViaPageWithRetry<TPayload = unknown>(
  page: Page,
  url: string,
  data: Record<string, unknown>,
  options?: {
    attempts?: number;
    retryDelayMs?: number;
  }
) {
  const attempts = options?.attempts ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 250;
  let lastResult: JsonRetryResult<TPayload> | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await page.evaluate(
      async ({ targetUrl, payload }) => {
        const response = await fetch(targetUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const body = await response.json().catch(() => null);

        return {
          ok: response.ok,
          status: response.status,
          payload: body as TPayload | null
        };
      },
      { targetUrl: url, payload: data }
    );

    lastResult = result;

    if (result.ok) {
      return result;
    }

    if (attempt < attempts - 1) {
      await page.waitForTimeout(retryDelayMs);
    }
  }

  expect(lastResult?.ok, formatJsonRetryFailure(url, lastResult)).toBeTruthy();
  throw new Error(`${url} が成功しませんでした。`);
}
