
// functions/proxy/[[path]].js
// -----------------------------------------------------------------------------
//     • 智能缓存 & M3U8 重写
// -----------------------------------------------------------------------------

import { kvHelper } from "../utils/kv-helper.js";

// -----------------------------------------------------------------------------
//  常量与正则
// -----------------------------------------------------------------------------
const RE_URI = /URI\s*=\s*"([^"]+)"/g;
const RE_OTHER_URI = /\b([A-Z0-9_-]*?URI)\s*=\s*"([^"]+)"/gi;

const DEFAULT_CACHE_TTL = 86400; // 24 h
const DEFAULT_MAX_RECURSION = 5;
const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
];
const DEFAULT_LARGE_MAX_MB = 32; // 超过此阈值即视为“大文件”

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
const OPTIONS_HEADERS = { ...COMMON_HEADERS, "Access-Control-Max-Age": "86400" };

// --- 开始粘贴 新增的广告规则和stripAds函数 ---
const AD_KEYWORDS = [
  '/ads/',
  'advertis',
  '//ad.', // 注意这个是匹配域名开头的 ad.
  '.com/ad/',
  '.com/ads/',
  'tracking',
  'doubleclick.net',
  'googleads.g.doubleclick.net',
  'googlesyndication.com',
  'imasdk.googleapis.com',
  'videoad',
  'preroll',
  'midroll',
  'postroll',
  'imasdk',
  // 您可以根据实际遇到的广告源添加更多关键词
];

const AD_REGEX_RULES = [
  /^https?:\/\/[^\/]*?adserver\.[^\/]+\//i,
  /^https?:\/\/[^\/]*?sponsor\.[^\/]+\//i,
  /\/advertisements\//i,
  // 更多自定义的正则表达式规则
];
// JS 允许正则里出现换行，但禁止使用 /x，所以最保险的写法还是单行：
const AD_TRIGGER_RE = /#EXT(?:-X)?-(?:CUE|SCTE35|DATERANGE).*?(?:CLASS="?ad"?|CUE-OUT|SCTE35-OUT|PLACEMENT-OPPORTUNITY|SCTE35-OUT-CONT)/i;

const AD_END_RE = /#EXT(?:-X)?-(?:CUE|SCTE35|DATERANGE).*?(?:CUE-IN|SCTE35-IN|PLACEMENT-OPPORTUNITY-END)/i;

// LL‑HLS 部分片保持不变
const PART_RE = /^#EXT-X-PART:.*URI="([^"]+)"/i;


const SKIP_RE = /#EXT-X-SKIP:SKIPPED-SEGMENTS=(\d+)/; // 用于处理 LL-HLS 跳过片段

