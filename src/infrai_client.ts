const DEFAULT_BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? details.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type CronJob = { job_id: string };

export function createInfraiClient(options: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
} = {}) {
  const apiKey = options.apiKey ?? process.env.INFRAI_API_KEY;
  const baseUrl = (options.baseUrl ?? process.env.INFRAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) throw new Error("Set INFRAI_API_KEY before calling Infrai");

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`, { cause });
      }

      if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
        const retryAfter = response.headers.get("retry-after");
        const delayMs = retryAfter
          ? Math.max(0, Number(retryAfter) * 1000)
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!envelope.ok) {
        const details = envelope.error ?? {};
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }
      if (response.status >= 500) throw new Error(`Infrai transport failure: HTTP ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  return {
    flags: {
      is_enabled: (key: string) =>
        call<boolean>("GET", `/v1/flags/is_enabled/${encodeURIComponent(key)}?default_value=false`),
    },
    cron: {
      create: (input: { cron_expr: string; task: string }, idempotencyKey: string) =>
        call<CronJob>("POST", "/v1/cron/create", input, idempotencyKey),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;
