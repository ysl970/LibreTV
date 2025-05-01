// functions/proxy/[[path]].js

// --- Constants ---
const DEFAULT_CACHE_TTL = 86400; // 24 hours in seconds
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
    "Access-Control-Max-Age": "86400", // 24 hours
};

// --- Utility Functions (Alphabetical Order) ---


function getBaseUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        // Handle cases like http://example.com (no path) or http://example.com/
        if (!url.pathname || url.pathname === '/') {
            return `${url.origin}/`;
        }
        // Get path parts, remove the filename part
        const pathParts = url.pathname.split('/');
        pathParts.pop(); // Remove the last part (filename or empty string if ends with /)
        // Join parts and ensure it ends with a slash
        const basePath = pathParts.join('/');
        return `${url.origin}${basePath}/`;
    } catch (e) {
        console.error(`[Util Error] Failed to parse URL for getBaseUrl: ${urlStr} - ${e.message}`);
        // Fallback: try to find the last '/' after the protocol part
        const protocolEnd = urlStr.indexOf('://');
        if (protocolEnd === -1) return urlStr; // Cannot determine protocol
        const lastSlashIndex = urlStr.lastIndexOf('/');
        if (lastSlashIndex > protocolEnd + 2) {
            return urlStr.substring(0, lastSlashIndex + 1);
        }
        // If no path slashes found, assume root
        return urlStr.endsWith('/') ? urlStr : urlStr + '/';
    }
}


function getKvNamespace(env, logFn) {
    try {
        const kv = env.LIBRETV_PROXY_KV;
        if (!kv) {
            logFn("KV namespace 'LIBRETV_PROXY_KV' is not bound or configured in environment.");
            return null;
        }
        return kv;
    } catch (e) {
        logFn(`Error accessing KV namespace 'LIBRETV_PROXY_KV': ${e.message}`);
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
    // Fallback check based on content, handling potential null/undefined
    return typeof content === 'string' && content.trimStart().startsWith('#EXTM3U');
}


function logDebug(debugEnabled, message) {
    if (debugEnabled) {
        console.log(`[Proxy Func] ${message}`);
    }
}

function resolveUrl(baseUrl, relativeUrl, resolveCache, logFn) {
    // If it's already absolute, return it directly.
    if (/^https?:\/\//i.test(relativeUrl)) {
        return relativeUrl;
    }

    // Check cache first
    const cacheKey = `${baseUrl}|${relativeUrl}`; // Combine base and relative for unique key
    if (resolveCache.has(cacheKey)) {
        return resolveCache.get(cacheKey);
    }

    try {
        const absoluteUrl = new URL(relativeUrl, baseUrl).toString();
        resolveCache.set(cacheKey, absoluteUrl); // Cache the result
        return absoluteUrl;
    } catch (e) {
        logFn(`URL resolution failed: baseUrl=${baseUrl}, relativeUrl=${relativeUrl}, error=${e.message}. Returning relative URL.`);
        // Return the original relative URL as a fallback, M3U8 players might handle it.
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
        logFn?.(`JSON parse error: ${e.message}`);
        return defaultValue;
    }
}


function safeJsonStringify(value, defaultValue = 'null', logFn) {
     try {
        return JSON.stringify(value);
    } catch (e) {
        logFn?.(`JSON stringify error: ${e.message}`);
        return defaultValue;
    }
}

// --- Request/Response Helpers ---

function createResponse(request, body, status = 200, headers = {}) {
    const responseHeaders = new Headers(headers);
    // Set common CORS headers
    for (const [key, value] of Object.entries(COMMON_HEADERS)) {
        responseHeaders.set(key, value);
    }

    if (request.method === "OPTIONS") {
        // Use OPTIONS-specific headers for preflight
        const optionsResponseHeaders = new Headers(OPTIONS_HEADERS);
        return new Response(null, {
            status: 204, // No Content for preflight
            headers: optionsResponseHeaders
        });
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
    const finalHeaders = new Headers(originalHeaders); // Clone original headers
    finalHeaders.set('Cache-Control', `public, max-age=${cacheTtl}`);
    // Ensure common CORS headers are present (createResponse adds them)
    return createResponse(request, content, status, finalHeaders);
}


function createFetchHeaders(originalRequest, targetUrl, userAgents) {
    const headers = new Headers();
    // Set User-Agent
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    headers.set('User-Agent', userAgent);

    // Set common headers
    headers.set('Accept', '*/*');
    headers.set('Accept-Language', originalRequest.headers.get('Accept-Language') || 'en-US,en;q=0.9');

    // Set Referer based on the target URL's origin
    try {
        headers.set('Referer', new URL(targetUrl).origin);
    } catch (e) {
        // If targetUrl is invalid, maybe use original request's Referer? Or none.
        const originalReferer = originalRequest.headers.get('Referer');
        if (originalReferer) {
            headers.set('Referer', originalReferer);
        }
    }
    // Optionally copy other safe headers from the original request if needed
    // e.g., headers.set('X-Forwarded-For', originalRequest.headers.get('CF-Connecting-IP'));

    return headers;
}


// --- Core M3U8 Processing Logic ---

function processUriLine(line, baseUrl, resolveCache, logFn) {
    // More robust regex to find URI="...", handles potential spaces
    return line.replace(/URI\s*=\s*"([^"]+)"/, (match, uri) => {
        if (!uri) return match; // Handle empty URI="". Should not happen but be safe.
        const absoluteUri = resolveUrl(baseUrl, uri, resolveCache, logFn);
        logFn(`Processing URI: Original='${uri}', Absolute='${absoluteUri}'`);
        return `URI="${rewriteUrlToProxy(absoluteUri)}"`; // Use the required rewrite function
    });
}