const stripAdsFromServer = (content, adFilteringEnabled = true, logFn = console.log) => {
  if (!adFilteringEnabled) {
    logFn('[AdBlocker Server] Ad filtering is disabled by switch.');
    return content;
  }

  let inAdSegment = false; // 标记是否处于一个由CUE或DATERANGE标记的广告段内
  let skipCounter = 0;   // 用于 #EXT-X-SKIP
  const lines = content.split(/\r?\n/);
  const filteredLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (AD_TRIGGER_RE.test(trimmedLine)) {
      inAdSegment = true;
      logFn(`[AdBlocker Server] Ad segment start detected by TRIGGER_RE: ${trimmedLine}`);
      filteredLines.push("#EXT-X-DISCONTINUITY"); // 可以选择性加入一个 discontinuity 标记广告被移除
      continue; // 移除广告标记行本身
    }

    if (inAdSegment && AD_END_RE.test(trimmedLine)) {
      inAdSegment = false;
      logFn(`[AdBlocker Server] Ad segment end detected by END_RE: ${trimmedLine}`);
      // 移除广告结束标记行本身，通常不需要加 discontinuity，因为内容会自然衔接
      continue;
    }

    if (inAdSegment) {
      // 连带 LL-HLS PART 一并丢弃
      if (PART_RE.test(trimmedLine)) { logFn(`[AdBlock] skip PART in ad`); }
      continue;
    }

    // 处理 #EXT-X-SKIP
    const skipMatch = trimmedLine.match(SKIP_RE);
    if (skipMatch) {
      const numToSkip = parseInt(skipMatch[1], 10);
      if (!isNaN(numToSkip) && numToSkip > 0) {
        skipCounter = numToSkip;
        logFn(`[AdBlocker Server] #EXT-X-SKIP detected, will skip next ${skipCounter} segments.`);
      }
      continue; // 移除 #EXT-X-SKIP 这一行
    }

    if (skipCounter > 0 && !trimmedLine.startsWith("#") && trimmedLine.length > 0) {
      logFn(`[AdBlocker Server] Skipping segment due to #EXT-X-SKIP: ${trimmedLine}`);
      skipCounter--;
      // 同时，通常也需要移除这个被跳过分片之前的 #EXTINF (如果存在)
      if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
        logFn(`[AdBlocker Server] Removing #EXTINF for skipped segment: ${filteredLines[filteredLines.length - 1]}`);
        filteredLines.pop();
      }
      continue;
    }


    // 如果不是元数据行 (即可能是分片URL)
    if (!trimmedLine.startsWith("#") && trimmedLine.length > 0) {
      let isAdUrl = false;
      for (const keyword of AD_KEYWORDS) {
        if (trimmedLine.toLowerCase().includes(keyword.toLowerCase())) {
          isAdUrl = true;
          logFn(`[AdBlocker Server] Ad URL detected by keyword '${keyword}': ${trimmedLine}`);
          break;
        }
      }
      if (!isAdUrl) {
        for (const regex of AD_REGEX_RULES) {
          if (regex.test(trimmedLine)) {
            isAdUrl = true;
            logFn(`[AdBlocker Server] Ad URL detected by regex '${regex.source}': ${trimmedLine}`);
            break;
          }
        }
      }

      if (isAdUrl) {
        // 移除这个广告URL之前紧邻的 #EXTINF (如果存在)
        if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
          logFn(`[AdBlocker Server] Removing #EXTINF for ad URL: ${filteredLines[filteredLines.length - 1]}`);
          filteredLines.pop();
        }
        // (可选，如果 #EXTINF 和 URL 之间还有其他特定标签)
        // else if (filteredLines.length > 1 && filteredLines[filteredLines.length - 2].startsWith("#EXTINF:")) {
        //    filteredLines.splice(-2, 1);
        // }
        logFn(`[AdBlocker Server] Skipping ad URL: ${trimmedLine}`);
        continue; // 不添加这行广告URL
      }
    }
    // 非广告行或不需要处理的元数据行，则添加到结果中
    filteredLines.push(line);
  }
  return filteredLines.join("\n");
};
// --- 粘贴结束 新增的广告规则和stripAdsFromServer函数 ---


// -----------------------------------------------------------------------------
//  工具函数
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

// 取 URL 目录部分
const getBaseUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!url.pathname || url.pathname === "/") return `${url.origin}/`;
    const parts = url.pathname.split("/");
    parts.pop();
    return `${url.origin}${parts.join("/")}/`;
  } catch {
    const protoEnd = urlStr.indexOf("://");
    if (protoEnd === -1) return urlStr;
    const lastSlash = urlStr.lastIndexOf("/");
    return lastSlash > protoEnd + 2
      ? urlStr.slice(0, lastSlash + 1)
      : urlStr.endsWith("/")
        ? urlStr
        : `${urlStr}/`;
  }
};

const isM3u8Content = (content, contentType) =>
  (contentType &&
    M3U8_CONTENT_TYPES.some((ct) => contentType.toLowerCase().includes(ct))) ||
  (typeof content === "string" && content.trimStart().startsWith("#EXTM3U"));

