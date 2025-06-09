// 执行搜索
async function performSearch(keyword, apis) {
    if (!keyword || !apis || apis.length === 0) return;
    
    const searchResults = [];
    const searchPromises = apis.map(async (apiCode) => {
        try {
            // 构建API URL
            const apiUrl = API_SITES[apiCode].api + API_CONFIG.search.path + encodeURIComponent(keyword);
            
            // 添加超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            // 发送请求
            const response = await fetch('/proxy/' + encodeURIComponent(apiUrl), {
                headers: API_CONFIG.search.headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data || !data.list || !Array.isArray(data.list)) {
                return [];
            }
            
            // 处理搜索结果
            return data.list.map(item => ({
                ...item,
                source_code: apiCode,
                source_name: API_SITES[apiCode]?.name || '未知来源'
            }));
        } catch (error) {
            console.error(`搜索API ${apiCode} 失败:`, error);
            return [];
        }
    });
    
    // 等待所有搜索完成
    const results = await Promise.all(searchPromises);
    
    // 合并所有结果
    results.forEach(apiResults => {
        if (Array.isArray(apiResults) && apiResults.length > 0) {
            searchResults.push(...apiResults);
        }
    });
    
    // 去重（根据vod_id和source_code组合）
    const uniqueResults = [];
    const seen = new Set();
    
    searchResults.forEach(item => {
        const key = `${item.source_code}_${item.vod_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueResults.push(item);
        }
    });
    
    // 按照视频名称和来源排序
    uniqueResults.sort((a, b) => {
        // 首先按照视频名称排序
        const nameCompare = (a.vod_name || '').localeCompare(b.vod_name || '');
        if (nameCompare !== 0) return nameCompare;
        
        // 如果名称相同，则按照来源排序
        return (a.source_name || '').localeCompare(b.source_name || '');
    });
    
    // 渲染搜索结果
    renderSearchResults(uniqueResults);
}

// 渲染搜索结果
function renderSearchResults(results) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-8">未找到相关结果</div>';
        return;
    }
    
    container.innerHTML = results.map(item => {
        const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, '') : '';
        const safeName = (item.vod_name || item.name || '未知资源').toString()
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        return `
            <div class="search-result-item" onclick="playFirstEpisode('${item.source_code}', '${safeId}', '${safeName}')">
                <div class="search-card-img-container">
                    <img src="${item.vod_pic || 'https://via.placeholder.com/300x450?text=无封面'}" 
                         alt="${safeName}" 
                         loading="lazy"
                         onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=无封面'; this.classList.add('object-contain');">
                </div>
                <div class="flex-grow p-4">
                    <h3 class="line-clamp-2">${safeName}</h3>
                    <div class="text-gray-400 text-sm mt-2">
                        <span class="bg-[#222]">${item.source_name}</span>
                        ${item.vod_remarks ? `<span class="bg-[#222]">${item.vod_remarks}</span>` : ''}
                        ${item.type_name ? `<span class="bg-[#222]">${item.type_name}</span>` : ''}
                    </div>
                    <div class="text-gray-400 text-sm mt-2 line-clamp-2">${item.vod_content || ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 播放第一集
async function playFirstEpisode(sourceCode, vodId, title) {
    try {
        // 获取视频详情
        const detail = await getVideoDetail(sourceCode, vodId);
        if (!detail || !detail.vod_play_url) {
            showToast('获取视频信息失败');
            return;
        }

        // 解析播放地址
        const playUrls = detail.vod_play_url.split('#');
        if (!playUrls || playUrls.length === 0) {
            showToast('无法获取播放地址');
            return;
        }

        // 获取第一集的播放地址
        const firstEpisodeUrl = playUrls[0].split('$')[1];
        if (!firstEpisodeUrl) {
            showToast('无法获取播放地址');
            return;
        }

        // 构建播放URL
        const playUrl = new URL('player.html', window.location.href);
        playUrl.searchParams.set('source_code', sourceCode);
        playUrl.searchParams.set('vod_id', vodId);
        playUrl.searchParams.set('title', title);
        playUrl.searchParams.set('url', firstEpisodeUrl);
        playUrl.searchParams.set('index', '0');

        // 跳转到播放页面
        window.location.href = playUrl.toString();
    } catch (error) {
        console.error('播放失败:', error);
        showToast('播放失败，请稍后重试');
    }
}

// 获取视频详情
async function getVideoDetail(sourceCode, vodId) {
    try {
        const response = await fetch(`/api/detail?source=${sourceCode}&id=${vodId}`);
        if (!response.ok) throw new Error('获取视频详情失败');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('获取视频详情失败:', error);
        throw error;
    }
}

// 初始化搜索
function initSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const keyword = urlParams.get('keyword');
    const apis = urlParams.get('apis')?.split(',') || [];
    
    if (keyword && apis.length > 0) {
        performSearch(keyword, apis);
    }
}

// 页面加载完成后初始化搜索
window.addEventListener('DOMContentLoaded', initSearch); 