function processMediaPlaylist(targetUrl, content, resolveCache, logFn) {
    const baseUrl = getBaseUrl(targetUrl);
    const lines = content.split('\n');
    const output = [];

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
             // Keep empty lines for structure, unless it's the very last line causing extra newline
            if (output.length > 0 || lines.indexOf(line) < lines.length -1 ) {
                 output.push('');
            }
            continue;
        }

        if (trimmedLine.startsWith('#EXT-X-KEY') || trimmedLine.startsWith('#EXT-X-MAP')) {
            output.push(processUriLine(trimmedLine, baseUrl, resolveCache, logFn));
        } else if (trimmedLine.startsWith('#')) {
            // Other directives - keep as is
            output.push(trimmedLine);
        } else {
            // Likely a segment URL
            const absoluteUrl = resolveUrl(baseUrl, trimmedLine, resolveCache, logFn);
            logFn(`Rewriting media segment: Original='${trimmedLine}', Absolute='${absoluteUrl}'`);
            output.push(rewriteUrlToProxy(absoluteUrl));
        }
    }

    // Join lines, ensuring a single trailing newline if the original had one (or if needed)
    let result = output.join('\n');
    if (content.endsWith('\n') && !result.endsWith('\n')) {
        result += '\n';
    }
    return result;
}



