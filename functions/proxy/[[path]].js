// functions/proxy/[[path]].js

import { kvHelper } from "../utils/kv-helper.js";

// ----------------------------- 常量配置 -----------------------------
const RE_URI = /URI\s*=\s*"([^"]+)"/g;                       // #EXT-X-KEY、#EXT-X-MAP 等标准 URI 属性
const RE_OTHER_URI = /(DATA-URI|IV|OTHER-URI-ATTR)\s*=\s*"([^"]+)"/gi; // 其他潜在包含 URL 的属性

const DEFAULT_CACHE_TTL = 86400; // 24 h
const DEFAULT_MAX_RECURSION = 5;
const DEFAULT_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const KV_RAW_PREFIX = "proxy_raw:";
const KV_M3U8_PROCESSED_PREFIX = "m3u8_processed:";

const M3U8_CONTENT_TYPES = [
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/mpegurl",
];

const COMMON_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};
const OPTIONS_HEADERS = {
    ...COMMON_HEADERS,
    "Access-Control-Max-Age": "86400",
};

// ----------------------------- 工具函数 -----------------------------
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

const getBaseUrl = (urlStr) => {
    try {
        const url = new URL(urlStr);
        if (!url.pathname || url.pathname === "/") return `${url.origin}/`;
        const parts = url.pathname.split("/");
        parts.pop();
        return `${url.origin}${parts.join("/")}/`;
    } catch {
        // fallback ── 保守回退策略，保证不会抛错
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

const logDebug = (debugEnabled, message) => {
    if (debugEnabled) console.log(`[Proxy] ${message}`);
};

const resolveUrl = (baseUrl, relativeUrl, cache, logFn) => {
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
    const key = `${baseUrl}|${relativeUrl}`;
    if (cache.has(key)) return cache.get(key);
    try {
        const abs = new URL(relativeUrl, baseUrl).toString();
        cache.set(key, abs);
        return abs;
    } catch (e) {
        logFn(`URL resolve failed: ${e.message}`);
        return relativeUrl;
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

const safeJsonStringify = (val, def = "null", logFn) => {
    try {
        return JSON.stringify(val);
    } catch (e) {
        logFn?.(`JSON stringify error: ${e.message}`);
        return def;
    }
};

// ----------------------------- Response 帮助 -----------------------------
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

const createOtherResponse = (request, body, status, originHeaders, ttl) => {
    const h = new Headers(originHeaders);
    stripHopByHopHeaders(h);
    h.set("Cache-Control", `public, max-age=${ttl}`);
    h.set("CDN-Cache-Control", `public, max-age=${ttl}`);
    h.delete("pragma");
    h.delete("expires");
    return createResponse(request, body, status, h);
};

// ----------------------------- Fetch -----------------------------
const createFetchHeaders = (req, targetUrl, agents) => {
    const h = new Headers();
    h.set("User-Agent", agents[Math.floor(Math.random() * agents.length)]);
    h.set("Accept", "*/*");
    const acceptLang = req.headers.get("Accept-Language");
    if (acceptLang) h.set("Accept-Language", acceptLang);
    try {
        h.set("Referer", new URL(targetUrl).origin);
    } catch {
        const ref = req.headers.get("Referer");
        if (ref) h.set("Referer", ref);
    }
    return h;
};

/**
 * 拉取并读取资源（自动文本/二进制处理）
 */
const fetchContentWithType = async (targetUrl, originalRequest, cfg, logFn) => {
    const headers = createFetchHeaders(originalRequest, targetUrl, cfg.USER_AGENTS);
    logFn(`Fetch -> ${targetUrl}`);

    let resp;
    try {
        resp = await fetch(targetUrl, { headers, redirect: "follow" });
    } catch (e) {
        throw new Error(`Network error fetching ${targetUrl}: ${e.message}`);
    }
    if (!resp.ok) {
        const body = await resp.text().catch(() => "<unreadable>");
        throw new Error(`HTTP ${resp.status} ${resp.statusText} (${body.slice(0, 200)})`);
    }

    const ct = resp.headers.get("Content-Type") || "";
    const isText = /^text\//i.test(ct) || M3U8_CONTENT_TYPES.some((t) => ct.toLowerCase().includes(t));
    const buf = await resp.arrayBuffer();
    const body = isText ? new TextDecoder().decode(buf) : buf;

    return { content: body, contentType: ct, responseHeaders: resp.headers };
};

// ----------------------------- M3U8 处理 -----------------------------
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
        .map((l) => {
            const t = l.trim();
            if (!t) return l; // 保留空行结构
            if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP")) return processUriLine(t, base, cache, logFn);
            if (t.startsWith("#")) return t;
            const abs = resolveUrl(base, t, cache, logFn);
            return rewriteUrlToProxy(abs);
        })
        .join("\n");
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
    const match = content.match(/[^#\r\n]+\.m3u8[^\r\n]*/i);
    if (!match) {
        logFn("No variant .m3u8 found, treating as media playlist");
        return processMediaPlaylist(targetUrl, content, cache, logFn);
    }

    const variantUrl = resolveUrl(base, match[0].trim(), cache, logFn);
    logFn(`Variant -> ${variantUrl}`);

    const cacheKey = `${KV_M3U8_PROCESSED_PREFIX}${variantUrl}`;
    if (kv) {
        const hit = await kv.get(cacheKey);
        if (hit) {
            logFn("[KV hit – processed M3U8]");
            return hit;
        }
    }

    const { content: variantContent, contentType } = await fetchContentWithType(variantUrl, ctx.request, cfg, logFn);
    const processed = await processM3u8Recursive(variantUrl, variantContent, contentType, depth + 1, ctx, cfg, cache, logFn, kv);

    kv?.put(cacheKey, processed, { expirationTtl: cfg.CACHE_TTL }).catch((e) => logFn(`KV put err: ${e.message}`));
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

// ----------------------------- 主入口 -----------------------------
export const onRequest = async (ctx) => {
    const { request, env } = ctx;
    const DEBUG = env.DEBUG === "true";
    const log = (m) => logDebug(DEBUG, m);

    // ------------ 配置读取 ------------
    const cfg = {
        CACHE_TTL: parseNumberEnv(env, "CACHE_TTL", DEFAULT_CACHE_TTL),
        MAX_RECURSION: parseNumberEnv(env, "MAX_RECURSION", DEFAULT_MAX_RECURSION),
        USER_AGENTS: parseJsonArrayEnv(env, "USER_AGENTS_JSON", DEFAULT_USER_AGENTS),
    };

    // ------------ 解析目标 URL ------------
    const pathPart = new URL(request.url).pathname.replace(/^\/proxy\//, "");
    let targetUrl = "";
    try {
        targetUrl = decodeURIComponent(pathPart);
    } catch {
        targetUrl = pathPart;
    }
    if (!/^https?:\/\//i.test(targetUrl)) return createResponse(request, "Bad Request: invalid target URL", 400);
    log(`Target: ${targetUrl}`);

    // ------------ KV 句柄 ------------
    const kv = env.LIBRETV_PROXY_KV ? kvHelper(env.LIBRETV_PROXY_KV, cfg.CACHE_TTL, log) : null;

    // ------------ 原始缓存尝试 ------------
    const rawKey = `${KV_RAW_PREFIX}${targetUrl}`;
    let rawCache = null;
    if (kv) {
        rawCache = safeJsonParse(await kv.get(rawKey), null, log);
    }

    let body, contentType, originHeaders;
    if (rawCache) {
        log("[KV hit – raw]");
        ({ body, headers: originHeaders } = rawCache);
        originHeaders = new Headers(originHeaders);
        contentType = originHeaders.get("content-type") || "";
    } else {
        const fetched = await fetchContentWithType(targetUrl, request, cfg, log);
        body = fetched.content;
        contentType = fetched.contentType;
        originHeaders = fetched.responseHeaders;
        // 写 KV（尽量不阻塞请求）
        if (kv) {
            const cacheVal = safeJsonStringify(
                {
                    body,
                    headers: Object.fromEntries([...originHeaders].map(([k, v]) => [k.toLowerCase(), v])),
                },
                null,
                log,
            );
            if (cacheVal) kv.put(rawKey, cacheVal, { expirationTtl: cfg.CACHE_TTL }).catch((e) => log(`KV put err: ${e.message}`));
        }
    }

    // ------------ M3U8 智能处理 / 直出 ------------
    if (isM3u8Content(body, contentType)) {
        log("M3U8 detected – processing");
        if (typeof body !== "string") body = new TextDecoder().decode(body); // binary → text
        const cache = new Map();
        const processed = await processM3u8Recursive(targetUrl, body, contentType, 0, ctx, cfg, cache, log, kv);
        return createM3u8Response(request, processed, cfg.CACHE_TTL);
    }

    // 非 M3U8 ── 直接返回
    return createOtherResponse(request, body, 200, originHeaders, cfg.CACHE_TTL);
};

export const onOptions = () => new Response(null, { status: 204, headers: OPTIONS_HEADERS });