const logDebug = (debugEnabled, msg) => {
  if (debugEnabled) console.log(`[Proxy] ${msg}`);
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
    logFn(`URL resolve failed (${relativeUrl}): ${e.message}`);
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

// -- Base64 辅助（分块 atob，突破 50 MB 限制）-----------------------------
const abToBase64 = (ab) => {
  const u8 = new Uint8Array(ab);
  const CHUNK = 0x8000;
  const parts = [];
  for (let i = 0; i < u8.length; i += CHUNK) {
    parts.push(String.fromCharCode(...u8.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
};

const base64ToAb = (b64) => {
  const CHUNK = 0x8000;
  let pos = 0;
  const len = b64.length;
  const bytes = new Uint8Array((len >> 2) * 3 + 3);
  let offset = 0;
  while (pos < len) {
    const slice = b64.slice(pos, pos + CHUNK);
    const bin = atob(slice);
    for (let i = 0; i < bin.length; i++) bytes[offset++] = bin.charCodeAt(i);
    pos += CHUNK;
  }
  return bytes.subarray(0, offset).buffer;
};

// -----------------------------------------------------------------------------
//  响应包装
// -----------------------------------------------------------------------------
const createResponse = (request, body, status = 200, headers = {}) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: OPTIONS_HEADERS });
  return new Response(body, { status, headers: { ...COMMON_HEADERS, ...headers } });
};

const createM3u8Response = (request, body, ttl) =>
  createResponse(request, body, 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": `public, max-age=${ttl}`,
  });

// ——细抠 #6：同时写 Surrogate-Control + CDN-Cache-Control------------------- ★
const stripHopByHopHeaders = (headers) =>
  [
    "set-cookie",
    "cookie",
    "authorization",
    "www-authenticate",
    "proxy-authenticate",
    "server",
    "x-powered-by",
  ].forEach((h) => headers.delete(h));

const createOtherResponse = (request, body, status, originHeaders, ttl) => {
  const h = new Headers(originHeaders);
  stripHopByHopHeaders(h);
  const browserTtl = Math.max(1, Math.floor(ttl / 4));
  h.set("Cache-Control", `public, max-age=${browserTtl}`);
  h.set("Surrogate-Control", `public, max-age=${ttl}`);
  h.set("CDN-Cache-Control", `public, max-age=${ttl}`); // ★
  return createResponse(request, body, status, h);
};

// -----------------------------------------------------------------------------
//  网络抓取
// -----------------------------------------------------------------------------
const createFetchHeaders = (req, targetUrl, agents) => {
  const h = new Headers();
  h.set("User-Agent", agents[Math.floor(Math.random() * agents.length)]);
  // 细抠 #5：再加 image/*，提高极端源站兼容性 ----------------------------- ★
  h.set(
    "Accept",
    "application/x-mpegurl, video/*;q=0.75, image/*;q=0.6, application/json;q=0.6, */*;q=0.5",
  );
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

// --①：无 Content-Length 时流式阈值探测 + 安全返回 ArrayBuffer ------------- ★
const decideStreamOrBuffer = async (resp, isText, threshold, logFn) => {
  const reader = resp.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (!isText && total > threshold) {
      logFn("switch → stream (size exceeded)");
      const tailStream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          const pump = () =>
            reader
              .read()
              .then(({ value, done }) => {
                if (done) {
                  controller.close();
                  return;
                }
                controller.enqueue(value);
                return pump();
              })
              .catch((e) => controller.error(e)); // 细抠 #2：捕获上游异常 ★
          pump();
        },
      });
      return { content: tailStream, isStream: true };
    }
  }

  // 未超阈值：合并缓冲并拷贝 ArrayBuffer，彻底与原 Uint8Array 解耦 ——细抠 #1
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const arrBuf = buf.slice().buffer; // ★
  return { content: isText ? new TextDecoder().decode(buf) : arrBuf, isStream: false };
};