async function processMasterPlaylist(targetUrl, content, recursionDepth, context, config, resolveCache, logFn) {
    const { env, waitUntil } = context;
    const { MAX_RECURSION, CACHE_TTL } = config;

    if (recursionDepth > MAX_RECURSION) {
        throw new Error(`Max recursion depth (${MAX_RECURSION}) exceeded while processing master playlist: ${targetUrl}`);
    }

    const baseUrl = getBaseUrl(targetUrl);
    const lines = content.split('\n');
    let bestVariantUrl = '';
    // Simplified approach: For now, just pick the *first* variant URI found.
    // Bandwidth selection can be added later if strictly needed.

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        // Look for a line that is NOT a comment/tag AND seems like a URI (ends with .m3u8 or contains it)
        // This usually follows #EXT-X-STREAM-INF or #EXT-X-MEDIA
        if (trimmedLine && !trimmedLine.startsWith('#') && (trimmedLine.includes('.m3u8') || trimmedLine.includes('.M3U8'))) {
            // Check if the previous non-empty line was a stream/media tag
             let prevLineIndex = i - 1;
             while (prevLineIndex >= 0 && !lines[prevLineIndex].trim()) {
                 prevLineIndex--;
             }
             if (prevLineIndex >= 0) {
                 const prevTrimmed = lines[prevLineIndex].trim();
                 if (prevTrimmed.startsWith('#EXT-X-STREAM-INF') || prevTrimmed.startsWith('#EXT-X-MEDIA')) {
                     bestVariantUrl = resolveUrl(baseUrl, trimmedLine, resolveCache, logFn);
                     logFn(`Found variant stream URI: ${bestVariantUrl} (from line: ${trimmedLine})`);
                     break; // Use the first one found
                 }
             }
             // If not preceded by a specific tag, still consider it if it looks like a sub-playlist
             if (!bestVariantUrl && (trimmedLine.endsWith('.m3u8') || trimmedLine.includes('.m3u8?'))) {
                  bestVariantUrl = resolveUrl(baseUrl, trimmedLine, resolveCache, logFn);
                  logFn(`Found likely sub-playlist URI (fallback): ${bestVariantUrl} (from line: ${trimmedLine})`);
                  break;
             }
        }
    }


    if (!bestVariantUrl) {
        logFn(`No suitable variant/sub-playlist URI found in master playlist: ${targetUrl}. Processing as media playlist (might be incorrect).`);
        // Fallback: Try processing the current content as if it were a media playlist
        return processMediaPlaylist(targetUrl, content, resolveCache, logFn);
    }

    // --- Fetch and process the selected variant ---
    logFn(`Selected variant/sub-playlist URL: ${bestVariantUrl}`);
    const kvNamespace = getKvNamespace(env, logFn);
    const cacheKey = `${KV_M3U8_PROCESSED_PREFIX}${bestVariantUrl}`;

    // Check KV cache for the *processed* version of the sub-playlist
    if (kvNamespace) {
        try {
            const cachedProcessedContent = await kvNamespace.get(cacheKey);
            if (cachedProcessedContent) {
                logFn(`[Cache Hit - Processed M3U8] Returning cached processed content for: ${bestVariantUrl}`);
                return cachedProcessedContent;
            }
            logFn(`[Cache Miss - Processed M3U8] Processing needed for: ${bestVariantUrl}`);
        } catch (kvError) {
            logFn(`KV get error for processed key (${cacheKey}): ${kvError.message}`);
        }
    }

    // Fetch the content of the selected sub-playlist URL
    // Note: We reuse fetchContentWithType for consistency, even though we expect M3U8
    const { content: variantContent, contentType: variantContentType } = await fetchContentWithType(
        bestVariantUrl,
        context.request, // Pass original request for headers
        config,          // Pass config for UserAgents etc.
        logFn
    );

    // Ensure the fetched content IS actually M3U8 before processing further
    if (!isM3u8Content(variantContent, variantContentType)) {
         logFn(`Fetched content for ${bestVariantUrl} is NOT M3U8 (Type: ${variantContentType}). Cannot process recursively. Returning original content of master (likely incorrect).`);
         // This is problematic. We should ideally return an error or the raw variant content?
         // For now, return the original *master* playlist processed as media playlist as a fallback.
         // A better strategy might be needed depending on expected input.
         return processMediaPlaylist(targetUrl, content, resolveCache, logFn);
         // Alternative: return createResponse(context.request, "Error: Sub-playlist was not M3U8", 500); // But this breaks the flow.
    }

    // Recursively process the fetched variant content (which could be another master or media)
    const processedVariant = await processM3u8Recursive(
        bestVariantUrl,
        variantContent,
        variantContentType, // Pass content type for context
        recursionDepth + 1,
        context,
        config,
        resolveCache, // Pass the same resolve cache down
        logFn
    );

    // Cache the *processed* result in KV
    if (kvNamespace && processedVariant) {
        try {
            waitUntil(kvNamespace.put(cacheKey, processedVariant, { expirationTtl: CACHE_TTL }));
            logFn(`[Cache Write - Processed M3U8] Cached processed content for: ${bestVariantUrl}`);
        } catch (kvError) {
            logFn(`KV put error for processed key (${cacheKey}): ${kvError.message}`);
        }
    }

    return processedVariant;
}



