// functions/proxy/[[path]].js
// -----------------------------------------------------------------------------
// 💡  A beginner-friendly ("小白" friendly) version of the Cloudflare-Workers proxy
//     with robust caching, playlist rewriting, and clear inline comments.
//     ✔  Implements SIX extra improvements requested on 2025-05-12.
// -----------------------------------------------------------------------------

import { kvHelper } from "../utils/kv-helper.js";

// -----------------------------------------------------------------------------
//  CONSTANTS & RE-USABLE REGEX
// -----------------------------------------------------------------------------
const RE_URI = /URI\s*=\s*"([^"]+)"/g;                         // Standard URI attributes
// 3️⃣  Generalised – capture any attribute that ends with "URI"
const RE_OTHER_URI = /\b([A-Z0-9_-]*?URI)\s*=\s*"([^"]+)"/gi;

const DEFAULT_CACHE_TTL = 86400;                         // 24 h in seconds
const DEFAULT_MAX_RECURSION = 5;
const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const KV_RAW_PREFIX = "proxy_raw:";                      // Raw response cache key
const KV_M3U8_PROCESSED_PREFIX = "m3u8_processed:";      // Processed playlist cache key

const M3U8_CONTENT_TYPES = [                             // MIME types that mean M3U8
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
];

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};
const OPTIONS_HEADERS = { ...COMMON_HEADERS, "Access-Control-Max-Age": "86400" };

// -----------------------------------------------------------------------------
//  HELPER UTILITIES (env parsing, logging, base64 helpers, etc.)
// -----------------------------------------------------------------------------
export const parseNumberEnv = (env, key, def = 0) => {
  const raw = env[key];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  return Number.isNaN(n) || n < 0 ? def : n;
};

export const parseJsonArrayEnv = (env, key, def = []) => {
  const raw = env[key];
  if (typeof raw !== "string" || !raw.trim()) return def;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : def;
  } catch {
    return def;
  }
};

// Fast way to get base URL of any absolute/relative string
const getBaseUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!url.pathname || url.pathname === "/") return `${url.origin}/`;
    const parts = url.pathname.split("/");
    parts.pop();
    return `${url.origin}${parts.join("/")}/`;
  } catch {
    // Fallback that never throws – keeps proxy alive even on weird URLs
    const protoEnd = urlStr.indexOf("://");
    if (protoEnd === -1) return urlStr;
    const lastSlash = urlStr.lastIndexOf("/");
    return lastSlash > protoEnd + 2 ? urlStr.slice(0, lastSlash + 1) : urlStr.endsWith("/") ? urlStr : `${urlStr}/`;
  }
};

const isM3u8Content = (content, contentType) => {
  if (contentType && M3U8_CONTENT_TYPES.some((ct) => contentType.toLowerCase().includes(ct))) return true;
  return typeof content === "string" && content.trimStart().startsWith("#EXTM3U");
};

const logDebug = (debugEnabled, msg) => {
  if (debugEnabled) console.log(`[Proxy] ${msg}`);
};

