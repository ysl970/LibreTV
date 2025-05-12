// functions/proxy/[[path]].js

// 顶部常量区
const resolveCache = new Map();          // 共享解析缓存
const RE_URI = /URI\s*=\s*"([^"]+)"/g;   // 预编译正则
const RE_OTHER_URI = /(DATA-URI|IV|OTHER-URI-ATTR)\s*=\s*"([^"]+)"/gi;

// --- 常量/配置 ---
const resolveCache = new Map();
const DEFAULT_CACHE_TTL = 86400; // 24小时
const DEFAULT_MAX_RECURSION = 5;
const DEFAULT_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];
const KV_RAW_PREFIX = "proxy_raw:";
const KV_M3U8_PROCESSED_PREFIX = "m3u8_processed:";
const M3U8_CONTENT_TYPES = [
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'audio/mpegurl'
];
const COMMON_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};
const OPTIONS_HEADERS = {
    ...COMMON_HEADERS,
    "Access-Control-Max-Age": "86400"
};

// --- 工具函数 ---
export function parseNumberEnv(env, key, def) {
    const n = parseNumberEnv(env, key, 0);
    return isNaN(n) || n < 0 ? def : n;
}

export function parseJsonArrayEnv(env, key, def) {
    try {
        const arr = parseJsonArrayEnv(env, key, []);
        return Array.isArray(arr) && arr.length ? arr : def;
    } catch {
        return def;
    }
}

function getBaseUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        if (!url.pathname || url.pathname === '/') {
            return `${url.origin}/`;
        }
        const pathParts = url.pathname.split('/');
        pathParts.pop();
        const basePath = pathParts.join('/');
        return `${url.origin}${basePath}/`;
    } catch (e) {
        // 容错处理
        // 记录日志，表明URL解析失败，使用字符串回退逻辑
        console.log(`getBaseUrl: new URL() failed for '${urlStr}', using string fallback.`);

        const protocolEnd = urlStr.indexOf('://');
        if (protocolEnd === -1) return urlStr;
        const lastSlashIndex = urlStr.lastIndexOf('/');
        if (lastSlashIndex > protocolEnd + 2) {
            return urlStr.substring(0, lastSlashIndex + 1);
        }
        return urlStr.endsWith('/') ? urlStr : urlStr + '/';
    }
}

function getKvNamespace(env, logFn) {
    try {
        const kv = env.LIBRETV_PROXY_KV;
        if (!kv) {
            logFn("KV namespace 'LIBRETV_PROXY_KV' is not bound.");
            return null;
        }
        return kv;
    } catch (e) {
        logFn(`Error accessing KV: ${e.message}`);
        return null;
    }
}

function isM3u8Content(content, contentType) {
    if (contentType) {
        const lowerContentType = contentType.toLowerCase();
        if (M3U8_CONTENT_TYPES.some(ct => lowerContentType.includes(ct))) {
            return true;
        }
    }
    return typeof content === 'string' && content.trimStart().startsWith('#EXTM3U');
}

function logDebug(debugEnabled, message) {
    if (debugEnabled) console.log(`[Proxy Func] ${message}`);
}

function resolveUrl(baseUrl, relativeUrl, resolveCache, logFn) {
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
    const cacheKey = `${baseUrl}|${relativeUrl}`;
    if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey);
    try {
        const absoluteUrl = new URL(relativeUrl, baseUrl).toString();
        resolveCache.set(cacheKey, absoluteUrl);
        return absoluteUrl;
    } catch (e) {
        logFn(`URL resolution failed: baseUrl=${baseUrl}, relativeUrl=${relativeUrl}, error=${e.message}`);
        return relativeUrl;
    }
}

function rewriteUrlToProxy(targetUrl) {
    return `/proxy/${encodeURIComponent(targetUrl)}`;
}

function safeJsonParse(jsonString, defaultValue = null, logFn) {
    if (typeof jsonString !== 'string') return defaultValue;
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        if (logFn) logFn(`JSON parse error: ${e.message}`);
        return defaultValue;
    }
}
function safeJsonStringify(value, defaultValue = 'null', logFn) {
    try {
        return JSON.stringify(value);
    } catch (e) {
        if (logFn) logFn(`JSON stringify error: ${e.message}`);
        return defaultValue;
    }
}

// --- 响应辅助 ---

