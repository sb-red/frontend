type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  cache?: RequestCache;
};

type ErrorLike = { message?: string } & Record<string, unknown>;

function getBaseUrl() {
  // when it's server environment (Node.js / Lambda)
  if (typeof window === "undefined") {
    
    // use the actual backend URL directly
    const backendUrl = process.env.SOFTGATE_API_BASE_URL;
    
    if (!backendUrl) {
      console.error("SOFTGATE_API_BASE_URL is missing!");
      return "http://localhost:3000/api/softgate"; 
    }
    return backendUrl;
  }
  // when it's client environment (browser)
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/softgate";
}

async function apiRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 10000, cache = "no-store" } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const baseUrl = getBaseUrl();
  
  // Ensure no double slashes when concatenating base URL and path
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const finalUrl = `${cleanBase}${cleanPath}`;

  try {
    const res = await fetch(finalUrl, {
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

export type ScheduleItem = {
  id: number;
  scheduled_at: string;
  payload?: Record<string, unknown>;
};

type CreateScheduleRequest = {
  scheduled_at: string;
  payload?: Record<string, unknown>;
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

export async function listSchedules(functionId: number) {
  return apiRequest<ScheduleItem[]>(`/functions/${functionId}/schedules`);
}

export async function createSchedule(functionId: number, body: CreateScheduleRequest) {
  return apiRequest<ScheduleItem>(`/functions/${functionId}/schedules`, {
    method: "POST",
    body,
  });
}

export async function deleteSchedule(functionId: number, scheduleId: number) {
  return apiRequest<{ message?: string }>(
    `/functions/${functionId}/schedules/${scheduleId}`,
    { method: "DELETE" },
  );
}