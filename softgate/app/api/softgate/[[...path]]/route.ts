import { NextRequest, NextResponse } from "next/server";

function getTargetBaseUrl() {
  const envBase = process.env.SOFTGATE_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  
  if (!envBase) {
    throw new Error("SOFTGATE_API_BASE_URL must be set to use the proxy");
  }
  
  const cleaned = envBase.replace(/\/$/, "");
  
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    throw new Error(`SOFTGATE_API_BASE_URL must be an absolute URL. Value: ${cleaned}`);
  }
  
  return cleaned;
}

function buildTargetUrl(baseUrl: string, path: string[], searchParams: URLSearchParams) {
  const url = new URL(`${baseUrl}/${path.join("/")}`);
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

type RouteContext =
  | { params: { path?: string[] } }
  | { params: Promise<{ path?: string[] }> };

async function handler(request: NextRequest, context: RouteContext) {
  try {
    // when request comes in, read env var and compute URL
    const targetBase = getTargetBaseUrl();

    const resolvedParams = await Promise.resolve(context.params);
    const path = Array.isArray(resolvedParams?.path) ? resolvedParams.path : [];
    
    const targetUrl = buildTargetUrl(targetBase, path, request.nextUrl.searchParams);
    
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

  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("[Proxy Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as OPTIONS, handler as HEAD };