function createResponse(request, body, status = 200, headers = {}) {
    const responseHeaders = new Headers(headers);
    for (const [key, value] of Object.entries(COMMON_HEADERS)) {
        responseHeaders.set(key, value);
    }
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: OPTIONS_HEADERS });
    }
    return new Response(body, { status, headers: responseHeaders });
}
function createM3u8Response(request, content, cacheTtl) {
    return createResponse(request, content, 200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": `public, max-age=${cacheTtl}`
    });
}
function createOtherResponse(request, content, status, originalHeaders, cacheTtl) {
    // 1. 复制源站响应头
    const finalHeaders = new Headers(originalHeaders);

    // 2. 让 Cloudflare CDN 缓 24h（或你在 env.CACHE_TTL 里设的秒数）
    finalHeaders.set('Cache-Control', `public, max-age=${cacheTtl}`);
    finalHeaders.set('CDN-Cache-Control', `public, max-age=${cacheTtl}`);

    // 3. 清理掉源站可能带来的私有或禁止缓存指令
    finalHeaders.delete('Pragma');
    finalHeaders.delete('Expires');
    // 你也可以根据需要过滤 'set-cookie'、'authorization' 等 header

    return createResponse(request, content, status, finalHeaders);
}
function createFetchHeaders(originalRequest, targetUrl, userAgents) {
    const headers = new Headers();
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    headers.set('User-Agent', userAgent);
    headers.set('Accept', '*/*');
    headers.set('Accept-Language', originalRequest.headers.get('Accept-Language') || 'en-US,en;q=0.9');
    try {
        headers.set('Referer', new URL(targetUrl).origin);
    } catch (e) {
        const origReferer = originalRequest.headers.get('Referer');
        if (origReferer) headers.set('Referer', origReferer);
    }
    return headers;
}

// --- M3U8处理 ---

function processUriLine(line, baseUrl, resolveCache, logFn) {
    // 处理标准URI属性
    let processedLine = line.replace(/URI\s*=\s*"([^"]+)"/g, (match, uri) => {
        if (!uri) return match;
        const absoluteUri = resolveUrl(baseUrl, uri, resolveCache, logFn);
        logFn(`Processing URI: Original='${uri}', Absolute='${absoluteUri}'`);
        return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
    });

    // 处理其他可能包含URI的属性，如DATA-URI等
    // 注意: 这里的属性列表(DATA-URI|IV|OTHER-URI-ATTR)是一个通用占位符
    // 未来可考虑通过环境变量配置这个列表，以支持更多自定义M3U8标签
    // 例如: env.CUSTOM_URI_ATTRIBUTES="DATA-URI|IV|CUSTOM-ATTR1|CUSTOM-ATTR2"
    processedLine = processedLine.replace(/(DATA-URI|IV|OTHER-URI-ATTR)\s*=\s*"([^"]+)"/gi, (match, attr, uri) => {
        if (!uri || !uri.includes('://')) return match; // 只处理看起来像URL的值
        const absoluteUri = resolveUrl(baseUrl, uri, resolveCache, logFn);
        logFn(`Processing ${attr}: Original='${uri}', Absolute='${absoluteUri}'`);
        return `${attr}="${rewriteUrlToProxy(absoluteUri)}"`;
    });

    return processedLine;
}

function processMediaPlaylist(targetUrl, content, resolveCache, logFn) {
    const baseUrl = getBaseUrl(targetUrl);
    const lines = content.split('\n');
    const output = [];
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            if (output.length > 0 || lines.indexOf(line) < lines.length - 1) output.push('');
            continue;
        }
        if (trimmedLine.startsWith('#EXT-X-KEY') || trimmedLine.startsWith('#EXT-X-MAP')) {
            output.push(processUriLine(trimmedLine, baseUrl, resolveCache, logFn));
        } else if (trimmedLine.startsWith('#')) {
            output.push(trimmedLine);
        } else {
            const absoluteUrl = resolveUrl(baseUrl, trimmedLine, resolveCache, logFn);
            logFn(`Rewriting media segment: Original='${trimmedLine}', Absolute='${absoluteUrl}'`);
            output.push(rewriteUrlToProxy(absoluteUrl));
        }
    }
    let result = output.join('\n');
    if (content.endsWith('\n') && !result.endsWith('\n')) result += '\n';
    return result;
}

