import { NextRequest } from "next/server";

function resolveTargetBase() {
  const envBase = process.env.SOFTGATE_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!envBase) {
    throw new Error("SOFTGATE_API_BASE_URL must be set to use the proxy");
  }
  const cleaned = envBase.replace(/\/$/, "");
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    throw new Error("SOFTGATE_API_BASE_URL must be an absolute URL (e.g., https://api.example.com)");
  }
  return cleaned;
}

const TARGET_API_BASE = resolveTargetBase();

function buildTargetUrl(path: string[], searchParams: URLSearchParams) {
  const base = TARGET_API_BASE.replace(/\/$/, "");
  const url = new URL(`${base}/${path.join("/")}`);
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

function forwardHeaders(headers: Headers) {
  const forwarded = new Headers();
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "content-length") return;
    forwarded.set(key, value);
  });
  return forwarded;
}

async function handler(
  request: NextRequest,
  { params }: { params: { path?: string[] } },
) {
  const path = params.path ?? [];
  const targetUrl = buildTargetUrl(path, request.nextUrl.searchParams);
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body = hasBody ? await request.text() : undefined;

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: forwardHeaders(request.headers),
    body,
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  return new Response(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as OPTIONS, handler as HEAD };
