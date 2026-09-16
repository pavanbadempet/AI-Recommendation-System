import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const PORT = parseInt(process.env.PORT || "5173", 10);
const HOST = process.env.HOST || "0.0.0.0";
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");

// Resolve dist directory robustly across root or frontend cwd invocations
const candidateDistDirs = [
  path.resolve(import.meta.dir, "dist"),
  path.resolve(process.cwd(), "frontend/dist"),
  path.resolve(process.cwd(), "dist"),
];
const DIST_DIR = candidateDistDirs.find((dir) => fs.existsSync(dir)) || candidateDistDirs[0];

/**
 * Resolves optimal Edge CDN Cache-Control header based on endpoint path.
 */
export function getEdgeCacheControl(pathname: string): string | null {
  if (
    pathname === "/movies/showcase" ||
    pathname.startsWith("/movies/showcase/") ||
    pathname === "/v1/showcase" ||
    pathname.startsWith("/v1/showcase/")
  ) {
    return "public, max-age=300, stale-while-revalidate=3600, s-maxage=300";
  }
  if (
    pathname === "/movies/titles" ||
    pathname.startsWith("/movies/titles/") ||
    pathname === "/v1/titles" ||
    pathname.startsWith("/v1/titles/")
  ) {
    return "public, max-age=1800, stale-while-revalidate=86400, s-maxage=1800";
  }
  if (pathname === "/v1/catalog" || pathname.startsWith("/v1/catalog/")) {
    return "public, max-age=600, stale-while-revalidate=7200, s-maxage=600";
  }
  if (pathname === "/movie" || pathname.startsWith("/movie/")) {
    return "public, max-age=3600, stale-while-revalidate=86400, s-maxage=3600";
  }
  if (
    pathname.startsWith("/v1/recommendations/id/") ||
    pathname.startsWith("/recommend/id/")
  ) {
    return "public, max-age=600, stale-while-revalidate=7200, s-maxage=600";
  }
  if (
    pathname === "/v1/events" ||
    pathname.startsWith("/v1/events/") ||
    pathname === "/events" ||
    pathname.startsWith("/events/") ||
    pathname.startsWith("/v1/auth/")
  ) {
    return "private, no-store, no-cache";
  }
  if (pathname === "/health" || pathname.startsWith("/health/")) {
    return "public, max-age=10, stale-while-revalidate=30";
  }
  return null;
}

/**
 * Checks if the request path matches backend API routes that must be reverse-proxied.
 */
export function shouldProxy(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname.startsWith("/health/") ||
    pathname === "/v1" ||
    pathname.startsWith("/v1/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/movies" ||
    pathname.startsWith("/movies/") ||
    pathname === "/movie" ||
    pathname.startsWith("/movie/") ||
    pathname === "/events" ||
    pathname.startsWith("/events/")
  );
}

/**
 * Reverse-proxies the HTTP request to the backend with edge caching and ETag headers.
 */
export async function handleProxy(req: Request, url: URL): Promise<Response> {
  const targetUrl = `${BACKEND_URL}${url.pathname}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.set("X-Forwarded-For", req.headers.get("x-forwarded-for") || "127.0.0.1");
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
  headers.set("X-Forwarded-Host", url.host);

  const isGetOrHead = req.method === "GET" || req.method === "HEAD";

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (!isGetOrHead) {
    init.body = req.body;
    // @ts-ignore - required by fetch streaming specifications in Bun/Node
    init.duplex = "half";
  }

  try {
    const upstreamRes = await fetch(targetUrl, init);
    const resHeaders = new Headers(upstreamRes.headers);

    if (isGetOrHead && upstreamRes.status === 200) {
      const cacheControl = getEdgeCacheControl(url.pathname);
      if (cacheControl) {
        resHeaders.set("Cache-Control", cacheControl);
        if (!cacheControl.includes("private")) {
          resHeaders.set("CDN-Cache-Control", cacheControl);
        }
      }

      // ETag resolution and If-None-Match evaluation
      let etag = upstreamRes.headers.get("etag") || upstreamRes.headers.get("ETag");
      let bodyBuffer: ArrayBuffer | null = null;

      if (!etag) {
        bodyBuffer = await upstreamRes.arrayBuffer();
        const hash = crypto.createHash("sha1").update(new Uint8Array(bodyBuffer)).digest("hex").slice(0, 16);
        etag = `"${hash}"`;
        resHeaders.set("ETag", etag);
      }

      const ifNoneMatch = req.headers.get("if-none-match");
      if (etag && ifNoneMatch) {
        const cleanClientEtags = ifNoneMatch
          .split(",")
          .map((t) => t.trim().replace(/^W\//, "").replace(/"/g, ""));
        const cleanServerEtag = etag.trim().replace(/^W\//, "").replace(/"/g, "");

        if (ifNoneMatch.trim() === "*" || cleanClientEtags.includes(cleanServerEtag)) {
          return new Response(null, {
            status: 304,
            statusText: "Not Modified",
            headers: resHeaders,
          });
        }
      }

      if (bodyBuffer !== null) {
        return new Response(req.method === "HEAD" ? null : bodyBuffer, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: resHeaders,
        });
      }
    } else if (isGetOrHead) {
      const cacheControl = getEdgeCacheControl(url.pathname);
      if (cacheControl && cacheControl.includes("private")) {
        resHeaders.set("Cache-Control", cacheControl);
      }
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders,
    });
  } catch (error: any) {
    console.error(`[Bun Edge Proxy Error] ${req.method} ${url.pathname} -> ${targetUrl}:`, error?.message || error);
    return new Response(
      JSON.stringify({
        error: "Backend service unreachable",
        status: "bad_gateway",
        detail: error?.message || String(error),
        target: targetUrl,
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      }
    );
  }
}

/**
 * Serves static assets from dist/ or falls back to index.html for client-side SPA routing.
 */
export async function handleStaticOrSpa(req: Request, url: URL): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Prevent path traversal
  const cleanPath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, "").replace(/^[\/\\]+/, "");

  if (cleanPath) {
    const candidateFile = path.join(DIST_DIR, cleanPath);
    if (candidateFile.startsWith(DIST_DIR)) {
      const file = Bun.file(candidateFile);
      if (await file.exists()) {
        const headers = new Headers();
        if (cleanPath.startsWith("assets/")) {
          headers.set("cache-control", "public, max-age=31536000, immutable");
        } else if (cleanPath === "sw.js") {
          headers.set("cache-control", "no-cache");
        } else {
          headers.set("cache-control", "public, max-age=3600");
        }
        return new Response(file, { headers });
      }
    }
  }

  // SPA fallback to dist/index.html
  const indexHtml = Bun.file(path.join(DIST_DIR, "index.html"));
  if (await indexHtml.exists()) {
    return new Response(indexHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  return new Response("Not Found - Run `bun run build` to generate static assets", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);

    if (shouldProxy(url.pathname)) {
      return handleProxy(req, url);
    }

    return handleStaticOrSpa(req, url);
  },
  error(error) {
    console.error("[Bun Serve Error]:", error);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", detail: error.message }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  },
});

console.log(`🚀 Apex Bun 1.2 Edge Server running on http://${server.hostname}:${server.port}`);
console.log(`📁 Static assets directory: ${DIST_DIR}`);
console.log(`🔗 Upstream backend target: ${BACKEND_URL}`);

export default server;