async function processM3u8Recursive(targetUrl, content, contentType, recursionDepth, context, config, resolveCache, logFn) {
    // Determine if it's a master playlist (contains variants) or media playlist
    // Simple check: Look for specific tags indicating variants.
    const isMaster = content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:');

    if (isMaster) {
        logFn(`Processing as Master Playlist: ${targetUrl}`);
        return await processMasterPlaylist(targetUrl, content, recursionDepth, context, config, resolveCache, logFn);
    } else {
        logFn(`Processing as Media Playlist: ${targetUrl}`);
        // Media playlist processing is synchronous currently
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
        logFn(`Fetch network error for ${targetUrl}: ${error.message}`);
        throw new Error(`Network error while fetching ${targetUrl}: ${error.message}`);
    }

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '[Could not read error body]');
        logFn(`Fetch failed for ${targetUrl}: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error ${response.status} (${response.statusText}) fetching ${targetUrl}. Body: ${errorBody.substring(0, 200)}`);
    }

    const content = await response.text();
    const contentType = response.headers.get('Content-Type') || '';
    logFn(`Fetch success: ${targetUrl}, Content-Type: ${contentType}, Length: ${content.length}`);

    return { content, contentType, responseHeaders: response.headers };
}

// --- Main Request Handler ---

/**
 * Main Pages Function handler for /proxy/* requests.
 */
