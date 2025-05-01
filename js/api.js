
// 改进的API请求处理函数
async function handleApiRequest(url) {
    const customApi = url.searchParams.get('customApi') || '';
    const source = url.searchParams.get('source') || 'heimuer';
    
    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数');
            
            // 验证API和source的有效性
            if (source === 'custom' && !customApi) {
                throw new Error('使用自定义API时必须提供API地址');
            }
            
            if (!API_SITES[source] && source !== 'custom') {
                throw new Error('无效的API来源');
            }
            
            // 构建API URL
            const apiUrl = source === 'custom'
                ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
                : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            
            // 使用统一的fetch封装处理
            const result = await fetchWithTimeout(PROXY_URL + encodeURIComponent(apiUrl), {
                headers: API_CONFIG.search.headers
            });
            
            // 检查JSON格式的有效性
            if (!result || !Array.isArray(result.list)) {
                throw new Error('API返回的数据格式无效');
            }
            
            // 添加源信息到每个结果
            result.list.forEach(item => {
                item.source_name = source === 'custom' ? '自定义源' : API_SITES[source].name;
                item.source_code = source;
                if (source === 'custom') item.api_url = customApi;
            });
            
            return JSON.stringify({
                code: 200,
                list: result.list,
            });
        }

        // 详情处理
        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer';
            
            if (!id) throw new Error('缺少视频ID参数');
            if (!/^[\w-]+$/.test(id)) throw new Error('无效的视频ID格式');
            
            // 特殊源处理
            if ((sourceCode === 'ffzy' || sourceCode === 'jisu' || sourceCode === 'huangcang') && 
                API_SITES[sourceCode]?.detail) {
                return await handleSpecialSourceDetail(id, sourceCode);
            }
            
            // 自定义API特殊处理
            if (sourceCode === 'custom' && url.searchParams.get('useDetail') === 'true') {
                return await handleCustomApiSpecialDetail(id, customApi);
            }
            
            // 构建详情页URL
            const detailUrl = sourceCode.startsWith('custom_')
                ? `${customApi}${API_CONFIG.detail.path}${id}`
                : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`;
            
            // 使用统一的fetch封装
            const result = await fetchWithTimeout(PROXY_URL + encodeURIComponent(detailUrl), {
                headers: API_CONFIG.detail.headers
            });
            
            // 检查返回的数据有效性
            if (!result || !result.list || !Array.isArray(result.list) || result.list.length === 0) {
                throw new Error('获取到的详情内容无效');
            }
            
            // 获取第一个匹配的视频详情
            const videoDetail = result.list[0];
            let episodes = [];
            
            // 提取播放地址
            if (videoDetail.vod_play_url) {
                const playSources = videoDetail.vod_play_url.split('$$$');
                if (playSources.length > 0) {
                    const mainSource = playSources[0];
                    const episodeList = mainSource.split('#');
                    episodes = episodeList.map(ep => {
                        const parts = ep.split('$');
                        return parts.length > 1 ? parts[1] : '';
                    }).filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
                }
            }
            
            // 如果没有找到播放地址，尝试使用正则表达式查找m3u8链接
            if (episodes.length === 0 && videoDetail.vod_content) {
                const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                episodes = matches.map(link => link.replace(/^\$/, ''));
            }
            
            return JSON.stringify({
                code: 200,
                episodes: episodes,
                detailUrl: detailUrl,
                videoInfo: {
                    title: videoDetail.vod_name,
                    cover: videoDetail.vod_pic,
                    desc: videoDetail.vod_content,
                    type: videoDetail.type_name,
                    year: videoDetail.vod_year,
                    area: videoDetail.vod_area,
                    director: videoDetail.vod_director,
                    actor: videoDetail.vod_actor,
                    remarks: videoDetail.vod_remarks,
                    source_name: sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name,
                    source_code: sourceCode
                }
            });
        }

        throw new Error('未知的API路径');
    } catch (error) {
        console.error('API处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: error.message || '请求处理失败',
            list: [],
            episodes: [],
        });
    }
}

// 统一的fetch封装（支持超时）
async function fetchWithTimeout(targetUrl, options, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(targetUrl, {
            ...options,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// 处理自定义API的特殊详情页
async function handleCustomApiSpecialDetail(id, customApi) {
    try {
        const detailUrl = `${customApi}/index.php/vod/detail/id/${id}.html`;
        const result = await fetchWithTimeout(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        
        // 使用通用模式提取m3u8链接
        const matches = result.html.match(/\$https?:\/\/[^"'\s]+?\.m3u8/g)
            ?.map(link => {
                link = link.substring(1);
                const parenIndex = link.indexOf('(');
                return parenIndex > 0 ? link.substring(0, parenIndex) : link;
            }) || [];
        
        // 提取基本信息
        const titleMatch = result.html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const descMatch = result.html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        
        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleMatch ? titleMatch[1].trim() : '',
                desc: descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '',
                source_name: '自定义源',
                source_code: 'custom'
            }
        });
    } catch (error) {
        console.error(`自定义API详情获取失败:`, error);
        throw error;
    }
}

// 通用特殊源详情处理函数
async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        const detailUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        const result = await fetchWithTimeout(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
        });
        
        // 根据源类型使用不同的正则表达式
        let matches = [];
        if (sourceCode === 'ffzy') {
            const ffzyPattern = /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
            matches = result.html.match(ffzyPattern) || [];
        }
        
        // 如果没有找到链接或不是ffzy源，使用通用正则
        if (matches.length === 0) {
            const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
            matches = result.html.match(generalPattern) || [];
        }
        
        // 去重处理
        matches = [...new Set(matches)];
        // 处理链接
        matches = matches.map(link => {
            link = link.substring(1, link.length);
            const parenIndex = link.indexOf('(');
            return parenIndex > 0 ? link.substring(0, parenIndex) : link;
        });
        
        // 提取标题、简介等基本信息
        const titleMatch = result.html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const titleText = titleMatch ? titleMatch[1].trim() : '';
        
        const descMatch = result.html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const descText = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
        
        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleText,
                desc: descText,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (error) {
        console.error(`${API_SITES[sourceCode].name}详情获取失败:`, error);
        throw error;
    }
}

// 处理聚合搜索
async function handleAggregatedSearch(searchQuery) {
    // 获取可用的API源列表（排除aggregated和custom）
    const availableSources = Object.keys(API_SITES).filter(key => 
        key !== 'aggregated' && key !== 'custom'
    );
    
    if (availableSources.length === 0) throw new Error('没有可用的API源');
    
    // 创建所有API源的搜索请求
    const searchPromises = availableSources.map(source => 
        fetchWithTimeout(
            PROXY_URL + encodeURIComponent(`${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`),
            { headers: API_CONFIG.search.headers },
            AGGREGATED_SEARCH_CONFIG.timeout
        ).catch(error => {
            console.warn(`${source}源搜索失败:`, error);
            return null; // 返回null表示该源搜索失败
        })
    );
    
    try {
        // 并行执行所有搜索请求
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        let allResults = [];
        resultsArray.forEach((result, index) => {
            if (result && Array.isArray(result.list) && result.list.length > 0) {
                // 为搜索结果添加源信息
                const sourceKey = availableSources[index];
                allResults.push(...result.list.map(item => ({
                    ...item,
                    source_name: API_SITES[sourceKey].name,
                    source_code: sourceKey
                })));
            }
        });
        
        // 如果没有搜索结果
        if (allResults.length === 0) {
            return JSON.stringify({
                code: 200,
                list: [],
                msg: '所有源均无搜索结果'
            });
        }
        
        // 去重（根据vod_id和source_code组合）
        const uniqueResults = [];
        const seen = new Set();
        
        allResults.forEach(item => {
            const key = `${item.source_code}_${item.vod_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });
        
        // 按照视频名称和来源排序
        uniqueResults.sort((a, b) => {
            const nameCompare = (a.vod_name || '').localeCompare(b.vod_name || '');
            return nameCompare !== 0 ? nameCompare : 
                (a.source_name || '').localeCompare(b.source_name || '');
        });
        
        return JSON.stringify({
            code: 200,
            list: uniqueResults,
        });
    } catch (error) {
        console.error('聚合搜索处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: '聚合搜索处理失败: ' + error.message,
            list: []
        });
    }
}