/**
 * 抓取任意资源。
 * @returns {{content:string|ArrayBuffer|ReadableStream, contentType:string,
 *            responseHeaders:Headers, isStream:boolean}}
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
    const msg = (await resp.text().catch(() => "<unreadable>")).slice(0, 80);
    throw new Error(`HTTP ${resp.status}: ${msg}`);
  }

  const contentType = resp.headers.get("Content-Type") || "";
  const isText =
    /^text\//i.test(contentType) ||
    M3U8_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t));

  const contentLength = Number(resp.headers.get("Content-Length") || 0);

  if (!isText && contentLength > cfg.LARGE_MAX_BYTES) {
    return { content: resp.body, contentType, responseHeaders: resp.headers, isStream: true };
  }

  if (!isText && contentLength === 0) {
    const { content, isStream } = await decideStreamOrBuffer(
      resp,
      isText,
      cfg.LARGE_MAX_BYTES,
      logFn,
    );
    return { content, contentType, responseHeaders: resp.headers, isStream };
  }

  const buf = await resp.arrayBuffer();
  const content = isText ? new TextDecoder().decode(buf) : buf;
  return { content, contentType, responseHeaders: resp.headers, isStream: false };
};

// -----------------------------------------------------------------------------
//  M3U8 处理
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

const processMediaPlaylist = (targetUrl, content, cache, logFn, adFilteringEnabled = true) => {
  logFn(`[Proxy] Processing media playlist. Ad filtering server-side: ${adFilteringEnabled}`);

  // 第一步：使用 stripAdsFromServer 移除广告标记和广告分片
  const adFreeContent = stripAdsFromServer(content, adFilteringEnabled, logFn);

  // 第二步：对处理后的内容进行URI重写 (与您之前的逻辑类似)
  const base = getBaseUrl(targetUrl);
  const newline = /\r\n/.test(adFreeContent) ? "\r\n" : "\n"; // 注意基于 adFreeContent 判断换行符
  const lines = adFreeContent.split(/\r?\n/);
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      // processedLines.push(""); // 根据需要是否保留空行
      continue;
    }

    if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP")) {
      processedLines.push(processUriLine(t, base, cache, logFn));
    } else if (t.startsWith("#")) {
      processedLines.push(t); // 其他元数据行直接保留
    } else if (t.startsWith('#EXT-X-PART')) {
      // 把 PART URI 提取出来再走关键词/正则检测
      const m = t.match(/URI="([^"]+)"/i);
      const partUri = m ? m[1] : '';
      if (adFilteringEnabled && (isUriAd(partUri))) {
        logFn(`[AdBlock] PART uri looks like ad, skip`);
        continue;
      }
      processedLines.push(processUriLine(t, base, cache, logFn));
    } else {
      const abs = resolveUrl(base, t, cache, logFn);
      processedLines.push(rewriteUrlToProxy(abs));
    }
  }
  return processedLines.join(newline);
};

/** 寻找首个变体 URL（支持 STREAM‑INF 与 MEDIA）。 */
const findFirstVariantUrl = (content, baseUrl, cache, logFn, adFilteringEnabled) => {
  const lines = content.split(/\r?\n/);
  const isAdLine = (l) =>
    /#EXT-X-STREAM-INF/i.test(l) && /(ad|promo|preroll)/i.test(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
        if (adFilteringEnabled && /#EXT-X-STREAM-INF/i.test(l) && /ad|promo|preroll/i.test(l)) {
            logFn(`[Proxy] Skipping ad variant: ${l}`);
            continue;
          }
    if (isAdLine(lines[i]) && adFilteringEnabled) {   // ★ 跳过广告码率档
      logFn(`[AdBlock] variant line looks like ad → skip`);
      // 跳到下一条 #EXT-X-STREAM-INF
      while (i < lines.length && !lines[i].startsWith('#EXT-X-STREAM-INF')) i++;
      continue;
    }
  }
  return "";
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
  adFilteringEnabled = true // <--- 新增参数
) => {
  if (depth > cfg.MAX_RECURSION) throw new Error("Max recursion depth reached");

  const variantUrl = findFirstVariantUrl(content, getBaseUrl(targetUrl), cache, logFn);

  if (!variantUrl) {
    logFn("[Proxy] No variant found in master playlist – falling back to treat as media playlist.");
    // 如果主播放列表没有有效的子播放列表链接，尝试直接作为媒体播放列表处理
    return processMediaPlaylist(targetUrl, content, cache, logFn, adFilteringEnabled); // <--- 传递
  }

  const cacheKey = `<span class="math-inline">\{KV\_M3U8\_PROCESSED\_PREFIX\}</span>{variantUrl}`; // 使用子列表URL作为处理后缓存的键
  const processedHit = kv ? await kv.get(cacheKey) : null;
  if (processedHit) {
    logFn(`[Proxy KV Hit] Returning processed M3U8 for variant: ${variantUrl}`);
    return processedHit;
  }

  // 获取并处理子播放列表 (variant stream)
  const { content: varContent, contentType: varContentType } = await fetchContentWithType(
    variantUrl,
    ctx.request,
    cfg,
    logFn,
  );

  if (typeof varContent !== 'string') { // 确保内容是字符串
    logFn(`[Proxy] Variant content for ${variantUrl} is not a string, attempting to decode.`);
    // 如果是 ArrayBuffer，尝试解码
    // (您可能需要根据 fetchContentWithType 的返回类型调整这里的逻辑)
    // 假设 varContent 是 ArrayBuffer
    // varContent = new TextDecoder().decode(varContent);
    // 如果 fetchContentWithType 保证M3U8内容总是字符串，则此检查可能不需要
  }


  const processedVariant = await processM3u8Recursive( // 递归调用
    variantUrl, // 子列表的URL
    varContent, // 子列表的内容
    varContentType, // 子列表的类型
    depth + 1,
    ctx,
    cfg,
    cache,
    logFn,
    kv,
    adFilteringEnabled // <--- 传递开关状态给递归调用
  );

  if (kv) {
    kv.put(cacheKey, processedVariant, { expirationTtl: cfg.CACHE_TTL })
      .catch((e) => logFn(`[Proxy KV Error] Failed to put processed M3U8 for ${variantUrl}: ${e.message}`));
  }
  return processedVariant;
};