export async function onRequest(context) {
    const { request, env, next, waitUntil } = context;
    const url = new URL(request.url);

    // --- Configuration Parsing ---
    const DEBUG_ENABLED = env.DEBUG === 'true';
    // Wrapper for logDebug to avoid passing DEBUG_ENABLED everywhere
    const log = (message) => logDebug(DEBUG_ENABLED, message);

    const CACHE_TTL = parseInt(env.CACHE_TTL, 10) || DEFAULT_CACHE_TTL;
    if (isNaN(CACHE_TTL) || CACHE_TTL < 0) {
        log(`Invalid CACHE_TTL value "${env.CACHE_TTL}". Using default: ${DEFAULT_CACHE_TTL}`);
        config.CACHE_TTL = DEFAULT_CACHE_TTL;
    }

    const MAX_RECURSION = parseInt(env.MAX_RECURSION, 10) || DEFAULT_MAX_RECURSION;
     if (isNaN(MAX_RECURSION) || MAX_RECURSION < 0) {
        log(`Invalid MAX_RECURSION value "${env.MAX_RECURSION}". Using default: ${DEFAULT_MAX_RECURSION}`);
        config.MAX_RECURSION = DEFAULT_MAX_RECURSION;
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

    // --- Target URL Extraction ---
    const encodedUrlPart = url.pathname.replace(/^\/proxy\//, '');
    let targetUrl = '';
    if (encodedUrlPart) {
        try {
             // Try decoding first
            let decoded = decodeURIComponent(encodedUrlPart);
             // Basic check if it looks like a URL after decoding
             if (/^https?:\/\//i.test(decoded)) {
                 targetUrl = decoded;
             } else {
                  // If decoding doesn't result in a URL, maybe it wasn't encoded?
                  if (/^https?:\/\//i.test(encodedUrlPart)) {
                      targetUrl = encodedUrlPart;
                      log(`Warning: Path part "${encodedUrlPart}" was not URI encoded but looks like a URL.`);
                  } else {
                     log(`Invalid target URL format after decoding: ${decoded}`);
                  }
             }
        } catch (e) {
            log(`Error decoding path part "${encodedUrlPart}": ${e.message}`);
             // Final check: maybe the original non-decoded part is a valid URL?
             if (/^https?:\/\//i.test(encodedUrlPart)) {
                  targetUrl = encodedUrlPart;
                  log(`Warning: Path part "${encodedUrlPart}" failed decoding but looks like a URL.`);
             }
        }
    }

    if (!targetUrl) {
        log(`Failed to extract a valid target URL from path: ${url.pathname}`);
        return createResponse(request, "Invalid proxy request: Missing or invalid target URL in path.", 400);
    }

    log(`Processing request for target URL: ${targetUrl}`);

    // --- Main Logic ---
    try {
        const kvNamespace = getKvNamespace(env, log);
        const rawCacheKey = `${KV_RAW_PREFIX}${targetUrl}`;
        let cachedRawData = null;

        // 1. Check KV Cache for Raw Content
        if (kvNamespace) {
            try {
                const cachedRawJson = await kvNamespace.get(rawCacheKey);
                if (cachedRawJson) {
                    log(`[Cache Hit - Raw] Found raw content in cache for: ${targetUrl}`);
                    cachedRawData = safeJsonParse(cachedRawJson, null, log);
                    // Basic validation of cached structure
                    if (!cachedRawData || typeof cachedRawData.body !== 'string' || typeof cachedRawData.headers !== 'string') {
                         log(`[Cache Invalid - Raw] Cached raw data for ${targetUrl} has invalid format. Ignoring.`);
                         cachedRawData = null; // Invalidate cache entry
                    }
                } else {
                    log(`[Cache Miss - Raw] No raw content in cache for: ${targetUrl}`);
                }
            } catch (kvError) {
                log(`KV get error for raw key (${rawCacheKey}): ${kvError.message}`);
            }
        }

        let content;
        let contentType;
        let responseHeaders;

        // 2. Fetch or Use Cached Raw Content
        if (cachedRawData) {
            content = cachedRawData.body;
            const parsedHeaders = safeJsonParse(cachedRawData.headers, {}, log);
            // Reconstruct Headers object from parsed headers
            responseHeaders = new Headers(parsedHeaders);
            contentType = responseHeaders.get('content-type') || '';
            log(`Using cached raw content. Content-Type: ${contentType}`);
        } else {
            // Fetch fresh content
            const fetchedData = await fetchContentWithType(targetUrl, request, config, log);
            content = fetchedData.content;
            contentType = fetchedData.contentType;
            responseHeaders = fetchedData.responseHeaders;

            // Write fetched raw content to KV cache
            if (kvNamespace) {
                try {
                    const headersToCache = {};
                     // Convert Headers object to a plain object for JSON
                    responseHeaders.forEach((value, key) => {
                         headersToCache[key.toLowerCase()] = value;
                    });
                    const cacheValue = {
                        body: content,
                        headers: safeJsonStringify(headersToCache, '{}', log) // Store headers as string
                    };
                     // Check if stringify produced a valid object representation before putting
                     if (cacheValue.headers !== '{}' || Object.keys(headersToCache).length === 0) {
                        const stringifiedValue = safeJsonStringify(cacheValue, null, log);
                        if (stringifiedValue) {
                            waitUntil(kvNamespace.put(rawCacheKey, stringifiedValue, { expirationTtl: CACHE_TTL }));
                            log(`[Cache Write - Raw] Stored raw content in cache for: ${targetUrl}`);
                        } else {
                            log(`[Cache Write Error - Raw] Failed to stringify cache value for ${targetUrl}.`);
                        }
                     } else {
                         log(`[Cache Write Error - Raw] Failed to serialize headers for ${targetUrl}. Not caching.`);
                     }

                } catch (kvError) {
                    log(`KV put error for raw key (${rawCacheKey}): ${kvError.message}`);
                }
            }
        }

        // 3. Process if M3U8, otherwise return directly
        if (isM3u8Content(content, contentType)) {
            log(`Content is M3U8, initiating processing for: ${targetUrl}`);
            // Initialize a new resolve cache for this M3U8 processing pass
            const resolveCache = new Map();
            // Note: processM3u8Recursive might hit cache for *processed* sub-playlists
            const processedM3u8 = await processM3u8Recursive(
                targetUrl,
                content,
                contentType,
                0, // Initial recursion depth
                context,
                config,
                resolveCache, // Pass the fresh cache map
                log
            );
            return createM3u8Response(request, processedM3u8, CACHE_TTL);
        } else {
            log(`Content is not M3U8 (Type: ${contentType}), returning directly: ${targetUrl}`);
            // Use original response headers, add Cache-Control
            return createOtherResponse(request, content, 200, responseHeaders, CACHE_TTL);
        }

    } catch (error) {
        log(`!!! Critical Error processing request for ${targetUrl || url.pathname}: ${error.message}\n${error.stack}`);
        return createResponse(request, `Proxy error: ${error.message}`, 500);
    }
}


export async function onOptions(context) {
    // Use the standard OPTIONS headers defined above
    return new Response(null, {
        status: 204,
        headers: OPTIONS_HEADERS,
    });
}
