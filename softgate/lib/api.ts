const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "/api/softgate";

const API_BASE_URL = resolveApiBaseUrl(DEFAULT_API_BASE);

function resolveApiBaseUrl(base: string) {
  const cleaned = stripTrailingSlash(base || "/api/softgate");
  const isServer = typeof window === "undefined";
  const isAbsolute =
    cleaned.startsWith("http://") || cleaned.startsWith("https://");
  if (isAbsolute) return cleaned;

  const relativeBase = normalizeRelativeBase(cleaned);
  if (!isServer) return relativeBase;

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const normalizedOrigin = origin.endsWith("/")
    ? origin.slice(0, -1)
    : origin;
  return `${normalizedOrigin}${relativeBase}`;
}

function normalizeRelativeBase(base: string) {
  const withLeading = base.startsWith("/") ? base : `/${base}`;
  if (withLeading === "/api" || withLeading === "/api/") {
    return "/api/softgate";
  }
  if (withLeading === "/" || withLeading === "") {
    return "/api/softgate";
  }
  return withLeading;
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  cache?: RequestCache;
};

type ErrorLike = { message?: string } & Record<string, unknown>;

async function apiRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 10000, cache = "no-store" } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      cache,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type");
    const isJson = contentType?.includes("application/json");

    if (!res.ok) {
      const errPayload = isJson ? await res.json() : await res.text();
      const message =
        typeof errPayload === "string"
          ? errPayload
          : (errPayload as ErrorLike)?.message ??
            JSON.stringify(errPayload, null, 2) ??
            "Request failed";
      throw new Error(message);
    }

    return isJson ? ((await res.json()) as T) : ((await res.text()) as unknown as T);
  } finally {
    clearTimeout(timeout);
  }
}

export type FunctionListItem = {
  id: number;
  name: string;
  runtime: string;
  description?: string;
  created_at?: string;
};

export type InvokeResponse = {
  duration_ms?: number;
  error_message?: string;
  function_id?: number;
  input_event?: Record<string, unknown>;
  invocation_id?: number;
  logged_at?: string;
  result?: Record<string, unknown>;
  status?: string;
};

export type InvocationListItem = {
  duration_ms?: number;
  error_message?: string;
  function_id?: number;
  id: number;
  input_event?: Record<string, unknown>;
  invoked_at?: string;
  output_result?: Record<string, unknown>;
  status?: string;
};

export type FunctionDetail = {
  id: number;
  name: string;
  runtime: string;
  description?: string;
  code?: string;
  sample_event?: Record<string, unknown>;
  params?: Array<Record<string, unknown>>;
};

type CreateFunctionRequest = {
  name: string;
  runtime: string;
  code: string;
  description?: string;
  sample_event?: Record<string, unknown>;
  params?: Array<Record<string, unknown>>;
};

export async function listFunctions() {
  return apiRequest<FunctionListItem[]>("/functions");
}

export async function invokeFunction(id: number, params: Record<string, unknown>) {
  return apiRequest<InvokeResponse>(`/functions/${id}/invoke`, {
    method: "POST",
    body: { params },
  });
}

export async function getInvocationStatus(id: number, invocationId: number) {
  return apiRequest<InvokeResponse>(
    `/functions/${id}/invocations/${invocationId}`,
  );
}

export async function listInvocations(id: number, limit = 20) {
  return apiRequest<InvocationListItem[]>(
    `/functions/${id}/invocations?limit=${limit}`,
  );
}

export async function getFunction(id: number) {
  return apiRequest<FunctionDetail>(`/functions/${id}`);
}

export async function createFunction(body: CreateFunctionRequest) {
  return apiRequest<FunctionDetail>(`/functions`, {
    method: "POST",
    body,
  });
}

export async function deleteFunction(id: number) {
  return apiRequest<{ message?: string }>(`/functions/${id}`, {
    method: "DELETE",
  });
}