// 处理多个自定义API源的聚合搜索
async function handleMultipleCustomSearch(searchQuery, customApiUrls) {
    // 解析自定义API列表
    const apiUrls = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => url.length > 0 && /^https?:\/\//.test(url))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    
    if (apiUrls.length === 0) throw new Error('没有提供有效的自定义API地址');
    
    // 为每个API创建搜索请求
    const searchPromises = apiUrls.map((apiUrl, index) => 
        fetchWithTimeout(
            PROXY_URL + encodeURIComponent(`${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`),
            { headers: API_CONFIG.search.headers },
            CUSTOM_API_CONFIG.testTimeout
        ).catch(error => {
            console.warn(`自定义API ${index+1} 搜索失败:`, error);
            return null; // 返回null表示该源搜索失败
        })
    );
    
    try {
        // 并行执行所有搜索请求
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        let allResults = [];
        resultsArray.forEach((result, index) => {
            if (result && Array.isArray(result.list) && result.list.length > 0) {
                // 为搜索结果添加源信息
                allResults.push(...result.list.map(item => ({
                    ...item,
                    source_name: `${CUSTOM_API_CONFIG.namePrefix}${index+1}`,
                    source_code: 'custom',
                    api_url: apiUrl
                })));
            }
        });
        
        // 如果没有搜索结果
        if (allResults.length === 0) {
            return JSON.stringify({
                code: 200,
                list: [],
                msg: '所有自定义API源均无搜索结果'
            });
        }
        
        // 去重（根据vod_id和api_url组合）
        const uniqueResults = [];
        const seen = new Set();
        
        allResults.forEach(item => {
            const key = `${item.api_url || ''}_${item.vod_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });
        
        return JSON.stringify({
            code: 200,
            list: uniqueResults,
        });
    } catch (error) {
        console.error('自定义API聚合搜索处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: '自定义API聚合搜索处理失败: ' + error.message,
            list: []
        });
    }
}

// 初始化API请求拦截
(function() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' 
            ? new URL(input, window.location.origin) 
            : input.url;
        
        if (requestUrl.pathname.startsWith('/api/')) {
            if (window.isPasswordProtected && window.isPasswordVerified) {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                    return;
                }
            }
            
            try {
                const data = await handleApiRequest(requestUrl);
                return new Response(data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            } catch (error) {
                return new Response(JSON.stringify({
                    code: 500,
                    msg: '服务器内部错误',
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }
        }
        
        // 非API请求使用原始fetch
        return originalFetch.apply(this, arguments);
    };
})();

// 站点可用性测试
async function testSiteAvailability(apiUrl) {
    try {
        const response = await fetch('/api/search?wd=test&customApi=' + encodeURIComponent(apiUrl), {
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        return data && data.code !== 400 && Array.isArray(data.list);
    } catch (error) {
        console.error('站点可用性测试失败:', error);
        return false;
    }
}