// Resolve relative → absolute, with per-request cache to avoid repeat new URL()
const resolveUrl = (baseUrl, relativeUrl, cache, logFn) => {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;      // already absolute
  const key = `${baseUrl}|${relativeUrl}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const abs = new URL(relativeUrl, baseUrl).toString();
    cache.set(key, abs);
    return abs;
  } catch (e) {
    logFn(`URL resolve failed (${relativeUrl}): ${e.message}`);
    return relativeUrl;                                           // best-effort fallback
  }
};

const rewriteUrlToProxy = (url) => `/proxy/${encodeURIComponent(url)}`;

const safeJsonParse = (str, def = null, logFn) => {
  if (typeof str !== "string") return def;
  try {
    return JSON.parse(str);
  } catch (e) {
    logFn?.(`JSON parse error: ${e.message}`);
    return def;
  }
};

// -- Base64 helpers (large-file safe) ----------------------------------------
const abToBase64 = (ab) => {
  const u8 = new Uint8Array(ab);
  const CHUNK = 0x8000;         // 32 768 bytes
  let str = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    str += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return btoa(str);
};

const base64ToAb = (b64) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;


// -----------------------------------------------------------------------------
//  RESPONSE HELPERS
// -----------------------------------------------------------------------------
const createResponse = (request, body, status = 200, headers = {}) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: OPTIONS_HEADERS });
  const h = new Headers({ ...COMMON_HEADERS, ...headers });
  return new Response(body, { status, headers: h });
};

const createM3u8Response = (request, body, ttl) =>
  createResponse(request, body, 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": `public, max-age=${ttl}`,
  });

const stripHopByHopHeaders = (headers) => {
  [
    "set-cookie",
    "cookie",
    "authorization",
    "www-authenticate",
    "proxy-authenticate",
    "server",
    "x-powered-by",
  ].forEach((h) => headers.delete(h));
};

// 6️⃣  Separate browser vs CDN caching
const createOtherResponse = (request, body, status, originHeaders, ttl) => {
  const h = new Headers(originHeaders);
  stripHopByHopHeaders(h);
  h.set("Cache-Control", `public, max-age=${Math.floor(ttl / 4)}`);    // browsers
  h.set("CDN-Cache-Control", `public, max-age=${ttl}`);                // edge
  h.delete("pragma");
  h.delete("expires");
  return createResponse(request, body, status, h);
};

// -----------------------------------------------------------------------------
//  NETWORK FETCHING – with text/binary sniffing (4️⃣)
// -----------------------------------------------------------------------------
const createFetchHeaders = (req, targetUrl, agents) => {
  const h = new Headers();
  h.set("User-Agent", agents[Math.floor(Math.random() * agents.length)]);
  h.set("Accept", "*/*");
  const al = req.headers.get("Accept-Language");
  if (al) h.set("Accept-Language", al);
  try {
    h.set("Referer", new URL(targetUrl).origin);
  } catch {
    const ref = req.headers.get("Referer");
    if (ref) h.set("Referer", ref);
  }
  return h;
};

/**
 * Fetch any asset and return { content, contentType, responseHeaders }.
 * Text is decoded to string, binary kept as ArrayBuffer.
 */
const fetchContentWithType = async (targetUrl, originalRequest, cfg, logFn) => {
  const headers = createFetchHeaders(originalRequest, targetUrl, cfg.USER_AGENTS);
  logFn(`Fetch → ${targetUrl}`);

  let resp;
  try {
    resp = await fetch(targetUrl, { headers, redirect: "follow" });
  } catch (e) {
    throw new Error(`Network error fetching ${targetUrl}: ${e.message}`);
  }
  if (!resp.ok) {
    const msg = await resp.text().catch(() => "<unreadable>");
    throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${msg.slice(0, 200)}`);
  }

  const contentType = resp.headers.get("Content-Type") || "";
  const buf = await resp.arrayBuffer();

  const isText =
    /^text\//i.test(contentType) ||
    M3U8_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t));

  const content = isText ? new TextDecoder().decode(buf) : buf;      // 4️⃣ tweak

  return { content, contentType, responseHeaders: resp.headers };
};

// -----------------------------------------------------------------------------
//  M3U8 PROCESSING FUNCTIONS
// -----------------------------------------------------------------------------
const processUriLine = (line, baseUrl, cache, logFn) => {
  let out = line.replace(RE_URI, (_, uri) => {
    const abs = resolveUrl(baseUrl, uri, cache, logFn);
    return `URI="${rewriteUrlToProxy(abs)}"`;
  });
  out = out.replace(RE_OTHER_URI, (match, attr, uri) => {
    if (!uri.includes("://")) return match;
    const abs = resolveUrl(baseUrl, uri, cache, logFn);
    return `${attr}="${rewriteUrlToProxy(abs)}"`;
  });
  return out;
};

const processMediaPlaylist = (targetUrl, content, cache, logFn) => {
  const base = getBaseUrl(targetUrl);
  return content
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;                               // keep blank lines
      if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP"))
        return processUriLine(t, base, cache, logFn);
      if (t.startsWith("#")) return t;                  // comment/directive
      const abs = resolveUrl(base, t, cache, logFn);     // media segment
      return rewriteUrlToProxy(abs);
    })
    .join("\n");
};

/**
 * 2️⃣  Master-playlist detection – line-by-line scan for first #EXT-X-STREAM-INF.
 */
const findFirstVariantUrl = (content, baseUrl, cache, logFn) => {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("#EXT-X-STREAM-INF")) {
      // Find the next non-empty, non-comment line
      for (let j = i + 1; j < lines.length; j++) {
        const cand = lines[j].trim();
        if (!cand || cand.startsWith("#")) continue;
        const abs = resolveUrl(baseUrl, cand, cache, logFn);
        logFn(`Variant (line scan) → ${abs}`);
        return abs;
      }
    }
  }
  return ""; // not found
};

const processMasterPlaylist = async (
  targetUrl,
  content,
  depth,
  ctx,
  cfg,
  cache,
  logFn,
  kv,
) => {
  if (depth > cfg.MAX_RECURSION) throw new Error("Max recursion depth reached");

  const base = getBaseUrl(targetUrl);
  let variantUrl = findFirstVariantUrl(content, base, cache, logFn);

  if (!variantUrl) {
    logFn("No variant found – fallback to media playlist");
    return processMediaPlaylist(targetUrl, content, cache, logFn);
  }

  // KV cache for processed sub-playlist
  const cacheKey = `${KV_M3U8_PROCESSED_PREFIX}${variantUrl}`;
  if (kv) {
    const hit = await kv.get(cacheKey);
    if (hit) {
      logFn("[KV hit – processed M3U8]");
      return hit;
    }
  }

  const { content: varContent, contentType } = await fetchContentWithType(variantUrl, ctx.request, cfg, logFn);
  const processed = await processM3u8Recursive(variantUrl, varContent, contentType, depth + 1, ctx, cfg, cache, logFn, kv);

  // 5️⃣ KV put de-duplication
  if (kv && (await kv.get(cacheKey)) == null) {
    kv
      .put(cacheKey, processed, { expirationTtl: cfg.CACHE_TTL })
      .catch((e) => logFn(`KV put err: ${e.message}`));
  }

  return processed;
};