async function processMasterPlaylist(targetUrl, content, recursionDepth, context, config, resolveCache, logFn) {
    const { env, waitUntil } = context;
    const { MAX_RECURSION, CACHE_TTL } = config;
    if (recursionDepth > MAX_RECURSION) throw new Error(`Max recursion depth (${MAX_RECURSION}) exceeded while processing master playlist: ${targetUrl}`);
    const baseUrl = getBaseUrl(targetUrl);
    const lines = content.split('\n');
    // let bestVariantUrl = '';
    // for (let i = 0; i < lines.length; i++) {
    //     const trimmedLine = lines[i].trim();
    //     if (trimmedLine && !trimmedLine.startsWith('#') && (trimmedLine.toLowerCase().includes('.m3u8'))) {
    //         let prevLineIndex = i - 1;
    //         while (prevLineIndex >= 0 && !lines[prevLineIndex].trim()) prevLineIndex--;
    //         if (prevLineIndex >= 0) {
    //             const prevTrimmed = lines[prevLineIndex].trim();
    //              if (prevTrimmed.startsWith('#EXT-X-STREAM-INF') || prevTrimmed.startsWith('#EXT-X-MEDIA')) {
    //                 bestVariantUrl = resolveUrl(baseUrl, trimmedLine, resolveCache, logFn);
    //                 logFn(`Found variant stream URI: ${bestVariantUrl}`);
    //                 break;
    //             }
    //        }
    //        if (!bestVariantUrl && (trimmedLine.endsWith('.m3u8') || trimmedLine.includes('.m3u8?'))) {
    //             bestVariantUrl = resolveUrl(baseUrl, trimmedLine, resolveCache, logFn);
    //            logFn(`Found likely sub-playlist URI: ${bestVariantUrl}`);
    //              break;
    //         }
    //      }
    //   }

    // 使用正则一次捕获第一个 .m3u8 行，有清晰度之后用上面的
    const match = content.match(/[^\r\n#]+\.m3u8[^\r\n]*/i);
    const bestVariantUrl = match
        ? resolveUrl(baseUrl, match[0].trim(), resolveCache, logFn)
        : '';
    logFn(`Found variant (regex): ${bestVariantUrl || 'none'}`);

    if (!bestVariantUrl) {
        // 添加更详细的警告日志
        if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
            logFn(`WARNING: Playlist appears to be a master playlist with variants, but no valid variant URLs were found. Falling back to media playlist processing for: ${targetUrl}`);
        } else {
            logFn(`No suitable variant/sub-playlist URI found, treating as media playlist: ${targetUrl}`);
        }
        return processMediaPlaylist(targetUrl, content, resolveCache, logFn);
    }
    logFn(`Selected variant/sub-playlist URL: ${bestVariantUrl}`);
    const kvNamespace = getKvNamespace(env, logFn);
    const cacheKey = `${KV_M3U8_PROCESSED_PREFIX}${bestVariantUrl}`;
    if (kvNamespace) {
        try {
            const cachedContent = await kvNamespace.get(cacheKey);
            if (cachedContent) {
                logFn(`[Cache Hit - Processed M3U8]`);
                return cachedContent;
            }
            logFn(`[Cache Miss - Processed M3U8]`);
        } catch (kvError) {
            logFn(`KV get error for processed key: ${kvError.message}`);
        }
    }
    const { content: variantContent, contentType: variantType } = await fetchContentWithType(
        bestVariantUrl, context.request, config, logFn
    );
    if (!isM3u8Content(variantContent, variantType)) {
        logFn(`Fetched content NOT M3U8, fallback to media playlist`);
        return processMediaPlaylist(targetUrl, content, resolveCache, logFn);
    }
    const processedVariant = await processM3u8Recursive(
        bestVariantUrl, variantContent, variantType, recursionDepth + 1,
        context, config, resolveCache, logFn
    );
    if (kvNamespace && processedVariant) {
        try {
            waitUntil(
                kvNamespace.put(cacheKey, processedVariant, { expirationTtl: CACHE_TTL })
                    .catch(kvPutError => logFn(`[Cache Write Error - Processed M3U8 Background]: ${kvPutError.message}`))
            );
            logFn(`[Cache Write - Processed M3U8] Operation sent to background.`);
        } catch (immediateKvPutError) {
            logFn(`[Cache Write Error - Processed M3U8 Immediate]: ${immediateKvPutError.message}`);
        }
    }
    return processedVariant;
}

async function processM3u8Recursive(targetUrl, content, contentType, recursionDepth, context, config, resolveCache, logFn) {
    const isMaster = content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:');
    if (isMaster) {
        logFn(`Processing as Master Playlist: ${targetUrl}`);
        return await processMasterPlaylist(targetUrl, content, recursionDepth, context, config, resolveCache, logFn);
    } else {
        logFn(`Processing as Media Playlist: ${targetUrl}`);
        return processMediaPlaylist(targetUrl, content, resolveCache, logFn);
    }
}

async function fetchContentWithType(targetUrl, originalRequest, config, logFn) {
    const fetchHeaders = createFetchHeaders(originalRequest, targetUrl, config.USER_AGENTS);
    logFn(`Fetching: ${targetUrl} with User-Agent: ${fetchHeaders.get('User-Agent')}`);
    let response;
    try {
        response = await fetch(targetUrl, { headers: fetchHeaders, redirect: 'follow' });
    } catch (error) {
        logFn(`Fetch network error: ${error.message}`);
        throw new Error(`Network error while fetching ${targetUrl}: ${error.message}`);
    }
    if (!response.ok) {
        const errorBody = await response.text().catch(() => '[Could not read error body]');
        logFn(`Fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error ${response.status} (${response.statusText}) fetching ${targetUrl}. Body: ${errorBody.substring(0, 200)}`);
    }
    const bodyStream = response.body;     // ReadableStream
    const contentType = response.headers.get('Content-Type') || '';
    logFn(`Fetch success: ${targetUrl}, Content-Type: ${contentType}`);
    return { content, contentType, responseHeaders: response.headers };
}

// --- 主处理入口 ---

export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);

    // 开启/关闭debug日志
    const DEBUG_ENABLED = env.DEBUG === 'true';
    const log = (msg) => logDebug(DEBUG_ENABLED, msg);

    // 1. 读取/校验配置
    const CACHE_TTL = parseNumberEnv(env, "CACHE_TTL", 86400);
    if (isNaN(CACHE_TTL) || CACHE_TTL < 0) {
        log(`Invalid CACHE_TTL value "${env.CACHE_TTL}". Using default: ${DEFAULT_CACHE_TTL}`);
        CACHE_TTL = DEFAULT_CACHE_TTL;
    }
    const MAX_RECURSION = parseNumberEnv(env, 'MAX_RECURSION', 3);
    if (isNaN(MAX_RECURSION) || MAX_RECURSION < 0) {
        log(`Invalid MAX_RECURSION value "${env.MAX_RECURSION}". Using default: ${DEFAULT_MAX_RECURSION}`);
        MAX_RECURSION = DEFAULT_MAX_RECURSION;
    }
    let USER_AGENTS = DEFAULT_USER_AGENTS;
    const agentsJson = env.USER_AGENTS_JSON;
    if (agentsJson) {
        const parsedAgents = safeJsonParse(agentsJson, null, log);
        if (Array.isArray(parsedAgents) && parsedAgents.length > 0 && parsedAgents.every(ua => typeof ua === 'string')) {
            USER_AGENTS = parsedAgents;
            log(`Loaded ${USER_AGENTS.length} User-Agents from env.`);
        } else {
            log("Env variable USER_AGENTS_JSON was invalid or empty. Using default User-Agents.");
        }
    } else {
        log("Env variable USER_AGENTS_JSON not set. Using default User-Agents.");
    }

    const config = { DEBUG_ENABLED, CACHE_TTL, MAX_RECURSION, USER_AGENTS };

    // ------ 目标URL提取逻辑 ------
    const encodedUrlPart = url.pathname.replace(/^\/proxy\//, '');
    let targetUrl = '';
    if (encodedUrlPart) {
        try {
            let decoded = decodeURIComponent(encodedUrlPart);
            if (/^https?:\/\//i.test(decoded)) {
                targetUrl = decoded;
            } else if (/^https?:\/\//i.test(encodedUrlPart)) {
                targetUrl = encodedUrlPart;
                log(`Warning: Path part "${encodedUrlPart}" was not URI encoded but looks like a URL.`);
            } else {
                log(`Invalid target URL format after decoding: ${decoded}`);
            }
        } catch (e) {
            log(`Error decoding path part "${encodedUrlPart}": ${e.message}`);
            if (/^https?:\/\//i.test(encodedUrlPart)) {
                targetUrl = encodedUrlPart;
                log(`Warning: Path part "${encodedUrlPart}" failed decoding but looks like a URL.`);
            }
        }
    }
    if (!targetUrl) {
        log(`Failed to extract valid target URL from path: ${url.pathname}`);
        return createResponse(request, "Invalid proxy request: Missing or invalid target URL in path.", 400);
    }
    log(`Processing request for target URL: ${targetUrl}`);

    try {
        const kvNamespace = getKvNamespace(env, log);
        const rawCacheKey = `${KV_RAW_PREFIX}${targetUrl}`;
        let cachedRawData = null;

        // -- 尝试KV原始缓存 --
        if (kvNamespace) {
            try {
                const cachedRawJson = await kvNamespace.get(rawCacheKey);
                if (cachedRawJson) {
                    log(`[Cache Hit - Raw]`);
                    cachedRawData = safeJsonParse(cachedRawJson, null, log);
                    if (!cachedRawData || typeof cachedRawData.body !== 'string' || typeof cachedRawData.headers !== 'object') {
                        log(`[Cache Invalid - Raw] Bad format. Ignoring.`);
                        cachedRawData = null;
                    }
                } else {
                    log(`[Cache Miss - Raw]`);
                }
            } catch (kvError) {
                log(`KV get error for raw key: ${kvError.message}`);
            }
        }

        let content, contentType, responseHeaders;
        if (cachedRawData) {
            content = cachedRawData.body;
            // 直接使用headers对象，不需要再解析
            responseHeaders = new Headers(cachedRawData.headers);
            contentType = responseHeaders.get('content-type') || '';
            log(`Using cached raw content. Content-Type: ${contentType}`);
        } else {
            // 没有缓存，真实请求源站
            const fetchedData = await fetchContentWithType(targetUrl, request, config, log);
            content = fetchedData.content;
            contentType = fetchedData.contentType;
            responseHeaders = fetchedData.responseHeaders;

            // ------- KV 写入逻辑（防错，小白友好） -------
            if (kvNamespace) {
                // 将响应的Headers变成普通对象
                const headersObj = {};
                responseHeaders.forEach((value, key) => {
                    headersObj[key.toLowerCase()] = value;
                });
                // 有header就写缓存
                if (Object.keys(headersObj).length > 0) {
                    // 直接存储headers对象，不再进行二次字符串化
                    const cacheData = {
                        body: content,
                        headers: headersObj
                    };
                    const stringifiedValue = safeJsonStringify(cacheData, null, log);
                    if (stringifiedValue) {
                        try {
                            waitUntil(
                                kvNamespace.put(rawCacheKey, stringifiedValue, { expirationTtl: CACHE_TTL })
                                    .catch(kvPutError => log(`[Cache Write Error - Raw KV Background]: ${kvPutError.message}`))
                            );
                            log(`[Cache Write - Raw] Operation sent to background.`);
                        } catch (immediateKvPutError) {
                            log(`[Cache Write Error - Raw KV Immediate]: ${immediateKvPutError.message}`);
                        }
                    } else {
                        log(`[Cache Write Skipped - Raw] Stringification of value failed.`);
                    }
                } else {
                    log(`[Cache Write Error - Raw] serialize headers fail`);
                }
            }
            // ------- 结束 -------
        }

        // M3U8智能处理/直出
        if (isM3u8Content(content, contentType)) {
            log(`Content is M3U8, processing`);
            const resolveCache = new Map();
            const processedM3u8 = await processM3u8Recursive(
                targetUrl,
                content,
                contentType,
                0,
                context,
                config,
                resolveCache,
                log
            );
            return createM3u8Response(request, processedM3u8, CACHE_TTL);
        } else {
            log(`Content is not M3U8 (Type: ${contentType}), return direct`);
            return createOtherResponse(request, content, 200, responseHeaders, CACHE_TTL);
        }
    } catch (error) {
        log(`!!! Critical Error: ${error.message}\n${error.stack}`);
        return createResponse(request, `Proxy error: ${error.message}`, 500);
    }
}


export async function onOptions(context) {
    // CORS 预检支持
    return new Response(null, {
        status: 204,
        headers: OPTIONS_HEADERS,
    });
}