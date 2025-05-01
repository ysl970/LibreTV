// functions/proxy/[[path]].js

// --- 配置 (现在从 Cloudflare 环境变量读取) ---
// 在 Cloudflare Pages 设置 -> 函数 -> 环境变量绑定 中设置以下变量:
// CACHE_TTL (例如 86400)
// MAX_RECURSION (例如 5)
// USER_AGENTS_JSON (例如 ["UA1", "UA2"]) - JSON 字符串数组
// DEBUG (例如 false 或 true)
// --- 配置结束 ---

// --- 常量 (之前在 config.js 中，现在移到这里，因为它们与代理逻辑相关) ---
const MEDIA_FILE_EXTENSIONS = [
    '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.f4v', '.m4v', '.3gp', '.3g2', '.ts', '.mts', '.m2ts',
    '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.alac', '.aiff', '.opus',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg', '.avif', '.heic'
];
const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/'];
// --- 常量结束 ---

/**
 * 主要的 Pages Function 处理函数
 * 拦截发往 /proxy/* 的请求
 */
export async function onRequest(context) {
    const { request, env, next, waitUntil } = context;
    const url = new URL(request.url);

    // --- 从环境变量读取配置 ---
    const DEBUG_ENABLED = env.DEBUG === 'true';
    const CACHE_TTL = parseInt(env.CACHE_TTL || '86400');
    const MAX_RECURSION = parseInt(env.MAX_RECURSION || '5');
    // 广告过滤已移至播放器处理，代理不再执行
    let USER_AGENTS = [ 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    try {
        const agentsJson = env.USER_AGENTS_JSON;
        if (agentsJson) {
            const parsedAgents = JSON.parse(agentsJson);
            if (Array.isArray(parsedAgents) && parsedAgents.length > 0) {
                USER_AGENTS = parsedAgents;
            } else {
                logDebug("环境变量 USER_AGENTS_JSON 格式无效或为空，使用默认值");
            }
        }
    } catch (e) {
        logDebug(`解析环境变量 USER_AGENTS_JSON 失败: ${e.message}，使用默认值`);
    }
    // --- 配置读取结束 ---

    // --- 调试日志 ---
    function logDebug(message) {
        if (DEBUG_ENABLED) {
            console.log(`[Proxy Func] ${message}`);
        }
    }

    // --- 路由处理 ---
    // 从请求路径中提取目标URL
    function getTargetUrlFromPath(pathname) {
        const encodedUrl = pathname.replace(/^\/proxy\//, '');
        if (!encodedUrl) return null;
        
        try {
            let decodedUrl = decodeURIComponent(encodedUrl);
            
            if (!decodedUrl.match(/^https?:\/\//i)) {
                if (encodedUrl.match(/^https?:\/\//i)) {
                    decodedUrl = encodedUrl;
                    logDebug(`警告: 路径未编码但看起来像URL: ${decodedUrl}`);
                } else {
                    logDebug(`无效的目标URL格式 (解码后): ${decodedUrl}`);
                    return null;
                }
            }
            return decodedUrl;
        } catch (e) {
            logDebug(`解码目标URL时出错: ${encodedUrl} - ${e.message}`);
            return null;
        }
    }

    // --- 响应处理 ---
    function createResponse(body, status = 200, headers = {}) {
        const responseHeaders = new Headers(headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        responseHeaders.set("Access-Control-Allow-Headers", "*");

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: responseHeaders
            });
        }

        return new Response(body, { status, headers: responseHeaders });
    }

    // 创建M3U8响应
    function createM3u8Response(content) {
        return createResponse(content, 200, {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": `public, max-age=${CACHE_TTL}`
        });
    }

    // 获取随机User-Agent
    function getRandomUserAgent() {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    // 获取URL的基础路径
    function getBaseUrl(urlStr) {
        try {
            const parsedUrl = new URL(urlStr);
            if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
                return `${parsedUrl.origin}/`;
            }
            const pathParts = parsedUrl.pathname.split('/');
            pathParts.pop();
            return `${parsedUrl.origin}${pathParts.join('/')}/`;
        } catch (e) {
            logDebug(`获取 BaseUrl 时出错: ${urlStr} - ${e.message}`);
            const lastSlashIndex = urlStr.lastIndexOf('/');
            return lastSlashIndex > urlStr.indexOf('://') + 2 
                ? urlStr.substring(0, lastSlashIndex + 1) 
                : urlStr + '/';
        }
    }

    // 将相对URL转换为绝对URL
    function resolveUrl(baseUrl, relativeUrl) {
        if (relativeUrl.match(/^https?:\/\//i)) {
            return relativeUrl;
        }
        try {
            return new URL(relativeUrl, baseUrl).toString();
        } catch (e) {
            logDebug(`解析 URL 失败: baseUrl=${baseUrl}, relativeUrl=${relativeUrl}, error=${e.message}`);
            if (relativeUrl.startsWith('/')) {
                const urlObj = new URL(baseUrl);
                return `${urlObj.origin}${relativeUrl}`;
            }
            return `${baseUrl.replace(/\/[^/]*$/, '/')}${relativeUrl}`;
        }
    }

    // 将目标URL重写为代理路径
    function rewriteUrlToProxy(targetUrl) {
        return `/proxy/${encodeURIComponent(targetUrl)}`;
    }

    // --- 网络请求处理 ---
    async function fetchContentWithType(targetUrl) {
        const headers = new Headers({
            'User-Agent': getRandomUserAgent(),
            'Accept': '*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': request.headers.get('Referer') || new URL(targetUrl).origin
        });

        try {
            logDebug(`开始直接请求: ${targetUrl}`);
            const response = await fetch(targetUrl, { headers, redirect: 'follow' });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                logDebug(`请求失败: ${response.status} ${response.statusText} - ${targetUrl}`);
                throw new Error(`HTTP error ${response.status}: ${response.statusText}. URL: ${targetUrl}. Body: ${errorBody.substring(0, 150)}`);
            }

            const content = await response.text();
            const contentType = response.headers.get('Content-Type') || '';
            logDebug(`请求成功: ${targetUrl}, Content-Type: ${contentType}, 内容长度: ${content.length}`);
            return { content, contentType, responseHeaders: response.headers };
        } catch (error) {
            logDebug(`请求彻底失败: ${targetUrl}: ${error.message}`);
            throw new Error(`请求目标URL失败 ${targetUrl}: ${error.message}`);
        }
    }

    // 判断是否是M3U8内容
    function isM3u8Content(content, contentType) {
        if (contentType && 
            (contentType.includes('application/vnd.apple.mpegurl') || 
             contentType.includes('application/x-mpegurl') || 
             contentType.includes('audio/mpegurl'))) {
            return true;
        }
        return content && typeof content === 'string' && content.trim().startsWith('#EXTM3U');
    }

    // 处理M3U8中的#EXT-X-KEY行
    function processKeyLine(line, baseUrl) {
        return line.replace(/URI="([^"]+)"/, (match, uri) => {
            const absoluteUri = resolveUrl(baseUrl, uri);
            logDebug(`处理 KEY URI: 原始='${uri}', 绝对='${absoluteUri}'`);
            return `URI="${rewriteUrlToProxy(absoluteUri)}`;
        });
    }

    // 处理M3U8中的#EXT-X-MAP行
    function processMapLine(line, baseUrl) {
        return line.replace(/URI="([^"]+)"/, (match, uri) => {
            const absoluteUri = resolveUrl(baseUrl, uri);
            logDebug(`处理 MAP URI: 原始='${uri}', 绝对='${absoluteUri}'`);
            return `URI="${rewriteUrlToProxy(absoluteUri)}`;
        });
    }

    // 处理媒体M3U8播放列表
    function processMediaPlaylist(url, content) {
        const baseUrl = getBaseUrl(url);
        const output = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line) {
                if (i === lines.length - 1) {
                    output.push(line);
                }
                continue;
            }
            
            if (line.startsWith('#EXT-X-KEY')) {
                output.push(processKeyLine(line, baseUrl));
                continue;
            }
            
            if (line.startsWith('#EXT-X-MAP')) {
                output.push(processMapLine(line, baseUrl));
                continue;
            }
            
            if (line.startsWith('#EXTINF')) {
                output.push(line);
                continue;
            }
            
            if (!line.startsWith('#')) {
                const absoluteUrl = resolveUrl(baseUrl, line);
                logDebug(`重写媒体片段: 原始='${line}', 绝对='${absoluteUrl}'`);
                output.push(rewriteUrlToProxy(absoluteUrl));
                continue;
            }
            
            output.push(line);
        }
        
        return output.join('\n');
    }

    // 递归处理M3U8内容
    async function processMasterPlaylist(url, content, recursionDepth, env) {
        if (recursionDepth > MAX_RECURSION) {
            throw new Error(`处理主列表时递归层数过多 (${MAX_RECURSION}): ${url}`);
        }

        const baseUrl = getBaseUrl(url);
        const lines = content.split('\n');
        let highestBandwidth = -1;
        let bestVariantUrl = '';

        // 查找最高带宽的变体
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                const currentBandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;

                let variantUriLine = '';
                for (let j = i + 1; j < lines.length; j++) {
                    const line = lines[j].trim();
                    if (line && !line.startsWith('#')) {
                        variantUriLine = line;
                        i = j;
                        break;
                    }
                }

                if (variantUriLine) {
                    bestVariantUrl = resolveUrl(baseUrl, variantUriLine);
                    highestBandwidth = currentBandwidth;
                }
            }
        }

        // 如果没有找到带宽较高的变体，尝试找到第一个子列表引用
        if (!bestVariantUrl) {
            logDebug(`主列表中未找到 BANDWIDTH 或 STREAM-INF，尝试查找第一个子列表引用: ${url}`);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line && !line.startsWith('#') && (line.endsWith('.m3u8') || line.includes('.m3u8?'))) {
                    bestVariantUrl = resolveUrl(baseUrl, line);
                    logDebug(`备选方案：找到第一个子列表引用: ${bestVariantUrl}`);
                    break;
                }
            }
        }

        // 如果仍然没有找到变体URL
        if (!bestVariantUrl) {
            logDebug(`在主列表 ${url} 中未找到任何有效的子播放列表 URL。可能格式有问题或仅包含音频/字幕。将尝试按媒体列表处理原始内容。`);
            return processMediaPlaylist(url, content);
        }

        // 获取并处理选中的子列表
        const cacheKey = `m3u8_processed:${bestVariantUrl}`;
        let kvNamespace = null;
        
        try {
            kvNamespace = env.LIBRETV_PROXY_KV;
            if (!kvNamespace) throw new Error("KV 命名空间未绑定");
        } catch (e) {
            logDebug(`KV 命名空间 'LIBRETV_PROXY_KV' 访问出错或未绑定: ${e.message}`);
            kvNamespace = null;
        }

        if (kvNamespace) {
            try {
                const cachedContent = await kvNamespace.get(cacheKey);
                if (cachedContent) {
                    logDebug(`[缓存命中] 主列表的子列表: ${bestVariantUrl}`);
                    return cachedContent;
                } else {
                    logDebug(`[缓存未命中] 主列表的子列表: ${bestVariantUrl}`);
                }
            } catch (kvError) {
                logDebug(`从 KV 读取缓存失败 (${cacheKey}): ${kvError.message}`);
            }
        }

        logDebug(`选择的子列表 (带宽: ${highestBandwidth}): ${bestVariantUrl}`);
        const { content: variantContent, contentType: variantContentType } = await fetchContentWithType(bestVariantUrl);

        if (!isM3u8Content(variantContent, variantContentType)) {
            logDebug(`获取到的子列表 ${bestVariantUrl} 不是 M3U8 内容 (类型: ${variantContentType})。可能直接是媒体文件，返回原始内容。`);
            return createResponse(variantContent, 200, { 'Content-Type': variantContentType || 'application/octet-stream' });
        }

        const processedVariant = await processM3u8Content(bestVariantUrl, variantContent, recursionDepth + 1, env);

        if (kvNamespace) {
            try {
                waitUntil(kvNamespace.put(cacheKey, processedVariant, { expirationTtl: CACHE_TTL }));
                logDebug(`已将处理后的子列表写入缓存: ${bestVariantUrl}`);
            } catch (kvError) {
                logDebug(`向 KV 写入缓存失败 (${cacheKey}): ${kvError.message}`);
            }
        }

        return processedVariant;
    }

    // 处理M3U8内容的主要函数
    async function processM3u8Content(targetUrl, content, recursionDepth = 0, env) {
        if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
            return await processMasterPlaylist(targetUrl, content, recursionDepth, env);
        }
        return processMediaPlaylist(targetUrl, content);
    }

    // --- 主要请求处理逻辑 ---
    try {
        const targetUrl = getTargetUrlFromPath(url.pathname);
        if (!targetUrl) {
            return createResponse("无效的代理请求。路径应为 /proxy/<经过编码的URL>", 400);
        }

        logDebug(`收到代理请求: ${targetUrl}`);

        // --- 缓存检查 ---
        const cacheKey = `proxy_raw:${targetUrl}`;
        let kvNamespace = null;
        
        try {
            kvNamespace = env.LIBRETV_PROXY_KV;
            if (!kvNamespace) throw new Error("KV 命名空间未绑定");
        } catch (e) {
            logDebug(`KV 命名空间 'LIBRETV_PROXY_KV' 访问出错或未绑定: ${e.message}`);
            kvNamespace = null;
        }

        if (kvNamespace) {
            try {
                const cachedDataJson = await kvNamespace.get(cacheKey);
                if (cachedDataJson) {
                    logDebug(`[缓存命中] 原始内容: ${targetUrl}`);
                    const cachedData = JSON.parse(cachedDataJson);
                    const content = cachedData.body;
                    let headers = {};
                    try { headers = JSON.parse(cachedData.headers); } catch(e){}
                    const contentType = headers['content-type'] || headers['Content-Type'] || '';

                    if (isM3u8Content(content, contentType)) {
                        logDebug(`缓存内容是 M3U8，重新处理: ${targetUrl}`);
                        const processedM3u8 = await processM3u8Content(targetUrl, content, 0, env);
                        return createM3u8Response(processedM3u8);
                    } else {
                        logDebug(`从缓存返回非 M3U8 内容: ${targetUrl}`);
                        return createResponse(content, 200, new Headers(headers));
                    }
                } else {
                    logDebug(`[缓存未命中] 原始内容: ${targetUrl}`);
                }
            } catch (kvError) {
                logDebug(`从 KV 读取或解析缓存失败 (${cacheKey}): ${kvError.message}`);
            }
        }

        // --- 实际请求 ---
        const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl);

        // --- 写入缓存 ---
        if (kvNamespace) {
            try {
                const headersToCache = {};
                responseHeaders.forEach((value, key) => { 
                    headersToCache[key.toLowerCase()] = value; 
                });
                
                const cacheValue = { 
                    body: content, 
                    headers: JSON.stringify(headersToCache) 
                };
                
                waitUntil(kvNamespace.put(cacheKey, JSON.stringify(cacheValue), { expirationTtl: CACHE_TTL }));
                logDebug(`已将原始内容写入缓存: ${targetUrl}`);
            } catch (kvError) {
                logDebug(`向 KV 写入缓存失败 (${cacheKey}): ${kvError.message}`);
            }
        }

        // --- 响应处理 ---
        if (isM3u8Content(content, contentType)) {
            logDebug(`内容是 M3U8，开始处理: ${targetUrl}`);
            const processedM3u8 = await processM3u8Content(targetUrl, content, 0, env);
            return createM3u8Response(processedM3u8);
        } else {
            logDebug(`内容不是 M3U8 (类型: ${contentType})，直接返回: ${targetUrl}`);
            const finalHeaders = new Headers(responseHeaders);
            finalHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
            finalHeaders.set("Access-Control-Allow-Origin", "*");
            finalHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
            finalHeaders.set("Access-Control-Allow-Headers", "*");
            return createResponse(content, 200, finalHeaders);
        }
    } catch (error) {
        logDebug(`处理代理请求时发生严重错误: ${error.message} \n ${error.stack}`);
        return createResponse(`代理处理错误: ${error.message}`, 500);
    }
}

// 处理 OPTIONS 预检请求的函数
export async function onOptions(context) {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400"
        },
    });
}