const processM3u8Recursive = async (
  targetUrl,
  content,
  contentType,
  depth,
  ctx,
  cfg,
  cache,
  logFn,
  kv,
) => {
  const isMaster = content.includes("#EXT-X-STREAM-INF") || content.includes("#EXT-X-MEDIA:");
  return isMaster
    ? processMasterPlaylist(targetUrl, content, depth, ctx, cfg, cache, logFn, kv)
    : processMediaPlaylist(targetUrl, content, cache, logFn);
};

// -----------------------------------------------------------------------------
//  MAIN REQUEST HANDLER
// -----------------------------------------------------------------------------
export const onRequest = async (ctx) => {
  const { request, env } = ctx;
  const DEBUG = env.DEBUG === "true";
  const log = (m) => logDebug(DEBUG, m);

  // ── 1.  Read config from environment --------------------------------------
  const cfg = {
    CACHE_TTL: parseNumberEnv(env, "CACHE_TTL", DEFAULT_CACHE_TTL),
    MAX_RECURSION: parseNumberEnv(env, "MAX_RECURSION", DEFAULT_MAX_RECURSION),
    USER_AGENTS: parseJsonArrayEnv(env, "USER_AGENTS_JSON", DEFAULT_USER_AGENTS),
  };

  // ── 2.  Extract target URL from /proxy/{ENCODED} ---------------------------
  const pathPart = new URL(request.url).pathname.replace(/^\/proxy\//, "");
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(pathPart);
  } catch {
    targetUrl = pathPart;
  }
  if (!/^https?:\/\//i.test(targetUrl)) return createResponse(request, "Bad Request: invalid target URL", 400);
  log(`Target → ${targetUrl}`);

  // ── 3.  Create KV helper ---------------------------------------------------
  const kv = env.LIBRETV_PROXY_KV ? kvHelper(env.LIBRETV_PROXY_KV, cfg.CACHE_TTL, log) : null;

  // ── 4.  Try RAW cache ------------------------------------------------------
  const rawKey = `${KV_RAW_PREFIX}${targetUrl}`;
  let rawCacheObj = null;
  if (kv) rawCacheObj = safeJsonParse(await kv.get(rawKey), null, log);

  let body, contentType, originHeaders;

  if (rawCacheObj) {
    log("[KV hit – raw]");
    body = rawCacheObj.isBase64 ? base64ToAb(rawCacheObj.body) : rawCacheObj.body; // 1️⃣ decode
    originHeaders = new Headers(rawCacheObj.headers);
    contentType = originHeaders.get("content-type") || "";
  } else {
    // ---- Fetch from origin --------------------------------------------------
    const fetched = await fetchContentWithType(targetUrl, request, cfg, log);
    body = fetched.content;
    contentType = fetched.contentType;
    originHeaders = fetched.responseHeaders;

    // ---- Write RAW cache (string or base64) --------------------------------
    if (kv) {
      const rawBody = typeof body === "string" ? body : abToBase64(body); // encode if binary
      const cacheVal = JSON.stringify({
        body: rawBody,
        isBase64: typeof body !== "string",
        headers: Object.fromEntries([...originHeaders].map(([k, v]) => [k.toLowerCase(), v])),
      });
      // 5️⃣  KV put de-dup (rare concurrency case)
      if ((await kv.get(rawKey)) == null) {
        kv
          .put(rawKey, cacheVal, { expirationTtl: cfg.CACHE_TTL })
          .catch((e) => log(`KV put err: ${e.message}`));
      }
    }
  }

  // ── 5.  M3U8 smart handling ----------------------------------------------
  if (isM3u8Content(body, contentType)) {
    log("M3U8 detected – processing");
    if (typeof body !== "string") body = new TextDecoder().decode(body); // ensure string
    const cache = new Map();                                            // per-request resolve cache
    const processed = await processM3u8Recursive(targetUrl, body, contentType, 0, ctx, cfg, cache, log, kv);
    return createM3u8Response(request, processed, cfg.CACHE_TTL);
  }

  // ── 6.  Non-M3U8 → pass through with tweaked caching ----------------------
  return createOtherResponse(request, body, 200, originHeaders, cfg.CACHE_TTL);
};

// -----------------------------------------------------------------------------
//  OPTIONS (CORS pre-flight) ---------------------------------------------------
// -----------------------------------------------------------------------------
export const onOptions = () => new Response(null, { status: 204, headers: OPTIONS_HEADERS });