const processM3u8Recursive = async (
  targetUrl, content, contentType, depth, ctx, cfg, cache, logFn, kv,
  adFilteringEnabled = true
) => {
  const isMaster = content.includes("#EXT-X-STREAM-INF") || content.includes("#EXT-X-MEDIA:");
  return isMaster
    ? processMasterPlaylist(targetUrl, content, depth, ctx, cfg, cache, logFn, kv, adFilteringEnabled)
    : processMediaPlaylist(targetUrl, content, cache, logFn, adFilteringEnabled);
};

// -----------------------------------------------------------------------------
//  主处理函数
// -----------------------------------------------------------------------------
// functions/proxy/[[path]].js

export const onRequest = async (ctx) => {
  const { request, env } = ctx;
  const DEBUG = env.DEBUG === "true";
  const log = (m) => DEBUG && console.log(`[LibreTV Proxy] ${m}`); // 稍微修改了日志前缀
  const cfg = {
    CACHE_TTL: parseNumberEnv(env, "CACHE_TTL", DEFAULT_CACHE_TTL),
    MAX_RECURSION: parseNumberEnv(env, "MAX_RECURSION", DEFAULT_MAX_RECURSION),
    USER_AGENTS: parseJsonArrayEnv(env, "USER_AGENTS_JSON", DEFAULT_USER_AGENTS),
    LARGE_MAX_BYTES:
      parseNumberEnv(env, "LARGE_MAX_MB", DEFAULT_LARGE_MAX_MB) * 1024 * 1024,
  };

  const { pathname, search } = new URL(request.url); // 从 request.url 获取 pathname 和 search
  const encodedTargetUrlInPath = pathname.slice(7); //  假设代理路径总是 /proxy/
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(encodedTargetUrlInPath);
  } catch {
    targetUrl = encodedTargetUrlInPath;
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    return createResponse(request, "Bad Request: invalid target URL in path", 400);
  }
  log(`Target URL from path: ${targetUrl}`);

  // --- 获取“分片广告过滤”开关状态 ------------------------------------------
  const adFilterParam = new URL(request.url).searchParams.get('ad_filter_enabled');

  /**
   * 逻辑：
   *   -   URL 没带参数   →  默认 **开启**
   *   -   ad_filter_enabled=true   →  开启
   *   -   ad_filter_enabled=false  →  关闭
   */
  const serverAdFilteringEnabled = adFilterParam !== 'false';

  log(
    `[Proxy] Server-side ad filtering is ${serverAdFilteringEnabled ? 'ENABLED' : 'DISABLED'
    } (param=${adFilterParam})`
  );

  const kv = env.LIBRETV_PROXY_KV ? kvHelper(env.LIBRETV_PROXY_KV, cfg.CACHE_TTL, log) : null;

  const rawKey = `${KV_RAW_PREFIX}${targetUrl}`;
  const rawVal = kv ? await kv.get(rawKey) : null;
  const rawCacheObj = rawVal ? safeJsonParse(rawVal, null, log) : null;

  let body, contentType, originHeaders;

  if (rawCacheObj) {
    log("[Proxy KV Hit] Raw content cache hit.");
    body = rawCacheObj.isBase64 ? base64ToAb(rawCacheObj.body) : rawCacheObj.body;
    originHeaders = new Headers(Object.entries(rawCacheObj.headers));
    contentType = originHeaders.get("content-type") || "";
  } else {
    log(`[Proxy] Raw content cache miss. Fetching from origin: ${targetUrl}`);
    try {
      const fetched = await fetchContentWithType(targetUrl, request, cfg, log);
      body = fetched.content;
      contentType = fetched.contentType;
      originHeaders = fetched.responseHeaders;

      if (kv && !fetched.isStream) {
        // ... (写入 raw 缓存的逻辑) ...
      }
    } catch (fetchErr) {
      log(`[Proxy Fetch Error] Failed to fetch content from origin: ${fetchErr.message}`);
      return createResponse(request, `Error fetching origin content: ${fetchErr.message}`, 502);
    }
  }


  if (isM3u8Content(body, contentType)) {
    log(`[Proxy] M3U8 content detected for ${targetUrl}. Processing...`);
    let m3u8TextContent = "";
    if (typeof body === 'string') {
      m3u8TextContent = body;
    } else if (body instanceof ArrayBuffer) {
      try {
        m3u8TextContent = new TextDecoder().decode(body);
      } catch (decodeError) {
        log(`[Proxy Error] Failed to decode M3U8 ArrayBuffer: ${decodeError.message}`);
        return createResponse(request, "Error decoding M3U8 content", 500);
      }
    } else {
      log(`[Proxy Error] M3U8 content is of unexpected type: ${typeof body}`);
      return createResponse(request, "Unexpected M3U8 content type", 500);
    }

    const urlForCacheAndProcessing = targetUrl; // 使用原始目标URL作为缓存和处理的基准

    const processedM3u8Key = `${KV_M3U8_PROCESSED_PREFIX}${targetUrl}_filter-${serverAdFilteringEnabled}`;
    const cachedProcessedM3u8 = kv ? await kv.get(processedM3u8Key) : null;

    if (cachedProcessedM3u8) {
      log(`[Proxy KV Hit] Returning pre-processed M3U8 from cache (filter: ${serverAdFilteringEnabled}) for: ${urlForCacheAndProcessing}`);
      return createM3u8Response(request, cachedProcessedM3u8, cfg.CACHE_TTL);
    }

    const recursionCache = new Map(); // 本次请求的递归处理缓存
    const processedM3u8 = await processM3u8Recursive(
      urlForCacheAndProcessing, // 使用原始 targetUrl
      m3u8TextContent,
      contentType,
      0, // initial depth
      ctx,
      cfg,
      recursionCache,
      log,
      kv, // 传递KV store实例
      serverAdFilteringEnabled // <--- 传递开关状态
    );

    if (kv) {
      kv.put(processedM3u8Key, processedM3u8, { expirationTtl: cfg.CACHE_TTL })
        .catch(e => log(`[Proxy KV Error] Failed to cache processed M3U8: ${e.message}`));
    }
    return createM3u8Response(request, processedM3u8, cfg.CACHE_TTL);
  }

  log(`[Proxy] Non-M3U8 content detected for ${targetUrl}. Passing through.`);
  return createOtherResponse(request, body, 200, originHeaders, cfg.CACHE_TTL);
};

// -----------------------------------------------------------------------------
//  CORS 预检
// -----------------------------------------------------------------------------
export const onOptions = () => new Response(null, { status: 204, headers: OPTIONS_HEADERS });